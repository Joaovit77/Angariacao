# Baseline observacional da IA

Este documento congela como se mede o comportamento das chamadas de IA em Production a partir da
instrumentação do IA-M1c (metadados em `ia_uso`, `ia-chamada-falhou` e `ia-resposta-rejeitada` em
`log_eventos`). Ele é a referência anterior a qualquer troca de modelo, de esforço, de prompt ou de
configuração: depois de uma mudança, os mesmos números são medidos de novo, com as mesmas consultas,
o mesmo cohort e as mesmas definições, e comparados com o baseline.

O baseline serve para observar: estabilidade, taxa de falha do provedor, truncamento, recusa,
latência, tokens, cache, modelo servido, configuração e chamadas por execução. Ele não mede
qualidade da resposta (isso é do Q1 e dos Evals) e não autoriza nenhuma mudança de comportamento.

**Estado atual: T0 em 02/10/2026. Isto NÃO é o baseline final.** É só o ponto inicial
observacional. O baseline final só existe quando o gate da seção 6 for verdadeiro.

## 1. Marcos da instrumentação (UTC)

Horários de "pronto" dos deploys de Production, conferidos na Vercel. Uma métrica só vale a partir
do marco que a tornou observável no fluxo correspondente.

| Marco | Commit | Deploy | Pronto em (UTC) | O que passou a existir |
| --- | --- | --- | --- | --- |
| M1c-A | `daccc40` | `dpl_GxPCmf9MG1Wgi2p4e6CFue4wCunC` | 2026-09-30 23:54:28 | metadados em `ia_uso` nos fluxos do executor (F1, F3, F4 a F9, F11, F12) |
| M1c-B | `fc48f99` | `dpl_6c8rP4a8jKPVuxTQ5WhtT3bLtbE9` | 2026-10-01 01:06:07 | `ia-chamada-falhou` nos fluxos do executor |
| M1c-C | `91b6335` | `dpl_D3nwvvcJ79JwGuYAKesxYhpHJPzR` | 2026-10-01 15:29:24 | `ia-resposta-rejeitada` (F1, F4 a F9, F11; F3 só ganhou `execucao_id` nos próprios eventos) |
| M1c-D1 | `23ec825` | `dpl_9vE8j2Q37avPyYBgAR3xEf3DumW4` | 2026-10-01 17:54:28 | metadados do F10 (`assistente-chat`) |
| M1c-D2 | `630deb4` | `dpl_7QWfgeEZ85bYnzQRDFozByjkRNbA` | 2026-10-01 19:47:30 | `ia-chamada-falhou` no F10 |
| M1c-E1 | `ec296f6` | `dpl_SSsxR2Pb8jqRBmX5JAvY8RqiUvbe` | 2026-10-01 22:13:57 | metadados e `ia-chamada-falhou` no F13 (`embedding-*`) |
| M1c-E2 | `57d2a9d` | `dpl_FY5VsT6gAX5R2fqCJ8pfrZ57Vizw` | 2026-10-02 00:07:48 | metadados e `ia-chamada-falhou` por tentativa no F2 (`transcricao`) |

Início válido de cada métrica, por fluxo:

| Fluxo | Metadados | Falha do provedor | Rejeição |
| --- | --- | --- | --- |
| Executor (F1, F3, F4 a F9, F11, F12) | M1c-A | M1c-B | M1c-C (F3 não emite) |
| F10 `assistente-chat` | M1c-D1 | M1c-D2 | não se aplica |
| F13 `embedding-*` | M1c-E1 | M1c-E1 | não se aplica |
| F2 `transcricao` | M1c-E2 | M1c-E2 | não se aplica |

Fluxos sem marco documentado não têm início inventado: só entram quando houver um.

## 2. Cohort

O baseline estatístico principal usa **somente a conta real principal atual**, congelada por
`user_id` explícito: C1 é o sha256 desse `user_id` (função `sha256` embutida do Postgres).

```
cohort C1 = encode(sha256(user_id::text::bytea), 'hex') = <COHORT_SHA256>
```

O repositório é público, então nem o `user_id` nem o valor real do hash são versionados. Nas
consultas, o cohort aparece como o placeholder `<COHORT_SHA256>`, e o valor real é fornecido
localmente por quem executa (ele está registrado fora do repositório, junto com o operador do
baseline). Isso não altera o universo do baseline: C1 continua sendo exatamente aquele `user_id`,
e qualquer snapshot precisa usar o mesmo valor do T0.

O cohort não é definido por nome, e-mail, "não é teste" nem por lista negativa de contas. Linhas
sem dono (`user_id` null) ficam fora, porque o hash de null é null.

Quando um segundo usuário real começar a operar, ele **não** entra automaticamente em C1. Abre-se
uma decisão separada sobre um cohort novo (por exemplo C2), com o seu próprio T0.

## 3. Definições

- **Chamada**: uma linha em `ia_uso` com `execucao_id` não nulo, do cohort, na janela. Uma linha ali
  significa só "o provedor respondeu com usage", nunca "a funcionalidade usou a resposta".
- **Falha do provedor**: um evento `ia-chamada-falhou` em `log_eventos`, do cohort, na janela, com o
  `tipo` lido do `detalhe` (JSON). Uma por chamada lógica ao provedor; os retries internos do SDK
  não geram eventos à parte; no F2, uma por tentativa do próprio Angario.
- **provider_attempts** = chamadas + falhas do provedor, para o mesmo `tipo` e a mesma janela.
- **provider_attempt_failure_rate** = falhas do provedor / provider_attempts. É uma taxa **por
  tentativa ao provedor**, não por execução: no F2 (até 3 tentativas), no F13 (N lotes) e no F10
  (até 5 rodadas) uma execução pode ter várias tentativas e ainda assim terminar bem.
- **Rejeição**: um evento `ia-resposta-rejeitada` (o provedor respondeu, a aplicação não usou).
  Taxa de rejeição = rejeições / chamadas. Contada à parte da falha.
- **Truncamento**: chamada com `motivo_fim = 'length'`. **Recusa**: chamada com `recusa = true`.
  Contados separadamente.
- **Execução**: um `execucao_id`. Quando ele existe, também se mede `count(distinct execucao_id)`,
  tentativas e usos por execução, e execuções com pelo menos uma falha. Dados anteriores ao
  `execucao_id` não são interpretados como execuções.
- **Latência**: `duracao_ms`, p50 e p95 com `percentile_cont`.
- **Tokens**: médias por chamada de `tokens_entrada`, `tokens_saida`, `tokens_raciocinio` e
  `tokens_entrada_cache`; **fração de cache** = soma de `tokens_entrada_cache` / soma de
  `tokens_entrada`.
- `ia-assistente-respondido` não é falha e não entra em nenhuma dessas contas.

## 4. Consultas fixas (somente leitura)

Todas são um único `SELECT` (com CTEs), sem função mutável, sem tabela temporária, sem DDL e sem
escrita. Leem só colunas de metadados e o `tipo`, a `categoria`, o `status_http` e o `motivo` do
`detalhe` dos eventos de IA: nunca prompt, resposta, mensagem, áudio, texto transcrito, endereço,
telefone ou conteúdo de imóvel. Os parâmetros ficam no CTE `p`: `inicio`, `fim` (exclusivo) e
`cohort`. Para medir uma taxa, `inicio` não pode ser anterior ao início válido dela (seção 1).

### Q1. Chamadas, truncamento, recusa, latência e tokens, por tipo e rota

```sql
with p as (
  select timestamptz '2026-09-30 23:54:28+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
), u as (
  select i.*
  from public.ia_uso i, p
  where i.criado_em >= p.inicio and i.criado_em < p.fim
    and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
)
select tipo, rota,
  count(*) as linhas,
  count(*) filter (where execucao_id is null) as sem_metadados,
  count(distinct execucao_id) as execucoes,
  count(*) filter (where motivo_fim = 'length') as truncamentos,
  count(*) filter (where recusa) as recusas,
  percentile_cont(0.5) within group (order by duracao_ms) as p50_ms,
  percentile_cont(0.95) within group (order by duracao_ms) as p95_ms,
  round(avg(tokens_entrada), 1) as entrada_por_chamada,
  round(avg(tokens_saida), 1) as saida_por_chamada,
  round(avg(tokens_raciocinio), 1) as raciocinio_por_chamada,
  round(avg(tokens_entrada_cache), 1) as cache_por_chamada,
  round(sum(tokens_entrada_cache)::numeric / nullif(sum(tokens_entrada), 0), 4) as fracao_cache
from u
group by tipo, rota
order by linhas desc, tipo;
```

`sem_metadados` maior que zero numa janela que começa depois do marco do fluxo é um defeito.

### Q2. Eventos de falha e de rejeição, por tipo e categoria

```sql
with p as (
  select timestamptz '2026-09-30 23:54:28+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
), ev as (
  select l.evento, l.detalhe
  from public.log_eventos l, p
  where l.criado_em >= p.inicio and l.criado_em < p.fim
    and l.categoria = 'ia'
    and l.evento in ('ia-chamada-falhou', 'ia-resposta-rejeitada')
    and encode(sha256(l.user_id::text::bytea), 'hex') = p.cohort
)
select evento,
  (detalhe::jsonb)->>'tipo' as tipo,
  (detalhe::jsonb)->>'categoria' as categoria,
  (detalhe::jsonb)->>'status_http' as status_http,
  (detalhe::jsonb)->>'motivo' as motivo,
  count(*) as eventos
from ev
group by 1, 2, 3, 4, 5
order by eventos desc;
```

### Q3. provider_attempts, taxa de falha por tentativa e taxa de rejeição

```sql
with p as (
  select timestamptz '2026-10-01 15:29:24+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
), usos as (
  select i.tipo, count(*) as n
  from public.ia_uso i, p
  where i.criado_em >= p.inicio and i.criado_em < p.fim
    and i.execucao_id is not null
    and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
  group by i.tipo
), ev as (
  select l.evento, l.detalhe
  from public.log_eventos l, p
  where l.criado_em >= p.inicio and l.criado_em < p.fim
    and l.categoria = 'ia'
    and l.evento in ('ia-chamada-falhou', 'ia-resposta-rejeitada')
    and encode(sha256(l.user_id::text::bytea), 'hex') = p.cohort
), contagem as (
  select (detalhe::jsonb)->>'tipo' as tipo,
         count(*) filter (where evento = 'ia-chamada-falhou') as falhas,
         count(*) filter (where evento = 'ia-resposta-rejeitada') as rejeicoes
  from ev
  group by 1
)
select coalesce(u.tipo, c.tipo) as tipo,
  coalesce(u.n, 0) as chamadas,
  coalesce(c.falhas, 0) as falhas,
  coalesce(u.n, 0) + coalesce(c.falhas, 0) as provider_attempts,
  round(coalesce(c.falhas, 0)::numeric / nullif(coalesce(u.n, 0) + coalesce(c.falhas, 0), 0), 4)
    as provider_attempt_failure_rate,
  coalesce(c.rejeicoes, 0) as rejeicoes,
  round(coalesce(c.rejeicoes, 0)::numeric / nullif(coalesce(u.n, 0), 0), 4) as taxa_rejeicao
from usos u
full join contagem c on c.tipo = u.tipo
order by provider_attempts desc, tipo;
```

O `inicio` de exemplo é o marco M1c-C, o primeiro em que falha e rejeição valem para o executor.
Para F10, F13 e F2 use o marco próprio de cada um.

### Q4. Modelo pedido, modelo servido, configuração e esforço

```sql
with p as (
  select timestamptz '2026-09-30 23:54:28+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
)
select i.tipo, i.modelo, i.modelo_servido, i.config_origem, i.config_versao, i.esforco,
  count(*) as chamadas
from public.ia_uso i, p
where i.criado_em >= p.inicio and i.criado_em < p.fim
  and i.execucao_id is not null
  and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
group by 1, 2, 3, 4, 5, 6
order by chamadas desc, tipo;
```

Ausência de configuração customizada (`config_origem = 'padrao'`, `config_versao` null) é um
estado observado, não um erro.

### Q5. Execuções: tentativas e usos por execução

```sql
with p as (
  select timestamptz '2026-09-30 23:54:28+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
), ids as (
  select i.tipo, i.execucao_id::text as execucao_id, 1 as uso, 0 as falha
  from public.ia_uso i, p
  where i.criado_em >= p.inicio and i.criado_em < p.fim
    and i.execucao_id is not null
    and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
  union all
  select (l.detalhe::jsonb)->>'tipo', (l.detalhe::jsonb)->>'execucao_id', 0, 1
  from public.log_eventos l, p
  where l.criado_em >= p.inicio and l.criado_em < p.fim
    and l.categoria = 'ia' and l.evento = 'ia-chamada-falhou'
    and encode(sha256(l.user_id::text::bytea), 'hex') = p.cohort
), por_execucao as (
  select tipo, execucao_id, sum(uso) as usos, sum(falha) as falhas
  from ids
  group by tipo, execucao_id
)
select tipo,
  count(*) as execucoes,
  sum(usos) as usos,
  sum(falhas) as falhas,
  round(avg(usos + falhas), 2) as tentativas_por_execucao,
  round(avg(usos), 2) as usos_por_execucao,
  max(usos + falhas) as max_tentativas,
  count(*) filter (where falhas > 0) as execucoes_com_falha,
  count(*) filter (where usos = 0) as execucoes_sem_uso
from por_execucao
group by tipo
order by execucoes desc, tipo;
```

### Q6. Gate do F1: volume e semanas completas

```sql
with p as (
  select timestamptz '2026-09-30 23:54:28+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
), f1 as (
  select i.criado_em
  from public.ia_uso i, p
  where i.tipo = 'classificar-resposta' and i.execucao_id is not null
    and i.criado_em >= p.inicio and i.criado_em < p.fim
    and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
), semanas as (
  select (date_trunc('week', p.inicio at time zone 'UTC')
          + case when date_trunc('week', p.inicio at time zone 'UTC') = p.inicio at time zone 'UTC'
                 then interval '0 day' else interval '7 days' end) as primeira_segunda,
         date_trunc('week', p.fim at time zone 'UTC') as ultima_segunda
  from p
)
select (select count(*) from f1) as f1_instrumentadas,
  greatest(0, (extract(epoch from (s.ultima_segunda - s.primeira_segunda)) / 604800)::int)
    as semanas_completas,
  s.primeira_segunda::date as primeira_semana_completa_comeca,
  (select count(*) from f1) >= 200 as gate_volume,
  greatest(0, (extract(epoch from (s.ultima_segunda - s.primeira_segunda)) / 604800)::int) >= 2
    as gate_semanas
from semanas s;
```

Uma semana completa vai de segunda 00:00 a domingo 23:59:59 UTC e precisa estar inteira dentro da
janela. `date_trunc('week', ...)` do Postgres começa na segunda-feira.

### Q7. Volume semanal do F1

```sql
with p as (
  select timestamptz '2026-09-30 23:54:28+00' as inicio,
         timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
)
select date_trunc('week', i.criado_em at time zone 'UTC')::date as semana_utc,
  count(*) as f1_instrumentadas
from public.ia_uso i, p
where i.tipo = 'classificar-resposta' and i.execucao_id is not null
  and i.criado_em >= p.inicio and i.criado_em < p.fim
  and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
group by 1
order by 1;
```

### Q8. Validação natural pós-deploy de F10, F13 e F2

```sql
with p as (
  select timestamptz '2026-10-02 11:00:00+00' as fim,
         '<COHORT_SHA256>'::text as cohort
), marcos(fluxo, padrao, desde, rota_esperada, com_esforco) as (values
  ('F10 assistente-chat', 'assistente-chat', timestamptz '2026-10-01 17:54:28+00', 'assistente', true),
  ('F13 embeddings', 'embedding%', timestamptz '2026-10-01 22:13:57+00', null, false),
  ('F2 transcricao', 'transcricao', timestamptz '2026-10-02 00:07:48+00', null, false)
)
select m.fluxo, m.desde,
  count(i.id) as linhas_pos_marco,
  count(i.id) filter (where i.execucao_id is null) as sem_execucao_id,
  count(i.id) filter (where i.duracao_ms is null) as sem_duracao,
  count(i.id) filter (where i.rota is distinct from m.rota_esperada) as rota_diferente_do_contrato,
  count(i.id) filter (where (i.esforco is not null) <> m.com_esforco) as esforco_diferente_do_contrato
from marcos m
cross join p
left join public.ia_uso i
  on i.tipo like m.padrao and i.criado_em >= m.desde and i.criado_em < p.fim
 and encode(sha256(i.user_id::text::bytea), 'hex') = p.cohort
group by m.fluxo, m.desde
order by m.desde;
```

Contrato esperado: F10 com `rota = 'assistente'` e esforço preenchido; F13 e F2 com rota e esforço
null; os três com `execucao_id` e `duracao_ms`. `modelo_servido` vem do F10 e do F13 e é sempre
null no F2.

## 5. Métricas de cada snapshot

Por `tipo` (e rota quando houver): chamadas, provider_attempts, provider_attempt_failure_rate,
rejeições e taxa de rejeição, truncamentos, recusas, p50 e p95 de duração, tokens de entrada,
saída e raciocínio por chamada, tokens de entrada em cache por chamada e fração de cache, modelo
pedido e servido, origem e versão da configuração, esforço, e execuções com tentativas e usos por
execução. Só agregados.

## 6. Gate de fechamento

O baseline final do F1 (`classificar-resposta`) exige as **duas** condições, ao mesmo tempo:

1. pelo menos **200 chamadas F1 instrumentadas** no cohort C1 (Q6, `gate_volume`);
2. pelo menos **2 semanas completas**, de segunda a domingo em UTC, dentro da janela (Q6,
   `gate_semanas`).

Não se fecha só por calendário nem só por volume.

**F3 (`rascunhar-resposta-*`).** Critério original do plano IA-M1c: pelo menos 30 execuções do F3.
**Revisão em 02/10/2026:** o volume real caiu para 0 a 3 execuções por semana (nenhuma desde o
M1c-A), e esperar 30 travaria o fechamento por meses. O F3 deixa de bloquear o fechamento do
M1c-F e passa a validação oportunística, junto com o Q1. O critério original continua registrado
aqui como histórico.

**F4 a F9, F11, F12, F10, F13 e F2.** Volume insuficiente para baseline estatístico: ficam
oportunísticos ou no Q1. Nenhuma chamada é fabricada para aumentar a amostra, e a conta de teste
não entra no cohort.

## 7. Critérios de regressão

Aplicados por `tipo`, comparando um snapshot com o baseline final (ou, antes dele, com o T0 só como
indicativo):

| Métrica | Atenção | Regressão |
| --- | --- | --- |
| Falha do provedor | 3 ou mais `ia-chamada-falhou` em 7 dias | provider_attempt_failure_rate acima de 2% com pelo menos 100 provider_attempts |
| Truncamento | qualquer ocorrência | acima de 1% com pelo menos 100 chamadas |
| Recusa | qualquer ocorrência | acima de 1% com pelo menos 100 chamadas |
| Latência | p95 acima de 1,5 vez o p95 do baseline numa janela com pelo menos 50 chamadas | o mesmo limite persistindo em 2 snapshots consecutivos |

Um aumento extremo de latência pode ser investigado na hora, sem esperar o segundo snapshot. A
ausência de falha, truncamento ou recusa hoje não garante ausência no futuro, e nada no T0 indica
estabilidade futura.

## 8. Validação natural pós-deploy (F10, F13, F2)

- Quando surgir a primeira amostra natural depois do marco do fluxo, audita-se só a estrutura e
  os metadados (Q8, mais Q2 e Q5 se houver falha).
- Metadados fora do contrato: **bloqueador**.
- Sem amostra natural até o fechamento do F1: registra-se **VALIDAÇÃO NATURAL PENDENTE**. A
  ausência de amostra não bloqueia sozinha, e não se fabrica tráfego.

## 9. Cadência dos snapshots

- Um snapshot por semana, de preferência na segunda-feira, depois de fechada a semana anterior.
- Sempre as mesmas consultas, o mesmo cohort e as mesmas definições; só `inicio` e `fim` mudam.
- Cada snapshot registra: período, volume, taxas, p50 e p95, tokens, cache, modelo, configuração
  e anomalias.
- A retenção dos logs da Vercel é curta (cerca de 1 dia). Em cada snapshot, dentro da janela
  disponível, procura-se nos logs de Production por `Registro: uso de IA recusado`,
  `Registro: log recusado`, `Registro: falha ao gravar` e outros erros de instrumentação. Não se
  afirma ausência fora dessa janela.

## 10. Limites conhecidos

- Retries internos do SDK não são mensuráveis; a duração de uma chamada os inclui.
- O custo é estimado pelo alias do modelo (`custoIa.ts`), não lido do provedor.
- No F2, uma falha ao ler o corpo depois dos cabeçalhos sai como `vazio`, sem `ia-chamada-falhou`.
- Inserts recusados pelo banco só são detectáveis nos logs, dentro da retenção.
- Amostras pequenas: só o F1 terá baseline estatístico.

Este documento não autoriza trocar modelo, esforço, prompt ou configuração, nem criar view,
migration, painel, cron ou chamada artificial. Evals não substituem o baseline.

## 11. Snapshot T0 em 02/10/2026

**Não é baseline final.** Janela: de 2026-09-30 23:54:28 a 2026-10-02 11:00:00 UTC, cohort C1.

**Chamadas (Q1):**

| Tipo | Rota | Chamadas | Sem metadados | Execuções | Trunc. | Recusas | p50 (ms) | p95 (ms) | Entrada | Saída | Raciocínio | Cache | Fração de cache |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `classificar-resposta` (F1) | classificacao | 35 | 0 | 35 | 0 | 0 | 1692 | 2771,6 | 3244,7 | 134,8 | 76,2 | 0,0 | 0,0000 |
| `extrair-anuncio` | operacoes | 5 | 0 | 5 | 0 | 0 | 5636 | 6966,6 | 2280,2 | 739,4 | 623,8 | 0,0 | 0,0000 |
| `abordagem-anuncio` | operacoes | 3 | 0 | 3 | 0 | 0 | 6393 | 8502,6 | 1792,3 | 862,3 | 770,0 | 426,7 | 0,2381 |

As 12 linhas de `transcricao` e as 2 de `embedding-comparavel-mercado` do cohort na janela são
**anteriores** aos marcos M1c-E2 e M1c-E1 (sem metadados por isso) e não constituem validação
natural. O F11 teve 1 chamada no período, da conta de teste, e o F10, 2, também da conta de teste:
ficam fora do baseline principal.

**Falhas e rejeições (Q2 e Q3):** 0 `ia-chamada-falhou` e 0 `ia-resposta-rejeitada` no cohort.
O F1 teve 35 provider_attempts desde o M1c-B (taxa de falha 0) e 6 chamadas desde o M1c-C (taxa de
rejeição 0 sobre 6); `extrair-anuncio` e `abordagem-anuncio` tiveram 5 e 3 chamadas, todas depois do
M1c-C, sem falha nem rejeição. Amostra pequena: nenhuma taxa do T0 é conclusiva.

**Modelo e configuração (Q4):** pedido `gpt-5.4-mini`, servido observado `gpt-5.4-mini-2026-03-17`
em todas as chamadas instrumentadas; `config_origem = 'padrao'`, `config_versao` null; esforço
`low` no F1 e `medium` em `extrair-anuncio` e `abordagem-anuncio`.

**Execuções (Q5):** uma chamada por execução nos três tipos (F1, `extrair-anuncio`,
`abordagem-anuncio`), sem execução com falha.

**Gate (Q6):** 35 chamadas F1 instrumentadas; 0 semanas completas (a primeira começa em
2026-10-05). `gate_volume` e `gate_semanas` falsos.

**Validação natural (Q8):** 0 linhas de F10, F13 e F2 depois dos respectivos marcos: validação
natural pendente nos três.

**Logs:** na janela de retenção disponível em 02/10, nenhum `Registro: … recusado`.

## 12. Projeção (estimativa, não compromisso)

No ritmo observado nas últimas semanas (65 a 142 chamadas F1 por semana), o F1 pode atingir os dois
critérios do gate entre **19/10/2026 e 22/10/2026**: as duas semanas completas fecham em 18/10 e o
volume é o que limita. Essa data não fecha o checkpoint automaticamente; quem fecha é a Q6.
