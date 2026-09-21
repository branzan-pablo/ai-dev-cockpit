# Troubleshooting

## Start não abre uma página

Correto: o servidor usa stdio e espera um cliente MCP. Abra o Chat do Copilot e peça a chamada de `analyze_pr`; a interface aparece no resultado da tool.

## A interface antiga continua aparecendo

1. Execute `git pull` e `npm ci`.
2. Execute `npm run check` para reconstruir `dist/ui/index.html`.
3. Em `.vscode/mcp.json`, use **Restart** no servidor.
4. Faça uma nova chamada a `analyze_pr`; respostas antigas da conversa não são re-renderizadas.

## Só aparece texto, sem dashboard

Confirme que está no VS Code/Copilot com MCP Apps habilitado e que a tool usada pertence ao servidor `ai-dev-cockpit`. Outros agentes podem ler a URL diretamente e responder texto sem invocar nossa tool.

## A análise aparece como local

Crie `.env`, preencha `AI_GATEWAY_API_KEY` e reinicie o servidor. O topo do dashboard informa **Análise por IA** e o modelo quando a chamada foi bem-sucedida. Se a IA falhar, a limitação exibirá o motivo resumido e o fallback local.

## PR privado não é encontrado

Configure `GITHUB_TOKEN` com acesso de leitura ao repositório e reinicie. Um HTTP 404 também pode significar que o token não tem acesso. Não cole o token no chat nem em `.vscode/mcp.json`.

## Rate limit do GitHub

Configure `GITHUB_TOKEN`, aguarde o horário indicado ou use **Atualizar PR** depois. O cache reduz chamadas repetidas durante dois minutos.

## O botão Abrir preview não aparece

O botão só existe quando um commit status contém uma URL HTTPS associada a Vercel, preview ou deployment. O PR pode não ter preview, pode usar Check Runs em vez de statuses ou o provedor pode não publicar URL.

## Alterei `.env` e nada mudou

Variáveis são lidas quando o processo Node inicia. Reinicie `ai-dev-cockpit` pelo controle sobre `.vscode/mcp.json`.

## Diagnóstico local

```powershell
node --version
npm ci
npm run check
npm start
```

`npm start` deve permanecer aguardando em silêncio. Encerre com `Ctrl+C`; isso não é uma falha.
