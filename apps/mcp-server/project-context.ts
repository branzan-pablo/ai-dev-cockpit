import { ProjectContextSchema, type ProjectContext } from '../../packages/contracts/index.js';

const MAX_SOURCES = 20;
const MAX_SOURCE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 40_000;
const CONFIG_PATH = '.ai-dev-cockpit.json';

type TreeEntry = { path: string; type: 'blob' | 'tree'; sha: string; size?: number };
type Tree = { tree: TreeEntry[]; truncated?: boolean };
type Blob = { content: string; encoding: string; sha: string };
type Config = { version: 1; context?: { include?: string[]; exclude?: string[] }; skills?: string[] };
type Get = <T>(url: string) => Promise<T>;

const conventional = [
  'AGENTS.md', '.github/copilot-instructions.md', 'CONTRIBUTING.md', 'STYLEGUIDE.md',
  'package.json', 'tsconfig.json', 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc', '.eslintrc.json',
];

function safePath(value: string) {
  return value.length > 0 && value.length <= 300 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..');
}

function globRegex(glob: string) {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      if (glob[index + 2] === '/') { pattern += '(?:.*/)?'; index += 2; }
      else { pattern += '.*'; index += 1; }
    } else if (character === '*') pattern += '[^/]*';
    else if (character === '?') pattern += '[^/]';
    else pattern += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

function matches(path: string, patterns: string[]) {
  return patterns.some((pattern) => safePath(pattern) && globRegex(pattern).test(path));
}

function redact(value: string) {
  return value
    .replace(/((?:password|secret|api[_-]?key|token)\s*[:=]\s*["'])[^"'\n]+/gi, '$1[REDACTED]')
    .replace(/\b(gh[opsu]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_TOKEN]');
}

function decode(blob: Blob) {
  if (blob.encoding !== 'base64') throw new Error('Codificação de contexto não suportada.');
  return Buffer.from(blob.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

function kind(path: string): ProjectContext['sources'][number]['kind'] {
  if (path.endsWith('/SKILL.md') || path === 'SKILL.md') return 'skill';
  if (path.endsWith('AGENTS.md')) return 'agents';
  if (path.includes('instructions')) return 'instructions';
  if (/CONTRIBUTING|STYLEGUIDE/i.test(path)) return 'guidelines';
  if (/package\.json|tsconfig|eslint/i.test(path)) return 'configuration';
  return 'custom';
}

function agentDirectories(changedPaths: string[]) {
  const result = new Set(['AGENTS.md']);
  for (const changed of changedPaths) {
    const parts = changed.split('/').slice(0, -1);
    for (let index = 1; index <= parts.length; index += 1) result.add(`${parts.slice(0, index).join('/')}/AGENTS.md`);
  }
  return result;
}

function appliesTo(path: string, changedPaths: string[]) {
  if (!path.endsWith('AGENTS.md') || path === 'AGENTS.md') return changedPaths;
  const directory = path.slice(0, -'AGENTS.md'.length);
  return changedPaths.filter((changed) => changed.startsWith(directory));
}

function parseConfig(raw: string): Config {
  const parsed = JSON.parse(raw) as Partial<Config>;
  if (parsed.version !== 1) throw new Error('A configuração deve usar version 1.');
  const values = [...(parsed.context?.include ?? []), ...(parsed.context?.exclude ?? []), ...(parsed.skills ?? [])];
  if (!values.every((value) => typeof value === 'string' && safePath(value))) throw new Error('A configuração contém caminho inválido.');
  if ((parsed.context?.include?.length ?? 0) > 30 || (parsed.context?.exclude?.length ?? 0) > 30 || (parsed.skills?.length ?? 0) > 20) throw new Error('A configuração excede o limite de entradas.');
  return parsed as Config;
}

export async function loadProjectContext(apiBase: string, headSha: string, changedPaths: string[], get: Get): Promise<ProjectContext> {
  let tree: Tree;
  try {
    tree = await get<Tree>(`${apiBase}/git/trees/${encodeURIComponent(headSha)}?recursive=1`);
  } catch {
    return ProjectContextSchema.parse({ status: 'partial', sources: [], omitted: [], message: 'Não foi possível consultar a árvore do repositório.' });
  }
  const blobs = new Map(tree.tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry]));
  let config: Config = { version: 1 };
  let invalidConfig = false;
  const configEntry = blobs.get(CONFIG_PATH);
  if (configEntry) {
    try {
      const blob = await get<Blob>(`${apiBase}/git/blobs/${configEntry.sha}`);
      config = parseConfig(decode(blob));
    } catch {
      invalidConfig = true;
    }
  }

  const candidates = new Set(conventional.filter((path) => blobs.has(path)));
  for (const path of agentDirectories(changedPaths)) if (blobs.has(path)) candidates.add(path);
  for (const path of blobs.keys()) if (/^\.github\/instructions\/[^/]+\.instructions\.md$/.test(path)) candidates.add(path);
  for (const pattern of config.context?.include ?? []) for (const path of blobs.keys()) if (matches(path, [pattern])) candidates.add(path);
  for (const path of config.skills ?? []) if (blobs.has(path) && path.endsWith('SKILL.md')) candidates.add(path);
  for (const path of [...candidates]) if (matches(path, config.context?.exclude ?? [])) candidates.delete(path);

  const ordered = [...candidates].sort((a, b) => {
    const aAgent = a.endsWith('AGENTS.md') ? a.split('/').length : 0;
    const bAgent = b.endsWith('AGENTS.md') ? b.split('/').length : 0;
    return aAgent !== bAgent ? aAgent - bAgent : a.localeCompare(b);
  });
  const omitted = ordered.slice(MAX_SOURCES);
  const sources: ProjectContext['sources'] = [];
  let remaining = MAX_TOTAL_CHARS;
  for (const path of ordered.slice(0, MAX_SOURCES)) {
    const entry = blobs.get(path)!;
    if (remaining <= 0) { omitted.push(path); continue; }
    try {
      const blob = await get<Blob>(`${apiBase}/git/blobs/${entry.sha}`);
      const raw = redact(decode(blob));
      const available = Math.min(raw.length, MAX_SOURCE_CHARS, remaining);
      const content = raw.slice(0, available);
      remaining -= content.length;
      sources.push({ path, kind: kind(path), sha: entry.sha, truncated: available < raw.length, content, appliesTo: appliesTo(path, changedPaths) });
    } catch {
      omitted.push(path);
    }
  }
  const partial = Boolean(tree.truncated || omitted.length || sources.some((source) => source.truncated));
  return ProjectContextSchema.parse({
    status: invalidConfig ? 'invalid' : sources.length === 0 ? 'not_found' : partial ? 'partial' : 'applied',
    sources, omitted,
    message: invalidConfig ? 'O .ai-dev-cockpit.json é inválido; somente descoberta convencional foi aplicada.' : tree.truncated ? 'A árvore do GitHub foi truncada.' : undefined,
  });
}
