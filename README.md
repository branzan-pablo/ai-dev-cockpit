# AI Dev Cockpit

MCP App para revisar Pull Requests reais dentro do chat de IA. O servidor consulta o GitHub, analisa os diffs, devolve dados estruturados e renderiza um dashboard React interativo no VS Code.

## O que já funciona

- PRs públicos e privados do GitHub, fixados ao `head SHA` analisado.
- Dashboard com visão executiva, score de risco, achados, arquivos/diffs e plano de testes.
- Revisão contextual opcional por Google Gemini, OpenAI direta ou Vercel AI Gateway, com saída validada por Zod.
- Fallback determinístico sem chave de IA: regras locais, evidências e sugestões de teste.
- Explicação focada por arquivo e tool `generate_tests` com status explícito `not_run`.
- Estado de commit statuses/CI e link para preview quando GitHub/Vercel o publica.
- Cache curto e limitado, atualização forçada pela UI, timeout e limites de arquivos/contexto.
- Proteções contra prompt injection, redação de segredos e nenhuma execução do código do PR.

## Requisitos

- Node.js 22.12 ou superior.
- VS Code atualizado com GitHub Copilot Chat e suporte a MCP Apps.
- GitHub token opcional para repositórios privados ou maior limite de API.
- Uma chave de API de IA opcional; Google Gemini é o caminho recomendado para começar.

## Instalação no Windows

```powershell
git clone https://github.com/branzan-pablo/ai-dev-cockpit.git
cd ai-dev-cockpit
npm ci
npm run check
Copy-Item .env.example .env
```

Edite `.env` conforme necessário:

```dotenv
GITHUB_TOKEN=
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=sua-chave-do-google-ai-studio
GOOGLE_AI_MODEL=gemini-3.8-flash
```

O arquivo `.env` é ignorado pelo Git. Nunca coloque tokens em `.vscode/mcp.json` ou em commits.

Crie a chave do Gemini em [Google AI Studio](https://aistudio.google.com/apikey). O plano ChatGPT Plus não pode ser usado como chave do servidor: a assinatura do ChatGPT e a API da OpenAI são produtos e cobranças separados.

## Usar no VS Code

1. Abra a raiz `ai-dev-cockpit` no VS Code.
2. Abra `.vscode/mcp.json`.
3. Inicie ou reinicie o servidor `ai-dev-cockpit` pelo link exibido sobre a configuração.
4. Abra o Chat do Copilot e habilite as tools desse servidor.
5. Envie:

```text
Use exclusivamente a ferramenta analyze_pr do servidor ai-dev-cockpit,
passando prUrl como https://github.com/owner/repo/pull/123
```

O dashboard será aberto dentro da conversa. Navegue por **Visão geral**, **Achados**, **Arquivos** e **Testes**. Em um arquivo, **Explicar alteração** faz uma segunda chamada ao servidor. **Atualizar PR** ignora o cache e lê o snapshot atual. Se houver um deployment status reconhecido, **Abrir preview** solicita ao host que abra a URL externa.

Sem `prUrl`, `analyze_pr` abre o cenário sintético de demonstração. Use `useAi: false` para forçar análise local mesmo com chave configurada.

## Configuração

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `GITHUB_TOKEN` | Não | PRs privados e maior rate limit; conceda apenas leitura necessária. |
| `AI_PROVIDER` | Não | `google`, `openai` ou `gateway`. Se omitido, o servidor detecta pelas chaves disponíveis. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Para Google | Chave criada no Google AI Studio. |
| `GOOGLE_AI_MODEL` | Não | Modelo direto do Google; padrão `gemini-3.8-flash`. |
| `OPENAI_API_KEY` | Para OpenAI | Chave da API da OpenAI, cobrada separadamente do ChatGPT. |
| `OPENAI_MODEL` | Não | Modelo direto da OpenAI; padrão `gpt-5.6`. |
| `AI_GATEWAY_API_KEY` | Para Gateway | Chave opcional do Vercel AI Gateway. |
| `AI_GATEWAY_MODEL` | Não | Modelo do Gateway; padrão `openai/gpt-5.6-luna`. |

O servidor lê `.env` pelo próprio Node ao ser iniciado pela configuração versionada do VS Code. Após alterar `.env`, reinicie o servidor MCP.

### Exemplos de provedor

Google direto, recomendado para o primeiro teste:

```dotenv
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=...
```

OpenAI direta, caso exista uma conta de API com faturamento próprio:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=...
```

Vercel AI Gateway continua disponível, mas não é obrigatório:

```dotenv
AI_PROVIDER=gateway
AI_GATEWAY_API_KEY=...
```

## Tools MCP

| Tool | Entrada principal | Resultado |
| --- | --- | --- |
| `analyze_pr` | `prUrl?`, `useAi?`, `refresh?` | Snapshot completo e abre o dashboard. |
| `explain_change` | `analysisId`, `filePath` | Explicação e verificação focadas no arquivo. |
| `generate_tests` | `analysisId`, `filePath?` | Plano sugerido, explicitamente não executado. |

## Desenvolvimento

```sh
npm run typecheck
npm run build
npm test
npm run check
```

Teste opcional contra um PR público real:

```powershell
$env:REAL_PR_URL='https://github.com/owner/repo/pull/123'
npm test
```

`npm start` inicia transporte stdio: não abre página nem porta HTTP. O cliente MCP normalmente inicia esse processo. Depois de alterar a UI, execute `npm run build`; depois de alterar o servidor, reinicie-o no VS Code.

## Estrutura

- `apps/mcp-server/`: tools, GitHub, IA, cache e recurso MCP App.
- `apps/cockpit-ui/`: dashboard React empacotado em um único HTML.
- `packages/contracts/`: contratos Zod compartilhados.
- `packages/review-engine/`: classificação e regras locais.
- `fixtures/`: cenário reproduzível sem serviços externos.
- `tests/`: unidade, transporte stdio e integração real opcional.
- `docs/`: arquitetura, roteiro, plano e solução de problemas.

## Limites de segurança e produto

- O cockpit não executa checkout, dependências, build ou testes do PR.
- Preview visual só é aberto quando já existe uma URL HTTPS publicada nos statuses do commit.
- A API do GitHub pode omitir patches binários ou muito grandes; isso aparece como análise parcial.
- A IA recebe contexto limitado e redigido. Ainda assim, não use código sensível com provedores externos sem aprovação organizacional.
- Score e achados orientam a revisão; não garantem segurança, correção ou aprovação de merge.

Veja [Arquitetura](docs/ARCHITECTURE.md), [Troubleshooting](docs/TROUBLESHOOTING.md), [Roteiro de demonstração](docs/DEMO.md) e [Política de segurança](SECURITY.md).
