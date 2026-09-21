# Plano de implementação

## Objetivo e escopo
Prova de conceito para apresentação de aproximadamente 12 minutos: análise de PR e interface interativa dentro da conversa. GitHub, um provedor de IA e um cliente MCP Apps validado. M1 tem implementação local com fixtures, duas tools e teste de integração stdio. A aceitação no host real permanece pendente; M2–M6 não foram concluídos.

## M1 — Validar integração com o host (1–2 dias)
- [ ] Escolher e validar versão/configuração do cliente, inicialmente VS Code com Copilot.
- [x] Fixar versões compatíveis dos SDKs, Node e gerenciador de pacotes; registrar lockfile.
- [x] Criar servidor MCP e recurso ui://cockpit/dashboard.
- [x] Implementar analyze_pr com dados sintéticos e saída estruturada.
- [x] Criar UI mínima e botão que chama uma tool e atualiza seu resultado.
- [x] Documentar comandos reais de build, execução e conexão.

Aceite: pedido na conversa abre a UI; botão realiza chamada real ao servidor; resposta atualiza a interface no cliente escolhido. Uma página isolada no navegador não comprova este marco.

## M2 — Cenário e contratos (0,5–1 dia)
- [ ] Definir schemas e fixtures para PR, arquivo, achado e teste.
- [ ] Definir erros estruturados, limites e estados de análise parcial.
- [ ] Preparar cenário TypeScript de pagamento com Vitest e resultados esperados.
Aceite: fixture identificada e contratos validados, com exemplos de sucesso e erro.

## M3 — GitHub (1 dia)
- [ ] Buscar metadados e arquivos do PR, com paginação.
- [ ] Fixar base SHA e head SHA; obter código no commit analisado.
- [ ] Tratar binários, renomeações, patch ausente/truncado e acesso negado.
- [ ] Limitar arquivos e bytes; informar cobertura parcial.
Aceite: dados reais na UI e erro legível para PR inexistente/sem acesso.

## M4 — Análise com IA (2–3 dias)
- [ ] Escolher provedor, modelo, limites de custo e timeout.
- [ ] Implementar analyze_pr, analyze_file, explain_change e generate_tests.
- [ ] Validar respostas e referenciar evidência por caminho, lado do diff e linha.
- [ ] Cache por repositório, PR, base/head SHA, modelo e versão do prompt.
- [ ] Tratar instruções embutidas no código como dados não confiáveis.
Aceite: resultados coerentes no cenário preparado; falhas da IA não quebram a UI; testes identificados como não executados.

## M5 — Dashboard (2 dias)
- [ ] Resumo, prioridades alta/média/baixa, lista de arquivos e diff.
- [ ] Painéis de explicação e teste com código legível.
- [ ] Loading por ação, erro com retry e indicação de análise parcial/desatualizada.
- [ ] Navegação por teclado e adaptação ao espaço do host.
Aceite: jornada completa no cliente, com contexto preservado ao alternar arquivos.

## M6 — Verificação e apresentação (1–2 dias)
- [ ] Testar contratos, parsing do diff, limites e invalidação de cache.
- [ ] Testar fluxo completo no host com fixture e GitHub real.
- [ ] Validar falha de autenticação, timeout, PR grande e mudança do head SHA.
- [ ] Ensaiar roteiro e gravar demonstração de backup.
Aceite: demonstração reproduzível com README atualizado e limitações visíveis.

Estimativa total: aproximadamente 8–11 dias focados; revisar após M1.

## Fora do MVP
Login próprio, múltiplos provedores Git, histórico persistente, aprovação automática, commits/comentários automáticos e execução automática de código.

## Definition of done
Build e checagem de tipos funcionando; testes relevantes aprovados; fluxo verificado no host; segredos ausentes do frontend e logs; fontes sintéticas e resultados não executados claramente identificados.
