# Radar R6.0c-B2.6-B0-R1 — reconciliação local

Data: 11/10/2026. Responsável: Codex.

**PASS R6.0c-B2.6-B0 LOCAL.** Cinco contratos reconciliados sem abertura genérica dos guards; contrato funcional B0 intacto. Smoke real e visual locais aprovados. Full suite final sem falha nova atribuível: três falhas reproduzidas na base limpa permanecem. Sem commit, push, deploy ou migration remota. Parado para revisão.

1. **Refs.** Fetch com prune repetido; `origin/main` e HEAD permanecem em `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`. Branch existente `codex/radar-r6-0c-b2-6-b0-venda-persistencia`; worktree `C:/Users/Corretor/.codex/worktrees/radar-r6-0c-b2-6-b0-venda-persistencia/Angariacao`. Sem commit, push, Preview ou deploy.

2. **Cinco falhas originais.** Três listas de migrations desatualizadas (IV-1, IV-4A, B3.2) e dois hashes de schema projetado (B1/B2). O B0 acrescenta uma migration legítima e modifica a seção de comparáveis no schema canônico. Não muda as migrations históricas de Vendas/Imóveis.

3. **Finalidade original dos guards.** Ver tabela abaixo. As listas detectam arquivos desconhecidos, ordem incorreta e reaparecimento de R6.1. Os hashes protegem todo o conteúdo restante após remover somente blocos aditivos conhecidos; B2 preserva inclusive o final de arquivo. Os demais testes de colunas, grants, RLS, funções e espelhos literais continuam intactos.

4. **Ajustes mínimos.** As três listas passam a reconhecer explicitamente `20261011203141_radar_ofertas_por_finalidade.sql`. IV-4A verifica seu predecessor pelo próprio índice, sem exigir ser a última migration. Os dois hashes foram atualizados somente depois do diff integral conferido. Não há wildcard, remoção de hash, lista aberta, teste apagado ou mudança no contrato funcional.

5. **Hashes.** SHA-256 sobre UTF-8 com CRLF normalizado para LF. Mesmas projeções e regras de EOF dos testes anteriores; somente os valores esperados mudaram. Tabela abaixo registra antes/depois.

6. **Diff estrutural.** O diff integral de `origin/main:supabase-schema.sql` contra o B0 foi gerado em `web/node_modules/.cache/b0-r1/schema-diff.patch`, com os dois schemas normalizados ao lado. Todas as alterações se concentram na seção `comparaveis_mercado`: UNIQUE nomeado com finalidade e instalação repetível dessa chave; finalidade nos dois índices alternativos; trigger invoker que impede reatribuir finalidade/autoria; RPC com validação observada, lock por usuário/finalidade, lookup por finalidade e UPDATE sem reclassificar. Nenhum delta de PK/FK, policy, histórico, Vendas comercial, Imóveis ou grant da RPC. O revoke adicional pertence somente à nova função privada do trigger.

7. **Arquivos R1.** Somente os cinco testes listados abaixo e este relatório. Um manifesto SHA-256 de todos os arquivos B0 existentes foi salvo antes das edições em `web/node_modules/.cache/b0-r1/delta-anterior.json`; a comparação posterior confirma que todos permanecem byte a byte iguais. Nenhuma fixture funcional nova versionada.

8. **Cinco testes isolados.** 5/5 arquivos, 46/46 asserções passaram. Relatório `estruturais.json` no cache R1.

9. **Schema/migrations relacionados.** 129/129 asserções passaram, incluindo todas as suítes com sufixo schema/migration. Nenhum sexto contrato foi ajustado.

10. **Testes B0.** Os 13 testes de oferta/SQL passaram novamente, inclusive no controle do runner de mutantes e na regressão dirigida. Identidades por ID/URL/fingerprint, preços, observações, autoria e conflito observado preservados.

11. **Mutantes.** 8/8 mortos, 100%, com controle passando. Mesmos oito mutantes B0, incluindo UPDATE direcionado à finalidade errada nos dois sentidos. Runner/restauração intactos; evidência `mutantes.log` e `../b0-mutantes.json` no cache.

12. **Regressão dirigida.** 346/346 asserções em 14 arquivos: comparáveis, histórico, persistência, referências Central/Radar, avaliação, aquisição/capacidade/transporte e Locação multiportal. Aumento de 344 para 346 em relação ao primeiro relatório B0 corresponde às duas checagens de finalidade observada aninhada já presentes no B0 final; R1 não acrescenta casos funcionais.

13. **Smoke real B0.** Runner aprovado repetido: 9/9. Somente `supabase_db_radar-b0-local` e serviços locais correspondentes, API 56221, banco 56222 e Next 56230. Baseline histórico + 38 migrations posteriores, Locação antiga antes da migration, migration B0 local e duas contas GoTrue sintéticas. Histórico e policies preservados literalmente. Contagens centrais 0/0 → 1/1 → 2/2 → 2/2 → 2/4 (comparáveis/observações); final com fixtures adicionais 17/20 e Radar 1/1.

14. **Smoke visual local.** Conduzido no navegador com conta A `@example.test`, somente stack B0. Central → Radar → link Avaliar: cartão Locação R$ 3.300; formulário exibiu “Dados preenchidos a partir do Radar”, finalidade Locação selecionada, Rua Sintética, 123 / Centro / Londrina / PR. API real retornou `comparavelId=25e1b151-cf1a-4e2b-b08b-c002db33c3ba`, o UUID Locação, mesmo com Venda mais recente. A referência direta desse comparável também abriu “Dados preenchidos a partir da Central”, em Locação, com área 80 m² e dois quartos. Nenhum cálculo, pesquisa externa, importação ou envio foi acionado. Console final: zero erros e warnings. Screenshots, snapshots e console somente no cache ignorado. Primeiro servidor dev tinha cache gerado inconsistente e respondeu HTML 404; após encerrar e preservar `.next/dev` fora do cache ativo, o build local e `next start` passaram, incluindo o handoff. Nenhuma correção de produto foi feita para contornar isso.

15. **SYNTHETIC-123.** Conta A: Locação UUID `25e1b151-cf1a-4e2b-b08b-c002db33c3ba`, 3.200→3.300; Venda UUID `49cf2e0d-e97b-4410-bab3-e142a4dadc3f`, 650.000→640.000. Duas ofertas e históricos separados. A conta B tem sua própria oferta sintética independente; não é terceira oferta de A.

16. **RLS/autoria.** B lê o catálogo compartilhado de A; UPDATE de A por B não altera linha; INSERT fingindo A é recusado; RPC com user_id forjado segue auth.uid e grava para B. Histórico e Radar de A permanecem privados. Imutabilidade de finalidade e autoria preservada. Nenhuma policy/grant alterada em R1.

17. **Locação 10/10.** Smoke real confirmou finalização, persistência e reobservação sem duplicar para Casa/Apartamento nos cinco portais. Regressão com fixtures passou. Aquisição ao vivo nos portais não foi repetida, pois os transportes externos permanecem proibidos.

18. **Venda bloqueada.** Matriz intacta. Dez requisições reais ao Next local retornaram HTTP 422 antes da aquisição. Sem B1/B2, parser ou builder Venda.

19. **Full suite base limpa.** 7.126 passaram / 5 falharam / 7.131 testes. Execução correspondente do SHA solicitado, mesmo ambiente e maxWorkers=2, concluída sem build/outra suíte concorrente. Cinco falhas de mensagens-agendadas; Garimpo temporal e localização passaram. Não se assume baseline fixo de seis falhas. A primeira tentativa paralela da base limpa foi interrompida e não é usada como resultado.

20. **Full suite B0-R1.** Final: 7.141 passaram / 3 falharam / 7.144. As três falhas são de mensagens-agendadas e se reproduziram na base limpa, conforme tabela abaixo. Nenhuma falha nova atribuível; cinco contratos reconciliados, Garimpo e localização passaram. A suíte inteira não é declarada verde. Primeira execução: 7.139 passaram / 5 falharam / 7.144, com as três falhas conhecidas, Garimpo temporal e erro do runner STACK_TRACE_ERROR no guard de localização (15,4 s). Essa execução concorria inicialmente com outra suíte, build e lint, deixando menos de 400 MB de RAM livre. Nenhuma expectativa desse guard adicional foi alterada. Os dois arquivos passaram isoladamente, 22/22, e na repetição integral final sem build/outra suíte concorrente.

21. **TypeScript.** `npx tsc --noEmit` final passou. Primeira tentativa concorrente com Next dev encontrou TS1128 em arquivo gerado `.next/dev/types/validator.ts`; após a recuperação do cache, o build e o comando separado passaram.

22. **Lint.** `npm run lint`: zero erros; um warning já existente em `tests/ia-contrato-requisicao.test.ts:657` (_choices não utilizado), arquivo intocado.

23. **Diff-check.** Passou. Sem arquivos staged; manifesto B0 preservado. Links do relatório e delta final conferidos antes da entrega.

24. **Build.** Build Next de produção passou e gerou 68 páginas. Executado com configuração exclusiva da stack local, chaves pagas vazias e opt-in de IA desligado. Esse mesmo build foi usado no smoke visual.

25. **Externos.** Firecrawl=0; OpenAI=0; RapidAPI=0; WhatsApp=0; escrita Supabase remota=0. O GET local `/api/ia` do bootstrap apenas informa indisponibilidade e não representa chamada à OpenAI. Para o smoke visual, a única busca sintética foi pausada localmente e seu JSON recebeu campos sintéticos de apresentação; não foram acionados Buscar ou Verificar agora. Nenhum dado remoto entrou nas fixtures.

26. **Ledger Production.** Consulta SELECT repetida: 82 migrations, latest `20261008150000`, B0=0. Sem operação remota de escrita.

27. **Migration local.** `20261011203141_radar_ofertas_por_finalidade.sql` permanece byte a byte igual ao B0 aprovado. Uma única migration, aplicada somente ao banco descartável B0. Não houve nova migration em R1.

28. **Riscos.** Permanecem os limites operacionais já documentados no B0: lock por usuário/finalidade ainda sem medição de throughput em Production, aplicação remota exigirá revisão própria, evidência observada depende do parser futuro, aquisição ao vivo não exercitada. Falhas baseline e tentativas transientes não são declaradas corrigidas pelo R1. Nenhuma mudança visual foi implementada.

29. **Delta completo.** B0 original preservado, mais cinco testes R1 e este relatório. Relação completa abaixo. Sem parser, portal, UI/CSS, scheduler, filtros, R6.1/R6.2, paginação, commit ou push. Parar para revisão.

## Guards reconciliados

| Guard | O que protege | Expectativa desatualizada | Ajuste específico |
| --- | --- | --- | --- |
| IV-1 | Predecessor B3.2, sequência posterior fechada, ausência de R6.1, espelho e DDL restrito | Depois de IV-1 somente IV-4A | Lista exata IV-4A, B0 |
| IV-4A | Predecessor IV-1, timestamp único, ausência de R6.1, função de Locação e espelho | IV-4A precisa ser a última | Predecessor pelo índice de IV-4A e lista posterior exata B0 |
| B3.2 | Predecessor B2, sequência posterior fechada e contrato comercial | Depois de B3.2 somente IV-1/IV-4A | Lista exata IV-1, IV-4A, B0 |
| B1 | Schema inteiro sem blocos aditivos conhecidos, trimEnd original | Identidade de comparáveis anterior ao B0 | Novo hash exato após diff B0; demais regras intactas |
| B2 | Schema com B1, sem blocos aditivos conhecidos, EOF preservado | Identidade de comparáveis anterior ao B0 | Novo hash exato após diff B0; hash da migration B1 continua intacto |

## Hashes aprovados

| Guard | Anterior | B0 |
| --- | --- | --- |
| B1 | `27eedab2dd5a92811d24f370d47c1ecd32c796cd0815527f5dbcb4aad7568733` | `11ca5f5d06a1b4e2fb2d3d6caee29ab60d3df38dfa350b87f11242c885febf1a` |
| B2 | `5b54399f21bae4e189d24babaecfe2774fdcab060fef1089063913b3562fc64c` | `f4f2f548da05396ff235ea35bf4b7e8273e5f1e9a0e53f0b2dc717f5212f2f5f` |

Os hashes anteriores foram recalculados a partir do schema no SHA base e coincidiram com as expectativas anteriores. Os novos hashes são os mesmos que as falhas B0 já apresentavam; R1 não alterou o SQL.

## Arquivos R1

- [imovel-venda-iv1-schema.test.ts](../web/tests/imovel-venda-iv1-schema.test.ts)
- [imovel-venda-iv4a-schema.test.ts](../web/tests/imovel-venda-iv4a-schema.test.ts)
- [vendas-v1-b3-2-schema.test.ts](../web/tests/vendas-v1-b3-2-schema.test.ts)
- [vendas-v1-b1-schema.test.ts](../web/tests/vendas-v1-b1-schema.test.ts)
- [vendas-v1-b2-schema.test.ts](../web/tests/vendas-v1-b2-schema.test.ts)
- Este relatório.

O delta B0 anterior, incluindo sua lista de 18 arquivos, está em [Relatório B0](RADAR-R6.0c-B2.6-B0-RELATORIO-LOCAL.md). Esse documento conserva o resultado histórico HOLD; este relatório R1 registra a reavaliação.

Delta completo B0 + R1, 24 arquivos:

```text
PROJECT.md
supabase-schema.sql
supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql
web/app/api/avaliacao/contexto/route.ts
web/lib/calculo/centralAngariacao.ts
web/lib/calculo/comparaveisMercado.ts
web/lib/persistencia/referenciasInvestigador.ts
web/lib/servidor/comparaveisMercado.ts
web/tests/comparaveis-mercado.test.ts
web/tests/investigador-imoveis-central-radar.test.ts
web/tests/ofertas-mercado-finalidade.test.ts
web/tests/fixtures/bancoOfertasMercado.ts
web/integration/radar-b0-ofertas-local.test.ts
web/vitest.radar-b0-local.config.ts
web/tests/harness/radar-r6-0c-b2-6-b0/preparar-local.mjs
web/tests/harness/radar-r6-0c-b2-6-b0/smoke-local.mjs
web/tests/harness/radar-r6-0c-b2-6-b0/mutantes.mjs
docs/RADAR-R6.0c-B2.6-B0-RELATORIO-LOCAL.md
web/tests/imovel-venda-iv1-schema.test.ts
web/tests/imovel-venda-iv4a-schema.test.ts
web/tests/vendas-v1-b3-2-schema.test.ts
web/tests/vendas-v1-b1-schema.test.ts
web/tests/vendas-v1-b2-schema.test.ts
docs/RADAR-R6.0c-B2.6-B0-R1-RELATORIO-LOCAL.md
```

## Evidências locais ignoradas

Pasta `web/node_modules/.cache/b0-r1/`: relatórios JSON e logs estruturais, schema, regressão, full/baseline, mutantes, smoke, build, tsc, lint; `radar-final.png`, `avaliacao-final.png`, snapshots `.txt`, `console-final.json`, `contexto-visual.log`, schemas normalizados e diff legível. Material transitório e credenciais sintéticas não devem ser versionados.

## Comparação das falhas, uma a uma

| Asserção em mensagens-agendadas | Base limpa desta rodada | R1 final |
| --- | --- | --- |
| Claim: reserva órfã antes da regra genérica — schema canônico | Falha | Passa |
| Claim: reserva órfã antes da regra genérica — migration M3/M4 | Falha | Falha |
| Efetivação definer/search_path/grants — schema canônico | Falha | Passa |
| Efetivação definer/search_path/grants — migration M3/M4 | Falha | Falha |
| Efetivação definer/search_path/grants — migration 1a-C2.1b.2 | Falha | Falha |

As duas diferenças do schema canônico não são correções funcionais do R1: o schema B0 já está em LF, enquanto a exportação limpa contém CRLF. O teste lê esse arquivo sem normalizar: a remoção de comentários usa `--.*$` e a expectativa de revoke contém `\n` literal. Ambos são sensíveis ao CRLF. As funções de mensagens do schema, normalizadas, continuam iguais entre base e B0; todos os hunks do diff normalizado pertencem aos comparáveis. As três falhas remanescentes se referem às migrations históricas, intocadas. Nenhum desses testes foi editado.

O Garimpo temporal e o guard de localização passaram na base limpa, na rechecagem isolada R1 e na full suite R1 final. A falha inicial de localização foi erro do runner, sem diagnóstico de violação de contrato. Não houve ajuste de sexto guard. A repetição integral final confirmou a ausência de falha nova atribuível.

**PASS R6.0c-B2.6-B0 LOCAL. Venda pública continua bloqueada. Migration somente local. Parado para revisão, sem commit ou push.**
