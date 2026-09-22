import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AnalysisSchema, ExplanationSchema, TestPlanSchema } from '../packages/contracts/index.js';
import { classifyPriority, parsePullRequestUrl } from '../apps/mcp-server/github.js';
import { buildDeterministicReview, inferFileMetadata } from '../packages/review-engine/index.js';
import { prepareAiInput, resolveAiConfiguration } from '../apps/mcp-server/ai-review.js';
import { analysis as fixtureAnalysis } from '../fixtures/payment.js';

test('validates GitHub PR URLs and deterministic priorities', () => {
  assert.deepEqual(parsePullRequestUrl('https://github.com/branzan-pablo/largada/pull/22'), { owner: 'branzan-pablo', repo: 'largada', prNumber: 22 });
  assert.throws(() => parsePullRequestUrl('https://example.com/a/b/pull/1'));
  assert.throws(() => parsePullRequestUrl('https://github.com/a/b/issues/1'));
  assert.equal(classifyPriority({ filename: 'public/pix.svg', patch: '+ viewBox="0 0 NaN NaN"', additions: 1, deletions: 0 }), 'high');
});

test('classifies files and creates evidence-based deterministic findings', () => {
  assert.deepEqual(inferFileMetadata('src/components/button.tsx'), { kind: 'source', language: 'TypeScript React' });
  assert.equal(inferFileMetadata('e2e/checkout.spec.ts').kind, 'test');
  assert.equal(inferFileMetadata('prisma/migrations/001.sql').kind, 'migration');
  const file = {
    path: 'public/image.svg', status: 'modified', priority: 'high' as const, kind: 'asset' as const, language: 'SVG',
    additions: 1, deletions: 0, diff: '+<svg viewBox="0 0 NaN NaN">', patchAvailable: true,
  };
  const review = buildDeterministicReview([file]);
  assert.equal(review.mode, 'deterministic');
  assert.equal(review.findings[0]?.category, 'correctness');
  assert.equal(review.findings[0]?.evidence[0]?.filePath, file.path);
  assert.ok(review.riskScore >= 20);
});

test('prepares bounded AI input and redacts obvious secrets', () => {
  const input = prepareAiInput({ ...fixtureAnalysis, files: fixtureAnalysis.files.map((file, index) => index === 0 ? { ...file, diff: '+ token = "ghp_abcdefghijklmnopqrstuvwxyz123456"' } : file) });
  assert.ok(input.files.length > 0);
  assert.equal(JSON.stringify(input).includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), false);
  assert.equal(JSON.stringify(input).includes('[REDACTED'), true);
});

test('resolves direct and gateway AI providers without exposing credentials', () => {
  assert.deepEqual(resolveAiConfiguration({ AI_PROVIDER: 'google', GOOGLE_GENERATIVE_AI_API_KEY: 'test' }), {
    provider: 'google', modelId: 'gemini-3.8-flash', displayModel: 'google/gemini-3.8-flash',
  });
  assert.deepEqual(resolveAiConfiguration({ OPENAI_API_KEY: 'test', OPENAI_MODEL: 'gpt-5.6' }), {
    provider: 'openai', modelId: 'gpt-5.6', displayModel: 'openai/gpt-5.6',
  });
  assert.deepEqual(resolveAiConfiguration({ AI_GATEWAY_API_KEY: 'test', AI_MODEL: 'openai/gpt-5.6-luna' }), {
    provider: 'gateway', modelId: 'openai/gpt-5.6-luna', displayModel: 'openai/gpt-5.6-luna',
  });
  assert.throws(() => resolveAiConfiguration({ AI_PROVIDER: 'google' }), /GOOGLE_GENERATIVE_AI_API_KEY/);
  assert.throws(() => resolveAiConfiguration({ AI_PROVIDER: 'unknown' }), /AI_PROVIDER inválido/);
});

test('stdio: discovery, UI resource, analysis, interaction and invalid input',async()=>{
 const client=new Client({name:'cockpit-test',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','apps/mcp-server/index.ts']});
 try{
  await client.connect(transport);
  const list=await client.listTools();
  assert.deepEqual(list.tools.map(t=>t.name).sort(),['analyze_pr','explain_change','generate_tests']);
  const result=await client.callTool({name:'analyze_pr',arguments:{useAi:false}});
  const analysis=AnalysisSchema.parse(result.structuredContent);
  assert.equal(analysis.source,'fixture');
  assert.equal(analysis.files.length,3);
  assert.equal(analysis.schemaVersion,2);
  assert.ok(analysis.review.findings.length>0);
  const ui=await client.readResource({uri:'ui://cockpit/dashboard.html'});
  assert.equal(ui.contents[0].mimeType,'text/html;profile=mcp-app');
  assert.ok('text' in ui.contents[0] && ui.contents[0].text.includes('AI Dev Cockpit'));
  for(const file of analysis.files){
   const explanation=await client.callTool({name:'explain_change',arguments:{analysisId:analysis.analysisId,filePath:file.path}});
   const parsed=ExplanationSchema.parse(explanation.structuredContent);
   assert.equal(parsed.filePath,file.path);
   assert.ok(parsed.explanation.length>20);
  }
  const plan=await client.callTool({name:'generate_tests',arguments:{analysisId:analysis.analysisId,filePath:'src/payment.ts'}});
  const parsedPlan=TestPlanSchema.parse(plan.structuredContent);
  assert.equal(parsedPlan.executionStatus,'not_run');
  assert.ok(parsedPlan.tests.length>0);
  const invalid=await client.callTool({name:'explain_change',arguments:{analysisId:analysis.analysisId,filePath:'../../.env'}});
  assert.equal(invalid.isError,true);
  const stale=await client.callTool({name:'explain_change',arguments:{analysisId:'unknown',filePath:'src/payment.ts'}});
  assert.equal(stale.isError,true);
 }finally{await client.close();}
});

test('real PR through GitHub API when REAL_PR_URL is provided', { skip: !process.env.REAL_PR_URL }, async()=>{
 const client=new Client({name:'cockpit-real-test',version:'1.0.0'});
 const env=Object.fromEntries(Object.entries({
  PATH:process.env.PATH,
  Path:process.env.Path,
  SystemRoot:process.env.SystemRoot,
  HTTPS_PROXY:process.env.HTTPS_PROXY,
  HTTP_PROXY:process.env.HTTP_PROXY,
  NO_PROXY:process.env.NO_PROXY,
  https_proxy:process.env.https_proxy,
  http_proxy:process.env.http_proxy,
  no_proxy:process.env.no_proxy,
  ALL_PROXY:process.env.ALL_PROXY,
  all_proxy:process.env.all_proxy,
  NODE_USE_ENV_PROXY:process.env.NODE_USE_ENV_PROXY,
  NODE_EXTRA_CA_CERTS:process.env.NODE_EXTRA_CA_CERTS,
  GITHUB_TOKEN:process.env.GITHUB_TOKEN,
 }).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
 const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','apps/mcp-server/index.ts'],env});
 try {
  await client.connect(transport);
  const result=await client.callTool({name:'analyze_pr',arguments:{prUrl:process.env.REAL_PR_URL}});
  assert.equal(result.isError,undefined);
  const analysis=AnalysisSchema.parse(result.structuredContent);
  assert.equal(analysis.source,'github');
  assert.ok(analysis.files.length>0);
  assert.ok(analysis.files.some(file=>file.patchAvailable));
 } finally { await client.close(); }
});
