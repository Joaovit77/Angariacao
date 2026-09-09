
do $$
begin
  if exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'assistente_acoes_action_type_check'
       and conrelid = 'public.assistente_acoes'::regclass
       and pg_catalog.pg_get_constraintdef(oid) not like '%criar_compromisso%'
  ) then
    alter table public.assistente_acoes
      drop constraint assistente_acoes_action_type_check;
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'assistente_acoes_action_type_check'
       and conrelid = 'public.assistente_acoes'::regclass
  ) then
    alter table public.assistente_acoes
      add constraint assistente_acoes_action_type_check
      check (action_type in ('agendar_visita', 'criar_compromisso'));
  end if;
end $$;

create or replace function private.assistente_acao_json(p_acao public.assistente_acoes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_acao.id,
    'tipo', p_acao.action_type,
    'estado', p_acao.status,
    'expiraEm', p_acao.expires_at,
    'operacao', case p_acao.action_type
      when 'criar_compromisso' then 'Criar compromisso'
      else 'Agendar visita'
    end,
    'impacto', 'Será criado um compromisso real na agenda.',
    'entidade', jsonb_build_object(
      'imovelId', p_acao.payload->>'imovelId',
      'codigo', p_acao.payload->>'codigo',
      'endereco', p_acao.payload->>'endereco',
      'responsavel', p_acao.payload->>'responsavel'
    ),
    'dados', jsonb_build_object(
      'titulo', p_acao.payload->>'title',
      'tipo', p_acao.payload->>'type',
      'data', p_acao.payload->>'date',
      'hora', p_acao.payload->>'hora',
      'observacao', p_acao.payload->>'notes'
    ),
    'resultado', case when p_acao.result is null then null else jsonb_build_object(
      'agendaId', p_acao.result->>'agendaId'
    ) end,
    'erro', case p_acao.error_code
      when 'imovel_indisponivel' then 'O imóvel não está mais disponível para esta ação.'
      when 'acao_expirada' then 'A confirmação expirou. Prepare a ação novamente.'
      else null
    end
  );
$$;

create or replace function public.preparar_acao_assistente_criar_compromisso(
  p_titulo text,
  p_tipo text,
  p_data date,
  p_hora text,
  p_imovel_id uuid,
  p_observacao text,
  p_sessao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_imovel_id uuid;
  v_codigo text;
  v_responsavel text;
  v_acao public.assistente_acoes;
  v_agenda_id uuid := gen_random_uuid();
  v_endereco text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'codigo', 'nao_autenticado', 'erro', 'Sessão inválida ou expirada.');
  end if;
  if not exists (
    select 1 from public.ia_permissoes p
     where p.user_id = v_user and p.liberado = true
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao', 'erro', 'Sua conta não tem permissão para usar o Assistente.');
  end if;
  if p_sessao_id is null then
    return jsonb_build_object('ok', false, 'codigo', 'sessao_invalida', 'erro', 'A sessão da conversa é inválida.');
  end if;
  if nullif(trim(p_titulo), '') is null then
    return jsonb_build_object('ok', false, 'codigo', 'titulo_invalido', 'erro', 'Informe o título do compromisso.');
  end if;
  if nullif(trim(p_tipo), '') is null then
    return jsonb_build_object('ok', false, 'codigo', 'tipo_invalido', 'erro', 'Informe o tipo do compromisso.');
  end if;
  if p_data is null or p_data < (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('ok', false, 'codigo', 'data_invalida', 'erro', 'A data do compromisso não pode estar no passado.');
  end if;
  if nullif(trim(coalesce(p_hora, '')), '') is not null
     and trim(p_hora) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'codigo', 'hora_invalida', 'erro', 'Informe um horário válido no formato HH:MM.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_sessao_id::text, 0)
  );

  if p_imovel_id is not null then
    select i.id, i.codigo, i.responsavel,
           concat_ws(', ',
             nullif(trim(i.endereco), ''),
             nullif(trim(i.bairro), ''),
             nullif(trim(i.cidade), '')
           )
      into v_imovel_id, v_codigo, v_responsavel, v_endereco
      from public.imoveis i
     where i.id = p_imovel_id and i.user_id = v_user;
    if not found then
      return jsonb_build_object('ok', false, 'codigo', 'imovel_nao_encontrado', 'erro', 'O imóvel não foi encontrado na sua carteira.');
    end if;
  end if;

  update public.assistente_acoes
     set status = 'cancelled', error_code = 'substituida', updated_at = now()
   where user_id = v_user
     and sessao_id = p_sessao_id
     and status = 'ready_for_confirmation';

  insert into public.assistente_acoes (
    user_id, sessao_id, action_type, status, payload, expires_at
  ) values (
    v_user,
    p_sessao_id,
    'criar_compromisso',
    'ready_for_confirmation',
    jsonb_build_object(
      'agendaId', v_agenda_id,
      'imovelId', v_imovel_id,
      'codigo', case when p_imovel_id is null then null else coalesce(nullif(trim(v_codigo), ''), 'Sem código') end,
      'endereco', case when p_imovel_id is null then null else coalesce(nullif(v_endereco, ''), 'Endereço não informado') end,
      'responsavel', case when p_imovel_id is null then null else coalesce(nullif(trim(v_responsavel), ''), 'Não informado') end,
      'title', trim(p_titulo),
      'type', trim(p_tipo),
      'date', p_data::text,
      'hora', nullif(trim(coalesce(p_hora, '')), ''),
      'notes', nullif(trim(coalesce(p_observacao, '')), ''),
      'done', false,
      'isVerificacaoDisponibilidade', false
    ),
    now() + interval '15 minutes'
  ) returning * into v_acao;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

drop function if exists public.confirmar_acao_assistente(uuid);

create or replace function public.confirmar_acao_assistente(p_acao_id uuid, p_sessao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_acao public.assistente_acoes;
  v_imovel_id uuid;
  v_agenda_id uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'codigo', 'nao_autenticado', 'erro', 'Sessão inválida ou expirada.');
  end if;
  if not exists (
    select 1 from public.ia_permissoes p
     where p.user_id = v_user and p.liberado = true
  ) then
    return jsonb_build_object('ok', false, 'codigo', 'sem_permissao', 'erro', 'Sua conta não tem permissão para usar o Assistente.');
  end if;

  select * into v_acao
    from public.assistente_acoes a
   where a.id = p_acao_id and a.user_id = v_user and a.sessao_id = p_sessao_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_encontrada', 'erro', 'A ação não foi encontrada.');
  end if;

  if v_acao.status = 'succeeded' then
    return jsonb_build_object('ok', true, 'repetida', true, 'acao', private.assistente_acao_json(v_acao));
  end if;
  if v_acao.status <> 'ready_for_confirmation' then
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;
  if v_acao.expires_at <= now() then
    update public.assistente_acoes
       set status = 'expired', error_code = 'acao_expirada', updated_at = now()
     where id = v_acao.id
     returning * into v_acao;
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;

  v_imovel_id := nullif(v_acao.payload->>'imovelId', '')::uuid;
  v_agenda_id := (v_acao.payload->>'agendaId')::uuid;
  if v_imovel_id is not null and not exists (
    select 1 from public.imoveis i
     where i.id = v_imovel_id and i.user_id = v_user
  ) then
    update public.assistente_acoes
       set status = 'failed', error_code = 'imovel_indisponivel', updated_at = now()
     where id = v_acao.id
     returning * into v_acao;
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;

  insert into public.agenda (
    id, user_id, title, type, date, hora, imovel_id, notes, done,
    is_verificacao_disponibilidade
  ) values (
    v_agenda_id,
    v_user,
    v_acao.payload->>'title',
    v_acao.payload->>'type',
    (v_acao.payload->>'date')::date,
    v_acao.payload->>'hora',
    v_imovel_id,
    v_acao.payload->>'notes',
    false,
    false
  );

  update public.assistente_acoes
     set status = 'succeeded',
         result = jsonb_build_object('agendaId', v_agenda_id),
         error_code = null,
         executed_at = now(),
         updated_at = now()
   where id = v_acao.id
   returning * into v_acao;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

drop function if exists public.cancelar_acao_assistente(uuid);

create or replace function public.cancelar_acao_assistente(p_acao_id uuid, p_sessao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_acao public.assistente_acoes;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'codigo', 'nao_autenticado', 'erro', 'Sessão inválida ou expirada.');
  end if;

  select * into v_acao
    from public.assistente_acoes a
   where a.id = p_acao_id and a.user_id = v_user and a.sessao_id = p_sessao_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_encontrada', 'erro', 'A ação não foi encontrada.');
  end if;

  if v_acao.status = 'ready_for_confirmation' then
    update public.assistente_acoes
       set status = case when expires_at <= now() then 'expired' else 'cancelled' end,
           error_code = case when expires_at <= now() then 'acao_expirada' else null end,
           updated_at = now()
     where id = v_acao.id
     returning * into v_acao;
  end if;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

revoke all on function private.assistente_acao_json(public.assistente_acoes) from public, anon, authenticated;
revoke all on function public.preparar_acao_assistente_criar_compromisso(text, text, date, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.confirmar_acao_assistente(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancelar_acao_assistente(uuid, uuid) from public, anon, authenticated;

grant execute on function public.preparar_acao_assistente_criar_compromisso(text, text, date, text, uuid, text, uuid) to authenticated;
grant execute on function public.confirmar_acao_assistente(uuid, uuid) to authenticated;
grant execute on function public.cancelar_acao_assistente(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
;
