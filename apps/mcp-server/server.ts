import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { analysis, explanations } from '../../fixtures/payment.js';
import { AnalysisSchema, ExplanationSchema, type Analysis } from '../../packages/contracts/index.js';
import { fetchPullRequestAnalysis } from './github.js';
import { generateAiReview, isAiConfigured } from './ai-review.js';

export const resourceUri = 'ui://cockpit/dashboard.html';
const analyses = new Map<string, Analysis>([[analysis.analysisId, analysis]]);

function explainFile(current: Analysis, filePath: string) {
  const file = current.files.find((candidate) => candidate.path === filePath);
  if (!file) throw new Error('Arquivo não pertence ao snapshot analisado.');
  if (current.source === 'fixture') return explanations[filePath];
  const aiFindings = current.review.findings.filter((finding) => finding.source === 'ai' && finding.evidence.some((item) => item.filePath === filePath));
  if (aiFindings.length > 0) return {
    explanation: aiFindings.map((finding) => `${finding.title}: ${finding.description}`).join('\n\n'),
    check: aiFindings.map((finding) => finding.recommendation).join('\n\n'),
    mode: 'ai' as const,
  };
  const patch = file.diff.toLowerCase();
  if (/\bnan\b/.test(patch)) return { explanation: 'O diff contém NaN em um valor que deveria ser numérico. Isso pode produzir um recurso inválido ou impossível de interpretar.', check: 'Regere o artefato com dimensões válidas e acrescente uma validação que rejeite valores não finitos.' };
  if (/randomuuid|idempoten/.test(patch)) return { explanation: 'O diff altera a identidade usada durante uma operação repetível. Uma chave nova a cada tentativa pode impedir a deduplicação.', check: 'Confirme que tentativas da mesma operação reutilizam a mesma chave de idempotência.' };
  if (!file.patchAvailable) return { explanation: 'O GitHub não disponibilizou um patch textual para este arquivo, então não é possível justificar uma análise linha a linha.', check: 'Abra o arquivo no GitHub e valide a alteração manualmente.' };
  return { explanation: `O arquivo ${file.status} possui +${file.additions} / −${file.deletions}. A prioridade ${file.priority} foi calculada por regras de caminho, conteúdo e tamanho do diff — não por IA.`, check: 'Revise o diff completo, confirme o comportamento esperado e verifique se há cobertura automatizada para o caminho alterado.' };
}

export function createServer() {
  const server = new McpServer({ name: 'ai-dev-cockpit', version: '0.3.0' });
  registerAppResource(server, 'Cockpit', resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({ contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await readFile(new URL('../../dist/ui/index.html', import.meta.url), 'utf8') }] }));
  registerAppTool(server, 'analyze_pr', {
    description: 'Analisa um PR e abre o AI Dev Cockpit. A IA é usada quando configurada; useAi=false força as regras locais.',
    inputSchema: { prUrl: z.string().url().optional(), useAi: z.boolean().optional() },
    outputSchema: AnalysisSchema.shape,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri } },
  }, async ({ prUrl, useAi }) => {
    try {
      let result = prUrl ? await fetchPullRequestAnalysis(prUrl) : analysis;
      if (prUrl && useAi !== false) {
        if (isAiConfigured()) {
          try {
            result = AnalysisSchema.parse({ ...result, review: await generateAiReview(result), limitations: result.limitations.filter((item) => !item.includes('Configure a camada de IA')) });
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'erro desconhecido';
            result = AnalysisSchema.parse({ ...result, limitations: [...result.limitations, `A IA falhou (${reason.slice(0, 160)}); exibindo análise local.`] });
          }
        } else {
          result = AnalysisSchema.parse({ ...result, limitations: [...result.limitations, 'Para ativar a IA, configure AI_GATEWAY_API_KEY no ambiente do servidor.'] });
        }
      }
      analyses.set(result.analysisId, result);
      return { content: [{ type: 'text', text: `Cockpit aberto para ${result.repository}#${result.prNumber}. ${result.summary}` }], structuredContent: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha desconhecida ao consultar o GitHub.';
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  registerAppTool(server, 'explain_change', {
    description: 'Explica um arquivo pertencente ao snapshot retornado por analyze_pr.',
    inputSchema: { analysisId: z.string().min(1), filePath: z.string().min(1) },
    outputSchema: ExplanationSchema.shape,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri, visibility: ['app', 'model'] } },
  }, async ({ analysisId, filePath }) => {
    try {
      const current = analyses.get(analysisId);
      if (!current) throw new Error('Análise expirada ou desconhecida. Execute analyze_pr novamente.');
      const result = ExplanationSchema.parse({ analysisId, source: current.source, filePath, ...explainFile(current, filePath), requestedAt: new Date().toISOString() });
      return { content: [{ type: 'text', text: result.explanation }], structuredContent: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao explicar o arquivo.';
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  return server;
}
