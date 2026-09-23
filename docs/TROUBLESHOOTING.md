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

Leia primeiro a limitação exibida. "Análise local" indica que nenhuma revisão de IA foi aceita, não necessariamente falta de configuração. Se a IA não estiver configurada, crie `.env`, selecione um provedor e reinicie o servidor. Para Google:

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

Esse erro genérico não prova uma causa específica. Confira modelo e parâmetros. A versão `0.5.1` simplificou o schema enviado ao Google como mitigação de possíveis incompatibilidades, mantendo validação local completa com Zod. Isso não corrige erros de capacidade, permissão ou cota.

Na versão `0.5.2`, o canal de saída do servidor MCP registra somente modelo, tentativa, status HTTP e categoria. Corpos e mensagens brutos não são registrados, pois podem conter conteúdo sensível. Nunca publique `.env`, chaves ou cabeçalhos de autenticação.

## Alta demanda / HTTP 503 / Failed after 3 attempts

A mensagem de alta demanda indica indisponibilidade do provedor. Na `0.5.1`, o SDK repetia o mesmo modelo três vezes e o servidor retornava regras locais, ainda com a orientação incorreta de configurar IA. A `0.5.2` elimina essa orientação, classifica o erro (inclusive dentro de `RetryError.lastError`) e permite alternativas explícitas em `GOOGLE_AI_FALLBACK_MODELS`.

- Máximo de três chamadas no total, com prazo global de 45 segundos e espera exponencial com jitter.
- HTTP 503/500/502/504: tenta o próximo modelo configurado; sem alternativa, repete o atual.
- HTTP 429: respeita Retry-After e repete o mesmo modelo; não troca para contornar cota.
- HTTP 400/401/403: não repete. Exceção: mensagem explícita de modelo removido/inexistente permite tentar uma alternativa configurada.
- JSON inválido: não é aceito como revisão de IA; mantém regras locais.
- Se todos falharem, o dashboard permanece local e lista modelos/status tentados. Não é falha de renderização.

Execute `npm run doctor:ai` após atualizar. O comando imprime versão, provedor e modelos efetivos e testa dados sintéticos através da mesma integração. Pode consumir créditos/cota. Não consulta GitHub nem envia código de PR real. Se falhar, compartilhe somente a saída segura desse comando. Não há promessa de que um modelo alternativo estará disponível ou terá acesso liberado na sua conta.

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

Variáveis já definidas no ambiente do processo podem prevalecer sobre `.env`. Confira os modelos impressos pelo `doctor:ai` e pelos logs de tentativa do MCP; não basta verificar o texto do arquivo. Uma análise antiga no chat não se atualiza sozinha: faça uma nova chamada com `refresh: true`.

## Diagnóstico local

```powershell
node --version
npm ci
npm run check
npm start
```

`npm start` deve permanecer aguardando em silêncio. Encerre com `Ctrl+C`; isso não é uma falha.
