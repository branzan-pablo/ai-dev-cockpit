# Arquitetura

## Fluxo principal

1. O modelo do host chama `analyze_pr` com a URL do PR.
2. O servidor valida estritamente `https://github.com/{owner}/{repo}/pull/{number}`.
3. A integração busca metadados, arquivos e commit statuses do GitHub.
4. O review engine classifica arquivos e produz um fallback determinístico.
5. Se um provedor de IA estiver configurado, a revisão contextual substitui o review local; qualquer falha preserva o fallback.
6. A resposta estruturada é validada e associada ao `head SHA` em um cache LRU na memória.
7. O host carrega `ui://cockpit/dashboard.html`; a UI renderiza o snapshot e chama tools adicionais pelo host.

## Componentes

| Componente | Responsabilidade |
| --- | --- |
| `apps/mcp-server/server.ts` | Registro das tools, recurso HTML, snapshots e erros públicos. |
| `apps/mcp-server/github.ts` | URL, GitHub REST, paginação limitada, statuses, cache e cobertura parcial. |
| `apps/mcp-server/ai-review.ts` | Prompt seguro, redação, orçamento de contexto e saída estruturada. |
| `packages/review-engine` | Metadados de arquivo, regras, evidências, risco e testes locais. |
| `packages/contracts` | Schemas Zod usados pelo servidor, UI e testes. |
| `apps/cockpit-ui` | Dashboard adaptativo e chamadas bidirecionais MCP Apps. |

## Contrato de análise v3

`Analysis` inclui identidade do snapshot, origem, PR, branches, autor, arquivos classificados, `Review`, `Delivery`, estado parcial e limitações. Cada arquivo carrega linguagem, tipo, prioridade, contagens, patch e disponibilidade.

`Review` contém modo (`deterministic` ou `ai`), modelo opcional, timestamp, score 0–100, veredito, resumo, achados e testes. Um achado sempre exige pelo menos uma evidência vinculada a caminho válido do snapshot.

`Delivery` resume os commit statuses e pode incluir uma URL HTTPS de preview. O cockpit não cria nem executa esse deployment.

`ProjectContext` registra as fontes descobertas no head SHA, sua aplicação por caminho, truncamento e eventuais omissões. O texto é usado internamente na revisão e removido da resposta pública. `Comparison` descreve mudanças entre atualizações do mesmo PR. A UI continua aceitando snapshots v2 durante a transição.

## IA e confiança

- Provedores: Google Gemini direto, OpenAI direta ou Vercel AI Gateway.
- `AI_PROVIDER` seleciona o provedor. Sem seleção explícita, a detecção prioriza Google, depois OpenAI e então Gateway.
- Padrão recomendado para desenvolvimento: `google/gemini-3.8-flash` com `GOOGLE_GENERATIVE_AI_API_KEY`.
- A assinatura ChatGPT não autentica a API da OpenAI; `OPENAI_API_KEY` exige uma conta de API separada.
- Saída: `generateText` com `Output.object` e schema Zod.
- Temperatura 0, timeout total de 45 segundos e máximo de 4.000 tokens de saída.
- No máximo 60.000 caracteres de patches entram no prompt.
- Segredos de formatos conhecidos são redigidos antes do envio.
- Título, descrição, caminhos e diffs ficam dentro de um bloco explicitamente não confiável.
- Evidências de IA que referenciem arquivos externos ao snapshot são descartadas.
- Falha, ausência de chave ou saída inválida retorna review determinístico.

## Cache e consistência

- GitHub: cache LRU de até 20 PRs por dois minutos; `refresh: true` ignora o cache.
- Snapshots de tools: até 20 análises na memória, identificadas por repositório, PR e head SHA.
- Reiniciar o processo apaga o cache e exige nova chamada a `analyze_pr`.
- `explain_change` e `generate_tests` rejeitam caminhos que não pertençam ao snapshot.

## Limites atuais

- Até 60 arquivos e 20.000 caracteres de patch por arquivo.
- Commit statuses não representam necessariamente todos os GitHub Check Runs.
- Sem persistência, login próprio, comentários automáticos, aprovação automática ou execução de código.
- A UI mostra diffs e abre previews existentes; ela não recompila a aplicação do PR.
- Skills do repositório são critérios textuais não confiáveis; nunca autorizam execução, ferramentas ou rede.
- Publicação no GitHub usa prévia temporária, confirmação explícita, validação do head SHA e comentário idempotente.

## Evolução recomendada

1. Persistência por head SHA e versão do prompt/modelo.
2. GitHub App em vez de token pessoal para uso em equipe.
3. Check Runs e deployments para melhor cobertura de CI/preview.
4. Comentário no PR somente com confirmação explícita do usuário.
5. Execução isolada em sandbox efêmero, nunca no host do MCP, caso previews automáticos se tornem requisito.
