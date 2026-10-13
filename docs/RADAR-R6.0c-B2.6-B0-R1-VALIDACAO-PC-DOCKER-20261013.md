# Radar R6.0c-B2.6-B0-R1 — validação no PC com Docker

Data: 13/10/2026. **PASS R6.0c-B2.6-B0 LOCAL.** Resultado limitado ao contrato B0 local; a full suite mantém falhas preexistentes descritas abaixo. Parado para revisão, sem commit, push, Preview, Production ou migration remota.

## Escopo e preservação

O trabalho B0 e a reconciliação dos cinco guards já estavam presentes. Nenhuma implementação foi refeita e nenhum teste, SQL, fixture, harness ou arquivo de produto foi alterado nesta rodada. O manifesto SHA-256 inicial e a conferência final confirmaram os 24 arquivos existentes byte a byte iguais. O runner de mutantes fez suas alterações temporárias e restaurou os originais.

Comportamento anterior ao B0: identidade e procura de comparáveis sem finalidade poderiam colidir entre Locação e Venda. O B0 existente separa a oferta por usuário/finalidade/identidade externa, mantém o fingerprint físico, impede reatribuição de finalidade/autoria e limita as referências atuais da Avaliação à Locação. As áreas potencialmente impactadas são persistência, deduplicação, observações, autoria/RLS e handoff Central/Radar → Avaliação. Não houve ajuste visual ou mudança de capacidade nesta validação.

## 1. Docker

PASS. Docker Desktop 4.87.0, Engine/Client 29.7.2, contexto desktop-linux. docker version e docker info retornaram seção Server válida. Daemon e configuração não foram alterados. Outros containers existentes não foram modificados.

## 2. Worktree e HEAD

- Worktree: C:/Users/Corretor/.codex/worktrees/radar-r6-0c-b2-6-b0-venda-persistencia/Angariacao.
- Branch: codex/radar-r6-0c-b2-6-b0-venda-persistencia.
- HEAD e origin/main: 0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883.
- Todos os comandos de validação foram executados no worktree B0 ou em sua pasta web. A exportação limpa ficou no cache ignorado desse mesmo worktree.

## 3. Estado inicial do delta

14 arquivos rastreados modificados; 107 inserções e 89 remoções no diff inicial. Nenhum arquivo staged. Migration B0 não rastreada e não commitada. Todos os caminhos solicitados estavam presentes, inclusive os cinco guards e os dois relatórios anteriores.

```text
 M PROJECT.md
 M supabase-schema.sql
 M web/app/api/avaliacao/contexto/route.ts
 M web/lib/calculo/centralAngariacao.ts
 M web/lib/calculo/comparaveisMercado.ts
 M web/lib/persistencia/referenciasInvestigador.ts
 M web/lib/servidor/comparaveisMercado.ts
 M web/tests/comparaveis-mercado.test.ts
 M web/tests/imovel-venda-iv1-schema.test.ts
 M web/tests/imovel-venda-iv4a-schema.test.ts
 M web/tests/investigador-imoveis-central-radar.test.ts
 M web/tests/vendas-v1-b1-schema.test.ts
 M web/tests/vendas-v1-b2-schema.test.ts
 M web/tests/vendas-v1-b3-2-schema.test.ts
?? docs/RADAR-R6.0c-B2.6-B0-R1-RELATORIO-LOCAL.md
?? docs/RADAR-R6.0c-B2.6-B0-RELATORIO-LOCAL.md
?? supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql
?? web/integration/radar-b0-ofertas-local.test.ts
?? web/tests/fixtures/bancoOfertasMercado.ts
?? web/tests/harness/radar-r6-0c-b2-6-b0/
?? web/tests/ofertas-mercado-finalidade.test.ts
?? web/vitest.radar-b0-local.config.ts
```

## 4. Revisão dos cinco guards

| Guard | Proteção original | Alteração local revisada e motivo | Rigidez preservada |
| --- | --- | --- | --- |
| imovel-venda-iv1-schema | Predecessor B3.2, sucessores fechados, exclusão da R6.1 antiga e contratos IV-1 | Acrescenta somente o nome B0 depois de IV-4A para acomodar a migration local em revisão | Ordem e lista exatas; migration arbitrária futura continua rejeitada |
| imovel-venda-iv4a-schema | IV-4A como último item, predecessor IV-1, timestamp único e contratos de Locação | Fixa IV-1 como predecessor pelo índice de IV-4A e permite somente B0 como sucessor | Lista posterior exata; unicidade, timestamp, predecessor e demais guards intactos |
| vendas-v1-b3-2-schema | Predecessor B2 e sequência posterior IV-1/IV-4A fechada | Acrescenta somente o nome B0 após IV-4A | Nada genérico é aceito; ordem histórica continua verificada |
| vendas-v1-b1-schema | Hash SHA-256 de todo o schema remanescente após remover blocos aditivos conhecidos, com trimEnd | Atualiza o hash exato pelo delta B0 não aditivo, documentando a âncora anterior | Nenhum hash removido, bloco adicional ignorado ou regex ampliada; conteúdo remanescente continua integralmente fixado |
| vendas-v1-b2-schema | Hash SHA-256 do schema com B1, sem blocos aditivos posteriores, incluindo EOF | Atualiza o hash exato pelo mesmo delta B0, preservando a âncora anterior no comentário | Hash integral e EOF preservados; hash da migration histórica B1 e demais contratos intactos |

Não houve wildcard, remoção de teste/hash, aceitação de qualquer migration futura nem desconsideração da ordem histórica. Os ajustes existentes foram preservados sem reescrita.

## 5. Hashes anteriores e B0

Recalculados diretamente do schema no SHA base e do schema B0, usando exatamente as transformações de cada teste. Todos coincidiram com as expectativas anteriores e atuais.

| Guard | Anterior | B0 |
| --- | --- | --- |
| vendas-v1-b1-schema | `27eedab2dd5a92811d24f370d47c1ecd32c796cd0815527f5dbcb4aad7568733` | `11ca5f5d06a1b4e2fb2d3d6caee29ab60d3df38dfa350b87f11242c885febf1a` |
| vendas-v1-b2-schema | `5b54399f21bae4e189d24babaecfe2774fdcab060fef1089063913b3562fc64c` | `f4f2f548da05396ff235ea35bf4b7e8273e5f1e9a0e53f0b2dc717f5212f2f5f` |

## 6. Comparação legível do schema

[Diff normalizado anterior vs B0](../web/node_modules/.cache/b0-pc-r1-20261013/schema-anterior-vs-b0.diff).

| Área | Antes | B0 existente |
| --- | --- | --- |
| UNIQUE da oferta | user_id, portal, id_externo | user_id, portal, id_externo, finalidade; chave nomeada e instalação repetível no espelho |
| Índice por URL | user_id, url_canonica | user_id, finalidade, url_canonica |
| Índice por fingerprint | user_id, anuncio_fingerprint | user_id, finalidade, anuncio_fingerprint |
| Imutabilidade | Sem trigger específico da oferta | Trigger privado invoker impede mudar finalidade ou autoria |
| RPC | Lookup/lock sem finalidade; UPDATE podia reclassificar | Finalidade validada, Venda exige observação explícita, lock por usuário/finalidade, lookup limitado por finalidade e UPDATE sem reclassificação |

Todos os hunks normalizados pertencem à seção de comparáveis. Sem mudança estrutural não explicada pelo B0. Sem alteração de PK/FK, policies, contrato do histórico, tabelas comerciais ou privilégios da RPC. O revoke adicional é da função privada nova do trigger. RPC e função do trigger coincidem literalmente entre migration e schema canônico. Migrations históricas não foram editadas.

## 7. Cinco arquivos isolados

PASS: 5/5 arquivos e 46/46 testes. Também passaram na full suite B0-R1. Evidência: estruturais.json no cache desta rodada.

## 8. Testes B0 e regressão

- Casos B0 conhecidos: 13/13 PASS.
- Regressão dirigida: 346/346 em 14 arquivos, incluindo identidade, persistência, histórico, referências Central/Radar, Avaliação, capacidade/execução/transporte e fixtures de Locação multiportal.
- Contratos schema/migration: 129/129 em 12 arquivos.

O log de falha de persistência no caso negativo ZAP é parte do teste aprovado; não foi falha da suíte. Nenhuma expectativa foi alterada.

## 9. Mutantes

PASS: 8/8 mortos; zero sobrevivente. Controle passou. Lookup sem finalidade; fingerprint sem finalidade; overwrite nos dois sentidos; observação na oferta errada; duplicação; autoria forjada; conflito de finalidade aceito. O runner exigiu falha de asserção. Conferência após restauração: zero arquivo original diferente.

## 10. Stack local

Usado somente o harness B0 existente. Containers locais radar-b0-local: PostgreSQL 17.11/pgvector, GoTrue, PostgREST e Kong. API 127.0.0.1:56221; banco 56222; Next 56230. Sem nova configuração Supabase, link, db push ou SQL remoto. O Next de teste foi encerrado depois do smoke visual; containers existentes foram preservados.

## 11. Migration local

A migration 20261011203141_radar_ofertas_por_finalidade.sql foi aplicada somente ao banco descartável supabase_db_radar-b0-local, após reconstrução da base anterior pelo harness: baseline histórico + 38 migrations posteriores. Continua não rastreada, sem commit e byte a byte igual ao estado inicial. Nenhuma migration nova foi criada.

## 12. Smoke real

PASS: 9/9 casos do runner existente. PostgreSQL, GoTrue/Auth, PostgREST, RLS e Next reais; duas contas sintéticas. Locação anterior à migration e seu histórico foram preservados literalmente; catálogo de policies antes/depois igual. Nenhum transporte funcional externo foi acionado.

Contagens comparáveis/observações: 0/0 → 1/1 → 2/2 → 2/2 → 2/4. Final com fixtures adicionais: 17/21; Radar 1 anúncio e 1 busca. A diferença de uma observação em relação ao relatório antigo (20) é a reobservação diária de Locação em 13/10/2026, esperada pelo contrato temporal; não é duplicação nem troca de vínculo.

## 13. SYNTHETIC-123

Conta A, mesma identidade externa, URL e sinais físicos:

| Finalidade | UUID | Histórico de preços |
| --- | --- | --- |
| Locação | 0bec2b3b-9db6-4e38-87c7-e46828f2f635 | 3200 → 3300 |
| Venda | 598b0afd-510f-4288-a5dd-ee85f49f9809 | 650000 → 640000 |

Dois UUIDs distintos, históricos separados e zero overwrite cruzado. A conta B tem sua oferta independente, criada pela prova de autoria da RPC, sem constituir uma terceira oferta da conta A. A preparação visual posterior alterou somente dados sintéticos locais: pausou a busca, completou a apresentação do cartão e tornou a Venda mais recente, sem mudar finalidade/autoria/preços.

## 14. RLS e autoria

PASS no banco real: catálogo de A legível por B conforme contrato compartilhado; UPDATE de A por B retorna zero linhas; INSERT fingindo A é recusado; RPC com user_id=A sob sessão B grava para B. Histórico e Radar de A permanecem privados. Mutação de finalidade rejeitada; trigger preserva finalidade/autoria. Policies/grants não foram flexibilizados.

## 15. Locação 10/10

PASS para Casa e Apartamento em OLX, ZAP, Viva Real, Chaves na Mão e Wimoveis. Finalização, escrita real local e reobservação preservadas; uma oferta por identidade/finalidade. Fixtures de aquisição/transporte aprovadas. Aquisição ao vivo nos portais não foi executada, conforme limite Firecrawl=0.

## 16. Venda bloqueada 10/10

OLX, ZAP, Viva Real, Chaves e Wimoveis × Casa/Apartamento: as dez requisições reais ao Next local retornaram HTTP 422 antes da aquisição. Venda pública permanece 0/10 habilitada. Não houve B1/B2, R6.1/R6.2, parser/builder Venda, paginação ou filtro portal.

## 17. Smoke visual local

PASS com a conta sintética desta execução. Central → Radar exibiu cartão Locação por R$ 3.300 → Avaliar abriu “Dados preenchidos a partir do Radar”, finalidade Locação ativa, Rua Sintética, 123, Centro, Londrina/PR, Apartamento, 80 m² e dois quartos. A referência direta do comparável também abriu “Dados preenchidos a partir da Central” em Locação. Nenhum cálculo, busca externa, importação ou envio foi acionado.

API local confirmou HTTP 200 e comparavelId=0bec2b3b-9db6-4e38-87c7-e46828f2f635, mesmo com Venda em 14/10 e Locação em 13/10. [Captura](../web/node_modules/.cache/b0-pc-r1-20261013/avaliacao-radar.jpg) e prova-visual.json no cache. Nenhuma mudança de UI/CSS realizada.

## 18. Console

Zero erros e warnings capturados no smoke visual. O bootstrap GET /api/ia apenas informa a indisponibilidade local; não acionou OpenAI. Sessão antiga do navegador foi encerrada antes do login na conta sintética desta rodada.

## 19. Full suite da base limpa

SHA 0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883 exportado sem alterar o delta. 7.125 passed / 6 failed / 7.131 total. maxWorkers=2, sem suíte/build concorrente. Resultados desta execução, sem assumir baseline fixo.

## 20. Full suite B0-R1

7.141 passed / 3 failed / 7.144 total. maxWorkers=2, executada depois da base limpa, sem suíte/build concorrente. Cinco guards PASS na integral. A suíte inteira não está sem falhas.

## 21. Comparação das falhas

Zero falha nova. As três falhas B0-R1 constam também da base limpa.

| Arquivo | Nome exato da asserção | Base limpa | B0-R1 |
| --- | --- | --- | --- |
| `mensagens-agendadas.test.ts` | claim_mensagens_agendadas vence linhas presas em processando no schema canônico, uma reserva de consolidação órfã é tratada ANTES da regra genérica, como consolidação interrompida | Falha | Passa |
| `mensagens-agendadas.test.ts` | claim_mensagens_agendadas vence linhas presas em processando no migration M3/M4, uma reserva de consolidação órfã é tratada ANTES da regra genérica, como consolidação interrompida | Falha | Falha |
| `mensagens-agendadas.test.ts` | M3/M4 — reserva de consolidação e efetivação atômica no schema canônico, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta | Falha | Passa |
| `mensagens-agendadas.test.ts` | M3/M4 — reserva de consolidação e efetivação atômica no migration M3/M4, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta | Falha | Falha |
| `mensagens-agendadas.test.ts` | M3/M4 — reserva de consolidação e efetivação atômica no migration 1a-C2.1b.2, `efetivar_consolidacao_contato` é definer com search_path vazio, só service_role, e fecha tudo pela reserva na mesma conta | Falha | Falha |
| `prospeccao-c13b-investigador.test.ts` | C13B — a tela do Investigador diz a verdade sobre a memória, sem dashboard salva com contagem, repetida, e falha explícita como alerta; sem memória no resultado, nenhum feedback | Falha | Passa |

As duas diferenças do schema canônico não são declaradas correções funcionais: a base contém 13.474 CRLF e o schema B0 está em LF. O teste lê o arquivo sem normalizar nessas verificações; remoção de comentários e revoke multiline são sensíveis a isso. O diff normalizado permanece restrito aos comparáveis. A sexta falha da base foi STACK_TRACE_ERROR em C13B; passou na integral B0-R1 e não foi mascarada por alteração de teste. Nenhuma falha preexistente foi corrigida nesta rodada.

## 22. TypeScript

PASS: npx --no-install tsc --noEmit, exit 0. O build também concluiu sua verificação de tipos.

## 23. ESLint

PASS: npm run lint, exit 0, zero erros. Um warning preexistente: tests/ia-contrato-requisicao.test.ts:657:20, _choices não utilizado. Arquivo intocado.

## 24. Diff-check

PASS: git diff --check, exit 0. Avisos LF→CRLF do Git foram separados de erros. Relatório novo e referências locais conferidos ao final.

## 25. Build

PASS: build Next 16.3.1 de produção local; 68 páginas geradas. Configuração exclusiva da stack B0, chaves externas vazias e ALLOW_REAL_OPENAI=0. O mesmo build foi usado no smoke visual. Nenhum código mudou depois desse build.

## 26. Firecrawl

Zero chamadas reais. Recortes exercitados por fixtures e persistência local; nenhuma coleta ao vivo.

## 27. Demais externos

OpenAI=0; RapidAPI=0; WhatsApp=0; Sophia=0; Supabase remoto=0 operações; Production=0 alteração. Nenhuma credencial remota carregada, teste manual OpenAI executado ou serviço remoto usado para validar a aplicação. Consultas de documentação oficial são leituras de documentação, separadas dos transportes funcionais.

## 28. Arquivos alterados adicionalmente

Somente este relatório novo. Os 24 arquivos preexistentes B0/R1 permaneceram byte a byte iguais. Evidências transitórias, exportação limpa e credenciais sintéticas ficaram no cache ignorado web/node_modules/.cache/b0-pc-r1-20261013/. Nenhuma alteração de produto, testes, schema ou migration adicional. O checkout codex/main não foi usado.

Evidências principais: manifesto inicial/final, estruturais.json, regressao.json, schema.json, mutantes.json, contagens.json, synthetic-123.json, prova-visual.json, console-visual.json, captura, baseline-full.json/log, full-b0-r1.json/log, comparacao-full.json, hashes-schema.json, schemas normalizados/diff, build.log, tsc.log e lint.log. Não versionar credenciais nem cache.

## 29. Riscos e revisão

- Permanecem três falhas automatizadas preexistentes de mensagens; esta validação não declara a suíte inteira aprovada.
- Lock por usuário/finalidade ainda não foi medido sob carga de Production. Migration remota exige revisão própria e não foi autorizada/executada aqui.
- Ambientes sem a RPC atual deixam de escrever pelo fallback V2; é o comportamento fail-closed existente no B0.
- Evidência observada de Venda depende de parser futuro confiável; a capacidade pública continua bloqueada.
- Aquisição ao vivo, serviços pagos, Preview e Production não foram exercitados, conforme o escopo. O fluxo real LOCAL solicitado foi exercitado; não há smoke manual local pendente desta rodada.

Próximo passo: revisão humana do delta B0/R1, dos guards e deste relatório. Nenhuma integração ou publicação foi realizada.

**PASS R6.0c-B2.6-B0 LOCAL. Parado para revisão. NÃO COMMIT. NÃO PUSH. NÃO PREVIEW. NÃO PRODUCTION. NÃO MIGRATION REMOTA.**
