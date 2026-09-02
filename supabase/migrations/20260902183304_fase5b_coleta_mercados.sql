-- Fase 5B: somente funções e proteção do estado operacional já existente.
-- Não cria tabelas, jobs SQL, eventos históricos nem altera a RPC da Avaliação.

-- Mantém compatibilidade com o cliente 5A (INSERT com próxima execução NULL e
-- UPDATE de updated_at), mas impede que o browser manipule o scheduler/lease.
create or replace function private.proteger_operacao_mercado_monitorado()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.proxima_execucao_em is not null
        or new.ultima_tentativa_em is not null or new.ultimo_sucesso_em is not null
        or new.falhas_consecutivas <> 0 or new.ultimo_erro_codigo is not null
        or new.lease_token is not null or new.lease_expira_em is not null then
        raise exception 'Estado operacional reservado ao servidor' using errcode = '42501';
      end if;
    elsif row(new.proxima_execucao_em, new.ultima_tentativa_em, new.ultimo_sucesso_em,
      new.falhas_consecutivas, new.ultimo_erro_codigo, new.lease_token, new.lease_expira_em)
      is distinct from
      row(old.proxima_execucao_em, old.ultima_tentativa_em, old.ultimo_sucesso_em,
      old.falhas_consecutivas, old.ultimo_erro_codigo, old.lease_token, old.lease_expira_em) then
      raise exception 'Estado operacional reservado ao servidor' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_operacao_mercado_monitorado()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_mercados_monitorados_operacao on public.mercados_monitorados;
create trigger trg_mercados_monitorados_operacao
  before insert or update on public.mercados_monitorados
  for each row execute function private.proteger_operacao_mercado_monitorado();

create or replace function public.claim_mercados_monitorados(p_limite integer default 1)
returns setof public.mercados_monitorados
language sql
volatile
security invoker
set search_path = ''
as $$
  with candidatos as (
    select m.id
    from public.mercados_monitorados m
    where m.ativo
      -- NULL representa a primeira coleta, nunca disparada pelo INSERT.
      and (m.proxima_execucao_em is null or m.proxima_execucao_em <= now())
      and (m.lease_expira_em is null or m.lease_expira_em <= now())
    order by m.proxima_execucao_em nulls first, m.created_at, m.id
    limit least(greatest(coalesce(p_limite, 1), 1), 2)
    for update skip locked
  )
  update public.mercados_monitorados m
  set lease_token = gen_random_uuid(),
      lease_expira_em = now() + interval '10 minutes',
      ultima_tentativa_em = now()
  from candidatos c
  where m.id = c.id
  returning m.*;
$$;

create or replace function public.concluir_mercado_monitorado(
  p_mercado_id uuid,
  p_lease_token uuid,
  p_sucesso boolean,
  p_erro_codigo text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alteradas integer;
  v_erro text;
begin
  if p_sucesso is null then
    raise exception 'Resultado da execução obrigatório' using errcode = '22023';
  end if;
  -- Lista fechada: mensagens, URLs, tokens e stacks jamais são persistidos.
  v_erro := case when p_erro_codigo in (
    'sem_portal_suportado', 'mercado_nao_suportado', 'saldo_insuficiente',
    'saldo_indisponivel', 'firecrawl_429', 'firecrawl_timeout',
    'firecrawl_indisponivel', 'parser_falhou', 'persistencia_falhou',
    'sem_resultados', 'limite_tempo', 'falha_total', 'lease_perdido'
  ) then p_erro_codigo else 'falha_total' end;

  update public.mercados_monitorados m
  set ultimo_sucesso_em = case when p_sucesso then now() else m.ultimo_sucesso_em end,
      falhas_consecutivas = case when p_sucesso then 0
        else least(m.falhas_consecutivas::bigint + 1, 2147483647)::integer end,
      ultimo_erro_codigo = case when p_sucesso then null else v_erro end,
      -- Intervalo contado a partir da observação bem-sucedida; sem catch-up pago.
      proxima_execucao_em = now() + make_interval(days => case
        when p_sucesso then m.frequencia_dias
        when m.falhas_consecutivas = 0 then 1
        when m.falhas_consecutivas = 1 then 2
        when m.falhas_consecutivas = 2 then 4
        else 7 end),
      lease_token = null,
      lease_expira_em = null
  where m.id = p_mercado_id
    and m.lease_token = p_lease_token
    and m.lease_expira_em > now();
  get diagnostics v_alteradas = row_count;
  return v_alteradas = 1;
end;
$$;

revoke all on function public.claim_mercados_monitorados(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.concluir_mercado_monitorado(uuid, uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_mercados_monitorados(integer) to service_role;
grant execute on function public.concluir_mercado_monitorado(uuid, uuid, boolean, text) to service_role;

-- CRUD e RLS da 5A permanecem; nenhum grant nas tabelas antigas é modificado.
notify pgrst, 'reload schema';
