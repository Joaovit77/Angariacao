# Imóvel de venda no Pipeline: contrato

Estado: IV-0 (decisões de produto) fechado. IV-1 (schema inerte, tipos e mapeadores) **concluído em
Production** em 2026-10-06; detalhes em "IV-1 em Production" abaixo. A interface ainda não tem
nenhum campo de venda ou finalidade. IV-2 a IV-6 não foram iniciados.

## Decisões fechadas (IV-0)

1. Um único Pipeline e um único imóvel; venda/locação é a característica `finalidade`.
2. `finalidade` em `imoveis`: `text` com check (`locacao`, `venda`, `locacao_venda`), sem enum do
   Postgres, `null` = não informado, sem default e sem backfill.
3. Os 122 imóveis da supervisora com origem "anúncio de venda" não são inferidos: confirmação
   humana, depois.
4. `valor_venda` próprio; `valor_aluguel` nunca é reaproveitado para venda.
5. `vendido_em` agora; status "Vendido" e seu marco no `status_history` só no IV-5.
6. "Ambos" locado continua à venda; vendido encerra os dois lados (regra para fatias futuras).
7. Os fluxos existentes que supõem locação ganham guardas de finalidade no IV-4. Integrações
   externas, como a Sophia, seguem as regras do Angario; o domínio não é desenhado em função delas.
8. Locados e Vendidos separados nas métricas (IV-6), fora do IV-1.

## IV-1: migration `20261006200215_imoveis_finalidade_venda.sql`

Uma transação (`lock_timeout` 5 s, `statement_timeout` 60 s) com um único `ALTER TABLE
public.imoveis`:

| Coluna | Tipo | Nula | Default | Check |
| --- | --- | --- | --- | --- |
| `finalidade` | `text` | sim | nenhum | `imoveis_finalidade_check`: null (não informado ou ainda não classificado) ou `locacao`/`venda`/`locacao_venda` |
| `valor_venda` | `numeric` | sim | nenhum | `imoveis_valor_venda_check`: null (não informado) ou `>= 0` e `< 'Infinity'` (recusa negativo, NaN, Infinity) |
| `vendido_em` | `date` | sim | nenhum | nenhum |

Repetível (`add column if not exists`, `drop constraint if exists` + `add`) e espelhada
literalmente no `supabase-schema.sql` entre `-- BEGIN IMOVEL VENDA IV-1` e
`-- END IMOVEL VENDA IV-1`, logo depois do Retirados C1 e antes do Vendas V1-B1.

Não muda: RLS e as quatro policies de dono, índices, os sete triggers de `imoveis` (nenhum faz
operação de linha inteira), `status`, `status_history`, Locado, locação/repasse, Sophia,
Retirados, Vendas. Nenhuma função, policy, índice ou trigger novo. A publicação
`supabase_realtime` não tem lista de colunas, então as colunas novas são transmitidas.

Os testes de schema de Vendas (B1, B2, B3.2) passaram a reconhecer o bloco IV-1 como bloco
posterior independente: as âncoras de hash removem o bloco antes de comparar (e o hash histórico
continua o mesmo), e a ordem das migrations aceita só o IV-1 depois do B3.2.

## IV-1: app

- `FINALIDADES_IMOVEL` e `FinalidadeImovel` em `web/lib/constantes.ts`.
- `Imovel.finalidade?`, `Imovel.valorVenda?`, `Imovel.vendidoEm?` (opcionais).
- `DbImovelRow`: `finalidade?`, `valor_venda?`, `vendido_em?` (opcionais, como `retirado_*`).
- `fromDbImovel`: finalidade fora da lista vira `null` (nunca `locacao`); `valor_venda` null
  fica null e número não finito vira null; `vendido_em` vazio vira null.
- **`toDbImovel` não manda as três colunas**, de propósito. O upsert grava só as colunas listadas;
  ficar de fora é o que as preserva quando o ModalImovel, o pré-cadastro, a importação ou o
  desdobramento gravam a linha, para nenhum save genérico apagar ou sobrescrever campos que ainda
  não têm tela própria.

## Regras para as próximas fatias

- **IV-2** (cadastro): passa a editar `finalidade` e `valor_venda`; só pode mandá-las no
  `toDbImovel` com guarda de campo presente (padrão `estado`) e a rede de `undefined` do
  `salvarImovel`. Decide a herança no desdobramento. Corrige `reconciliarImovelRealtime`, que
  reconstrói a base pelo `toDbImovel`: hoje um payload parcial do Realtime deixa as três em null
  na memória até recarregar (o banco não é tocado).
- **`vendido_em` nunca passa pelo save genérico**, nem no IV-2.
- **IV-5** (Vendido): status "Vendido", marco no `status_history` e `vendido_em`, gravados só pela
  ação humana explícita de Vendido, nunca derivados de oportunidade ganha em Vendas.

## Roteiro (nenhuma fatia iniciada)

| Fatia | Escopo |
| --- | --- |
| IV-2, cadastro e edição | editar `finalidade` e `valor_venda`; preservação segura no save; imóveis antigos com `null`; desdobramento; importação e pré-cadastro; Realtime parcial |
| IV-3, Pipeline | filtro por finalidade, selo, valor certo para cada lado, visualização de locação, venda e ambos |
| IV-4, guardas de finalidade nos fluxos existentes | cada fluxo que hoje supõe locação passa a respeitar a finalidade; integrações externas (como a Sophia) seguem as regras do Angario |
| IV-5, Vendido | status Vendido, `status_history`, `vendido_em`, só por ação humana explícita |
| IV-6, métricas e relatórios | Locados e Vendidos separados, sem misturar fórmulas financeiras de locação e venda |

Relação com outras frentes: Vendas B3.4a segue na branch `codex/vendas-v1-b3-4a-leitura`
(`c8a0494`, Preview `dpl_7ENX6mYPadjnbbuKQPz8j6fSGXsX`), sem Production; a B3.4b espera a evolução
do domínio de imóvel de venda.

## Provas do IV-1

- `web/tests/imovel-venda-iv1-schema.test.ts`: forma da migration, checks exatos, sem default,
  sem índice/policy/trigger/função/DML, espelho literal e posição no schema.
- `web/tests/imovel-venda-iv1-banco.test.ts` (PGlite): catálogo antes e depois (só três colunas
  e dois checks), linhas antigas com o mesmo `xmin` e null nas novas, bloco repetível, valores
  aceitos e recusados, RLS A/B.
- `web/tests/imovel-venda-iv1-mapeadores.test.ts`: leitura, `toDbImovel` sem as colunas,
  desdobramento e Realtime.
- `web/integration/imovel-venda-iv1-supabase-local.test.ts` (opt-in, stack local isolada
  `imovel-iv1-c69a18b`): linha legada criada antes da migration, `salvarImovel`,
  `importarImoveis` e `desdobrarImovel` reais, checks pelo PostgREST, RLS A/B, publicação do
  Realtime com as três colunas e reconciliação sem gravação.
- Realtime ao vivo: numa stack local recém-criada nenhum UPDATE de `imoveis` é entregue, **com ou
  sem o IV-1** (controle antes e depois da migration), então a entrega ao vivo não entra no teste.
  Numa stack já aquecida com o IV-1 aplicado, o payload de UPDATE trouxe `finalidade` e
  `valor_venda` normalmente.
- `prospeccao-fronteira.test.ts`: os pins de conteúdo de `tipos.ts` e `mapeadores.ts` foram
  atualizados junto com a mudança desses arquivos, como no Retirados C1 (regra do próprio teste:
  o pin muda no mesmo commit que altera o arquivo, e a mensagem explica).

## IV-1 em Production

- Código: main em `43d863eef52ebc20ffb251357f0457cc79f793ce` (fast-forward de `c69a18b`), deploy
  `dpl_3LVGfqc3aS8K9TvkQYuLXZhdaYXq`. O código entrou antes do schema, porque é compatível com e
  sem as colunas.
- Migration `20261006200215_imoveis_finalidade_venda.sql` (sha256
  `0bbbdd70b023939100b3e20737be40fb102cf374f83d99fdddf8557f22449572`) aplicada sozinha em
  2026-10-06 por `db push` a partir de um workdir isolado; ledger 80 → 81.
- Catálogo depois da aplicação: `imoveis` passou de 57 para 60 colunas e ganhou só os dois checks
  (`convalidated`); índices, policies, triggers e funções iguais; RLS e Realtime como antes.
- Retrato da aplicação (não é regra): 1044 imóveis, nenhum com `finalidade`, `valor_venda` ou
  `vendido_em` preenchidos.
- Smoke só leitura antes e depois da migration, sem erro, sem escrita e sem consulta às colunas
  novas.
- Funções do banco que leem a linha inteira de `imoveis`: 3 funções, com 4 comandos
  `select * into v_imovel from public.imoveis` (`private.prever_locacoes`,
  `public.confirmar_acao_assistente` com dois, `public.operar_acao_assistente_acompanhamento`).
  São seguras com colunas novas: `v_imovel` tem o tipo `public.imoveis`, que acompanha a tabela;
  os campos são lidos por nome; nenhuma serializa a linha inteira nem faz INSERT posicional.
- Radar: a migration antiga `20261003233240_radar_r6_1_schema_global.sql` continua não aplicada;
  uma R6.1 reemitida precisa de timestamp posterior a `20261006200215`.
