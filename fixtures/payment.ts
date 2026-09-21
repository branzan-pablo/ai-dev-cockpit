import { AnalysisSchema } from '../packages/contracts/index.js';
import { buildDeterministicReview, inferFileMetadata } from '../packages/review-engine/index.js';

const files = [
  { path: 'src/payment.ts', status: 'modified', priority: 'high' as const, additions: 2, deletions: 1, diff: '- await charge(order.id);\n+ const key = crypto.randomUUID();\n+ await charge(order.id, key);', patchAvailable: true },
  { path: 'src/retry.ts', status: 'modified', priority: 'medium' as const, additions: 1, deletions: 1, diff: '- if (error.transient) retry();\n+ retry();', patchAvailable: true },
  { path: 'src/button.ts', status: 'modified', priority: 'low' as const, additions: 1, deletions: 1, diff: '- label = "Pagar";\n+ label = "Confirmar pagamento";', patchAvailable: true },
].map((file) => ({ ...file, ...inferFileMetadata(file.path) }));

export const analysis = AnalysisSchema.parse({
  schemaVersion: 2, analysisId: 'demo-payment-v2', source: 'fixture', title: 'Retry no processamento de pagamentos',
  repository: 'demo/payment-service', prNumber: 142, state: 'demo', author: 'demo-user', baseRef: 'main', headRef: 'feat/payment-retry', headSha: 'fixture-v2',
  summary: 'Exemplo sintético: revise a identidade da operação durante tentativas de pagamento e o tratamento de erros.',
  description: 'Cenário seguro para validar a experiência do cockpit sem consultar serviços externos.',
  partial: false, limitations: ['Dados sintéticos; nenhuma consulta ao GitHub foi realizada.'], files,
  review: buildDeterministicReview(files),
  delivery: { checksState: 'success', total: 3, successful: 3, failed: 0 },
});

export const explanations: Record<string, { explanation: string; check: string }> = {
  'src/payment.ts': { explanation: 'Se uma nova chave for criada a cada tentativa, o provedor pode interpretar o mesmo pagamento como operações distintas. Este trecho isolado não comprova cobrança duplicada.', check: 'Verificar se as tentativas do mesmo pedido reutilizam a chave de idempotência.' },
  'src/retry.ts': { explanation: 'A condição que restringia retries a erros transitórios foi removida. Erros permanentes podem ser repetidos.', check: 'Cobrir erro permanente e limite máximo de tentativas.' },
  'src/button.ts': { explanation: 'O texto do botão foi alterado; o trecho não modifica o processamento de pagamento.', check: 'Conferir clareza do rótulo e nome acessível.' },
};
