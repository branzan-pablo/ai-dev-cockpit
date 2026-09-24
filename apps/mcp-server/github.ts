import { AnalysisSchema, type Analysis } from '../../packages/contracts/index.js';
import { buildDeterministicReview, inferFileMetadata } from '../../packages/review-engine/index.js';
import { loadProjectContext } from './project-context.js';

const MAX_FILES = 60;
const MAX_PATCH_CHARS = 20_000;
const CACHE_TTL_MS = 2 * 60_000;
const MAX_CACHE_ENTRIES = 20;
const cache = new Map<string, { expiresAt: number; value: Analysis }>();

interface GitHubPullRequest {
  html_url: string;
  number: number;
  state: string;
  title: string;
  body: string | null;
  changed_files: number;
  additions: number;
  deletions: number;
  head: { sha: string; ref: string };
  base: { ref: string };
  user: { login: string };
}

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GitHubCombinedStatus {
  state: 'pending' | 'success' | 'failure' | 'error';
  statuses: Array<{ state: string; context: string; target_url: string | null }>;
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

export function requestHeaders() {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ai-dev-cockpit',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function githubRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...requestHeaders(), ...init.headers }, signal: init.signal ?? AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (response.status === 404) throw new Error('PR não encontrado ou sem permissão de acesso.');
    if (response.status === 403 || response.status === 429) {
      const reset = response.headers.get('x-ratelimit-reset');
      const exhausted = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
      const when = reset ? ` Tente novamente após ${new Date(Number(reset) * 1_000).toLocaleTimeString('pt-BR')}.` : '';
      if (exhausted) throw new Error(`Limite da API do GitHub atingido. Configure GITHUB_TOKEN e reinicie o servidor.${when}`);
      throw new Error('O token do GitHub não possui permissão para esta operação.');
    }
    if (response.status === 401) throw new Error('Token do GitHub inválido ou expirado.');
    throw new Error(`GitHub respondeu HTTP ${response.status}.`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export function githubGet<T>(url: string) { return githubRequest<T>(url); }

function normalizePreviewUrl(value: string | null) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : undefined; } catch { return undefined; }
}

async function fetchDelivery(apiBase: string, sha: string) {
  try {
    const combined = await githubGet<GitHubCombinedStatus>(`${apiBase}/commits/${sha}/status`);
    const preview = combined.statuses.find((status) => /vercel|preview|deploy/i.test(`${status.context} ${status.target_url ?? ''}`));
    const successful = combined.statuses.filter((status) => status.state === 'success').length;
    const failed = combined.statuses.filter((status) => status.state === 'failure' || status.state === 'error').length;
    return { checksState: combined.state === 'error' ? 'failure' as const : combined.state, total: combined.statuses.length, successful, failed, previewUrl: normalizePreviewUrl(preview?.target_url ?? null) };
  } catch {
    return { checksState: 'unknown' as const, total: 0, successful: 0, failed: 0 };
  }
}

export function classifyPriority(file: Pick<GitHubFile, 'filename' | 'patch' | 'additions' | 'deletions'>): 'high' | 'medium' | 'low' {
  const content = `${file.filename}\n${file.patch ?? ''}`.toLowerCase();
  if (/\b(nan|secret|token|password|auth|payment|pix|checkout|migration|schema)\b/.test(content)) return 'high';
  if (file.additions + file.deletions > 250 || /\.(sql|prisma|ya?ml)$/.test(file.filename)) return 'high';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file.filename) || /(^|\/)(api|lib|server|services)(\/|$)/.test(file.filename)) return 'medium';
  if (/\.(md|txt|png|jpe?g|gif)$/.test(file.filename)) return 'low';
  return 'medium';
}

export async function fetchPullRequestAnalysis(prUrl: string, options: { refresh?: boolean } = {}): Promise<Analysis> {
  const { owner, repo, prNumber } = parsePullRequestUrl(prUrl);
  const repository = `${owner}/${repo}`;
  const cacheKey = `${repository.toLowerCase()}#${prNumber}`;
  const cached = cache.get(cacheKey);
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [pr, files] = await Promise.all([
    githubGet<GitHubPullRequest>(`${apiBase}/pulls/${prNumber}`),
    githubGet<GitHubFile[]>(`${apiBase}/pulls/${prNumber}/files?per_page=${MAX_FILES}`),
  ]);
  const [delivery, context] = await Promise.all([
    fetchDelivery(apiBase, pr.head.sha),
    loadProjectContext(apiBase, pr.head.sha, files.map((file) => file.filename), githubGet),
  ]);
  const selectedFiles = files.slice(0, MAX_FILES).map((file) => {
    const rawPatch = file.patch ?? '';
    const truncated = rawPatch.length > MAX_PATCH_CHARS;
    return {
      path: file.filename,
      status: file.status,
      priority: classifyPriority(file),
      ...inferFileMetadata(file.filename),
      additions: file.additions,
      deletions: file.deletions,
      diff: rawPatch ? `${rawPatch.slice(0, MAX_PATCH_CHARS)}${truncated ? '\n… patch truncado pelo Cockpit' : ''}` : 'Patch não disponibilizado pelo GitHub para este arquivo.',
      patchAvailable: Boolean(rawPatch),
    };
  });
  const limitations: string[] = ['Análise produzida por regras locais. Configure a camada de IA para obter revisão contextual.'];
  if (selectedFiles.some((file) => !file.patchAvailable)) limitations.push('Alguns patches não foram disponibilizados pelo GitHub.');
  if (selectedFiles.some((file) => file.diff.endsWith('patch truncado pelo Cockpit'))) limitations.push('Alguns patches foram truncados por limite de tamanho.');
  const result = AnalysisSchema.parse({
    schemaVersion: 3,
    analysisId: `github:${repository}#${pr.number}@${pr.head.sha}`,
    source: 'github',
    title: pr.title,
    repository,
    prNumber: pr.number,
    prUrl: pr.html_url,
    state: pr.state,
    author: pr.user.login,
    baseRef: pr.base.ref,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    summary: `${pr.changed_files} arquivos alterados · +${pr.additions} / −${pr.deletions} · base ${pr.base.ref}`,
    description: pr.body ?? undefined,
    files: selectedFiles,
    review: buildDeterministicReview(selectedFiles),
    delivery,
    context,
    partial: pr.changed_files > MAX_FILES || selectedFiles.some((file) => !file.patchAvailable),
    limitations,
  });
  cache.delete(cacheKey);
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  return result;
}
