import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { analysis, explanations } from '../../fixtures/payment.js';
import { AnalysisSchema, ExplanationSchema } from '../../packages/contracts/index.js';
export const resourceUri = 'ui://cockpit/dashboard.html';
export function createServer() {
 const server = new McpServer({name:'ai-dev-cockpit',version:'0.1.0'});
 registerAppResource(server,'Cockpit',resourceUri,{mimeType:RESOURCE_MIME_TYPE},async()=>({contents:[{uri:resourceUri,mimeType:RESOURCE_MIME_TYPE,text:await readFile(new URL('../../dist/ui/index.html',import.meta.url),'utf8')}]}));
 registerAppTool(server,'analyze_pr',{description:'Abre o AI Dev Cockpit com o PR sintético de demonstração. Não consulta GitHub nem IA.',inputSchema:{},outputSchema:AnalysisSchema.shape,annotations:{readOnlyHint:true},_meta:{ui:{resourceUri}}},async()=>({content:[{type:'text',text:'Demonstração com dados sintéticos. '+analysis.summary}],structuredContent:analysis}));
 registerAppTool(server,'explain_change',{description:'Retorna explicação pré-definida de um arquivo do PR de demonstração.',inputSchema:{analysisId:z.literal('demo-payment-v1'),filePath:z.enum(['src/payment.ts','src/retry.ts','src/button.ts'])},outputSchema:ExplanationSchema.shape,annotations:{readOnlyHint:true},_meta:{ui:{resourceUri,visibility:['app','model']}}},async({analysisId,filePath})=>{
  const result=ExplanationSchema.parse({analysisId,source:'fixture',filePath,...explanations[filePath],requestedAt:new Date().toISOString()});
  return {content:[{type:'text',text:result.explanation}],structuredContent:result};
 });
 return server;
}
