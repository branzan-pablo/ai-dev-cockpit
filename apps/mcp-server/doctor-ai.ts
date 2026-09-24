import { analysis } from '../../fixtures/payment.js';
import { generateAiReview, probeAiProvider, resolveAiConfiguration, resolveModelCandidates } from './ai-review.js';
import { AiRecoveryError } from './ai-recovery.js';

// Explicit diagnostic: one review of synthetic data, subject to provider billing.
try {
  const config = resolveAiConfiguration();
  if (!config) throw new Error('missing configuration');
  const models = resolveModelCandidates(config);
  const probe = process.argv.includes('--probe');
  console.log(JSON.stringify({ version: '0.6.0', provider: config.provider, models, mode: probe ? 'api_probe' : 'review', attemptTimeoutMs: 20_000, budgetMs: 45_000 }));
  console.log('Testando a API; pode consumir cota/créditos. Nenhum PR real será enviado.');
  if (probe) {
    console.log(JSON.stringify(await probeAiProvider()));
  } else {
    const review = await generateAiReview(analysis);
    console.log(JSON.stringify({ ok: true, mode: review.mode, model: review.model }));
  }
} catch (error) {
  console.error(error instanceof AiRecoveryError ? error.message : 'Diagnóstico falhou. Verifique AI_PROVIDER, a chave e os modelos no ambiente efetivo do processo.');
  process.exitCode = 1;
}
