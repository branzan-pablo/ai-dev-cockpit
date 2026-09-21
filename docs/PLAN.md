# Plano de evolução

## Release 0.4 — concluída

- [x] MCP App validado no VS Code/Copilot com transporte stdio.
- [x] PR real do GitHub, snapshots por head SHA e erros legíveis.
- [x] Contratos v2 para arquivos, achados, evidências, review, testes e delivery.
- [x] Motor determinístico com fallback, score e sugestões de teste.
- [x] IA estruturada opcional, timeout, limites, redação e defesa contra prompt injection.
- [x] Dashboard adaptativo com overview, findings, files e tests.
- [x] Explicação por arquivo, atualização do PR, status de CI e preview existente.
- [x] Cache limitado, testes stdio, integração real opcional e CI.
- [x] Documentação operacional e política de segurança.

## Próximo marco — uso em equipe

- [ ] Autenticar com GitHub App e instalação por organização.
- [ ] Persistir análises por head SHA, modelo e versão do prompt.
- [ ] Consumir Check Runs e deployments além de commit statuses.
- [ ] Deduplicar achados locais/IA e medir precisão com um conjunto de PRs avaliados.
- [ ] Adicionar orçamento de custo por análise e telemetria sem código sensível.
- [ ] Permitir publicar comentário/review no GitHub somente após confirmação explícita.

## Futuro — preview isolado

- [ ] Descobrir preview do provedor de forma extensível.
- [ ] Para PR sem preview, usar sandbox efêmero isolado, com rede e recursos restritos.
- [ ] Detectar framework, instalar com lockfile, buildar e executar testes sob limites rígidos.
- [ ] Nunca executar código do PR dentro do processo MCP ou da máquina do usuário.

## Critérios antes de produção

- GitHub App, controle de acesso e auditoria.
- Persistência criptografada com retenção definida.
- Avaliação de privacidade do provedor de IA para código privado.
- Testes de carga, falhas, rate limit, PRs grandes e formatos binários.
- Threat model e revisão de segurança independentes.
- Métricas de falsos positivos/negativos; score não pode ser usado como aprovação automática.
