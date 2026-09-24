import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { analysis, explanations } from '../../fixtures/payment.js';
import { AnalysisSchema, ExplanationSchema, ReviewCommentPreviewSchema, ReviewCommentPublicationSchema, TestPlanSchema, type Analysis } from '../../packages/contracts/index.js';
import { fetchPullRequestAnalysis } from './github.js';
import { applyAiReview } from './ai-review.js';
import { prepareReviewComment, publishReviewComment } from './review-comments.js';

export const resourceUri = 'ui://cockpit/dashboard.html';
const analyses = new Map<string, Analysis>([[analysis.analysisId, analysis]]);
const MAX_ANALYSES = 20;

function previousAnalysis(current: Analysis) {
  return [...analyses.values()].reverse().find((candidate) => candidate.source === 'github' && candidate.repository === current.repository && candidate.prNumber === current.prNumber);
}

function withoutContextContents(current: Analysis): Analysis {
  if (!current.context) return current;
  return { ...current, context: { ...current.context, sources: current.context.sources.map(({ content: _content, ...source }) => source) } };
}

function compareAnalyses(previous: Analysis, current: Analysis) {
  const beforeFiles = new Set(previous.files.map((file) => file.path));
  const afterFiles = new Set(current.files.map((file) => file.path));
  const beforeFindings = new Map(previous.review.findings.map((finding) => [finding.id, finding.title]));
  const afterFindings = new Map(current.review.findings.map((finding) => [finding.id, finding.title]));
  return {
    previousHeadSha: previous.headSha, currentHeadSha: current.headSha,
    scoreDelta: current.review.riskScore - previous.review.riskScore,
    filesAdded: [...afterFiles].filter((path) => !beforeFiles.has(path)),
    filesRemoved: [...beforeFiles].filter((path) => !afterFiles.has(path)),
    findingsAdded: [...afterFindings].filter(([id]) => !beforeFindings.has(id)).map(([, title]) => title),
    findingsResolved: [...beforeFindings].filter(([id]) => !afterFindings.has(id)).map(([, title]) => title),
    checksChanged: previous.delivery.checksState !== current.delivery.checksState,
  };
}

function rememberAnalysis(value: Analysis) {
  analyses.delete(value.analysisId);
  analyses.set(value.analysisId, value);
  while (analyses.size > MAX_ANALYSES) {
    const oldest = analyses.keys().next().value;
    if (oldest) analyses.delete(oldest); else break;
  }
}

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
  const server = new McpServer({ name: 'ai-dev-cockpit', version: '0.6.0' });
  registerAppResource(server, 'Cockpit', resourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({ contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: await readFile(new URL('../../dist/ui/index.html', import.meta.url), 'utf8') }] }));
  registerAppTool(server, 'analyze_pr', {
    description: 'Analisa um PR e abre o AI Dev Cockpit. A IA é usada quando configurada; useAi=false força as regras locais.',
    inputSchema: { prUrl: z.string().url().optional(), useAi: z.boolean().optional(), refresh: z.boolean().optional() },
    outputSchema: AnalysisSchema.shape,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri } },
  }, async ({ prUrl, useAi, refresh }) => {
    try {
      let result = prUrl ? await fetchPullRequestAnalysis(prUrl, { refresh }) : analysis;
      if (prUrl) result = AnalysisSchema.parse(await applyAiReview(result, useAi));
      const previous = previousAnalysis(result);
      if (refresh && previous) result = AnalysisSchema.parse({ ...result, comparison: compareAnalyses(previous, result) });
      result = AnalysisSchema.parse(withoutContextContents(result));
      rememberAnalysis(result);
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
  registerAppTool(server, 'generate_tests', {
    description: 'Retorna um plano de testes não executado para o snapshot analisado, opcionalmente filtrado por arquivo.',
    inputSchema: { analysisId: z.string().min(1), filePath: z.string().min(1).optional() },
    outputSchema: TestPlanSchema.shape,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri, visibility: ['app', 'model'] } },
  }, async ({ analysisId, filePath }) => {
    try {
      const current = analyses.get(analysisId);
      if (!current) throw new Error('Análise expirada ou desconhecida. Execute analyze_pr novamente.');
      if (filePath && !current.files.some((file) => file.path === filePath)) throw new Error('Arquivo não pertence ao snapshot analisado.');
      const tests = current.review.tests.filter((test) => !filePath || test.relatedFiles.includes(filePath));
      const result = TestPlanSchema.parse({ analysisId, filePath, tests, executionStatus: 'not_run', disclaimer: 'Sugestões geradas para orientar a validação. Nenhum teste foi criado ou executado automaticamente.', generatedAt: new Date().toISOString() });
      return { content: [{ type: 'text', text: `${tests.length} teste(s) sugerido(s). Nenhum teste foi executado.` }], structuredContent: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao gerar o plano de testes.';
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  registerAppTool(server, 'prepare_review_comment', {
    description: 'Prepara a prévia integral do comentário consolidado sem publicar no GitHub.',
    inputSchema: { analysisId: z.string().min(1) },
    outputSchema: ReviewCommentPreviewSchema.shape,
    annotations: { readOnlyHint: true },
    _meta: { ui: { resourceUri, visibility: ['app', 'model'] } },
  }, async ({ analysisId }) => {
    try {
      const current = analyses.get(analysisId);
      if (!current || current.source !== 'github') throw new Error('Análise real expirada ou desconhecida. Execute analyze_pr novamente.');
      const result = prepareReviewComment(current);
      return { content: [{ type: 'text', text: 'Prévia preparada. Revise o conteúdo antes de publicar.' }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Falha ao preparar comentário.' }] };
    }
  });
  registerAppTool(server, 'publish_review_comment', {
    description: 'Publica ou atualiza o comentário consolidado no PR após confirmação explícita.',
    inputSchema: { analysisId: z.string().min(1), previewId: z.string().min(1), confirm: z.literal(true) },
    outputSchema: ReviewCommentPublicationSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    _meta: { ui: { resourceUri, visibility: ['app', 'model'] } },
  }, async ({ analysisId, previewId, confirm }) => {
    try {
      const current = analyses.get(analysisId);
      if (!current || current.source !== 'github') throw new Error('Análise real expirada ou desconhecida. Execute analyze_pr novamente.');
      const result = await publishReviewComment(current, previewId, confirm);
      return { content: [{ type: 'text', text: `Comentário ${result.action === 'created' ? 'publicado' : 'atualizado'} no GitHub.` }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Falha ao publicar comentário.' }] };
    }
  });
  return server;
}
