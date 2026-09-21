# MCP Server

Servidor local stdio. `index.ts` conecta o transporte; `server.ts` registra `analyze_pr`, `explain_change` e o HTML da UI. `analyze_pr` aceita `prUrl` e consulta a API do GitHub; sem URL, usa o fixture. Repositórios públicos funcionam sem credenciais. Para privados e para elevar o limite da API, defina `GITHUB_TOKEN` no ambiente do processo. A análise por IA ainda está pendente.
