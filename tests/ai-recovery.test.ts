import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError, RetryError } from 'ai';
import { analysis } from '../fixtures/payment.js';
import { applyAiReview, generateAiReview, resolveModelCandidates } from '../apps/mcp-server/ai-review.js';
import { AiRecoveryError, classifyAiError, withAiRecovery } from '../apps/mcp-server/ai-recovery.js';

const env = { AI_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'test-key', GOOGLE_AI_MODEL: 'primary', GOOGLE_AI_FALLBACK_MODELS: 'secondary' };
const validOutput = { riskScore: 40, verdict: 'attention', executiveSummary: 'Revisar as alterações.', findings: [], tests: [] };
const wait = async () => {};
const log = () => {};
function apiError(status: number, message = 'provider error', headers?: Record<string, string>) {
  return new APICallError({ statusCode: status, message, url: 'https://example.test', requestBodyValues: {}, responseHeaders: headers });
}

function mockProvider(responses: Array<{ status?: number; message?: string; output?: unknown }>) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const provider = createGoogleGenerativeAI({ apiKey: 'fake-test-key', fetch: async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    const response = responses[calls.length - 1];
    assert.ok(response, 'Unexpected additional HTTP attempt');
    const status = response.status ?? 200;
    return new Response(JSON.stringify(status === 200 ? {
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(response.output ?? validOutput) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    } : { error: { code: status, status: status === 503 ? 'UNAVAILABLE' : 'INVALID_ARGUMENT', message: response.message ?? 'This model is currently experiencing high demand' } }), { status, headers: { 'content-type': 'application/json' } });
  } });
  return { calls, modelFactory: (config: { modelId: string }) => provider(config.modelId) };
}

test('real SDK request: 503 primary → valid secondary response with actual model provenance', async () => {
  const mock = mockProvider([{ status: 503 }, {}]);
  const result = await generateAiReview(analysis, { env, ...mock, wait, log });
  assert.equal(result.mode, 'ai');
  assert.equal(result.model, 'google/secondary');
  assert.equal(mock.calls.length, 2);
  assert.match(mock.calls[0].url, /models\/primary:/);
  assert.match(mock.calls[1].url, /models\/secondary:/);
  assert.equal((mock.calls[0].body.generationConfig as Record<string, unknown>).temperature, undefined);
});

test('all models unavailable: bounded requests, correct local fallback, no configure-IA advice', async () => {
  const mock = mockProvider([{ status: 503 }, { status: 503 }, { status: 503 }]);
  const result = await applyAiReview({ ...analysis, limitations: ['Patch truncado.', 'Análise produzida por regras locais. Configure a camada de IA para obter revisão contextual.'] }, true, { env, ...mock, wait, log });
  assert.equal(mock.calls.length, 3);
  assert.equal(result.review.mode, 'deterministic');
  assert.equal(result.limitations[0], 'Patch truncado.');
  assert.match(result.limitations[1], /primary.*HTTP 503.*secondary/);
  assert.equal(result.limitations.some(s => s.includes('Configure a camada')), false);
});

test('unwrap SDK retry failure to recover HTTP status', () => {
  const error = new RetryError({ message: 'Failed after 3 attempts', reason: 'maxRetriesExceeded', errors: [apiError(503)] });
  assert.equal(classifyAiError(error).status, 503);
  assert.equal(classifyAiError(error).kind, 'unavailable');
});

for (const status of [400, 401, 403]) test(`HTTP ${status}: no retry or model switching`, async () => {
  let calls = 0;
  await assert.rejects(withAiRecovery(async () => { calls++; throw apiError(status); }, { models: ['a', 'b'], wait, log }), AiRecoveryError);
  assert.equal(calls, 1);
});

test('429 respects Retry-After and never switches model', async () => {
  const called: string[] = [], waits: number[] = [];
  await assert.rejects(withAiRecovery(async model => { called.push(model); throw apiError(429, 'quota', { 'retry-after': '3' }); }, {
    models: ['a', 'b'], log, wait: async ms => { waits.push(ms); },
  }), AiRecoveryError);
  assert.deepEqual(called, ['a', 'a', 'a']);
  assert.deepEqual(waits, [3000, 3000]);
});

test('Retry-After greater than budget does not send another request', async () => {
  let calls = 0;
  await assert.rejects(withAiRecovery(async () => { calls++; throw apiError(503, 'busy', { 'retry-after': '120' }); }, { models: ['a', 'b'], wait, log }), AiRecoveryError);
  assert.equal(calls, 1);
});

test('single model recovers with retry, no configured fallback required', async () => {
  let calls = 0;
  const result = await withAiRecovery(async () => { if (++calls === 1) throw apiError(503); return 'ok'; }, { models: ['a'], wait, log });
  assert.equal(result.value, 'ok');
  assert.equal(calls, 2);
});

test('removed model can use explicit alternative, but generic 404 stops', async () => {
  const called: string[] = [];
  const result = await withAiRecovery(async model => {
    called.push(model);
    if (model === 'a') throw apiError(400, 'This model models/a is no longer available to new users');
    return 'ok';
  }, { models: ['a', 'b'], wait, log });
  assert.equal(result.model, 'b');
  assert.deepEqual(called, ['a', 'b']);
  let calls = 0;
  await assert.rejects(withAiRecovery(async () => { calls++; throw apiError(404, 'Resource not found'); }, { models: ['a', 'b'], wait, log }), AiRecoveryError);
  assert.equal(calls, 1);
});

test('healthy provider is called once and successful review clears only local-configuration warning', async () => {
  const mock = mockProvider([{}]);
  const result = await applyAiReview({ ...analysis, limitations: ['Patch truncado.', 'Configure a camada de IA'] }, true, { env, ...mock, wait, log });
  assert.equal(mock.calls.length, 1);
  assert.equal(result.review.model, 'google/primary');
  assert.deepEqual(result.limitations, ['Patch truncado.']);
});

test('total deadline aborts in-flight request', async () => {
  await assert.rejects(withAiRecovery(async (_model, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }), { models: ['a'], budgetMs: 15, wait, log }), /tempo limite/);
});

test('invalid structured output is rejected, not retried or labeled AI', async () => {
  const mock = mockProvider([{ output: { ...validOutput, riskScore: 999 } }]);
  const result = await applyAiReview(analysis, true, { env, ...mock, wait, log });
  assert.equal(result.review.mode, 'deterministic');
  assert.match(result.limitations.join(' '), /validação/);
  assert.equal(mock.calls.length, 1);
});

test('useAi=false and missing/invalid config do not call provider', async () => {
  const modelFactory = () => { throw new Error('must not call'); };
  assert.equal(await applyAiReview(analysis, false, { env, modelFactory }), analysis);
  assert.match((await applyAiReview(analysis, true, { env: {}, modelFactory })).limitations.join(' '), /não configurada/);
  assert.match((await applyAiReview(analysis, true, { env: { AI_PROVIDER: 'google' }, modelFactory })).limitations.join(' '), /Configuração de IA inválida/);
});

test('safe diagnostics never expose response bodies, secrets or prompts', async () => {
  const events: unknown[] = [];
  const secret = 'sensitive-PR-and-api-key-value';
  await assert.rejects(withAiRecovery(async () => { throw apiError(401, secret); }, { models: ['a'], wait, log: event => events.push(event) }), error => {
    assert.ok(error instanceof AiRecoveryError);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
  assert.equal(JSON.stringify(events).includes(secret), false);
});

test('fallback list is opt-in, deduplicated, limited and same-provider only', () => {
  const config = { provider: 'google' as const, modelId: 'primary', displayModel: 'google/primary' };
  assert.deepEqual(resolveModelCandidates(config, {}), ['primary']);
  assert.deepEqual(resolveModelCandidates(config, { GOOGLE_AI_FALLBACK_MODELS: 'primary,secondary,secondary' }), ['primary', 'secondary']);
  assert.throws(() => resolveModelCandidates(config, { GOOGLE_AI_FALLBACK_MODELS: 'a,b,c' }));
  assert.deepEqual(resolveModelCandidates({ ...config, provider: 'openai' }, env), ['primary']);
});
