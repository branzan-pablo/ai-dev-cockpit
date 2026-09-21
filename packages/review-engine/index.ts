import { createHash } from 'node:crypto';
import type { ChangedFile, Finding, Review, TestSuggestion } from '../contracts/index.js';

const extensionLanguages: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React', css: 'CSS', scss: 'SCSS', html: 'HTML',
  json: 'JSON', md: 'Markdown', yml: 'YAML', yaml: 'YAML', sql: 'SQL', prisma: 'Prisma', svg: 'SVG', py: 'Python',
  java: 'Java', kt: 'Kotlin', go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP', sh: 'Shell',
};

export function inferFileMetadata(path: string): Pick<ChangedFile, 'kind' | 'language'> {
  const lower = path.toLowerCase();
  const extension = lower.split('.').pop() ?? '';
  let kind: ChangedFile['kind'] = 'source';
  if (/(^|\/)(test|tests|__tests__|e2e)(\/|$)|\.(test|spec)\.[^.]+$/.test(lower)) kind = 'test';
  else if (/\.(md|mdx|txt|rst)$/.test(lower)) kind = 'documentation';
  else if (/(^|\/)(migrations?|prisma)(\/|$)|\.(sql|prisma)$/.test(lower)) kind = 'migration';
  else if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|package\.json)$/.test(lower)) kind = 'dependency';
  else if (/\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf)$/.test(lower)) kind = 'asset';
  else if (/(^|\/)(\.github|config)(\/|$)|\.(ya?ml|toml|ini|env|config\.[^.]+)$/.test(lower)) kind = 'configuration';
  else if (!extensionLanguages[extension]) kind = 'other';
  return { kind, language: extensionLanguages[extension] ?? (extension ? extension.toUpperCase() : 'Text') };
}

function stableId(prefix: string, value: string) { return `${prefix}-${createHash('sha1').update(value).digest('hex').slice(0, 10)}`; }
function addedLines(file: ChangedFile) { return file.diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')); }
function evidence(file: ChangedFile, pattern: RegExp) {
  const lines = file.diff.split('\n');
  const index = lines.findIndex((line) => pattern.test(line));
  return [{ filePath: file.path, excerpt: (lines[index] ?? file.diff.slice(0, 300)).slice(0, 500) }];
}

export function buildDeterministicReview(files: ChangedFile[]): Review {
  const findings: Finding[] = [];
  const tests: TestSuggestion[] = [];
  for (const file of files) {
    const additions = addedLines(file).join('\n');
    const rules: Array<{ pattern: RegExp; severity: Finding['severity']; category: Finding['category']; title: string; description: string; recommendation: string }> = [
      { pattern: /\bNaN\b/, severity: 'high', category: 'correctness', title: 'Valor não numérico no artefato', description: 'O diff adiciona NaN onde consumidores esperam um valor numérico válido.', recommendation: 'Valide valores finitos antes de gerar o artefato e cubra o caso com um teste.' },
      { pattern: /(password|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']+/i, severity: 'critical', category: 'security', title: 'Possível segredo adicionado ao código', description: 'O diff parece conter uma credencial ou segredo literal.', recommendation: 'Remova o valor, revogue a credencial e use o gerenciador de segredos do ambiente.' },
      { pattern: /\b(eval|new Function)\s*\(/, severity: 'high', category: 'security', title: 'Execução dinâmica de código', description: 'O código adicionado executa texto como código e pode ampliar a superfície de ataque.', recommendation: 'Substitua a execução dinâmica por uma implementação explícita e valide qualquer entrada externa.' },
      { pattern: /randomUUID\s*\(|idempoten/i, severity: 'high', category: 'reliability', title: 'Identidade de tentativa merece revisão', description: 'Uma nova identidade dentro do fluxo pode impedir deduplicação entre tentativas.', recommendation: 'Garanta que repetições da mesma operação reutilizem a mesma chave de idempotência.' },
      { pattern: /console\.(log|debug)\s*\(/, severity: 'low', category: 'maintainability', title: 'Log de depuração adicionado', description: 'Logs diretos podem gerar ruído ou expor dados no ambiente de produção.', recommendation: 'Use o logger da aplicação com nível e sanitização apropriados, ou remova o log.' },
      { pattern: /dangerouslySetInnerHTML/, severity: 'high', category: 'security', title: 'HTML inserido diretamente', description: 'HTML dinâmico pode permitir XSS quando o conteúdo não é confiável.', recommendation: 'Evite HTML direto ou sanitize o conteúdo com uma política restritiva e testes de segurança.' },
      { pattern: /target=["']_blank["'](?![^>]*rel=)/i, severity: 'medium', category: 'security', title: 'Link externo sem isolamento explícito', description: 'Uma nova aba sem rel adequado pode permitir acesso à página de origem.', recommendation: 'Adicione rel="noopener noreferrer" ao link.' },
    ];
    for (const rule of rules) {
      if (!rule.pattern.test(additions)) continue;
      findings.push({ id: stableId('rule', `${file.path}:${rule.title}`), severity: rule.severity, category: rule.category, title: rule.title, description: rule.description, recommendation: rule.recommendation, confidence: 'medium', evidence: evidence(file, rule.pattern), source: 'rule' });
    }
    if (file.kind === 'source' && file.priority === 'high') tests.push({ id: stableId('test', file.path), title: `Cobrir o caminho alterado em ${file.path}`, rationale: 'Arquivo de alta prioridade alterado sem confirmação de cobertura no snapshot.', type: 'unit', priority: 'high', relatedFiles: [file.path], source: 'rule' });
    if (file.kind === 'migration') tests.push({ id: stableId('migration-test', file.path), title: 'Validar migração e rollback', rationale: 'Mudanças persistentes devem ser verificadas em banco vazio e com dados existentes.', type: 'integration', priority: 'high', relatedFiles: [file.path], source: 'rule' });
  }
  const productionFiles = files.filter((file) => file.kind === 'source' || file.kind === 'migration');
  if (productionFiles.length > 0 && !files.some((file) => file.kind === 'test')) tests.push({ id: stableId('test', 'missing-tests'), title: 'Adicionar cobertura para o comportamento alterado', rationale: `${productionFiles.length} arquivo(s) de produção foram alterados e nenhum teste aparece no PR.`, type: 'integration', priority: 'medium', relatedFiles: productionFiles.slice(0, 5).map((file) => file.path), source: 'rule' });
  const weights: Record<Finding['severity'], number> = { critical: 45, high: 25, medium: 12, low: 5, info: 1 };
  const riskScore = Math.min(100, findings.reduce((sum, finding) => sum + weights[finding.severity], 0) + files.filter((file) => file.priority === 'high').length * 4);
  const verdict: Review['verdict'] = findings.some((finding) => finding.severity === 'critical') || riskScore >= 70 ? 'block' : riskScore >= 20 ? 'attention' : 'approve';
  return {
    mode: 'deterministic', generatedAt: new Date().toISOString(), riskScore, verdict,
    executiveSummary: findings.length > 0 ? `${findings.length} ponto(s) de atenção identificado(s) por regras locais. Revise as evidências antes do merge.` : 'Nenhum padrão de risco conhecido foi identificado pelas regras locais. A revisão humana continua necessária.',
    findings, tests,
  };
}
