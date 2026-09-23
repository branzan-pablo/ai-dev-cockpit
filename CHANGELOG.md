# Changelog

## 0.5.2

- Recuperação limitada a três chamadas/45 segundos, com backoff, jitter e Retry-After.
- Modelos Google alternativos configuráveis, sem trocar de provedor nem contornar cotas.
- Tratamento de RetryError.lastError e classificação segura por status HTTP.
- Fallback local não recomenda reconfigurar IA quando o provedor está indisponível.
- Logs apenas de metadados; remoção de corpos/mensagens brutos que poderiam conter segredos.
- Comando doctor:ai valida a mesma integração com dados sintéticos.
- Testes HTTP simulados através do SDK real para recuperação, validação, prazo e segurança.

## 0.5.1

- Schema estruturado compatível com o subconjunto aceito pela API Gemini.
- Validação completa da resposta de IA mantida localmente com Zod.
- Diagnóstico seguro de falhas do provedor no terminal do servidor MCP.

## 0.5.0

- Google Gemini direto como caminho recomendado para análise contextual.
- OpenAI direta e Vercel AI Gateway como alternativas opcionais.
- Seleção por `AI_PROVIDER`, modelos específicos por provedor e autodetecção por chave.
- Documentação clara sobre a separação entre ChatGPT Plus e API da OpenAI.

## 0.4.0

- Dashboard adaptativo com visão geral, achados, arquivos e testes.
- Revisão estruturada opcional por IA com fallback determinístico.
- Evidências, score de risco e plano de testes não executado.
- Cache limitado, atualização forçada, commit statuses e preview externo.
- Segurança, troubleshooting, integração real opcional e documentação completa.

## 0.2.0

- Leitura de Pull Requests públicos reais do GitHub.
- Diffs, classificação local e explicação por arquivo.

## 0.1.0

- MCP App, fixture e fluxo bidirecional inicial.
