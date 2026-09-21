# Arquitetura proposta

## Componentes
- apps/mcp-server: tools MCP, recurso HTML, integração GitHub e chamadas ao provedor de IA.
- apps/cockpit-ui: React/TypeScript, UI e comunicação com o host pelo SDK MCP Apps.
- packages/contracts: tipos e schemas compartilhados.
- fixtures: dados sintéticos e respostas para demonstração.

## Fluxo
1. Usuário pede análise; o modelo do host invoca analyze_pr.
2. Servidor obtém um snapshot do PR e analisa seu conteúdo.
3. Host carrega o recurso UI e entrega o resultado estruturado.
4. UI chama tools pelo host ao selecionar ações.
5. Servidor retorna resultados; UI atualiza o painel correspondente.

Um clique não implica uma nova decisão do modelo do host. O servidor chama seu próprio provedor de IA nas operações que exigem geração. Credencial e custos dessa API são separados da assinatura do cliente.

## Contratos propostos
| Tool | Entrada | Saída |
| --- | --- | --- |
| analyze_pr | owner, repo, prNumber | analysisId, baseSha, headSha, summary, files, findings, coverage |
| analyze_file | analysisId, filePath | findings, evidence, limitations |
| explain_change | analysisId, filePath, findingId opcional | explanation, potentialImpact, checks |
| generate_tests | analysisId, findingId | fileName, code, framework, scenario, executionStatus=not_run |

Analysis: schemaVersion, analysisId, source (github/fixture), repository, prNumber, baseSha, headSha, generatedAt, status (complete/partial), coverage e limitations.
Finding: id, filePath, priority (high/medium/low), title, rationale, evidence e limitations.
Evidence: trecho, lado do diff, linha inicial/final quando disponíveis. Validar contra o snapshot; não inventar linhas.
TestSuggestion: código, cenário, suposições e status não executado.

## Decisões iniciais
- Um monorepositório simples; evitar infraestrutura adicional antes de M1.
- Memória com TTL e limites para a PoC; reinício pode exigir nova análise.
- Todas as ações vinculadas ao mesmo snapshot. Detectar head SHA novo e oferecer reanálise.
- UI compacta com prioridade explicada; sem score numérico de risco no MVP.
- Transporte e configuração do host definidos e testados em M1.
- Sem banco, autenticação de produto ou deploy público nesta etapa. Endpoint remoto, se necessário, exige proteção apropriada antes de expor código privado.

## Confiabilidade
Validar inputs e outputs. Restringir consultas a arquivos do snapshot. Credenciais apenas no servidor e fora dos logs. Tratar código e descrição do PR como entrada não confiável. Limitar tamanho, tempo e chamadas de IA; informar omissões. Não executar código do repositório. Ausência de achados não representa garantia de segurança.

## Referências para M1
- https://modelcontextprotocol.io/extensions/apps/overview
- https://modelcontextprotocol.io/extensions/apps/build
- https://modelcontextprotocol.io/extensions/client-matrix

Verificar documentação e versões no início da implementação; suporte varia por cliente.
