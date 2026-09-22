# MCP Server

Servidor local stdio. `server.ts` registra `analyze_pr`, `explain_change`, `generate_tests` e o recurso da UI. `github.ts` consulta PRs e statuses; `ai-review.ts` seleciona Google, OpenAI ou Vercel AI Gateway e executa a revisão estruturada opcional; o review engine fornece fallback local. Consulte o README raiz para ambiente e execução.
