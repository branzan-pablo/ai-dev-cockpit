import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@modelcontextprotocol/ext-apps';
import { AnalysisSchema, ExplanationSchema, type Analysis, type Explanation } from '../../packages/contracts/index.js';
import './style.css';
function Cockpit(){
 const appRef=useRef<App|null>(null);
 const [data,setData]=useState<Analysis|null>(null);
 const [selected,setSelected]=useState('src/payment.ts');
 const [detail,setDetail]=useState<Explanation|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [connected,setConnected]=useState(false);
 useEffect(()=>{
  const app=new App({name:'AI Dev Cockpit',version:'0.1.0'});appRef.current=app;
  let disposed=false;
  app.ontoolresult=(result)=>{
   if(disposed)return;
   const parsed=AnalysisSchema.safeParse(result.structuredContent);
   if(parsed.success){setData(parsed.data);setSelected(parsed.data.files[0]?.path??'');setDetail(null);setError('');return;}
   const explanation=ExplanationSchema.safeParse(result.structuredContent);
   if(explanation.success){setDetail(explanation.data);setSelected(explanation.data.filePath);return;}
   setError('O servidor retornou dados incompatíveis. Solicite novamente a análise.');
  };
  if(window.parent===window){setError('Abra este painel em um cliente compatível com MCP Apps.');return;}
  void app.connect().then(()=>{if(!disposed)setConnected(true);}).catch(()=>{if(!disposed)setError('Não foi possível conectar ao cliente de IA.');});
  return ()=>{disposed=true;appRef.current=null;void app.close();};
 },[]);
 async function explain(){
  if(!data||!appRef.current)return;
  setBusy(true);setError('');setDetail(null);
  try{
   const result=await appRef.current.callServerTool({name:'explain_change',arguments:{analysisId:data.analysisId,filePath:selected}});
   if(result.isError)throw new Error('tool failed');
   setDetail(ExplanationSchema.parse(result.structuredContent));
  }catch{setError('Não foi possível consultar a explicação. Tente novamente.');}finally{setBusy(false);}
 }
 const file=data?.files.find(f=>f.path===selected);
 const priorities={high:'Alta',medium:'Média',low:'Baixa'};
 const real=data?.source==='github';
 return <main><header><div><span className="eyebrow">AI DEV COCKPIT</span><h1>Revisão com contexto</h1></div><span className={`badge ${real?'live':''}`}>{real?'GitHub real':'Demonstração'}</span></header><p className="notice">{real?'Metadados e diffs obtidos da API do GitHub. Prioridades e explicações ainda usam regras determinísticas, sem IA.':'Dados sintéticos e explicações pré-definidas.'}</p>{error&&<p role="alert" className="error">{error}</p>}{!data?<p role="status">{connected?'Peça ao assistente para chamar analyze_pr informando a URL do PR.':'Aguardando conexão e análise…'}</p>:<><section><span className="eyebrow">{data.repository} · PR #{data.prNumber} · {data.state}</span><h2>{data.title}</h2><p>{data.summary}</p><small>{data.files.length} arquivos exibidos · Snapshot {data.headSha.slice(0,12)}</small>{data.partial&&<p className="warning">Análise parcial: confira as limitações abaixo.</p>}{data.limitations.length>0&&<ul className="limitations">{data.limitations.map(item=><li key={item}>{item}</li>)}</ul>}</section><div className="layout"><nav aria-label="Arquivos alterados">{data.files.map(f=><button disabled={busy} key={f.path} aria-pressed={selected===f.path} onClick={()=>{setSelected(f.path);setDetail(null);setError('');}}><strong>{f.path}</strong><span>Prioridade {priorities[f.priority]} · +{f.additions} / −{f.deletions}</span></button>)}</nav><section className="file"><h2>{file?.path}</h2><pre aria-label="Trecho alterado"><code>{file?.diff}</code></pre><button className="primary" disabled={busy||!connected||!file} onClick={()=>void explain()}>{busy?'Consultando servidor…':'Explicar alteração'}</button><div aria-live="polite">{detail&&detail.filePath===selected&&<article><h3>O que merece atenção</h3><p>{detail.explanation}</p><h3>O que verificar</h3><p>{detail.check}</p><small>Resposta do servidor: {new Date(detail.requestedAt).toLocaleTimeString('pt-BR')}</small></article>}</div></section></div><footer>A prioridade orienta a revisão humana; não representa garantia de segurança.</footer></>}</main>;
}
createRoot(document.getElementById('root')!).render(<Cockpit/>);
