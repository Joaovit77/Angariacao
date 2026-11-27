-- ============================================================================
-- Retirados, Fase C / C5: migração de imóveis já captados marcados como Perdido
--
-- Escopo: SOMENTE UMA CONTA por execução (identificada pelo e-mail em auth.users).
-- O que faz:
--   Converte imóveis dessa conta com `status = 'Perdido'` e `retirado = false`
--   que já passaram por `'Angariado'` ou `'Autorização assinada'` no
--   `status_history` para o estado de Retirados (`retirado = true`):
--     1. Restaura `status` para o último status de carteira no histórico
--        (`'Publicado'`, `'Autorização assinada'` ou `'Angariado'`).
--     2. Remove somente a entrada final `'Perdido'` do `status_history`
--        (preservando todo o histórico anterior sem injetar data de hoje).
--     3. Preenche `retirado_em` com a data da entrada final `'Perdido'`
--        (ou `null` se não houver data civil válida e <= hoje em Brasília).
--     4. Traduz `motivo_perda` / `motivo_perda_outro` para a lista fechada
--        `MOTIVOS_RETIRADA` (C1) e limpa `motivo_perda` / `motivo_perda_outro`.
--     5. Registra uma nota idempotente (`c5:migracao-retirado`) em `notas`.
--
-- Segurança:
--   - Fail-closed: aborta se o e-mail não resolver exatamente 1 conta.
--   - Transação única (`BEGIN ... COMMIT`): se qualquer check/trigger falhar,
--     tudo é revertido automaticamente (incluindo o trigger de status_history).
--   - Mantém ativos todos os checks C1, `trg_retirada_dados_imovel`,
--     `trg_transicao_disponibilidade_imovel`, `trg_retomada_retirado_imovel`
--     e `trg_imoveis_updated_at`.
--   - Idempotente: rodar de novo na mesma conta altera 0 linhas.
--
-- Como usar no Supabase SQL Editor:
--   1. Substitua `SEU_EMAIL_AQUI` pelo e-mail exato da conta nos blocos abaixo.
--   2. Rode primeiro SOMENTE o PASSO 1 (Prévia) para conferir a lista exata.
--   3. Estando tudo certo, rode o PASSO 2 (Migração) e confira no PASSO 3.
-- ============================================================================

-- ============================================================================
-- PASSO 1 — PRÉVIA (100% SOMENTE LEITURA — rode primeiro para conferir)
-- ============================================================================
/*
with conta as (
  select id as user_id
  from auth.users
  where lower(email) = lower('SEU_EMAIL_AQUI')
),
candidatos as (
  select
    i.id,
    i.codigo,
    i.referencia_crm,
    i.status as status_atual,
    (
      select h.entrada->>'status'
      from jsonb_array_elements(coalesce(i.status_history, '[]'::jsonb)) with ordinality as h(entrada, ord)
      where h.entrada->>'status' in ('Angariado', 'Autorização assinada', 'Publicado')
      order by h.ord desc
      limit 1
    ) as status_restaurado,
    case
      when jsonb_array_length(coalesce(i.status_history, '[]'::jsonb)) > 0
           and (i.status_history->-1)->>'status' = 'Perdido'
           and coalesce((i.status_history->-1)->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           and ((i.status_history->-1)->>'date')::date <= (now() at time zone 'America/Sao_Paulo')::date
      then ((i.status_history->-1)->>'date')::date
      else null
    end as retirado_em_novo,
    i.motivo_perda as motivo_perda_atual,
    case
      when nullif(btrim(i.motivo_perda), '') is null then null
      when btrim(i.motivo_perda) = 'Imóvel já alugado por conta própria' then 'locado-proprietario'
      when btrim(i.motivo_perda) = 'Imóvel já vendido' then 'vendido'
      when btrim(i.motivo_perda) = 'Proprietário desistiu de alugar' then 'desistiu'
      when btrim(i.motivo_perda) = 'Não é mais o proprietário' then 'nao-e-mais-proprietario'
      else 'outro'
    end as retirado_motivo_novo,
    case
      when nullif(btrim(i.motivo_perda), '') is null then null
      when btrim(i.motivo_perda) in (
        'Imóvel já alugado por conta própria',
        'Imóvel já vendido',
        'Proprietário desistiu de alugar',
        'Não é mais o proprietário'
      ) then null
      when btrim(i.motivo_perda) = 'Angariado, mas locado por outra imobiliária ou pelo proprietário'
        then 'Locado por outra imobiliária ou pelo proprietário (migrado de Perdido)'
      when btrim(i.motivo_perda) = 'Imóvel não está mais disponível'
        then 'Imóvel não está mais disponível'
      when btrim(i.motivo_perda) = 'Optou por outra imobiliária'
        then 'Optou por outra imobiliária (migrado de Perdido)'
      when btrim(i.motivo_perda) = 'Outro'
        then left(coalesce(nullif(btrim(i.motivo_perda_outro), ''), 'Motivo registrado como Outro (migrado de Perdido)'), 1000)
      else left(
        btrim(i.motivo_perda) || coalesce(' — ' || nullif(btrim(i.motivo_perda_outro), ''), ''),
        1000
      )
    end as retirado_observacao_nova
  from public.imoveis i
  join conta c on c.user_id = i.user_id
  where i.status = 'Perdido'
    and coalesce(i.retirado, false) = false
    and exists (
      select 1
      from jsonb_array_elements(coalesce(i.status_history, '[]'::jsonb)) as h(entrada)
      where h.entrada->>'status' in ('Angariado', 'Autorização assinada')
    )
)
select
  codigo,
  referencia_crm,
  status_atual,
  status_restaurado,
  retirado_em_novo,
  retirado_motivo_novo,
  retirado_observacao_nova,
  motivo_perda_atual
from candidatos
order by retirado_em_novo desc nulls last, codigo;
*/

-- ============================================================================
-- PASSO 2 — MIGRAÇÃO ATÔMICA (um bloco DO $$ é sempre uma transação única)
-- ============================================================================
do $$
declare
  v_email_alvo constant text := 'SEU_EMAIL_AQUI';
  v_user_id uuid;
  v_contas integer;
  v_hoje_brasilia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora_brasilia text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI');
  v_migrados integer := 0;
begin
  select count(*), min(id::text)::uuid
    into v_contas, v_user_id
    from auth.users
   where lower(email) = lower(btrim(v_email_alvo));

  if v_contas <> 1 or v_user_id is null then
    raise exception 'C5 abortada: esperado exatamente 1 usuário para o e-mail informado (encontrados: %).', v_contas;
  end if;

  -- Desabilita somente o trigger de status_history dentro desta transação
  -- atômica para remover o 'Perdido' final sem injetar data de hoje. Todos os
  -- checks C1 e triggers de retirada/disponibilidade/retomada seguem ativos.
  execute 'alter table public.imoveis disable trigger trg_imoveis_status_history';

  with candidatos as (
    select
      i.id,
      (
        select h.entrada->>'status'
        from jsonb_array_elements(coalesce(i.status_history, '[]'::jsonb)) with ordinality as h(entrada, ord)
        where h.entrada->>'status' in ('Angariado', 'Autorização assinada', 'Publicado')
        order by h.ord desc
        limit 1
      ) as status_restaurado,
      case
        when jsonb_array_length(coalesce(i.status_history, '[]'::jsonb)) > 0
             and (i.status_history->-1)->>'status' = 'Perdido'
        then i.status_history - (jsonb_array_length(i.status_history) - 1)
        else coalesce(i.status_history, '[]'::jsonb)
      end as historico_limpo,
      case
        when jsonb_array_length(coalesce(i.status_history, '[]'::jsonb)) > 0
             and (i.status_history->-1)->>'status' = 'Perdido'
             and coalesce((i.status_history->-1)->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             and ((i.status_history->-1)->>'date')::date <= v_hoje_brasilia
        then ((i.status_history->-1)->>'date')::date
        else null
      end as retirado_em_novo,
      case
        when nullif(btrim(i.motivo_perda), '') is null then null
        when btrim(i.motivo_perda) = 'Imóvel já alugado por conta própria' then 'locado-proprietario'
        when btrim(i.motivo_perda) = 'Imóvel já vendido' then 'vendido'
        when btrim(i.motivo_perda) = 'Proprietário desistiu de alugar' then 'desistiu'
        when btrim(i.motivo_perda) = 'Não é mais o proprietário' then 'nao-e-mais-proprietario'
        else 'outro'
      end as retirado_motivo_novo,
      case
        when nullif(btrim(i.motivo_perda), '') is null then null
        when btrim(i.motivo_perda) in (
          'Imóvel já alugado por conta própria',
          'Imóvel já vendido',
          'Proprietário desistiu de alugar',
          'Não é mais o proprietário'
        ) then null
        when btrim(i.motivo_perda) = 'Angariado, mas locado por outra imobiliária ou pelo proprietário'
          then 'Locado por outra imobiliária ou pelo proprietário (migrado de Perdido)'
        when btrim(i.motivo_perda) = 'Imóvel não está mais disponível'
          then 'Imóvel não está mais disponível'
        when btrim(i.motivo_perda) = 'Optou por outra imobiliária'
          then 'Optou por outra imobiliária (migrado de Perdido)'
        when btrim(i.motivo_perda) = 'Outro'
          then left(coalesce(nullif(btrim(i.motivo_perda_outro), ''), 'Motivo registrado como Outro (migrado de Perdido)'), 1000)
        else left(
          btrim(i.motivo_perda) || coalesce(' — ' || nullif(btrim(i.motivo_perda_outro), ''), ''),
          1000
        )
      end as retirado_observacao_nova
    from public.imoveis i
    where i.user_id = v_user_id
      and i.status = 'Perdido'
      and coalesce(i.retirado, false) = false
      and exists (
        select 1
        from jsonb_array_elements(coalesce(i.status_history, '[]'::jsonb)) as h(entrada)
        where h.entrada->>'status' in ('Angariado', 'Autorização assinada')
      )
  )
  update public.imoveis i
     set status = c.status_restaurado,
         status_history = c.historico_limpo,
         retirado = true,
         retirado_em = c.retirado_em_novo,
         retirado_motivo = c.retirado_motivo_novo,
         retirado_observacao = c.retirado_observacao_nova,
         motivo_perda = null,
         motivo_perda_outro = null,
         notas = case
           when exists (
             select 1
             from jsonb_array_elements(coalesce(i.notas, '[]'::jsonb)) as n(item)
             where n.item->>'id' = 'c5:migracao-retirado'
           ) then coalesce(i.notas, '[]'::jsonb)
           else coalesce(i.notas, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object(
               'id', 'c5:migracao-retirado',
               'texto',
                 'Migrado de Perdido para Retirados (Fase C5). Status restaurado para ' ||
                 c.status_restaurado ||
                 case
                   when c.retirado_em_novo is not null
                     then '; data da retirada preservada (' || to_char(c.retirado_em_novo, 'DD/MM/YYYY') || ').'
                   else '; data da retirada não informada.'
                 end,
               'data', v_agora_brasilia
             )
           )
         end
    from candidatos c
   where i.id = c.id
     and c.status_restaurado is not null;

  get diagnostics v_migrados = row_count;
  execute 'alter table public.imoveis enable trigger trg_imoveis_status_history';
  raise notice 'Fase C5 concluída: % imóvel(is) migrado(s) para Retirados.', v_migrados;
end
$$;

-- ============================================================================
-- PASSO 3 — CONFERÊNCIA PÓS-MIGRAÇÃO (somente leitura)
-- ============================================================================
/*
with conta as (
  select id as user_id
  from auth.users
  where lower(email) = lower('SEU_EMAIL_AQUI')
)
select
  (select count(*) from public.imoveis i join conta c on c.user_id = i.user_id where i.retirado is true) as total_retirados,
  (select count(*) from public.imoveis i join conta c on c.user_id = i.user_id
    where i.status = 'Perdido'
      and exists (
        select 1 from jsonb_array_elements(coalesce(i.status_history, '[]'::jsonb)) as h(e)
        where h.e->>'status' in ('Angariado', 'Autorização assinada')
      )) as perdidos_angariados_restantes,
  (select tgenabled from pg_trigger where tgname = 'trg_imoveis_status_history' and not tgisinternal) as status_trigger_history;
*/
