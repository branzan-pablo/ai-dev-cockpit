import { randomUUID } from 'node:crypto';
import { ReviewCommentPreviewSchema, ReviewCommentPublicationSchema, type Analysis, type ReviewCommentPreview } from '../../packages/contracts/index.js';
import { githubGet, githubRequest } from './github.js';

const PREVIEW_TTL_MS = 10 * 60_000;
const MAX_PREVIEWS = 20;
const MARKER = '<!-- ai-dev-cockpit-review -->';
const previews = new Map<string, ReviewCommentPreview>();

function cleanInline(value: string) { return value.replace(/[\r\n]+/g, ' ').trim(); }
function escapeTable(value: string) { return cleanInline(value).replace(/\|/g, '\\|'); }
function codeInline(value: string) { return cleanInline(value).replace(/`/g, 'ˋ'); }

export function renderReviewComment(analysis: Analysis) {
  const findings = analysis.review.findings.length
    ? analysis.review.findings.map((finding) => {
      const evidence = finding.evidence.map((item) => `\`${codeInline(item.filePath)}\`${item.line ? `:${item.line}` : ''}`).join(', ');
      const rules = finding.applicableRules?.length ? ` Regras: ${finding.applicableRules.map((path) => `\`${codeInline(path)}\``).join(', ')}.` : '';
      return `| ${finding.severity} | ${escapeTable(finding.title)} | ${escapeTable(finding.recommendation)} | ${evidence}${rules} |`;
    }).join('\n')
    : '| — | Nenhum achado automático | A revisão humana continua necessária. | — |';
  const tests = analysis.review.tests.length
    ? analysis.review.tests.map((test) => `- **${cleanInline(test.title)}** (${test.type}, ${test.priority}) — ${cleanInline(test.rationale)}`).join('\n')
    : '- Nenhum teste adicional foi sugerido.';
  const context = analysis.context?.sources.length
    ? analysis.context.sources.map((source) => `\`${codeInline(source.path)}\`${source.truncated ? ' (truncado)' : ''}`).join(', ')
    : 'Nenhuma fonte contextual aplicada.';
  const limitations = analysis.limitations.length ? `\n### Limitações\n${analysis.limitations.map((item) => `- ${cleanInline(item)}`).join('\n')}\n` : '';
  return `${MARKER}
## AI Dev Cockpit — revisão do snapshot \`${analysis.headSha.slice(0, 12)}\`

**Risco:** ${analysis.review.riskScore}/100 · **Veredito:** ${analysis.review.verdict} · **Modelo:** ${analysis.review.model ?? 'regras locais'}

${analysis.review.executiveSummary}

### Achados
| Severidade | Achado | Recomendação | Evidência |
| --- | --- | --- | --- |
${findings}

### Testes sugeridos
${tests}

### Contexto aplicado
${context}
${limitations}
> Gerado para o head SHA \`${analysis.headSha}\`. Revise as evidências antes do merge.`;
}

export function prepareReviewComment(analysis: Analysis) {
  const preview = ReviewCommentPreviewSchema.parse({
    analysisId: analysis.analysisId,
    previewId: randomUUID(),
    repository: analysis.repository,
    prNumber: analysis.prNumber,
    headSha: analysis.headSha,
    markdown: renderReviewComment(analysis),
    expiresAt: new Date(Date.now() + PREVIEW_TTL_MS).toISOString(),
  });
  previews.set(preview.previewId, preview);
  while (previews.size > MAX_PREVIEWS) previews.delete(previews.keys().next().value as string);
  return preview;
}

type PullHead = { head: { sha: string } };
type IssueComment = { id: number; body?: string; html_url: string; user?: { login: string } };
type GitHubUser = { login: string };

export async function publishReviewComment(analysis: Analysis, previewId: string, confirm: boolean) {
  if (!confirm) throw new Error('Confirmação explícita obrigatória para publicar no GitHub.');
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN com permissão de escrita é necessário para publicar.');
  const preview = previews.get(previewId);
  if (!preview || preview.analysisId !== analysis.analysisId) throw new Error('Prévia desconhecida. Gere uma nova prévia.');
  if (Date.parse(preview.expiresAt) <= Date.now()) { previews.delete(previewId); throw new Error('A prévia expirou. Gere uma nova prévia.'); }
  if (preview.headSha !== analysis.headSha) throw new Error('A prévia não pertence ao snapshot atual.');
  const [owner, repo] = analysis.repository.split('/');
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [pull, viewer] = await Promise.all([
    githubGet<PullHead>(`${apiBase}/pulls/${analysis.prNumber}`),
    githubGet<GitHubUser>('https://api.github.com/user'),
  ]);
  if (pull.head.sha !== analysis.headSha) throw new Error('O PR recebeu novos commits. Atualize a análise antes de publicar.');
  const comments = await githubGet<IssueComment[]>(`${apiBase}/issues/${analysis.prNumber}/comments?per_page=100`);
  const existing = comments.find((comment) => comment.user?.login === viewer.login && comment.body?.includes(MARKER));
  const result = existing
    ? await githubRequest<IssueComment>(`${apiBase}/issues/comments/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ body: preview.markdown }), headers: { 'Content-Type': 'application/json' } })
    : await githubRequest<IssueComment>(`${apiBase}/issues/${analysis.prNumber}/comments`, { method: 'POST', body: JSON.stringify({ body: preview.markdown }), headers: { 'Content-Type': 'application/json' } });
  previews.delete(previewId);
  console.error(JSON.stringify({ event: 'github_review_comment', repository: analysis.repository, prNumber: analysis.prNumber, headSha: analysis.headSha, status: existing ? 'updated' : 'created' }));
  return ReviewCommentPublicationSchema.parse({ analysisId: analysis.analysisId, repository: analysis.repository, prNumber: analysis.prNumber, headSha: analysis.headSha, commentUrl: result.html_url, action: existing ? 'updated' : 'created', publishedAt: new Date().toISOString() });
}
