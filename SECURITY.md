# Segurança

## Relatar uma vulnerabilidade

Não publique detalhes sensíveis em uma issue. Envie um aviso privado ao mantenedor pelo recurso **Report a vulnerability** do GitHub Security, quando habilitado, incluindo impacto, reprodução e versão afetada.

## Modelo de confiança

Conteúdo de Pull Requests é não confiável. O projeto não executa código, instala dependências ou faz checkout do repositório analisado. URLs de PR aceitas pertencem exclusivamente a `github.com` por HTTPS. Links de preview são abertos pelo host MCP, sujeitos à política dele.

Tokens permanecem no processo do servidor, via `.env` ignorado. Use menor privilégio, rotação e credenciais separadas para desenvolvimento. Nunca registre patches completos, prompts ou secrets em produção.

## Uso de IA

Quando a IA está habilitada, trechos redigidos dos diffs são enviados ao provedor selecionado: Google, OpenAI ou Vercel AI Gateway. Confirme políticas da organização e do provedor antes de analisar código privado. A redação reduz riscos, mas não garante detecção de todos os segredos.

Não reutilize cookies, sessões ou credenciais do ChatGPT. Use somente chaves oficiais de API, restritas ao projeto quando o provedor permitir.

## Fora da garantia

Achados automáticos, score e veredito não substituem revisão humana, SAST, testes, políticas de branch ou análise profissional de segurança.
