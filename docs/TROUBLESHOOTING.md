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

Crie `.env`, selecione um provedor e reinicie o servidor. Para Google:

```dotenv
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=sua-chave
```

O topo do dashboard informa **Análise por IA** e o modelo quando a chamada foi bem-sucedida. Se a IA falhar, a limitação exibirá o motivo resumido e o fallback local.

## Tenho ChatGPT Plus; por que preciso de outra chave?

O servidor MCP não pode reutilizar sua sessão ou assinatura do ChatGPT. ChatGPT e API da OpenAI têm autenticação e faturamento separados. Use Gemini direto para começar ou configure `OPENAI_API_KEY` de uma conta da API da OpenAI.

## A Vercel está pedindo cartão

A Vercel só é usada quando `AI_PROVIDER=gateway` ou quando apenas a chave do Gateway está disponível. Para removê-la do fluxo, configure `AI_PROVIDER=google`, adicione `GOOGLE_GENERATIVE_AI_API_KEY`, remova ou comente a seleção do Gateway e reinicie o MCP.

### O Gemini retorna `Request contains an invalid argument`

Atualize para a versão `0.5.1` ou posterior. Versões anteriores enviavam ao Gemini restrições de JSON Schema que não fazem parte do subconjunto aceito pela API. A partir da `0.5.1`, o servidor envia um schema compatível e aplica os limites completos localmente com Zod.

Depois da atualização, reinicie o servidor MCP. Se ainda houver falha, consulte o terminal **Output > MCP: ai-dev-cockpit**: o servidor registra provedor, modelo, status HTTP e corpo de erro sanitizado, sem registrar a chave nem o conteúdo do PR.

## Provedor configurado, mas a chave não foi encontrada

Confira se a chave corresponde ao provedor: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY` ou `AI_GATEWAY_API_KEY`. Não coloque aspas extras, reinicie o servidor e execute novamente com `refresh: true`.

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
