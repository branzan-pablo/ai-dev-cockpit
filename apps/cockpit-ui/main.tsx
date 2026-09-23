import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { AnalysisSchema, ExplanationSchema, type Analysis, type Explanation, type Finding } from '../../packages/contracts/index.js';
import './style.css';

type Tab = 'overview' | 'findings' | 'files' | 'tests';
const priorityLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' } as const;
const severityLabels = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa', info: 'Info' } as const;
const verdictLabels = { approve: 'Baixo risco', attention: 'Requer atenção', block: 'Bloquear merge' } as const;
const kindLabels = { source: 'Código', test: 'Teste', documentation: 'Documentação', configuration: 'Configuração', asset: 'Asset', migration: 'Migração', dependency: 'Dependência', other: 'Outro' } as const;

function Diff({ value }: { value: string }) {
  return <pre aria-label="Trecho alterado"><code>{value.split('\n').map((line, index) => <span key={`${index}-${line.slice(0, 20)}`} className={line.startsWith('+') ? 'added' : line.startsWith('-') ? 'deleted' : 'context'}>{line || ' '}\n</span>)}</code></pre>;
}

function Cockpit() {
  const appRef = useRef<App | null>(null);
  const [data, setData] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState<Explanation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [fileQuery, setFileQuery] = useState('');

  useEffect(() => {
    const app = new App({ name: 'AI Dev Cockpit', version: '0.5.2' });
    appRef.current = app;
    let disposed = false;
    app.ontoolresult = (result) => {
      if (disposed) return;
      const parsed = AnalysisSchema.safeParse(result.structuredContent);
      if (parsed.success) {
        setData(parsed.data); setSelected(parsed.data.files[0]?.path ?? ''); setDetail(null); setError(''); setTab('overview');
        return;
      }
      const explanation = ExplanationSchema.safeParse(result.structuredContent);
      if (explanation.success) { setDetail(explanation.data); setSelected(explanation.data.filePath); return; }
      setError('O servidor retornou dados incompatíveis. Execute a análise novamente.');
    };
    if (window.parent === window) { setError('Abra este painel em um cliente compatível com MCP Apps.'); return; }
    void app.connect().then(() => { if (!disposed) setConnected(true); }).catch(() => { if (!disposed) setError('Não foi possível conectar ao cliente de IA.'); });
    return () => { disposed = true; appRef.current = null; void app.close(); };
  }, []);

  const file = data?.files.find((candidate) => candidate.path === selected);
  const filteredFiles = useMemo(() => data?.files.filter((candidate) => candidate.path.toLowerCase().includes(fileQuery.toLowerCase())) ?? [], [data, fileQuery]);
  const counts = useMemo(() => {
    const initial = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    return data?.review.findings.reduce((result, finding) => ({ ...result, [finding.severity]: result[finding.severity] + 1 }), initial) ?? initial;
  }, [data]);

  async function explain() {
    if (!data || !appRef.current || !file) return;
    setBusy(true); setError(''); setDetail(null);
    try {
      const result = await appRef.current.callServerTool({ name: 'explain_change', arguments: { analysisId: data.analysisId, filePath: selected } });
      if (result.isError) throw new Error('tool failed');
      setDetail(ExplanationSchema.parse(result.structuredContent));
    } catch { setError('Não foi possível consultar a explicação. Tente novamente.'); } finally { setBusy(false); }
  }

  async function refreshAnalysis() {
    if (!data?.prUrl || !appRef.current) return;
    setBusy(true); setError('');
    try {
      const result = await appRef.current.callServerTool({ name: 'analyze_pr', arguments: { prUrl: data.prUrl, useAi: data.review.mode === 'ai', refresh: true } });
      if (result.isError) throw new Error('tool failed');
      const next = AnalysisSchema.parse(result.structuredContent);
      setData(next); setSelected(next.files[0]?.path ?? ''); setDetail(null);
    } catch { setError('Não foi possível atualizar o PR. Verifique o acesso ao GitHub e tente novamente.'); } finally { setBusy(false); }
  }

  async function openExternal(url: string) {
    try { await appRef.current?.openLink({ url }); } catch { setError('O cliente bloqueou a abertura do link externo.'); }
  }

  function openFinding(finding: Finding) {
    setSelected(finding.evidence[0]?.filePath ?? ''); setDetail(null); setTab('files');
  }

  if (!data) return <main className="shell"><header><div><span className="eyebrow">AI DEV COCKPIT</span><h1>Revisão com contexto</h1></div></header>{error && <p role="alert" className="error">{error}</p>}<section className="empty"><span className="pulse" /><h2>{connected ? 'Cockpit conectado' : 'Conectando ao servidor…'}</h2><p>{connected ? 'Peça ao assistente para chamar analyze_pr informando a URL do Pull Request.' : 'Aguardando o cliente MCP.'}</p></section></main>;

  const real = data.source === 'github';
  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">AI DEV COCKPIT</span><h1>{data.title}</h1><p className="meta">{data.repository} · PR #{data.prNumber} · {data.author ? `por @${data.author} · ` : ''}{data.state}</p></div><div className="headerActions"><div className="headerBadges"><span className={`badge verdict-${data.review.verdict}`}>{verdictLabels[data.review.verdict]}</span><span className={`badge ${real ? 'live' : ''}`}>{real ? 'GitHub real' : 'Demonstração'}</span></div>{real && <div className="actionRow">{data.delivery.previewUrl && <button className="secondary" onClick={() => void openExternal(data.delivery.previewUrl!)}>Abrir preview</button>}<button className="secondary" disabled={busy} onClick={() => void refreshAnalysis()}>{busy ? 'Atualizando…' : 'Atualizar PR'}</button></div>}</div></header>
    <div className="modebar"><span className={`modeDot ${data.review.mode}`} /> <strong>{data.review.mode === 'ai' ? 'Análise por IA' : 'Análise local'}</strong>{data.review.model && <span> · {data.review.model}</span>}<span className="snapshot">Snapshot {data.headSha.slice(0, 12)}</span></div>
    {error && <p role="alert" className="error">{error}</p>}
    <nav className="tabs" aria-label="Seções do cockpit">{(['overview', 'findings', 'files', 'tests'] as Tab[]).map((item) => <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item === 'overview' ? 'Visão geral' : item === 'findings' ? `Achados (${data.review.findings.length})` : item === 'files' ? `Arquivos (${data.files.length})` : `Testes (${data.review.tests.length})`}</button>)}</nav>

    {tab === 'overview' && <div className="overview">
      <section className="hero"><div className={`score verdict-${data.review.verdict}`}><strong>{data.review.riskScore}</strong><span>risco / 100</span></div><div><span className="eyebrow">RESUMO EXECUTIVO</span><h2>{verdictLabels[data.review.verdict]}</h2><p>{data.review.executiveSummary}</p></div></section>
      <div className="metrics"><section><strong>{data.files.length}</strong><span>arquivos</span></section><section><strong>{counts.critical + counts.high}</strong><span>riscos altos</span></section><section><strong>{data.review.tests.length}</strong><span>testes sugeridos</span></section><section><strong className={`ci-${data.delivery.checksState}`}>{data.delivery.checksState === 'success' ? 'Passando' : data.delivery.checksState === 'failure' ? 'Falhando' : data.delivery.checksState === 'pending' ? 'Pendente' : 'Sem status'}</strong><span>CI · {data.delivery.successful}/{data.delivery.total}</span></section></div>
      <div className="overviewGrid"><section><span className="eyebrow">ALTERAÇÃO</span><p>{data.summary}</p>{data.description && <p className="description">{data.description}</p>}<div className="branch"><span>{data.baseRef ?? 'base'}</span><b>←</b><span>{data.headRef ?? 'head'}</span></div></section><section><span className="eyebrow">DISTRIBUIÇÃO</span><div className="kindList">{Object.entries(kindLabels).map(([kind, label]) => { const amount = data.files.filter((item) => item.kind === kind).length; return amount ? <span key={kind}>{label}<strong>{amount}</strong></span> : null; })}</div></section></div>
      {data.limitations.length > 0 && <section className="limitations"><span className="eyebrow">LIMITAÇÕES</span><ul>{data.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    </div>}

    {tab === 'findings' && <section className="panel"><div className="sectionHeading"><div><span className="eyebrow">REVISÃO</span><h2>Achados priorizados</h2></div><div className="severitySummary"><span className="critical">{counts.critical} crítica</span><span className="high">{counts.high} alta</span><span className="medium">{counts.medium} média</span></div></div>{data.review.findings.length === 0 ? <div className="empty compact"><h3>Nenhum achado automático</h3><p>As regras e o modelo não encontraram um problema sustentado pelo diff. Isso não substitui a revisão humana.</p></div> : <div className="findingList">{data.review.findings.map((finding) => <article className="finding" key={finding.id}><div className="findingTop"><span className={`severity ${finding.severity}`}>{severityLabels[finding.severity]}</span><span className="category">{finding.category}</span><span className="source">{finding.source === 'ai' ? 'IA' : 'Regra local'}</span></div><h3>{finding.title}</h3><p>{finding.description}</p><blockquote><code>{finding.evidence[0]?.excerpt}</code></blockquote><p className="recommendation"><strong>Recomendação:</strong> {finding.recommendation}</p><button className="secondary" onClick={() => openFinding(finding)}>Abrir {finding.evidence[0]?.filePath}</button></article>)}</div>}</section>}

    {tab === 'files' && <div className="fileLayout"><aside><label htmlFor="file-search">Filtrar arquivos</label><input id="file-search" value={fileQuery} onChange={(event) => setFileQuery(event.target.value)} placeholder="Nome do arquivo…" /> <div className="fileList">{filteredFiles.map((item) => <button key={item.path} aria-pressed={selected === item.path} onClick={() => { setSelected(item.path); setDetail(null); setError(''); }}><span className="fileKind">{kindLabels[item.kind]} · {item.language}</span><strong>{item.path}</strong><span>Prioridade {priorityLabels[item.priority]} · <i>+{item.additions}</i> / <em>−{item.deletions}</em></span></button>)}</div></aside><section className="filePanel">{file ? <><div className="sectionHeading"><div><span className="eyebrow">{kindLabels[file.kind]} · {file.language} · {file.status}</span><h2>{file.path}</h2></div><span className={`priority ${file.priority}`}>Prioridade {priorityLabels[file.priority]}</span></div><Diff value={file.diff} /><button className="primary" disabled={busy || !connected} onClick={() => void explain()}>{busy ? 'Consultando servidor…' : 'Explicar alteração'}</button><div aria-live="polite">{detail?.filePath === selected && <article className="explanation"><span className="eyebrow">EXPLICAÇÃO {detail.mode === 'ai' ? 'POR IA' : 'LOCAL'}</span><h3>O que merece atenção</h3><p>{detail.explanation}</p><h3>O que verificar</h3><p>{detail.check}</p></article>}</div></> : <div className="empty compact"><p>Nenhum arquivo corresponde ao filtro.</p></div>}</section></div>}

    {tab === 'tests' && <section className="panel"><div className="sectionHeading"><div><span className="eyebrow">PLANO DE VALIDAÇÃO</span><h2>Testes sugeridos</h2></div></div>{data.review.tests.length === 0 ? <div className="empty compact"><p>Nenhuma sugestão automática para este snapshot.</p></div> : <div className="testGrid">{data.review.tests.map((test) => <article className="testCard" key={test.id}><div><span className={`priority ${test.priority}`}>{priorityLabels[test.priority]}</span><span className="category">{test.type.toUpperCase()}</span></div><h3>{test.title}</h3><p>{test.rationale}</p><small>{test.relatedFiles.join(' · ') || 'Validação transversal'} · {test.source === 'ai' ? 'IA' : 'Regra local'}</small></article>)}</div>}</section>}
    <footer>O cockpit orienta a revisão humana; achados automáticos não constituem garantia de segurança ou correção.</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Cockpit />);
