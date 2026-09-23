import { setTimeout as delay } from 'node:timers/promises';
import { APICallError, NoObjectGeneratedError, RetryError } from 'ai';

export type FailureKind = 'unavailable' | 'rate_limit' | 'authentication' | 'invalid_request' | 'model_unavailable' | 'invalid_output' | 'timeout' | 'unknown';
export type Attempt = { model: string; kind: FailureKind; status?: number };

export function classifyAiError(error: unknown): { kind: FailureKind; status?: number; retryAfterMs?: number } {
  // SDK retry errors wrap the actual HTTP error in lastError, not cause.
  for (let depth = 0; depth < 5 && RetryError.isInstance(error); depth++) error = error.lastError;
  if (NoObjectGeneratedError.isInstance(error)) return { kind: 'invalid_output' };
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return { kind: 'timeout' };
  if (!APICallError.isInstance(error)) return { kind: 'unknown' };
  const status = error.statusCode;
  const retryHeader = error.responseHeaders?.['retry-after'];
  const retryAfterMs = retryHeader == null ? undefined : /^\d+(\.\d+)?$/.test(retryHeader)
    ? Number(retryHeader) * 1000 : Math.max(0, Date.parse(retryHeader) - Date.now());
  const base = { status, retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined };
  if (status === 401 || status === 403) return { ...base, kind: 'authentication' };
  if (status === 429) return { ...base, kind: 'rate_limit' };
  if ([500, 502, 503, 504].includes(status ?? 0)) return { ...base, kind: 'unavailable' };
  if (status === 408) return { ...base, kind: 'timeout' };
  if ((status === 400 || status === 404) && /model.*(?:not found|no longer available|not supported|does not exist)/i.test(error.message)) return { ...base, kind: 'model_unavailable' };
  return { ...base, kind: status === 400 ? 'invalid_request' : 'unknown' };
}

const reasons: Record<FailureKind, string> = {
  unavailable: 'provedor indisponível/alta demanda',
  rate_limit: 'limite de uso ou cota atingido; consulte a cota do provedor',
  authentication: 'credencial recusada ou sem permissão',
  invalid_request: 'requisição rejeitada; verifique parâmetros e modelo',
  model_unavailable: 'modelo não disponível para esta conta/API',
  invalid_output: 'resposta não passou na validação; nenhuma análise de IA foi aceita',
  timeout: 'tentativa excedeu o tempo limite',
  unknown: 'falha não classificada; execute npm run doctor:ai',
};

export class AiRecoveryError extends Error {
  constructor(readonly attempts: Attempt[], readonly deadlineReached = false) {
    super(`IA não concluída: ${attempts.map(a => `${a.model} (${a.status ? `HTTP ${a.status}, ` : ''}${reasons[a.kind]})`).join('; ')}.${deadlineReached ? ' Prazo total esgotado.' : ''} Exibindo regras locais, sem revisão por IA.`);
    this.name = 'AiRecoveryError';
  }
}

type RecoveryOptions = {
  models: string[];
  budgetMs?: number;
  attemptTimeoutMs?: number;
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  log?: (event: Record<string, unknown>) => void;
};

async function callWithDeadline<T>(call: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(() => controller.abort(new DOMException('AI attempt deadline', 'TimeoutError')), timeoutMs);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    signal.throwIfAborted();
    const value = await Promise.race([call(signal), aborted]);
    signal.throwIfAborted();
    return value;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

export async function withAiRecovery<T>(
  call: (model: string, signal: AbortSignal) => Promise<T>,
  { models, budgetMs = 45_000, attemptTimeoutMs = 20_000, now = Date.now, wait = async (ms, signal) => { await delay(ms, undefined, { signal }); }, log = event => console.error('[ai-review]', JSON.stringify(event)) }: RecoveryOptions,
): Promise<{ value: T; model: string }> {
  if (models.length === 0) throw new Error('Nenhum modelo configurado.');
  if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isFinite(attemptTimeoutMs) || attemptTimeoutMs <= 0) throw new Error('Prazo de IA inválido.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('AI deadline', 'TimeoutError')), budgetMs);
  const deadline = now() + budgetMs;
  const attempts: Attempt[] = [];
  let modelIndex = 0;
  try {
    // Global limit, NOT three attempts per model; no hidden SDK retries.
    for (let index = 0; index < 3; index++) {
      const model = models[modelIndex];
      if (controller.signal.aborted || now() >= deadline) break;
      const startedAt = now();
      const timeoutMs = Math.min(attemptTimeoutMs, deadline - startedAt);
      log({ event: 'attempt', model, attempt: index + 1, timeoutMs });
      try {
        const value = await callWithDeadline(signal => call(model, signal), controller.signal, timeoutMs);
        if (controller.signal.aborted || now() >= deadline) throw new DOMException('AI deadline', 'TimeoutError');
        log({ event: 'success', model, attempt: index + 1, elapsedMs: now() - startedAt });
        return { value, model };
      } catch (error) {
        const failure = classifyAiError(error);
        attempts.push({ model, kind: failure.kind, status: failure.status });
        // Never log raw error bodies, prompts, headers or API keys.
        log({ event: 'failure', ...attempts[attempts.length - 1], attempt: index + 1, elapsedMs: now() - startedAt });
        if (controller.signal.aborted || now() >= deadline) break;
        const hasNextModel = modelIndex + 1 < models.length;
        if (failure.kind === 'model_unavailable' && !hasNextModel) break;
        if (!['unavailable', 'rate_limit', 'timeout', 'model_unavailable'].includes(failure.kind)) break;
        // 429 may be a project-wide quota: never switch models to evade it.
        if (hasNextModel && ['unavailable', 'model_unavailable', 'timeout'].includes(failure.kind)) modelIndex++;
        if (index === 2) break;
        const backoff = Math.max(failure.retryAfterMs ?? 0, 1000 * 2 ** index + Math.floor(Math.random() * 250));
        if (backoff >= deadline - now()) break;
        try { await wait(backoff, controller.signal); } catch { break; }
      }
    }
    throw new AiRecoveryError(attempts, controller.signal.aborted || now() >= deadline);
  } finally { clearTimeout(timer); }
}
