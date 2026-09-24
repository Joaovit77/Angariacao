-- Garimpo em Campo — B3-M3: marcar uma informação da memória como incorreta.
--
-- Terceiro estado de uma afirmação: `rejeitada`. É decisão humana final, como
-- `confirmada`: nesta versão nenhuma das duas volta a hipótese nem vira a
-- outra. A linha continua no banco (append-only): valor, fonte, investigação,
-- `observado_em` e `created_at` não mudam; só a decisão é registrada.
--
-- Aditiva: duas colunas nulas, os CHECKs de estado/decisão trocados por
-- versões de três estados, a RPC nova de rejeição e a RPC de confirmação
-- recriada para recusar, com código, uma linha já rejeitada. Nenhuma linha
-- existente é reclassificada; não há backfill (todas são `hipotese` ou
-- `confirmada` e já satisfazem os CHECKs novos).
--
-- FK de `rejeitado_por`: ON DELETE NO ACTION, de propósito. Quem rejeita é
-- sempre o dono da linha (a RPC exige `user_id = auth.uid()`), e a linha já
-- some com a conta pelo `user_id ... on delete cascade`; NO ACTION é checado
-- no fim do comando, depois dessa cascata, então excluir a conta continua
-- funcionando. Se um dia outro ator puder decidir, excluir esse ator é
-- RECUSADO em vez de apagar (CASCADE) ou violar o CHECK (SET NULL) em
-- silêncio: o histórico de uma rejeição nunca some por acidente.
-- `confirmado_por` (C13) fica como está.

-- ============================================================
-- COLUNAS
-- ============================================================
alter table public.imoveis_identificados_atributos
  add column if not exists rejeitado_por uuid references auth.users(id) on delete no action,
  add column if not exists rejeitado_em timestamptz;

-- ============================================================
-- CHECKS: três estados, e cada um com exatamente a sua decisão.
-- ============================================================
alter table public.imoveis_identificados_atributos
  drop constraint if exists imoveis_identificados_atributos_estado_check,
  drop constraint if exists imoveis_identificados_atributos_confirmacao_check,
  drop constraint if exists imoveis_identificados_atributos_decisao_check;

alter table public.imoveis_identificados_atributos
  add constraint imoveis_identificados_atributos_estado_check check (
    estado in ('hipotese', 'confirmada', 'rejeitada')
  ),
  -- Hipótese não tem decisão nenhuma; confirmada e rejeitada têm autor e
  -- instante da própria decisão, e nada da outra.
  add constraint imoveis_identificados_atributos_decisao_check check (
    (estado = 'hipotese'
      and confirmado_por is null and confirmado_em is null
      and rejeitado_por is null and rejeitado_em is null)
    or (estado = 'confirmada'
      and confirmado_por is not null and confirmado_em is not null
      and rejeitado_por is null and rejeitado_em is null)
    or (estado = 'rejeitada'
      and rejeitado_por is not null and rejeitado_em is not null
      and confirmado_por is null and confirmado_em is null)
  );

-- ============================================================
-- RPC DO NAVEGADOR: confirmação humana (C13A), recriada. Mesmo contrato;
-- a única novidade é recusar, com código, uma linha que já tem outra
-- decisão, em vez de cair no CHECK.
-- ============================================================
create or replace function public.confirmar_atributo_identificado(p_atributo_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_atributo public.imoveis_identificados_atributos;
  v_identidade public.imoveis_identificados;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_atributo_id is null then
    raise exception 'Atributo obrigatório.' using errcode = '22023';
  end if;

  select a.* into v_atributo
    from public.imoveis_identificados_atributos a
   where a.id = p_atributo_id
     and a.user_id = v_user
   for update;
  if v_atributo.id is null then
    raise exception 'Atributo não encontrado.' using errcode = 'P0002';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = v_atributo.imovel_identificado_id
     and i.user_id = v_user;
  if v_identidade.id is null then
    raise exception 'Atributo não encontrado.' using errcode = 'P0002';
  end if;
  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  if v_atributo.estado = 'confirmada' then
    return jsonb_build_object('ok', true, 'repetida', true,
      'atributo_id', p_atributo_id, 'confirmado_em', v_atributo.confirmado_em);
  end if;
  -- B3-M3: rejeitada é decisão final; confirmar não a desfaz.
  if v_atributo.estado <> 'hipotese' then
    return jsonb_build_object('ok', false, 'codigo', 'decisao_existente');
  end if;

  update public.imoveis_identificados_atributos a
     set estado = 'confirmada',
         confirmado_por = v_user,
         confirmado_em = now()
   where a.id = p_atributo_id;

  return jsonb_build_object('ok', true, 'repetida', false,
    'atributo_id', p_atributo_id, 'confirmado_em', now());
end;
$$;

-- ============================================================
-- RPC DO NAVEGADOR: rejeição humana de uma hipótese (B3-M3). Espelha a
-- confirmação: só o dono, sem revelar linha de outra conta, respeitando
-- exclusão pendente, idempotente. Não muda atributo, valor, fonte,
-- investigação, observado_em nem created_at — só registra que um humano
-- disse "está incorreta".
-- ============================================================
create or replace function public.rejeitar_atributo_identificado(p_atributo_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_atributo public.imoveis_identificados_atributos;
  v_identidade public.imoveis_identificados;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_atributo_id is null then
    raise exception 'Atributo obrigatório.' using errcode = '22023';
  end if;

  select a.* into v_atributo
    from public.imoveis_identificados_atributos a
   where a.id = p_atributo_id
     and a.user_id = v_user
   for update;
  if v_atributo.id is null then
    raise exception 'Atributo não encontrado.' using errcode = 'P0002';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = v_atributo.imovel_identificado_id
     and i.user_id = v_user;
  if v_identidade.id is null then
    raise exception 'Atributo não encontrado.' using errcode = 'P0002';
  end if;
  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  if v_atributo.estado = 'rejeitada' then
    return jsonb_build_object('ok', true, 'repetida', true,
      'atributo_id', p_atributo_id, 'rejeitado_em', v_atributo.rejeitado_em);
  end if;
  -- Confirmada é decisão final; rejeitar não a desfaz.
  if v_atributo.estado <> 'hipotese' then
    return jsonb_build_object('ok', false, 'codigo', 'decisao_existente');
  end if;

  update public.imoveis_identificados_atributos a
     set estado = 'rejeitada',
         rejeitado_por = v_user,
         rejeitado_em = now()
   where a.id = p_atributo_id;

  return jsonb_build_object('ok', true, 'repetida', false,
    'atributo_id', p_atributo_id, 'rejeitado_em', now());
end;
$$;

-- ------------------------------------------------------------
-- Permissões: decisões humanas só para authenticated. Ninguém mais.
-- ------------------------------------------------------------
revoke all on function public.confirmar_atributo_identificado(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.confirmar_atributo_identificado(bigint)
  to authenticated;

revoke all on function public.rejeitar_atributo_identificado(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.rejeitar_atributo_identificado(bigint)
  to authenticated;
