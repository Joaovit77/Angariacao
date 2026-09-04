# Fase 5B.1 — Sanitização de logs

## Escopo e diagnóstico

Base: `a4dd48e4e438e03de143a1110b3d0700e767dcc3`.
Branch: `codex/fase5b1-sanitizacao-logs`.

O erro de embedding chegava inteiro a `console.error` em
`web/lib/servidor/comparaveisMercado.ts` e
`web/app/api/avaliacao/comparaveis/route.ts`. O SDK pode carregar headers de resposta,
inclusive cookies, no objeto de erro. Despejá-lo também expunha mensagem, causa e
outros campos externos. O problema não estava na geração do embedding, mas nos consumidores
que registravam a falha.

Não havia sanitizador genérico de erros: `lib/ia/observabilidade.ts` descreve fatos da
execução da IA, não serve para serializar exceções. Foi criado um helper pequeno,
sem dependências novas, sem interceptação global de console e sem refatoração funcional.

O padrão se repetia nos logs da finalização Central/Radar, do registro Supabase e de
chamadas textuais da OpenAI. Esses pontos usam a mesma correção. O Investigador já
selecionava nomes de headers operacionais, mas deixava passar seus valores textuais e
a consulta privada. O coletor por navegador registrava URL, título e mensagem externos.

## Contrato de logging

`sanitizarErroExterno` aceita contexto de um vocabulário local fechado e erro `unknown`.
Retorna somente `provider`, `operation`, `error_code` local e `status` HTTP numérico
(100–599), ou `null` quando não comprovado. Não copia o código externo.

Não lê/serializa `message`, `stack`, `cause`, `config`, `request`, `response`, headers,
body, HTML, callbacks de serialização ou dados privados. Um getter de status que lança
não derruba o fallback. O erro original não é modificado. Request ID foi omitido:
não é necessário para esta correção e seria mais um valor externo a validar.

No Investigador permanecem somente os nomes operacionais já selecionados, com valores
compostos de 1 a 10 dígitos. Consulta textual removida. Status, motivo local, tentativa
e duração continuam disponíveis. Retry-after funcional e política de chamadas não mudaram.

Exemplo do 403 de embedding:

```json
{"provider":"openai","operation":"embedding","error_code":"embedding_request_failed","status":403}
```

Falhas posteriores de persistência/busca no Supabase têm contexto próprio e não são
atribuídas ao provider de embeddings. Persistência estruturada e fallback da Avaliação
continuam funcionando. Nenhuma mudança de modelo, endpoint, chave, retry, similaridade,
metodologia ou filtro geográfico foi feita.

## Integrações e invariantes

- OpenAI: geração de embeddings intacta; sanitização nos consumidores. Chamadas textuais,
  erros de parsing e recusa do modelo deixam de expor objetos/textos externos.
- Supabase: logs de registro assíncrono, comparáveis e consultas nos caminhos de IA tratados
  por allowlist. Não foram alterados clientes, consultas, owners, autenticação ou RLS.
- Firecrawl: adaptador já converte falhas em códigos/mensagens locais; intacto. O consumidor
  Central deixa de despejar exceções inesperadas. Nenhuma coleta paga foi executada.
- RapidAPI: consulta e valores não numéricos dos headers removidos dos diagnósticos.
- Coletor por navegador: removidos URL completa, título da página e erro textual do log;
  tentativas, exceções, retornos e fallback mantidos.
- Radar: somente o argumento do log de erro de comparáveis mudou; agendamento intacto.
- Coleta de mercados: executor, cron, claim/lease e conclusão intactos.

O mercado `c2cfe26e-0edf-463e-a320-c5f07a471e2f` foi preservado por ordem explícita do
usuário. Nenhum UPDATE, DELETE, desativação, migração ou coleta foi executado nesta etapa.
Nenhum comparável, observação, anúncio, histórico, avaliação ou imóvel foi removido.

## Validação em 04/09/2026

- Testes direcionados de sanitização/consumidores: **80 testes, 9 arquivos**.
- Regressões de coleta, Central/Radar, Avaliação e handoffs Fases 1–4: **131 testes, 13 arquivos**.
- Regressões IA/atendimento/WhatsApp: **172 testes, 8 arquivos**.
- Suíte completa final: **1.970 testes, 152 arquivos**.
- TypeScript (`tsc --noEmit`): aprovado.
- ESLint (`npm run lint`): aprovado, sem erros/warnings.
- Build (`npm run build`): aprovado, **60 páginas** geradas.
- `git diff --check`: aprovado.

Os grupos direcionados se sobrepõem à suíte completa; não somar como testes distintos.
O teste de persistência com 403 falhou antes da correção, mostrando o objeto externo
integral, e passou após a correção. Fixtures contêm somente valores fictícios, incluindo
Authorization, Proxy-Authorization, X-API-Key, Api-Key, Cookie, Set-Cookie, causa e body.

Além dos mocks, houve reprodução com **SDK OpenAI instalado real**, um servidor HTTP
efêmero em `127.0.0.1` e resposta 403 sintética com cookies/headers fictícios. O SDK gerou
`PermissionDeniedError`; o helper preservou status/provider/operação/código local e a
formatação de console não continha os segredos. Servidor encerrado ao final. Zero
requisições a OpenAI/Firecrawl/RapidAPI reais e nenhum uso de credencial real nesse smoke.
O Node exibiu apenas aviso de carregamento avulso de TypeScript como ES module, não erro
da aplicação; não foi alterado package.json para ocultá-lo.

## Limites e verificação antes de integrar

Validação automatizada concluída, mas o fluxo real não foi exercitado contra providers
remotos nem em UI autenticada. O smoke sintético valida logging, não disponibilidade
do provider. **Aguardando smoke manual dos fluxos externos antes do merge**, conforme a
política de regressão do repositório. Nenhuma mensagem WhatsApp foi enviada/recebida
como teste real nesta rodada.

Roteiro em ambiente aprovado, com dados seguros e sem provocar consumo pago só para teste:

1. Abrir Central, Radar, Investigador e Avaliação; conferir console e ausência de cálculo automático.
2. Na primeira falha externa que ocorrer naturalmente, verificar os logs permitidos e o
   fallback correspondente, sem copiar resposta externa ou segredos para o relatório.
3. Conferir uma sugestão de IA permitida e os bloqueios/protocolos; nenhuma ação sem confirmação.
4. Antes de integrar código compartilhado pela IA do webhook, confirmar envio/recebimento,
   histórico, identidade JID/LID, bloqueio de destinatário incorreto e ausência de duplicação
   com contato autorizado. Não provocar envio sem autorização adicional.

Esta é auditoria focada, não certificação de todos os logs do produto. Perde-se detalhe
textual externo deliberadamente; os rótulos de contexto e códigos locais preservam o
diagnóstico operacional mínimo. Deploys anteriores ainda têm o logging antigo até a publicação.

## Pendências independentes (não implementadas)

- **VivaReal indisponível no smoke Production da Fase 5B** — não investigado nesta branch.
- **403 de embeddings — investigar autenticação/configuração/provider** — sanitizar o log
  não resolve o 403; nenhuma tentativa de corrigir configuração foi feita.
- Auditoria mais ampla de logs legados de Evolution/WhatsApp e Assistente: há outros
  caminhos próprios com mensagens/objetos de erro externos. Exigem escopo e smoke próprios;
  não se expandiu esta rodada para refatorar esses módulos.
- Contract do overload antigo da RPC permanece futuro e separado; nenhum SQL alterado.

## Arquivos alterados

- `PROJECT.md`
- `docs/FASE5B1_SANITIZACAO_LOGS.md`
- `web/lib/servidor/erroExterno.ts`
- `web/lib/servidor/comparaveisMercado.ts`
- `web/lib/servidor/registro.ts`
- `web/lib/servidor/monitorRadarAngariacao.ts`
- `web/lib/servidor/investigadorImoveis.ts`
- `web/lib/servidor/scraperCentralAngariacao.ts`
- `web/lib/servidor/ia.ts`
- `web/lib/servidor/ia/executor-openai.ts`
- `web/lib/servidor/ia/handlers/atendimento.ts`
- `web/app/api/avaliacao/comparaveis/route.ts`
- `web/app/api/central-angariacao/buscar/route.ts`
- `web/app/api/ia/route.ts`
- `web/tests/fixtures/erroExterno.ts`
- `web/tests/erro-externo.test.ts`
- `web/tests/avaliacao-logs-externos.test.ts`
- `web/tests/registro-logs-externos.test.ts`
- `web/tests/comparaveis-mercado-persistencia.test.ts`
- `web/tests/central-angariacao-persistencia.test.ts`
- `web/tests/monitor-radar-angariacao.test.ts`
- `web/tests/investigador-imoveis.test.ts`
- `web/tests/ia-executor.test.ts`
- `web/tests/ia-handler-atendimento.test.ts`

## Estado

Código e testes preparados para publicação; integração condicionada ao smoke manual
acima e à nova autorização. Somente commit local. Sem push, merge, deploy ou Fase 5C.
