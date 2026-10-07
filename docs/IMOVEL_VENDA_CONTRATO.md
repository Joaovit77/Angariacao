# Imóvel de venda no Pipeline: contrato

Estado: IV-0 (decisões de produto) fechado. IV-1 (schema inerte, tipos e mapeadores) **concluído em
Production** em 2026-10-06; detalhes em "IV-1 em Production" abaixo. IV-2B (persistência, Realtime
e desdobramento) e IV-2C (tela de cadastro e edição) na branch `codex/imovel-venda-iv2b-persistencia`
(commit `e614311`, Preview aprovada); IV-3A (valores no Pipeline) e IV-3A.2 (centavos e largura da lista) na mesma branch. Ver "IV-2B",
"IV-2C" e "IV-3A" abaixo. Em Production a interface ainda não tem nenhum campo de venda ou
finalidade. IV-3B a IV-6 não foram iniciados.

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
- **`toDbImovel` não mandava as três colunas** no IV-1, de propósito. O upsert grava só as colunas
  listadas; ficar de fora é o que as preservava quando o ModalImovel, o pré-cadastro, a importação
  ou o desdobramento gravam a linha. O IV-2B trocou essa regra pela de "ausente não é null"
  (abaixo).

## IV-2B: persistência

Regra: **chave ausente** (ou `undefined`) = não altera a coluna; **chave presente com null** =
limpa; **chave presente com valor** = grava (0 é valor). Nunca `ausente → null`.

- `fromDbImovel` só cria `finalidade` e `valorVenda` quando a coluna veio na linha (D1), como
  `estado`. Uma linha parcial, ou anterior à migration, não ganha um null que o próximo save
  gravaria. `vendidoEm` segue como no IV-1.
- `toDbImovel` manda `finalidade` e `valor_venda` só quando o imóvel traz o campo, sem default
  (`locacao`, `|| 0`). `vendido_em` e os dados da retirada continuam fora.
- `CAMPOS_IMOVEL_SEM_ESCRITA_GARANTIDA` e `preservarCamposSemEscritaGarantida` (em
  `mapeadores.ts`, depois do `fromDbImovel`) listam e preservam o que o `toDbImovel` não grava
  sempre: `finalidade`, `valor_venda`, `vendido_em`, `retirado_em`, `retirado_motivo`,
  `retirado_observacao`. O `toDbImovel` continua mapper de escrita, não serialização completa.
- `reconciliarImovelRealtime`: o que veio no payload vale (inclusive null); o que não veio fica
  como estava. Fecha o cenário "banco = venda, memória = null por payload parcial, próximo
  arrasto grava null".
- `salvarImovel`: o upsert recebe só o que o chamador trouxe; **depois** da escrita, o objeto do
  store completa com o anterior o que não foi gravado (`finalidade`/`valorVenda` ausentes;
  `vendidoEm` e os dados da retirada sempre). Feito antes do upsert, transformaria "não sei" em
  escrita do valor da memória.
- Dados da retirada (D3): só preservação de estado no Realtime e no store; antes, editar um imóvel
  retirado pelo formulário deixava a memória sem data, motivo e observação até o eco do Realtime
  ou um recarregamento. Regras, tela, motivos, reativação e API de Retirados não mudam.
- Arrastar no Pipeline (`{...imovel, status}`) reenvia `finalidade` e `valor_venda` com o valor
  real do store.
- Desdobramento (D2): a unidade herda a `finalidade` do principal (sem o campo no principal, fica
  sem; nunca `locacao` inventado) e nasce com `valorVenda` null.
- Pré-cadastro e importação não trazem o campo e gravam null. A importação continua lendo a
  coluna "valor"/"preco" como aluguel: numa planilha de venda, o preço iria para o aluguel
  (dívida registrada, fora do IV-2).
- Pins: `tipos.ts` e `mapeadores.ts` mudaram, e os pins do `prospeccao-fronteira.test.ts`
  mudam junto.

Provas: `web/tests/imovel-venda-iv2b-persistencia.test.ts` (A a V, com mock do Supabase e as
mutações reais) e `web/integration/imovel-venda-iv2b-supabase-local.test.ts` (opt-in, mesma stack
local isolada do IV-1, porque não há migration nova).

## IV-2C: tela de cadastro e edição

Só o `ModalImovel`. Pipeline, ModalDesdobrar, importação, pré-cadastro e fluxos de locação não
mudam.

- Campo **Finalidade** no fieldset "Dados do imóvel", antes dos valores: Locação, Venda, Locação e
  venda (`locacao`, `venda`, `locacao_venda`).
- **Criação** (cadastro manual e promoção do Garimpo, `!imovel`): nasce vazia ("Selecione a
  finalidade"), sem presumir locação nem inferir pela origem ou pelo anúncio; salvar sem escolher
  mostra "Informe a finalidade do imóvel." e não grava (D4).
- **Imóvel existente null** (toda a carteira em 2026-10-06, e a confirmação de pré-cadastro, que é
  edição): aparece "Não informado", o aluguel continua visível como antes (compatibilidade visual,
  não classificação), e salvar sem escolher grava null sem bloquear.
- **Imóvel classificado**: "Não informado" não é oferecido (D5).
- **Valores**: Locação mostra o aluguel e o valor em caso de atraso; Venda, o valor de venda;
  Locação e venda, os três; o imóvel antigo sem finalidade, o aluguel e o atraso, como antes. O
  condomínio aparece sempre (vale também para venda). Trocar a finalidade só esconde: o
  valor fica no estado, é salvo de novo e reaparece ao voltar; uma dica curta avisa que ele
  continua guardado.
- **Gravação**: o formulário manda sempre `finalidade` (vazio vira null) e `valorVenda`
  (`numOrNull`, sem `|| 0`: vazio é null, 0 é 0, decimal preservado). O aluguel mantém
  `numOrNull(...) || 0`. `vendidoEm` não é campo nem é mandado.

Provas: `web/tests/imovel-venda-iv2c-modal.test.ts` (jsdom, o modal real com sessão, router, mapa,
autocomplete, linha do tempo e `salvarImovel` trocados). O teste de ponta a ponta da promoção do
Garimpo (`prospeccao-promocao.test.ts`) passou a escolher a finalidade antes de cadastrar e
confirma que ela nasce vazia mesmo com "aluga-se" na observação.

## IV-3A: valores no Pipeline

Só apresentação; nada é gravado. Uma regra pura (`exibicaoValoresImovel`, em
`web/lib/calculo/valoresImovel.ts`) decide o que o Pipeline mostra, e as três superfícies usam a
mesma regra por `web/components/pipeline/ValoresImovelPipeline.tsx`:

| Finalidade | Card do Kanban e lista | Painel lateral |
| --- | --- | --- |
| `locacao` | "Aluguel R$ X" | Finalidade: Locação; Valor do aluguel |
| `venda` | "Venda R$ Y" | Finalidade: Venda; Valor de venda |
| `locacao_venda` | "Aluguel R$ X" e "Venda R$ Y", um por linha | Finalidade: Locação e venda; os dois valores |
| null ou ausente | o aluguel sem rótulo, como antes | Finalidade: Não informado; "Valor" (o aluguel) |

- O aluguel antigo de um imóvel de venda continua no banco, mas nunca aparece como preço da
  venda (o smoke do IV-2 viu "R$ 0" e "R$ 1.200" no card antes desta correção).
- Venda sem valor (`null`) aparece como "—" (não informado); 0 aparece como "R$ 0", que é valor
  real. A decisão não usa verdade/falsidade.
- Finalidade fora da lista é tratada como sem finalidade.
- O cabeçalho da coluna da lista virou "Valor"; a classe `col-aluguel`, que alinha a coluna,
  ficou.
- `ROTULO_FINALIDADE_IMOVEL` (em `web/lib/constantes.ts`) é a fonte única dos rótulos, usada pelo
  ModalImovel e pelo Pipeline.

Provas: `web/tests/imovel-venda-iv3a-valores.test.ts` (regra pura, componentes em jsdom e trava de
que o PipelineView não mostra mais `valorAluguel` direto).

### IV-3A.2: centavos e largura da lista

O smoke da Preview do IV-3A achou dois defeitos de apresentação, corrigidos aqui sem tocar em
banco nem em persistência.

**Formatação.** Até o IV-3A os valores passavam pelo `fmtMoney`, que arredonda para reais
inteiros: 450000.55 aparecia como "R$ 450.001", um preço que não é o cadastrado. Agora o texto de
cada valor sai pronto de `fmtValorImovel` (em `web/lib/calculo/valoresImovel.ts`), a única regra
de centavos; card do Kanban, lista e painel lateral mostram exatamente esse texto.

| Valor gravado | Aparece como |
| --- | --- |
| 500000 | R$ 500.000 |
| 450000.55 | R$ 450.000,55 |
| 1500.5 | R$ 1.500,50 |
| 0 | R$ 0 |
| null | — |

- Inteiro não mostra ",00"; centavos reais são preservados.
- `null` é "não informado" e aparece como "—"; 0 continua sendo valor real.
- A regra depende do valor, não da finalidade: vale igualmente para aluguel e venda (um aluguel
  com centavos também os mostra), inclusive no imóvel sem finalidade.
- Os centavos contam depois de arredondar para 2 casas, então um resíduo de ponto flutuante não
  vira ",00".

**Largura da lista (desktop).** A coluna Valor tinha 100px, pensada para "R$ 3.500", e cortava
"Venda R$ 450.0". Passou para 160px: "Venda R$ 1.500.000,50", a linha mais longa prevista, mede
129px em 13px Segoe UI, e a célula deixa 136px de texto. O endereço já estava espremido antes do
IV-3A (as colunas fixas somavam 1166px contra `min-width` de 1180px, sobrando 14px); a regra
estrutural agora é:

> soma das colunas fixas + 240px mínimos para o Endereço ≤ `min-width` da tabela

Hoje: 1226 + 240 = 1466px. Abaixo disso a tabela rola na horizontal, que é o comportamento
previsto. No celular a coluna Valor continua escondida, como antes.

Provas: `web/tests/imovel-venda-iv3a-valores.test.ts` (casos de formatação, as três superfícies
com o mesmo texto, componente sem formatação própria) e `web/tests/pipeline-colunas.test.ts`
(largura da coluna Valor e a regra do endereço).

## Regras para as próximas fatias

- **`vendido_em` nunca passa pelo save genérico**, nem no IV-2.
- **IV-5** (Vendido): status "Vendido", marco no `status_history` e `vendido_em`, gravados só pela
  ação humana explícita de Vendido, nunca derivados de oportunidade ganha em Vendas.

## Roteiro

| Fatia | Escopo |
| --- | --- |
| IV-2, cadastro e edição | persistência, Realtime e desdobramento no IV-2B; tela no IV-2C (os dois locais) |
| IV-3, Pipeline | valor certo para cada lado no IV-3A; filtro por finalidade e o resto da visualização depois |
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
