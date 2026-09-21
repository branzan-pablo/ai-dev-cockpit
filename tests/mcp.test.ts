import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AnalysisSchema, ExplanationSchema } from '../packages/contracts/index.js';

test('stdio: discovery, UI resource, analysis, interaction and invalid input',async()=>{
 const client=new Client({name:'cockpit-test',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','apps/mcp-server/index.ts']});
 try{
  await client.connect(transport);
  const list=await client.listTools();
  assert.deepEqual(list.tools.map(t=>t.name).sort(),['analyze_pr','explain_change']);
  const result=await client.callTool({name:'analyze_pr',arguments:{}});
  const analysis=AnalysisSchema.parse(result.structuredContent);
  assert.equal(analysis.source,'fixture');
  assert.equal(analysis.files.length,3);
  const ui=await client.readResource({uri:'ui://cockpit/dashboard.html'});
  assert.equal(ui.contents[0].mimeType,'text/html;profile=mcp-app');
  assert.ok('text' in ui.contents[0] && ui.contents[0].text.includes('AI Dev Cockpit'));
  for(const file of analysis.files){
   const explanation=await client.callTool({name:'explain_change',arguments:{analysisId:analysis.analysisId,filePath:file.path}});
   const parsed=ExplanationSchema.parse(explanation.structuredContent);
   assert.equal(parsed.filePath,file.path);
   assert.ok(parsed.explanation.length>20);
  }
  const invalid=await client.callTool({name:'explain_change',arguments:{analysisId:analysis.analysisId,filePath:'../../.env'}});
  assert.equal(invalid.isError,true);
  const stale=await client.callTool({name:'explain_change',arguments:{analysisId:'unknown',filePath:'src/payment.ts'}});
  assert.equal(stale.isError,true);
 }finally{await client.close();}
});
