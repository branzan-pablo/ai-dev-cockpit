# AI Dev Cockpit

Dashboard interativo dentro de um cliente de IA para analisar Pull Requests, explicar alterações e sugerir testes com MCP Apps.

> Status: primeira fatia implementada com dados sintéticos: `analyze_pr`, interface React e `explain_change`. Build, tipos e integração MCP têm verificação automatizada. Validação visual no VS Code/Copilot ainda pendente. GitHub real, IA e geração de testes continuam no backlog.

## Objetivo
Demonstrar uma jornada completa: pedir análise de PR na conversa, visualizar uma interface, selecionar um arquivo e solicitar explicações ou testes sem sair do cliente de IA.

## MVP
- `analyze_pr`: resumo do PR e prioridades de revisão.
- `analyze_file`: achados por arquivo, com evidências.
- `explain_change`: explicação da mudança e impacto potencial.
- `generate_tests`: sugestão de teste, explicitamente não executado.
- Um dashboard com resumo, lista de arquivos, diff e painel de resultados.
- GitHub como primeiro provedor; um repositório de demonstração.

## Stack planejada
React, TypeScript e Vite na interface; Node.js e TypeScript no servidor; SDK MCP e `@modelcontextprotocol/ext-apps`; schemas compartilhados; um provedor de IA chamado pelo servidor. Dependências fixadas no package.json e package-lock.json. MCP SDK 1.x com MCP Apps 1.7.5; migração para a linha 2.x fica fora desta etapa.

## Organização
- `apps/mcp-server/`: servidor, ferramentas e integrações.
- `apps/cockpit-ui/`: interface MCP App.
- `packages/contracts/`: contratos e validação.
- `fixtures/`: dados sintéticos para desenvolvimento e demonstração.
- `docs/PLAN.md`: backlog, sequência e critérios de aceite.
- `docs/ARCHITECTURE.md`: decisões técnicas e contratos propostos.
- `docs/DEMO.md`: cenário e roteiro da apresentação.

## Primeiro marco
Validar no cliente escolhido uma ferramenta que abre a interface e um botão que chama o servidor e atualiza a tela. Começar com dados sintéticos identificados. A compatibilidade do host deve ser comprovada antes da integração real.

## Desenvolvimento
Requer Node.js 22.12+ e npm. Clone o repositório:
```sh
git clone https://github.com/branzan-pablo/ai-dev-cockpit.git
cd ai-dev-cockpit
```

## Limites
Prioridade de revisão não é garantia de segurança. A análise pode ser parcial e deve informar seu escopo. Não executar automaticamente código ou testes vindos de repositórios. Credenciais ficam somente no servidor.

## Referências
- [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview)
- [Guia de construção](https://modelcontextprotocol.io/extensions/apps/build)
- [Compatibilidade dos clientes](https://modelcontextprotocol.io/extensions/client-matrix)

## Executar a primeira versão
```sh
npm ci
npm run check
```
`check` verifica tipos, gera o HTML da interface e testa o servidor pelo transporte stdio. Não precisa de token GitHub ou chave de IA nesta etapa.

Abra a raiz do projeto no VS Code. A configuração em `.vscode/mcp.json` inicia o servidor local. Em um ambiente compatível com MCP Apps, abra o arquivo de configuração e inicie `ai-dev-cockpit`; habilite suas ferramentas no chat do Copilot. Peça: **Use analyze_pr do ai-dev-cockpit para abrir o PR de demonstração.**

Selecione um arquivo e clique em **Explicar alteração**. A resposta pré-definida deve aparecer com o horário retornado pelo servidor. Esse horário comprova a consulta, não uma nova análise por IA.

`npm start` inicia o transporte stdio; não abre uma página nem uma porta HTTP. Não digite mensagens nesse terminal. O cliente MCP normalmente inicia o processo automaticamente. Após alterar a interface, execute `npm run build`; após alterar o servidor, reinicie-o no cliente.

### Validação manual pendente
- A interface deve aparecer dentro da conversa.
- O botão deve atualizar a explicação dos três arquivos.
- Falhas de conexão devem produzir mensagem legível.
- Navegação por teclado e painel estreito devem permanecer utilizáveis.

Se apenas texto aparecer, confira o suporte a MCP Apps e a habilitação do servidor no cliente. O teste automatizado do protocolo não substitui esta validação visual.
