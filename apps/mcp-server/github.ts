import { AnalysisSchema, type Analysis } from '../../packages/contracts/index.js';

const MAX_FILES = 30;
const MAX_PATCH_CHARS = 20_000;

interface GitHubPullRequest {
  html_url: string;
  number: number;
  state: string;
  title: string;
  body: string | null;
  changed_files: number;
  additions: number;
  deletions: number;
  head: { sha: string };
  base: { ref: string };
}

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export function parsePullRequestUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Use uma URL HTTPS de Pull Request do github.com.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 4 || parts[2] !== 'pull' || !/^\d+$/.test(parts[3])) {
    throw new Error('URL inválida. Use https://github.com/owner/repo/pull/123.');
  }
  return { owner: parts[0], repo: parts[1], prNumber: Number(parts[3]) };
}

function requestHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ai-dev-cockpit',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function githubGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: requestHeaders(), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (response.status === 404) throw new Error('PR não encontrado ou sem permissão de acesso.');
    if (response.status === 403) throw new Error('Limite da API do GitHub atingido. Configure GITHUB_TOKEN e reinicie o servidor.');
    throw new Error(`GitHub respondeu HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function classifyPriority(file: Pick<GitHubFile, 'filename' | 'patch' | 'additions' | 'deletions'>): 'high' | 'medium' | 'low' {
  const content = `${file.filename}\n${file.patch ?? ''}`.toLowerCase();
  if (/\b(nan|secret|token|password|auth|payment|pix|checkout|migration|schema)\b/.test(content)) return 'high';
  if (file.additions + file.deletions > 250 || /\.(sql|prisma|ya?ml)$/.test(file.filename)) return 'high';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file.filename) || /(^|\/)(api|lib|server|services)(\/|$)/.test(file.filename)) return 'medium';
  if (/\.(md|txt|png|jpe?g|gif)$/.test(file.filename)) return 'low';
  return 'medium';
}

export async function fetchPullRequestAnalysis(prUrl: string): Promise<Analysis> {
  const { owner, repo, prNumber } = parsePullRequestUrl(prUrl);
  const repository = `${owner}/${repo}`;
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [pr, files] = await Promise.all([
    githubGet<GitHubPullRequest>(`${apiBase}/pulls/${prNumber}`),
    githubGet<GitHubFile[]>(`${apiBase}/pulls/${prNumber}/files?per_page=${MAX_FILES}`),
  ]);
  const selectedFiles = files.slice(0, MAX_FILES).map((file) => {
    const rawPatch = file.patch ?? '';
    const truncated = rawPatch.length > MAX_PATCH_CHARS;
    return {
      path: file.filename,
      status: file.status,
      priority: classifyPriority(file),
      additions: file.additions,
      deletions: file.deletions,
      diff: rawPatch ? `${rawPatch.slice(0, MAX_PATCH_CHARS)}${truncated ? '\n… patch truncado pelo Cockpit' : ''}` : 'Patch não disponibilizado pelo GitHub para este arquivo.',
      patchAvailable: Boolean(rawPatch),
    };
  });
  const limitations: string[] = ['Prioridades e explicações usam regras determinísticas; a análise por IA ainda não está habilitada.'];
  if (pr.changed_files > MAX_FILES) limitations.push(`Mostrando ${MAX_FILES} de ${pr.changed_files} arquivos alterados.`);
  if (selectedFiles.some((file) => !file.patchAvailable)) limitations.push('Alguns patches não foram disponibilizados pelo GitHub.');
  if (selectedFiles.some((file) => file.diff.endsWith('patch truncado pelo Cockpit'))) limitations.push('Alguns patches foram truncados por limite de tamanho.');
  return AnalysisSchema.parse({
    schemaVersion: 1,
    analysisId: `github:${repository}#${pr.number}@${pr.head.sha}`,
    source: 'github',
    title: pr.title,
    repository,
    prNumber: pr.number,
    prUrl: pr.html_url,
    state: pr.state,
    headSha: pr.head.sha,
    summary: `${pr.changed_files} arquivos alterados · +${pr.additions} / −${pr.deletions} · base ${pr.base.ref}`,
    files: selectedFiles,
    partial: pr.changed_files > MAX_FILES || selectedFiles.some((file) => !file.patchAvailable),
    limitations,
  });
}
