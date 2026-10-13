# Radar R6.0c-B2.6-B0 — relatório local

**Resultado: HOLD R6.0c-B2.6-B0.** A separação de ofertas passou nas provas locais, mas a full suite tem cinco falhas novas em contratos estruturais de schema/ledger. Não houve commit, push, Preview, deploy, migration remota ou aquisição externa.

Data: 11/10/2026. Responsável: Codex.

1. **Refs.** `git fetch origin --prune` executado. `origin/main`, HEAD inicial do worktree e Production conferidos em `0149ad44f4a3c1afa8b7e4cef8abaa8cfb5de883`. Production consultada pela listagem Vercel: deployment `dpl_DqayRiDTJff7DmmuCjqtvLKkgNEd`, READY, target production. A sessão original estava em `codex/main`; seus arquivos locais não foram alterados.

2. **Branch/worktree.** `codex/radar-r6-0c-b2-6-b0-venda-persistencia`, em `C:/Users/Corretor/.codex/worktrees/radar-r6-0c-b2-6-b0-venda-persistencia/Angariacao`, criado de `origin/main`. O ponto de rollback continua sendo o SHA acima; todo o delta está sem commit.

3. **Schema atual auditado.** `comparaveis_mercado`: PK UUID `id`, FK `user_id → auth.users` com CASCADE, finalidade NOT NULL/default locacao/CHECK locacao|venda; identidade externa e URL obrigatórias, preço positivo. Não há soft delete; `status_anuncio` registra estado observado. `observacoes_comparaveis_mercado`: PK bigint identity, FKs `comparavel_id → comparaveis_mercado` e `user_id → auth.users`, ambas CASCADE, preço positivo, enum de eventos e snapshot JSONB. `radar_buscas`: PK UUID, FK user, filtros JSONB, ativo e relógios de execução. `radar_anuncios`: PK UUID, FKs user e busca, dados JSONB, visto e encontrado_em. Checks de portal, UF, áreas, quartos, vagas, banheiros, pavimentos, andar, anunciante, dimensões vetoriais e status foram inspecionados e preservados.

4. **RPC anterior.** `registrar_comparavel_mercado(p_dados jsonb)` é SECURITY INVOKER, search_path vazio, retorno `id/criado/precisa_embedding`. Resolve autoria por auth.uid(); somente service_role sem sessão usa user_id do payload. A lookup filtrava user e um OR entre portal+id, URL canônica e fingerprint forte, ordenando nessa prioridade. Nenhum desses ramos incluía finalidade. O UPDATE podia trocar finalidade e preço. O lock antigo preferia fingerprint, depois URL, depois portal/id. Dependências auditadas: auth.uid, advisory lock/hashtextextended, tabela e trigger de observação. Não chama transporte externo.

5. **Índices/constraints.** Antes: UNIQUE `(user_id,portal,id_externo)`, índices não únicos `(user_id,url_canonica)` e `(user_id,anuncio_fingerprint)`, este parcial para fingerprint forte. Também existem índices de busca geográfica/finalidade/recência, bairro/tipo, filtros vetoriais, status, catálogo compartilhado e HNSW. Observações têm índices comparável/data e user/data. Radar tem UNIQUE `(busca_id,portal,id_externo)`, índices user/visto, busca/data e buscas ativas/automáticas. B0 substitui apenas o UNIQUE de oferta e os dois índices alternativos, acrescentando finalidade. PKs, FKs, checks e demais índices permanecem.

6. **Fingerprints.** `baseFingerprintAnuncio` permanece físico e mantém a versão fingerprint-v2-uf: portal, UF, cidade, bairro, endereço normalizado, tipo, área, quartos e anunciante. Não inclui preço. `baseFingerprintOferta` acrescenta finalidade em composição separada; ausência significa exclusivamente Locação legada. Na persistência, o hash físico existente continua em anuncio_fingerprint, e sua identidade de oferta é a combinação com user/finalidade na lookup e nos índices. Não houve rehash/backfill.

7. **Call sites.** Geração física e RPC: `web/lib/servidor/comparaveisMercado.ts`. Comparação pura: `web/lib/calculo/comparaveisMercado.ts`. Ingestão comum: `finalizacaoCentralAngariacao.ts`, consumida pela rota Central buscar, monitor Radar, coleta de mercados monitorados e script coletar-comparaveis-zonas. Histórico: trigger privado registrar_observacao_comparavel e leitura em persistencia/comparaveisMercado. Catálogo: carregarComparaveisMercadoComCliente e rota api/avaliacao/comparaveis, ambos filtrados por finalidade; RPC híbrida também recebe finalidade. Referências por ID externo: persistencia/referenciasInvestigador e api/avaliacao/contexto, agora explicitamente Locação nos consumidores atuais. Referências por URL do Investigador já exigem resultado único e ficam sem associação diante de duas ofertas; não foram alteradas. Leitura diagnóstica shadow de repetição Chaves no monitor não registra, associa nem atualiza ofertas e ficou fora do delta. Escritas complementares de região/embedding usam UUID retornado pela RPC, user_id e, no embedding, hash esperado.

8. **Production READ ONLY.** Projeto Supabase angariacoes, ref `jkkzknmdrvbstouekosi`. Início e fim: 82 migrations, latest `20261008150000`; nenhuma migration B0 remota, nenhuma R6.1 identificada no ledger auditado. 3.510 comparáveis, todos Locação; Venda=0; finalidade NULL=0; finalidade inválida=0; 3.133 observações. Candidatos com mesmo user/portal/id em finalidades distintas=0; mesmo user/URL em finalidades distintas=0; duplicatas da nova chave composta=0. Constraints, índices, policies, grants, triggers, colunas e funções efetivas foram consultados pelo catálogo PostgreSQL. Nenhuma PII de registros foi impressa. Todas as operações remotas foram SELECT.

9. **Risco anterior.** Mesmo anúncio poderia ser localizado sem finalidade e ter finalidade/preço substituídos; o trigger anexaria observação ao mesmo UUID, misturando ofertas. O UNIQUE anterior também impedia duas linhas por portal/id no mesmo usuário. A colisão remota não foi exercitada.

10. **Contrato escolhido.** Oferta = user + finalidade + identidade externa. Identidade externa mantém a prioridade portal/id → URL → fingerprint forte. Finalidade e autoria de uma linha persistida são imutáveis; nova finalidade requer outro UUID.

11. **Motivo.** Alterar somente TypeScript seria insuficiente: o UNIQUE remoto continuaria impedindo coexistência e os consumidores diretos da RPC permaneceriam vulneráveis. A migration conserva a entidade, PKs, FKs, histórico e catálogo existentes. Não cria outra RPC nem modelo físico paralelo.

12. **Migration.** Uma única migration local, criada com Supabase CLI: [20261011203141_radar_ofertas_por_finalidade.sql](../supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql). Transação, lock_timeout=5s, statement_timeout=60s. Troca UNIQUE, recompõe dois índices, adiciona trigger de identidade imutável e substitui a RPC mantendo assinatura/grants. Sem INSERT/UPDATE/DELETE/backfill de dados. Não aplicada remotamente. Espelho correspondente em supabase-schema.sql.

13. **Compatibilidade Locação.** Finalidade ausente na RPC continua significando Locação. Evidência observada ausente é aceita somente nesse contrato legado; evidência divergente é rejeitada. Preço, status, primeiro/último visto, critérios fortes e comportamento diário de observação foram preservados. O fallback de escrita V2 foi removido: sem RPC, a escrita falha fechada, pois o upsert antigo não separava finalidades. A RPC existe na base atual; ambientes antigos sem ela passam a exigir o contrato atual.

14. **Identidade por finalidade.** Lookup inteira recebe `c.finalidade = v_finalidade`. UNIQUE novo `(user_id,portal,id_externo,finalidade)`. Lock transacional por user/finalidade serializa aliases diferentes da mesma oferta; usuários/finalidades diferentes mantêm locks distintos.

15. **URL por finalidade.** A mesma URL foi usada com finalidades distintas, com IDs externos diferentes e fingerprint fraco: duas ofertas persistidas, aliases deduplicados dentro de cada finalidade. Índice passa a user/finalidade/URL.

16. **Fingerprint por finalidade.** Os mesmos sinais físicos produzem o mesmo fingerprint físico e fingerprints de oferta diferentes. O fallback SQL físico é sempre limitado pela finalidade. A prova local também usou mesmo fingerprint físico com URLs e IDs distintos.

17. **Preço.** Venda nunca atualiza a linha Locação e vice-versa. Depois das mudanças: Locação=3.300; Venda=640.000. Sem mudança do primeiro_visto nem troca de UUID.

18. **Evidência/finalidade observada.** Campo aditivo `AnuncioCentralAngariacao.finalidadeObservada`, transportado como `finalidade_observada` à RPC. Não é preenchido a partir dos filtros nem do campo de contexto que a finalização acrescenta. Preparação rejeita finalidade observada divergente. RPC rejeita divergência da finalidade_observada, divergência de dados_originais.finalidade ou dados_originais.finalidadeObservada e Venda sem observação explícita. O campo transporta a evidência do parser futuro; não verifica remotamente a veracidade do anúncio e não habilita aquisição Venda.

19. **Observações.** O trigger existente `private.registrar_observacao_comparavel` permanece responsável por INSERTs append-only. A FK aponta para o UUID da oferta correta. Cliente autenticado conserva somente SELECT sobre o próprio histórico; não ganha INSERT/UPDATE/DELETE. Registros de preço da oferta A não apareceram na oferta B.

20. **Histórico.** Migration preservou literalmente a linha Locação anterior e suas observações. Sem merge ou reclassificação. Reobservações no mesmo dia e sem mudança de preço/status não criam observação extra, como no contrato anterior. Mudança de preço cria evento preco_alterado. Venda reobservada no dia seguinte gera observação apenas de Venda.

21. **RLS.** Comparáveis continuam catálogo SELECT compartilhado para authenticated; INSERT/UPDATE continuam por auth.uid=user_id com WITH CHECK. Radar permanece privado por ownership; inserção de radar_anuncios exige busca do próprio usuário. Observações permanecem privadas por autoria. Nenhuma policy/grant foi alterada pela migration; comparação textual do catálogo pg_policies antes/depois passou.

22. **Autoria.** B lê ofertas de A no catálogo; UPDATE de A por B retorna zero linhas; INSERT em nome de A retorna 42501. RPC de B com user_id=A cria oferta de B, obedecendo auth.uid. Oferta A e seu preço permanecem intactos. Trigger também impede reatribuição de finalidade/autoria em UPDATE direto.

23. **radar_anuncios.** A busca é a unidade dos filtros e a chave inclui busca_id. O fluxo público cria outra busca para outro recorte e não edita seus filtros ao alternar ativação. Não foi identificado defeito de colisão que exigisse mudar essas tabelas no B0. Schema, políticas e persistência Radar ficaram intactos. Smoke confirmou privacidade para B e resolução da referência Radar para Locação, mesmo com Venda da mesma identidade mais recente.

24. **Testes B0.** 13 testes automatizados de oferta/SQL passaram. Cobrem migration, Locação antiga, nova Venda, reobservação, aliases por URL/fingerprint, preços, observações, autoria/RLS, conflito de finalidade e fingerprint da oferta. O teste estrutural específico de comparáveis foi atualizado para a nova chave sem remover validações de lock/FOR UPDATE. O mock do resolvedor Central foi ampliado para verificar o filtro de finalidade.

25. **Mutantes.** 8/8 mortos, 100%: lookup sem finalidade; fingerprint de oferta sem finalidade; Venda sobrescrevendo Locação; Locação sobrescrevendo Venda; observação vinculada à oferta errada; reobservação duplicada; user_id forjado prevalecendo; finalidade conflitante aceita. Controle passa. O runner exige falha de asserção e restaura os arquivos ao terminar.

26. **Smoke local.** 9/9 casos contra stack Docker descartável `radar-b0-local`: PostgreSQL 17/pgvector real, PostgREST real, GoTrue real, RLS real e Next 16 real. API em 127.0.0.1:56221, PostgreSQL em 56222, Next em 56230. Duas contas Auth sintéticas A/B. Somente dados sintéticos locais. Chaves OpenAI/Firecrawl vazias. Next confirmou leitura por UUID/finalidade, ownership da referência e bloqueio Venda HTTP 422 nos dez recortes.

27. **Dupla finalidade.** Portal zap, ID SYNTHETIC-123, mesma URL/fingerprint físico. Sequência Locação 3.200 → Venda 650.000 → Locação novamente → Venda novamente: dois UUIDs e duas observações iniciais; nenhuma duplicação ou sobrescrita.

28. **Mudança de preços.** Locação 3.200→3.300 e Venda 650.000→640.000: duas ofertas, quatro observações (duas novo e duas preco_alterado), com valores ligados aos respectivos UUIDs.

29. **Mesma URL.** Testes independentes com IDs externos distintos e fingerprint fraco mantiveram duas finalidades e deduplicaram cinco aliases concorrentes por finalidade.

30. **Mesmo fingerprint físico.** Testes independentes com URLs e IDs distintos mantiveram duas finalidades e deduplicaram cinco aliases concorrentes por finalidade. Prova pura usa mesmo endereço, UF/cidade, área, quartos e tipo.

31. **Contagens.** Ver tabela abaixo. As contagens do cenário central foram isoladas antes de adicionar fixtures de URL/fingerprint, B, dez recortes de Locação e uma busca/anúncio Radar.

32. **Migration test.** Banco reconstruído do baseline histórico completo `20260828115824_assistente_status_sem_resposta_em_lote.sql` e 38 migrations posteriores, até `20261008150000`. A RPC anterior é a mesma auditada em Production. Criada Locação pelo contrato anterior antes de aplicar B0. Aplicação, UNIQUE, RLS e preservação literal dos registros passaram. A tentativa inicial de carregar diretamente o schema canônico anterior falhou por ordem de dependência de reservada_para_mensagem_id; o bootstrap foi feito pelo ledger, sem corrigir o baseline fora do escopo. Não houve teste destrutivo com dados de Production.

33. **Regressões.** 344/344 em 14 arquivos direcionados: comparáveis, histórico, persistência, capacidade/execução/transporte Radar, OLX, Viva Real, Chaves/Wimoveis, contrato multiportal, ZAP Casa, contexto de avaliação e referências Central/Radar. Demais regressões Central, cron/monitor, avaliação e RLS também compõem a full suite. Smoke exercitou finalização + escrita/deduplicação real de Locação Casa/Apartamento nos cinco portais.

34. **Full suite.** Base limpa exportada do SHA solicitado: 7.126 aprovados / 5 falhas / 7.131 testes. Todas as cinco em mensagens-agendadas; o Garimpo temporal passou nessa execução. B0 final: 7.136 aprovados / 8 falhas / 7.144 testes. Três falhas de mensagens-agendadas também aparecem na base limpa; duas falhas canônicas da base limpa não se reproduziram no B0. Os relatórios preservam essa diferença; não se declara correção dessas falhas pelo B0. Cinco falhas novas atribuíveis à mudança de schema/ledger:
    - imovel-venda-iv1-schema: exige que somente IV-4A venha depois de IV-1;
    - imovel-venda-iv4a-schema: exige IV-4A como última migration;
    - vendas-v1-b3-2-schema: fixa a lista de migrations posteriores a B3.2;
    - vendas-v1-b1-schema: hash global do schema anterior;
    - vendas-v1-b2-schema: hash global do schema anterior.
    Esses cinco testes não foram alterados. O pedido proíbe baseline global; atualizar essa classe de contrato exige revisão de escopo. Por isso o resultado é HOLD. Uma execução inicial teve também falha temporal do Garimpo, que não persistiu na execução final; ela não foi usada para aceitar falha nova.

35. **TypeScript.** `npx tsc --noEmit` passou; o build também executou verificação de tipos.

36. **ESLint.** Passou com zero erros e um warning existente em tests/ia-contrato-requisicao.test.ts:657 (`_choices` não utilizado). Arquivo não alterado.

37. **Diff-check.** `git diff --check` passou; sem marcadores de conflito. Delta revisado para imports/exports e coexistência indevida de implementações. Sem UI, CSS, scheduler, parser, builder, filtro ou matriz alterados.

38. **Build.** Next build de produção passou, com 68 páginas geradas. Um primeiro build encontrou um ciclo de junction criado para testar a base limpa dentro do cache; esse diretório de baseline foi movido para scratch fora da árvore de dependências e o build foi repetido com sucesso. Nenhuma configuração do produto foi modificada para contornar o erro.

39. **Firecrawl.** Zero chamadas reais. Não houve execução do script de coleta nem chamadas pagas OpenAI/embeddings. Testes de transporte usam mocks/fixtures.

40. **Venda bloqueada.** Matriz original intacta. OLX/ZAP/Viva Real/Chaves/Wimoveis × Casa/Apartamento continuam bloqueados. Dez requisições reais ao Next local retornaram 422 antes da aquisição.

41. **Locação 10/10.** Matriz preservada; regressões com fixtures passaram; finalização/persistência real local de cada um dos dez recortes passou e reobservação não duplicou. Aquisição ao vivo nos portais não foi repetida neste checkpoint, conforme Firecrawl=0. Não se afirma novo smoke de portais em Production.

42. **Arquivos alterados.** Lista abaixo. Apenas persistência/contrato de ofertas, referências diretamente afetadas, testes/harness e documentação B0. Nada de B1/B2, R6.1/R6.2, paginação, filtro portal ou habilitação Venda.

43. **Riscos e revisão.** HOLD pelos cinco testes estruturais novos. Lock mais abrangente serializa registros por usuário/finalidade para garantir aliases; impacto em throughput não foi medido em carga de Production. Migration exige lock breve sobre tabela/índices; timeouts limitam espera e toda aplicação é transacional. Fallback V2 deixa de escrever quando RPC não existe. O campo observado depende de parser futuro confiável e não representa autenticação de evidência enviada diretamente por um cliente. Snapshots antigos não recebem finalidade: o UUID da oferta e sua finalidade imutável preservam o vínculo. O schema canônico anterior tem problema de bootstrap independente do B0. Preview/Production, IA real, aquisição ao vivo e interação visual no navegador não foram exercitados.

## Contagens do smoke

| Etapa | comparaveis_mercado | observacoes_comparaveis_mercado | radar_anuncios | radar_buscas |
| --- | ---: | ---: | ---: | ---: |
| Antes | 0 | 0 | 0 | 0 |
| Após Locação, antes da migration | 1 | 1 | 0 | 0 |
| Após Venda | 2 | 2 | 0 | 0 |
| Após reobservações no mesmo dia | 2 | 2 | 0 | 0 |
| Após mudanças de preço | 2 | 4 | 0 | 0 |
| Final, com todas as fixtures adicionais | 17 | 20 | 1 | 1 |

As 20 observações finais incluem os cenários adicionais; os dois históricos centrais tiveram seus valores conferidos antes dessas adições.

## Delta para revisão

- [PROJECT.md](../PROJECT.md): contrato permanente da oferta.
- [supabase-schema.sql](../supabase-schema.sql): espelho da chave, índices, trigger e RPC.
- [Migration B0](../supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql).
- [Contrato do anúncio](../web/lib/calculo/centralAngariacao.ts): finalidadeObservada opcional.
- [Identidade/fingerprint](../web/lib/calculo/comparaveisMercado.ts).
- [Persistência](../web/lib/servidor/comparaveisMercado.ts).
- [Referências Central](../web/lib/persistencia/referenciasInvestigador.ts).
- [Referência Radar na avaliação](../web/app/api/avaliacao/contexto/route.ts).
- [Teste estrutural de comparáveis](../web/tests/comparaveis-mercado.test.ts).
- [Teste de referências Central/Radar](../web/tests/investigador-imoveis-central-radar.test.ts).
- [Testes B0](../web/tests/ofertas-mercado-finalidade.test.ts).
- [Fixture SQL anterior](../web/tests/fixtures/bancoOfertasMercado.ts).
- [Integração real local](../web/integration/radar-b0-ofertas-local.test.ts).
- [Config de integração](../web/vitest.radar-b0-local.config.ts).
- [Runner de mutantes](../web/tests/harness/radar-r6-0c-b2-6-b0/mutantes.mjs).
- [Reconstrução local](../web/tests/harness/radar-r6-0c-b2-6-b0/preparar-local.mjs).
- [Runner de smoke](../web/tests/harness/radar-r6-0c-b2-6-b0/smoke-local.mjs).
- Este relatório.

Evidências detalhadas locais, ignoradas pelo Git: web/node_modules/.cache/b0-{full-final,baseline-full,regressao,mutantes,contagens}.json e logs b0-smoke, b0-build, b0-tsc-final, b0-lint-final. Nenhuma chave deve ser copiada do log da inicialização da stack para o repositório.

## Roteiro antes de merge

1. Revisar o contrato B0 e decidir como acomodar a nova migration nos cinco testes estruturais sem reescrever hashes históricos nem ampliar o baseline global silenciosamente.
2. Na stack descartável B0, repetir o runner de smoke; ele apaga/reconstrói somente os schemas public/private do container fixo supabase_db_radar-b0-local. Não apontar para outro banco.
3. Abrir a interface local com conta sintética, conferir o handoff Central/Radar para Avaliação e a ausência de erros no console. Conferir que a referência Radar de Locação não escolhe Venda do mesmo ID.
4. Conferir os dois UUIDs e históricos separados para SYNTHETIC-123 e repetir preços 3.200→3.300 / 650.000→640.000.
5. Executar novamente a full suite depois de qualquer ajuste aprovado. Não aplicar migration remota nem liberar Venda como parte desta revisão.

**Aguardando revisão e smoke manual de interface. HOLD R6.0c-B2.6-B0.**
