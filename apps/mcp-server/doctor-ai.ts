import { analysis } from '../../fixtures/payment.js';
import { generateAiReview, resolveAiConfiguration, resolveModelCandidates } from './ai-review.js';
import { AiRecoveryError } from './ai-recovery.js';

// Explicit diagnostic: one review of synthetic data, subject to provider billing.
try {
  const config = resolveAiConfiguration();
  if (!config) throw new Error('missing configuration');
  const models = resolveModelCandidates(config);
  console.log(JSON.stringify({ version: '0.5.2', provider: config.provider, models }));
  console.log('Testando a API com dados sintéticos; pode consumir cota/créditos. Nenhum PR real será enviado.');
  const review = await generateAiReview(analysis);
  console.log(JSON.stringify({ ok: true, mode: review.mode, model: review.model }));
} catch (error) {
  console.error(error instanceof AiRecoveryError ? error.message : 'Diagnóstico falhou. Verifique AI_PROVIDER, a chave e os modelos no ambiente efetivo do processo.');
  process.exitCode = 1;
}
