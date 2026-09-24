import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import {
  AnalysisSchema, ExplanationSchema, ReviewCommentPreviewSchema, ReviewCommentPublicationSchema, TestPlanSchema,
  type Analysis, type Explanation, type Finding, type ReviewCommentPreview, type TestPlan,
} from '../../packages/contracts/index.js';
import './style.css';

type Tab = 'overview' | 'findings' | 'files' | 'tests';
type Task = 'refresh' | 'explain' | 'tests' | 'preview' | 'publish' | null;
const tabs: Tab[] = ['overview', 'findings', 'files', 'tests'];
const priorityLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' } as const;
const severityLabels = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', info: 'Info' } as const;
const verdictLabels = { approve: 'Baixo risco', attention: 'Requer atenção', block: 'Bloquear merge' } as const;
const kindLabels = { source: 'Código', test: 'Teste', documentation: 'Documentação', configuration: 'Configuração', asset: 'Asset', migration: 'Migração', dependency: 'Dependência', other: 'Outro' } as const;

function githubFileUrl(data: Analysis, path: string, line?: number) {
  return `https://github.com/${data.repository}/blob/${data.headSha}/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
}

function Diff({ value, highlights = [] }: { value: string; highlights?: string[] }) {
  let oldLine = 0; let newLine = 0;
  const rows = value.split('\n').map((line, index) => {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) { oldLine = Number(header[1]); newLine = Number(header[2]); return { line, old: '', next: '', kind: 'context', index }; }
    const added = line.startsWith('+') && !line.startsWith('+++');
    const deleted = line.startsWith('-') && !line.startsWith('---');
    const result = { line: line || ' ', old: added ? '' : String(oldLine || ''), next: deleted ? '' : String(newLine || ''), kind: added ? 'added' : deleted ? 'deleted' : 'context', index };
    if (!added) oldLine += 1; if (!deleted) newLine += 1;
    return result;
  });
  return <div className="diff" role="region" aria-label="Trecho alterado" tabIndex={0}><code>{rows.map((row) => <span key={`${row.index}-${row.line.slice(0, 20)}`} className={`${row.kind} ${highlights.some((excerpt) => excerpt && row.line.includes(excerpt.trim())) ? 'evidenceLine' : ''}`}><i>{row.old}</i><i>{row.next}</i><b>{row.line}</b></span>)}</code></div>;
}

function Cockpit() {
  const appRef = useRef<App | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [data, setData] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [selected, setSelected] = useState('');
  const [activeFindingId, setActiveFindingId] = useState('');
  const [detail, setDetail] = useState<Explanation | null>(null);
  const [testPlan, setTestPlan] = useState<TestPlan | null>(null);
  const [preview, setPreview] = useState<ReviewCommentPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [task, setTask] = useState<Task>(null);
  const [connected, setConnected] = useState(false);
  const [fileQuery, setFileQuery] = useState('');

  useEffect(() => {
    const app = new App({ name: 'AI Dev Cockpit', version: '0.6.0' });
    appRef.current = app;
    let disposed = false;
    app.ontoolresult = (result) => {
      if (disposed) return;
      const parsed = AnalysisSchema.safeParse(result.structuredContent);
      if (parsed.success) { setData(parsed.data); setSelected(parsed.data.files[0]?.path ?? ''); setDetail(null); setTestPlan(null); setError(''); setTab('overview'); return; }
      const explanation = ExplanationSchema.safeParse(result.structuredContent);
      if (explanation.success) { setDetail(explanation.data); setSelected(explanation.data.filePath); }
    };
    if (window.parent === window) {
      if (import.meta.env.DEV) {
        void import('./demo.js').then(({ demoAnalysis }) => {
          if (disposed) return;
          const parsed = AnalysisSchema.parse(demoAnalysis);
          setData(parsed); setSelected(parsed.files[0]?.path ?? ''); setConnected(true);
        }).catch(() => { if (!disposed) setError('Não foi possível carregar a demonstração local.'); });
        return;
      }
      setError('Abra este painel em um cliente compatível com MCP Apps.'); return;
    }
    void app.connect().then(() => { if (!disposed) setConnected(true); }).catch(() => { if (!disposed) setError('Não foi possível conectar ao cliente de IA. Reinicie o servidor MCP.'); });
    return () => { disposed = true; appRef.current = null; void app.close(); };
  }, []);

  const file = data?.files.find((candidate) => candidate.path === selected);
  const activeFinding = data?.review.findings.find((finding) => finding.id === activeFindingId);
  const filteredFiles = useMemo(() => data?.files.filter((candidate) => candidate.path.toLowerCase().includes(fileQuery.toLowerCase())) ?? [], [data, fileQuery]);
  const counts = useMemo(() => {
    const initial = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    return data?.review.findings.reduce((result, finding) => ({ ...result, [finding.severity]: result[finding.severity] + 1 }), initial) ?? initial;
  }, [data]);

  async function invoke<T>(name: string, args: Record<string, unknown>, parse: (value: unknown) => T, activeTask: Exclude<Task, null>) {
    if (!appRef.current) throw new Error('Cliente MCP desconectado.');
    setTask(activeTask); setError(''); setNotice('');
    try {
      const result = await appRef.current.callServerTool({ name, arguments: args });
      if (result.isError) throw new Error(result.content?.find((item) => item.type === 'text')?.text ?? 'A ferramenta falhou.');
      return parse(result.structuredContent);
    } finally { setTask(null); }
  }

  async function explain() {
    if (!data || !file) return;
    try { setDetail(await invoke('explain_change', { analysisId: data.analysisId, filePath: selected }, (value) => ExplanationSchema.parse(value), 'explain')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível consultar a explicação.'); }
  }

  async function refreshAnalysis() {
    if (!data?.prUrl) return;
    try {
      const next = await invoke('analyze_pr', { prUrl: data.prUrl, useAi: data.review.mode === 'ai', refresh: true }, (value) => AnalysisSchema.parse(value), 'refresh');
      setData(next); setSelected(next.files[0]?.path ?? ''); setDetail(null); setTestPlan(null); setNotice(next.comparison ? 'Snapshot atualizado e comparado com a análise anterior.' : 'Snapshot atualizado.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o PR.'); }
  }

  async function generateTests(filePath?: string) {
    if (!data) return;
    try { setTestPlan(await invoke('generate_tests', { analysisId: data.analysisId, ...(filePath ? { filePath } : {}) }, (value) => TestPlanSchema.parse(value), 'tests')); setTab('tests'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o plano de testes.'); }
  }

  async function copyTestPlan() {
    const tests = testPlan?.tests ?? data?.review.tests ?? [];
    const text = ['Implemente e execute os testes abaixo, seguindo as regras do repositório:', ...tests.map((test) => `- ${test.title}: ${test.rationale} (${test.relatedFiles.join(', ') || 'transversal'})`)].join('\n');
    try { await navigator.clipboard.writeText(text); setNotice('Instrução de testes copiada. Nenhum arquivo foi modificado.'); }
    catch { setError('O host bloqueou a área de transferência. Copie o plano manualmente.'); }
  }

  async function prepareComment() {
    if (!data) return;
    try { const next = await invoke('prepare_review_comment', { analysisId: data.analysisId }, (value) => ReviewCommentPreviewSchema.parse(value), 'preview'); setPreview(next); dialogRef.current?.showModal(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o comentário.'); }
  }

  async function publishComment() {
    if (!data || !preview) return;
    try {
      const result = await invoke('publish_review_comment', { analysisId: data.analysisId, previewId: preview.previewId, confirm: true }, (value) => ReviewCommentPublicationSchema.parse(value), 'publish');
      dialogRef.current?.close(); setPreview(null); setNotice(`Comentário ${result.action === 'created' ? 'publicado' : 'atualizado'} no GitHub.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível publicar o comentário.'); }
  }

  async function openExternal(url: string) { try { await appRef.current?.openLink({ url }); } catch { setError('O cliente bloqueou a abertura do link externo.'); } }
  function openFinding(finding: Finding) { setSelected(finding.evidence[0]?.filePath ?? ''); setActiveFindingId(finding.id); setDetail(null); setTab('files'); }
  function onTabKeyDown(event: React.KeyboardEvent, current: number) {
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(tabs[next]); tabRefs.current[next]?.focus();
  }

  if (!data) return <main className="shell"><header><span className="eyebrow">AI DEV COCKPIT</span><h1>Revisão com contexto</h1></header>{error ? <p role="alert" className="error">{error}</p> : null}<section className="empty" aria-live="polite"><span className="pulse" aria-hidden="true" /><h2>{connected ? 'Cockpit conectado' : 'Conectando ao servidor…'}</h2><p>{connected ? 'Peça ao assistente para analisar a URL de um Pull Request.' : 'Aguardando o cliente MCP.'}</p></section></main>;

  const real = data.source === 'github';
  const displayedTests = testPlan?.tests ?? data.review.tests;
  return <main className="shell" aria-busy={task !== null}>
    <header className="topbar"><div><span className="eyebrow">AI DEV COCKPIT</span><h1>{data.title}</h1><p className="meta">{data.repository} · PR #{data.prNumber} · {data.author ? `por @${data.author} · ` : ''}{data.state}</p></div><div className="headerActions"><div className="headerBadges"><span className={`badge verdict-${data.review.verdict}`}>{verdictLabels[data.review.verdict]}</span><span className={`badge ${real ? 'live' : ''}`}>{real ? 'GitHub real' : 'Demonstração'}</span></div>{real ? <div className="actionRow">{data.delivery.previewUrl ? <button className="secondary" onClick={() => void openExternal(data.delivery.previewUrl!)}>Abrir preview</button> : null}<button className="secondary" disabled={task !== null} onClick={() => void prepareComment()}>{task === 'preview' ? 'Preparando…' : 'Comentar no PR'}</button><button className="secondary" disabled={task !== null} onClick={() => void refreshAnalysis()}>{task === 'refresh' ? 'Atualizando…' : 'Atualizar PR'}</button></div> : null}</div></header>
    <div className="modebar"><span className={`modeDot ${data.review.mode}`} aria-hidden="true" /><strong>{data.review.mode === 'ai' ? 'Análise por IA' : 'Análise local'}</strong>{data.review.model ? <span> · {data.review.model}</span> : null}<button className="snapshot" onClick={() => void openExternal(`https://github.com/${data.repository}/commit/${data.headSha}`)}>Snapshot {data.headSha.slice(0, 12)}</button></div>
    <div className="announcements" aria-live="polite">{notice ? <p className="notice">{notice}</p> : null}{error ? <p role="alert" className="error">{error}</p> : null}</div>
    <nav className="tabs" role="tablist" aria-label="Seções do cockpit">{tabs.map((item, index) => <button ref={(node) => { tabRefs.current[index] = node; }} id={`tab-${item}`} role="tab" aria-selected={tab === item} aria-controls={`panel-${item}`} tabIndex={tab === item ? 0 : -1} key={item} onKeyDown={(event) => onTabKeyDown(event, index)} onClick={() => setTab(item)}>{item === 'overview' ? 'Visão geral' : item === 'findings' ? `Achados (${data.review.findings.length})` : item === 'files' ? `Arquivos (${data.files.length})` : `Testes (${data.review.tests.length})`}</button>)}</nav>

    {tab === 'overview' ? <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="overview">
      <section className="hero"><div className={`riskRail verdict-${data.review.verdict}`}><strong>{data.review.riskScore}</strong><span>risco / 100</span></div><div><span className="eyebrow">RESUMO EXECUTIVO</span><h2>{verdictLabels[data.review.verdict]}</h2><p>{data.review.executiveSummary}</p></div></section>
      <div className="metrics"><section><strong>{data.files.length}</strong><span>arquivos</span></section><section><strong>{counts.critical + counts.high}</strong><span>riscos altos</span></section><section><strong>{data.review.tests.length}</strong><span>testes sugeridos</span></section><section><strong className={`ci-${data.delivery.checksState}`}>{data.delivery.checksState === 'success' ? 'Passando' : data.delivery.checksState === 'failure' ? 'Falhando' : data.delivery.checksState === 'pending' ? 'Pendente' : 'Sem status'}</strong><span>CI · {data.delivery.successful}/{data.delivery.total}</span></section></div>
      {data.review.riskFactors?.length ? <section className="riskFactors"><span className="eyebrow">COMO O RISCO FOI COMPOSTO</span>{data.review.riskFactors.map((factor) => <div key={`${factor.label}-${factor.contribution}`}><strong className={factor.contribution < 0 ? 'credit' : ''}>{factor.contribution > 0 ? '+' : ''}{factor.contribution}</strong><span><b>{factor.label}</b><small>{factor.reason}</small></span></div>)}</section> : null}
      {data.comparison ? <section className="comparison"><span className="eyebrow">DESDE O SNAPSHOT {data.comparison.previousHeadSha.slice(0, 8)}</span><div><strong>{data.comparison.scoreDelta > 0 ? '+' : ''}{data.comparison.scoreDelta}</strong> risco · {data.comparison.findingsAdded.length} novos · {data.comparison.findingsResolved.length} resolvidos · {data.comparison.filesAdded.length + data.comparison.filesRemoved.length} arquivos mudaram</div></section> : null}
      <div className="overviewGrid"><section><span className="eyebrow">ALTERAÇÃO</span><p>{data.summary}</p>{data.description ? <p className="description">{data.description}</p> : null}<div className="branch"><span>{data.baseRef ?? 'base'}</span><b>←</b><span>{data.headRef ?? 'head'}</span></div></section><section><span className="eyebrow">DISTRIBUIÇÃO</span><div className="kindList">{Object.entries(kindLabels).map(([kind, label]) => { const amount = data.files.filter((item) => item.kind === kind).length; return amount ? <span key={kind}>{label}<strong>{amount}</strong></span> : null; })}</div></section></div>
      <section className="contextPanel"><div className="sectionHeading"><div><span className="eyebrow">CONTEXTO APLICADO</span><h2>{data.context?.sources.length ?? 0} fontes do projeto</h2></div><span className={`contextStatus ${data.context?.status ?? 'not_found'}`}>{data.context?.status === 'applied' ? 'Completo' : data.context?.status === 'partial' ? 'Parcial' : data.context?.status === 'invalid' ? 'Configuração inválida' : 'Não encontrado'}</span></div>{data.context?.message ? <p>{data.context.message}</p> : null}{data.context?.sources.length ? <ul className="contextList">{data.context.sources.map((source) => <li key={source.path}><code>{source.path}</code><span>{source.kind}{source.truncated ? ' · truncado' : ''} · {source.appliesTo.length} arquivo(s)</span></li>)}</ul> : <p>Nenhuma regra convencional ou configurada foi encontrada no snapshot.</p>}</section>
      {data.limitations.length ? <section className="limitations"><span className="eyebrow">LIMITAÇÕES</span><ul>{data.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
    </div> : null}

    {tab === 'findings' ? <section id="panel-findings" role="tabpanel" aria-labelledby="tab-findings" className="panel"><div className="sectionHeading"><div><span className="eyebrow">REVISÃO</span><h2>Achados priorizados</h2></div><div className="severitySummary"><span className="critical">{counts.critical} crítica</span><span className="high">{counts.high} alta</span><span className="medium">{counts.medium} média</span></div></div>{data.review.findings.length === 0 ? <div className="empty compact"><h3>Nenhum achado automático</h3><p>As regras e o modelo não encontraram um problema sustentado pelo diff. Isso não substitui a revisão humana.</p></div> : <div className="findingList">{data.review.findings.map((finding) => <article className="finding" key={finding.id}><div className="findingTop"><span className={`severity ${finding.severity}`}>{severityLabels[finding.severity]}</span><span className="category">{finding.category}</span><span className="source">{finding.source === 'ai' ? 'IA' : 'Regra local'}</span></div><h3>{finding.title}</h3><p>{finding.description}</p><div className="evidenceList">{finding.evidence.map((evidence, index) => <blockquote key={`${evidence.filePath}-${index}`}><code>{evidence.excerpt}</code><button onClick={() => void openExternal(githubFileUrl(data, evidence.filePath, evidence.line))}>Abrir {evidence.filePath}{evidence.line ? `:${evidence.line}` : ''}</button></blockquote>)}</div>{finding.applicableRules?.length ? <p className="appliedRules"><strong>Regras:</strong> {finding.applicableRules.join(' · ')}</p> : null}<p className="recommendation"><strong>Recomendação:</strong> {finding.recommendation}</p><button className="secondary" onClick={() => openFinding(finding)}>Ver no diff</button></article>)}</div>}</section> : null}

    {tab === 'files' ? <div id="panel-files" role="tabpanel" aria-labelledby="tab-files" className="fileLayout"><aside><label htmlFor="file-search">Filtrar arquivos</label><input id="file-search" name="file-search" autoComplete="off" value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Ex.: src/components…" /> <div className="fileList">{filteredFiles.map((item) => <button key={item.path} aria-pressed={selected === item.path} onClick={() => { setSelected(item.path); setActiveFindingId(''); setDetail(null); setError(''); }}><span className="fileKind">{kindLabels[item.kind]} · {item.language}</span><strong>{item.path}</strong><span>Prioridade {priorityLabels[item.priority]} · <i>+{item.additions}</i> / <em>−{item.deletions}</em></span></button>)}</div></aside><section className="filePanel">{file ? <><div className="sectionHeading"><div><span className="eyebrow">{kindLabels[file.kind]} · {file.language} · {file.status}</span><h2>{file.path}</h2></div><span className={`priority ${file.priority}`}>Prioridade {priorityLabels[file.priority]}</span></div><Diff value={file.diff} highlights={activeFinding?.evidence.filter((item) => item.filePath === file.path).map((item) => item.excerpt) ?? []} /><div className="fileActions"><button className="primary" disabled={task !== null || !connected} onClick={() => void explain()}>{task === 'explain' ? 'Consultando…' : 'Explicar alteração'}</button><button className="secondary" disabled={task !== null} onClick={() => void generateTests(file.path)}>Gerar testes</button><button className="secondary" onClick={() => void openExternal(githubFileUrl(data, file.path))}>Abrir no GitHub</button></div><div aria-live="polite">{detail?.filePath === selected ? <article className="explanation"><span className="eyebrow">EXPLICAÇÃO {detail.mode === 'ai' ? 'POR IA' : 'LOCAL'}</span><h3>O que merece atenção</h3><p>{detail.explanation}</p><h3>O que verificar</h3><p>{detail.check}</p></article> : null}</div></> : <div className="empty compact"><p>Nenhum arquivo corresponde ao filtro.</p></div>}</section></div> : null}

    {tab === 'tests' ? <section id="panel-tests" role="tabpanel" aria-labelledby="tab-tests" className="panel"><div className="sectionHeading"><div><span className="eyebrow">PLANO DE VALIDAÇÃO</span><h2>{testPlan?.filePath ? `Testes para ${testPlan.filePath}` : 'Testes sugeridos'}</h2></div><div className="actionRow"><button className="secondary" disabled={task !== null} onClick={() => void generateTests()}>{task === 'tests' ? 'Gerando…' : 'Gerar plano detalhado'}</button><button className="secondary" disabled={!displayedTests.length} onClick={() => void copyTestPlan()}>Copiar para o Copilot</button></div></div>{testPlan ? <p className="disclaimer"><strong>Não executado.</strong> {testPlan.disclaimer}</p> : null}{displayedTests.length === 0 ? <div className="empty compact"><p>Nenhuma sugestão automática para este snapshot.</p></div> : <div className="testGrid">{displayedTests.map((test) => <article className="testCard" key={test.id}><div><span className={`priority ${test.priority}`}>{priorityLabels[test.priority]}</span><span className="category">{test.type.toUpperCase()}</span></div><h3>{test.title}</h3><p>{test.rationale}</p><small>{test.relatedFiles.join(' · ') || 'Validação transversal'} · {test.source === 'ai' ? 'IA' : 'Regra local'}</small></article>)}</div>}</section> : null}

    <footer>O cockpit orienta a revisão humana; achados automáticos não garantem segurança ou correção.</footer>
    <dialog ref={dialogRef} aria-labelledby="review-dialog-title" onClose={() => setPreview(null)}><div className="dialogHeader"><div><span className="eyebrow">PUBLICAÇÃO NO GITHUB</span><h2 id="review-dialog-title">Revise o comentário</h2></div><button className="secondary" onClick={() => dialogRef.current?.close()}>Fechar</button></div><p>Esta ação publicará ou atualizará um único comentário em <strong>{preview?.repository}#{preview?.prNumber}</strong>, no snapshot <code>{preview?.headSha.slice(0, 12)}</code>.</p><pre className="markdownPreview">{preview?.markdown}</pre><div className="dialogActions"><button className="secondary" onClick={() => dialogRef.current?.close()}>Cancelar</button><button className="danger" disabled={task === 'publish'} onClick={() => void publishComment()}>{task === 'publish' ? 'Publicando…' : 'Confirmar publicação'}</button></div></dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Cockpit />);
