# AI Dev Cockpit

Dashboard interativo dentro de um cliente de IA para analisar Pull Requests, explicar alterações e sugerir testes com MCP Apps.

> Status: planejamento e estrutura inicial. A aplicação ainda não está implementada; não há comandos de instalação ou execução disponíveis nesta etapa.

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
React, TypeScript e Vite na interface; Node.js e TypeScript no servidor; SDK MCP e `@modelcontextprotocol/ext-apps`; schemas compartilhados; um provedor de IA chamado pelo servidor. Versões e dependências serão fixadas na primeira etapa executável.

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
Clone o repositório e comece pelo item M1 do plano:
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
