alter table agenda add column if not exists origin text not null default 'usuario';
alter table agenda add column if not exists reason_code text;
alter table agenda add column if not exists source_action_id uuid;
alter table agenda add column if not exists completed_at timestamptz;
alter table agenda add column if not exists completion_reason text;
alter table agenda add column if not exists completion_origin text;
alter table agenda add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'agenda_origin_check'
       and conrelid = 'public.agenda'::regclass
  ) then
    alter table public.agenda add constraint agenda_origin_check
      check (origin in ('usuario', 'assistente', 'automacao', 'evento_whatsapp'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'agenda_completion_origin_check'
       and conrelid = 'public.agenda'::regclass
  ) then
    alter table public.agenda add constraint agenda_completion_origin_check
      check (completion_origin is null or completion_origin in ('usuario', 'assistente', 'automacao', 'evento_whatsapp'));
  end if;
end $$;

-- O browser continua podendo manter a Agenda pelo RLS, mas não pode se
-- atribuir autoria do Assistente nem forjar o motivo de uma automação. RPCs
-- fechadas marcam a origem confiável apenas durante a própria transação.
create or replace function proteger_auditoria_agenda()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_origem text := nullif(pg_catalog.current_setting('angario.agenda_source', true), '');
  v_motivo text := nullif(pg_catalog.current_setting('angario.agenda_reason', true), '');
  v_acao text := nullif(pg_catalog.current_setting('angario.agenda_action_id', true), '');
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if v_origem is null then
      if auth.role() = 'service_role' and new.origin in ('automacao', 'evento_whatsapp') then
        new.reason_code := nullif(trim(coalesce(new.reason_code, '')), '');
      else
        new.origin := 'usuario';
        new.reason_code := null;
      end if;
      new.source_action_id := null;
    else
      new.origin := v_origem;
      new.reason_code := v_motivo;
      new.source_action_id := v_acao::uuid;
    end if;
  else
    new.origin := old.origin;
    new.reason_code := old.reason_code;
    new.source_action_id := old.source_action_id;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.done, false) then
      new.completed_at := now();
      new.completion_origin := coalesce(v_origem, 'usuario');
      new.completion_reason := v_motivo;
    end if;
  elsif coalesce(old.done, false) = false and coalesce(new.done, false) = true then
    new.completed_at := now();
    new.completion_origin := coalesce(v_origem, 'usuario');
    new.completion_reason := v_motivo;
  elsif coalesce(old.done, false) = true and coalesce(new.done, false) = false then
    new.completed_at := null;
    new.completion_origin := null;
    new.completion_reason := null;
  else
    new.completed_at := old.completed_at;
    new.completion_origin := old.completion_origin;
    new.completion_reason := old.completion_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_auditoria_agenda on agenda;
create trigger trg_proteger_auditoria_agenda
before insert or update on agenda
for each row execute function proteger_auditoria_agenda();
revoke all on function proteger_auditoria_agenda() from public, anon, authenticated;
create index if not exists agenda_followup_pendente_imovel_idx
  on agenda (user_id, imovel_id, date, id)
  where type = 'Follow-up' and done = false;
create table if not exists assistente_acoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sessao_id uuid,
  action_type text not null,
  status text not null default 'ready_for_confirmation'
    check (status in ('ready_for_confirmation', 'succeeded', 'cancelled', 'expired', 'failed')),
  payload jsonb not null,
  result jsonb,
  error_code text,
  origin text not null default 'assistente',
  autonomy_level text not null default 'high',
  confirmation_required boolean not null default true,
  reason_code text not null default 'pedido_explicito_usuario',
  reason_data jsonb not null default '{}'::jsonb,
  source_event_key text,
  expires_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table assistente_acoes alter column sessao_id drop not null;
alter table assistente_acoes alter column expires_at drop not null;
alter table assistente_acoes add column if not exists origin text not null default 'assistente';
alter table assistente_acoes add column if not exists autonomy_level text not null default 'high';
alter table assistente_acoes add column if not exists confirmation_required boolean not null default true;
alter table assistente_acoes add column if not exists reason_code text not null default 'pedido_explicito_usuario';
alter table assistente_acoes add column if not exists reason_data jsonb not null default '{}'::jsonb;
alter table assistente_acoes add column if not exists source_event_key text;
alter table assistente_acoes add column if not exists confirmed_by uuid references auth.users(id) on delete set null;
alter table assistente_acoes add column if not exists confirmed_at timestamptz;

-- Atualiza instalações que já possuíam a restrição da primeira versão,
-- limitada a visitas, sem recriá-la em reaplicações idempotentes do schema.
do $$
begin
  if exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'assistente_acoes_action_type_check'
       and conrelid = 'public.assistente_acoes'::regclass
       and pg_catalog.pg_get_constraintdef(oid) not like '%concluir_followups_por_resposta%'
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
      check (action_type in (
        'agendar_visita', 'criar_compromisso', 'alterar_status_sem_resposta_em_lote',
        'registrar_tentativa', 'criar_followup', 'reagendar_followup',
        'concluir_followup', 'concluir_followups_por_resposta'
      ));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'assistente_acoes_origin_check'
       and conrelid = 'public.assistente_acoes'::regclass
  ) then
    alter table public.assistente_acoes add constraint assistente_acoes_origin_check
      check (origin in ('assistente', 'automacao', 'evento_whatsapp'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'assistente_acoes_autonomy_level_check'
       and conrelid = 'public.assistente_acoes'::regclass
  ) then
    alter table public.assistente_acoes add constraint assistente_acoes_autonomy_level_check
      check (autonomy_level in ('low', 'medium', 'high', 'critical'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'assistente_acoes_confirmation_contract_check'
       and conrelid = 'public.assistente_acoes'::regclass
  ) then
    alter table public.assistente_acoes add constraint assistente_acoes_confirmation_contract_check
      check (
        status <> 'ready_for_confirmation'
        or (confirmation_required = true and sessao_id is not null and expires_at is not null)
      );
  end if;
end $$;

alter table assistente_acoes enable row level security;

-- Ausência deliberada de políticas: nem mesmo o dono altera o payload pelo
-- Data API. As funções abaixo descobrem o ator por auth.uid() e são a única
-- porta autenticada para preparar, confirmar ou cancelar.
create index if not exists assistente_acoes_usuario_sessao_idx
  on assistente_acoes (user_id, sessao_id, created_at desc);
create unique index if not exists assistente_acoes_pendente_sessao_idx
  on assistente_acoes (user_id, sessao_id)
  where status = 'ready_for_confirmation' and sessao_id is not null;
create unique index if not exists assistente_acoes_evento_idempotente_idx
  on assistente_acoes (user_id, origin, source_event_key, action_type)
  where source_event_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'agenda_source_action_id_fkey'
       and conrelid = 'public.agenda'::regclass
  ) then
    alter table public.agenda add constraint agenda_source_action_id_fkey
      foreign key (source_action_id) references public.assistente_acoes(id) on delete set null;
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Regra canônica da ação pontual de status do Assistente. A preparação e a
-- confirmação chamam a mesma função para não divergirem entre o preview e a
-- execução. Tentativa é o registro operacional; mensagem enviada, sozinha,
-- não entra. Qualquer resposta observada encerra a hipótese de silêncio.
create or replace function private.imovel_elegivel_status_sem_resposta(p_imovel public.imoveis)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    p_imovel.status = 'Novo contato'
    and not coalesce(p_imovel.retirado, false)
    and not coalesce(p_imovel.pre_cadastro, false)
    and jsonb_typeof(coalesce(p_imovel.tentativas, '[]'::jsonb)) = 'array'
    and jsonb_array_length(coalesce(p_imovel.tentativas, '[]'::jsonb)) >= 3
    and not exists (
      select 1
        from jsonb_array_elements(coalesce(p_imovel.tentativas, '[]'::jsonb)) tentativa
       where tentativa->>'resultado' in ('respondeu', 'vai-retornar', 'agendou', 'recusou', 'outro-contato')
    )
    and not exists (
      select 1
        from jsonb_array_elements(coalesce(p_imovel.notas, '[]'::jsonb)) nota
       where (
         coalesce(nota->>'id', '') like 'wa:%'
         and coalesce(nota->>'id', '') not like '%:encerrado'
         and regexp_replace(lower(coalesce(nota->>'tipo', '')), '[[:space:]_.-]', '', 'g')
             not in ('reaction', 'reactionmessage')
       ) or (
         nota->>'origem' = 'importacao-evolution'
         and nota->>'direcao' = 'recebida'
         and coalesce(nota->>'id', '') like 'wa-contexto-recebida:%'
       )
    );
$$;
revoke all on function private.imovel_elegivel_status_sem_resposta(public.imoveis) from public, anon, authenticated;

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
    'origem', p_acao.origin,
    'nivelAutonomia', p_acao.autonomy_level,
    'requerConfirmacao', p_acao.confirmation_required,
    'motivo', jsonb_build_object(
      'codigo', p_acao.reason_code,
      'descricao', case p_acao.reason_code
        when 'tres_tentativas_sem_resposta' then 'O imóvel possui pelo menos 3 tentativas e nenhuma resposta observada.'
        when 'tentativa_informada_usuario' then 'O usuário pediu explicitamente o registro desta tentativa.'
        when 'followup_solicitado_usuario' then 'O usuário pediu explicitamente este acompanhamento.'
        when 'followup_reagendado_usuario' then 'O usuário informou uma nova data para o acompanhamento.'
        when 'followup_concluido_usuario' then 'O usuário informou que este acompanhamento pode ser concluído.'
        when 'proprietario_respondeu' then 'O proprietário respondeu e o acompanhamento automático anterior perdeu sentido.'
        else 'Ação solicitada explicitamente pelo usuário.'
      end,
      'dados', p_acao.reason_data
    ),
    'operacao', case p_acao.action_type
      when 'criar_compromisso' then 'Criar compromisso'
      when 'alterar_status_sem_resposta_em_lote' then 'Alterar status em lote'
      when 'registrar_tentativa' then 'Registrar tentativa de contato'
      when 'criar_followup' then 'Criar follow-up'
      when 'reagendar_followup' then 'Reagendar follow-up'
      when 'concluir_followup' then 'Concluir follow-up'
      when 'concluir_followups_por_resposta' then 'Concluir follow-ups após resposta'
      else 'Agendar visita'
    end,
    'impacto', case p_acao.action_type
      when 'alterar_status_sem_resposta_em_lote' then
        (p_acao.payload->>'quantidade') || case
          when (p_acao.payload->>'quantidade')::integer = 1
            then ' imóvel terá o status alterado para Sem resposta.'
          else ' imóveis terão o status alterado para Sem resposta.'
        end
      when 'registrar_tentativa' then 'Uma tentativa real será adicionada ao histórico do imóvel após confirmação.'
      when 'criar_followup' then 'Um follow-up interno será criado automaticamente na agenda.'
      when 'reagendar_followup' then 'A data do follow-up interno será atualizada automaticamente.'
      when 'concluir_followup' then 'O follow-up interno será marcado como concluído automaticamente.'
      when 'concluir_followups_por_resposta' then 'Follow-ups automáticos que aguardavam resposta serão concluídos.'
      else 'Será criado um compromisso real na agenda.'
    end,
    'entidade', case p_acao.action_type
      when 'alterar_status_sem_resposta_em_lote' then jsonb_build_object(
        'imoveis', p_acao.payload->'imoveis'
      )
      else jsonb_build_object(
        'imovelId', p_acao.payload->>'imovelId',
        'codigo', p_acao.payload->>'codigo',
        'endereco', p_acao.payload->>'endereco',
        'responsavel', p_acao.payload->>'responsavel',
        'agendaId', p_acao.payload->>'agendaId'
      )
    end,
    'dados', case p_acao.action_type
      when 'alterar_status_sem_resposta_em_lote' then jsonb_build_object(
        'statusDestino', p_acao.payload->>'statusDestino',
        'quantidade', (p_acao.payload->>'quantidade')::integer
      )
      when 'registrar_tentativa' then jsonb_build_object(
        'tentativaId', p_acao.payload->>'tentativaId',
        'canal', p_acao.payload->>'canal',
        'resultado', p_acao.payload->>'resultado',
        'observacao', p_acao.payload->>'observacao'
      )
      when 'reagendar_followup' then jsonb_build_object(
        'titulo', p_acao.payload->>'title',
        'dataAnterior', p_acao.payload->>'dataAnterior',
        'horaAnterior', p_acao.payload->>'horaAnterior',
        'data', p_acao.payload->>'date',
        'hora', p_acao.payload->>'hora'
      )
      else jsonb_build_object(
        'titulo', p_acao.payload->>'title',
        'tipo', p_acao.payload->>'type',
        'data', p_acao.payload->>'date',
        'hora', p_acao.payload->>'hora',
        'observacao', p_acao.payload->>'notes'
      )
    end,
    'resultado', case
      when p_acao.result is null then null
      when p_acao.action_type = 'alterar_status_sem_resposta_em_lote' then p_acao.result
      when p_acao.action_type = 'registrar_tentativa' then p_acao.result
      when p_acao.action_type = 'concluir_followups_por_resposta' then p_acao.result
      else jsonb_build_object('agendaId', p_acao.result->>'agendaId')
    end,
    'erro', case p_acao.error_code
      when 'imovel_indisponivel' then 'O imóvel não está mais disponível para esta ação.'
      when 'acao_expirada' then 'A confirmação expirou. Prepare a ação novamente.'
      when 'payload_invalido' then 'A ação preparada não passou na validação de segurança.'
      when 'estado_incompativel' then 'O registro mudou e a ação não é mais compatível com o estado atual.'
      else null
    end
  );
$$;

create or replace function preparar_acao_assistente_criar_compromisso(
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
    user_id, sessao_id, action_type, status, payload, origin,
    autonomy_level, confirmation_required, reason_code, expires_at
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
    ), 'assistente', 'high', true, 'pedido_explicito_usuario',
    now() + interval '15 minutes'
  ) returning * into v_acao;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;
revoke all on function private.assistente_acao_json(public.assistente_acoes) from public, anon, authenticated;

create or replace function preparar_acao_assistente_agendar_visita(
  p_imovel_id uuid,
  p_data date,
  p_hora text,
  p_sessao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_imovel record;
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
  if p_data is null or p_data < (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('ok', false, 'codigo', 'data_invalida', 'erro', 'A data da visita não pode estar no passado.');
  end if;
  if p_hora is null or p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'codigo', 'hora_invalida', 'erro', 'Informe um horário válido no formato HH:MM.');
  end if;

  -- Serializa preparações da mesma conversa. Sem isto, dois requests que
  -- cheguem juntos poderiam cancelar o estado antigo e criar dois previews.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_sessao_id::text, 0)
  );

  select i.id, i.codigo, i.endereco, i.bairro, i.cidade, i.responsavel
    into v_imovel
    from public.imoveis i
   where i.id = p_imovel_id and i.user_id = v_user;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'imovel_nao_encontrado', 'erro', 'O imóvel não foi encontrado na sua carteira.');
  end if;

  v_endereco := concat_ws(', ',
    nullif(trim(v_imovel.endereco), ''),
    nullif(trim(v_imovel.bairro), ''),
    nullif(trim(v_imovel.cidade), '')
  );

  update public.assistente_acoes
     set status = 'cancelled', error_code = 'substituida', updated_at = now()
   where user_id = v_user
     and sessao_id = p_sessao_id
     and status = 'ready_for_confirmation';

  insert into public.assistente_acoes (
    user_id, sessao_id, action_type, status, payload, origin,
    autonomy_level, confirmation_required, reason_code, expires_at
  ) values (
    v_user,
    p_sessao_id,
    'agendar_visita',
    'ready_for_confirmation',
    jsonb_build_object(
      'agendaId', v_agenda_id,
      'imovelId', v_imovel.id,
      'codigo', coalesce(nullif(trim(v_imovel.codigo), ''), 'Sem código'),
      'endereco', coalesce(nullif(v_endereco, ''), 'Endereço não informado'),
      'responsavel', coalesce(nullif(trim(v_imovel.responsavel), ''), 'Não informado'),
      'title', 'Visita ao imóvel ' || coalesce(nullif(trim(v_imovel.codigo), ''), 'sem código'),
      'type', 'Visita',
      'date', p_data::text,
      'hora', p_hora,
      'notes', 'Agendada pelo Assistente após confirmação explícita do usuário.',
      'done', false,
      'isVerificacaoDisponibilidade', false
    ), 'assistente', 'high', true, 'pedido_explicito_usuario',
    now() + interval '15 minutes'
  ) returning * into v_acao;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

create or replace function preparar_acao_assistente_status_sem_resposta(
  p_sessao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_imoveis jsonb;
  v_quantidade integer;
  v_acao public.assistente_acoes;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_sessao_id::text, 0)
  );

  -- Um novo pedido operacional substitui qualquer preview anterior da mesma
  -- conversa, mesmo quando a nova consulta não encontra alvos elegíveis.
  update public.assistente_acoes
     set status = 'cancelled', error_code = 'substituida', updated_at = now()
   where user_id = v_user
     and sessao_id = p_sessao_id
     and status = 'ready_for_confirmation';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'codigo', coalesce(nullif(trim(i.codigo), ''), 'Sem código'),
           'endereco', coalesce(nullif(concat_ws(', ',
             nullif(trim(i.endereco), ''),
             nullif(trim(i.bairro), ''),
             nullif(trim(i.cidade), '')
           ), ''), 'Endereço não informado'),
           'statusPreparado', i.status,
           'tentativas', jsonb_array_length(coalesce(i.tentativas, '[]'::jsonb))
         ) order by i.codigo nulls last, i.id), '[]'::jsonb),
         count(*)::integer
    into v_imoveis, v_quantidade
    from public.imoveis i
   where i.user_id = v_user
     and private.imovel_elegivel_status_sem_resposta(i);

  if v_quantidade = 0 then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'sem_elegiveis',
      'erro', 'Não encontrei imóveis em Novo contato com pelo menos 3 tentativas registradas e sem resposta do proprietário.'
    );
  end if;

  insert into public.assistente_acoes (
    user_id, sessao_id, action_type, status, payload, origin,
    autonomy_level, confirmation_required, reason_code, expires_at
  ) values (
    v_user,
    p_sessao_id,
    'alterar_status_sem_resposta_em_lote',
    'ready_for_confirmation',
    jsonb_build_object(
      'statusDestino', 'Sem resposta',
      'quantidade', v_quantidade,
      'imoveis', v_imoveis
    ), 'assistente', 'high', true, 'tres_tentativas_sem_resposta',
    now() + interval '15 minutes'
  ) returning * into v_acao;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

-- Porta única das primeiras ações de acompanhamento. Os parâmetros são
-- fechados e o banco decide a política: tentativa é preparada; follow-ups
-- internos de baixo risco são executados na mesma transação e auditados.
create or replace function operar_acao_assistente_acompanhamento(
  p_operacao text,
  p_sessao_id uuid,
  p_imovel_id uuid default null,
  p_agenda_id uuid default null,
  p_data date default null,
  p_hora text default null,
  p_canal text default null,
  p_resultado text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_imovel public.imoveis;
  v_agenda public.agenda;
  v_acao public.assistente_acoes;
  v_acao_id uuid := gen_random_uuid();
  v_agenda_id uuid;
  v_tentativa_id uuid := gen_random_uuid();
  v_endereco text;
  v_titulo text;
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
  if p_operacao not in ('registrar_tentativa', 'criar_followup', 'reagendar_followup', 'concluir_followup') then
    return jsonb_build_object('ok', false, 'codigo', 'operacao_indisponivel', 'erro', 'Esta operação não está disponível para o Assistente.');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user::text || ':' || p_sessao_id::text, 0)
  );

  if p_operacao in ('reagendar_followup', 'concluir_followup') then
    select * into v_agenda
      from public.agenda a
     where a.id = p_agenda_id
       and a.user_id = v_user
       and a.type = 'Follow-up'
       and a.done = false
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'codigo', 'followup_indisponivel', 'erro', 'O follow-up não existe, já foi concluído ou mudou de estado.');
    end if;
    p_imovel_id := v_agenda.imovel_id;
  end if;

  select * into v_imovel
    from public.imoveis i
   where i.id = p_imovel_id and i.user_id = v_user
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'imovel_nao_encontrado', 'erro', 'O imóvel não foi encontrado na sua carteira.');
  end if;
  if coalesce(v_imovel.retirado, false) then
    return jsonb_build_object('ok', false, 'codigo', 'estado_incompativel', 'erro', 'O imóvel foi retirado e não aceita novas ações de acompanhamento.');
  end if;

  v_endereco := coalesce(nullif(concat_ws(', ',
    nullif(trim(v_imovel.endereco), ''), nullif(trim(v_imovel.bairro), ''), nullif(trim(v_imovel.cidade), '')
  ), ''), 'Endereço não informado');

  if p_operacao = 'registrar_tentativa' then
    if p_canal not in ('Ligação telefônica', 'WhatsApp', 'Visita presencial', 'Indicação', 'Panfletagem', 'E-mail', 'Rede social', 'Outro') then
      return jsonb_build_object('ok', false, 'codigo', 'canal_invalido', 'erro', 'Informe um canal de contato válido.');
    end if;
    if p_resultado not in ('sem-resposta', 'respondeu', 'vai-retornar', 'agendou', 'recusou', 'outro-contato', 'numero-errado') then
      return jsonb_build_object('ok', false, 'codigo', 'resultado_invalido', 'erro', 'Informe um resultado de tentativa válido.');
    end if;

    update public.assistente_acoes
       set status = 'cancelled', error_code = 'substituida', updated_at = now()
     where user_id = v_user and sessao_id = p_sessao_id and status = 'ready_for_confirmation';

    insert into public.assistente_acoes (
      id, user_id, sessao_id, action_type, status, payload, origin,
      autonomy_level, confirmation_required, reason_code, expires_at
    ) values (
      v_acao_id, v_user, p_sessao_id, p_operacao, 'ready_for_confirmation',
      jsonb_build_object(
        'imovelId', v_imovel.id,
        'codigo', coalesce(nullif(trim(v_imovel.codigo), ''), 'Sem código'),
        'endereco', v_endereco,
        'responsavel', coalesce(nullif(trim(v_imovel.responsavel), ''), 'Não informado'),
        'tentativaId', v_tentativa_id,
        'data', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI'),
        'canal', p_canal,
        'resultado', p_resultado,
        'observacao', nullif(left(trim(coalesce(p_observacao, '')), 2000), '')
      ),
      'assistente', 'high', true, 'tentativa_informada_usuario', now() + interval '15 minutes'
    ) returning * into v_acao;
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;

  if p_operacao in ('criar_followup', 'reagendar_followup') then
    if p_data is null or p_data < (now() at time zone 'America/Sao_Paulo')::date then
      return jsonb_build_object('ok', false, 'codigo', 'data_invalida', 'erro', 'A data do follow-up não pode estar no passado.');
    end if;
    if nullif(trim(coalesce(p_hora, '')), '') is not null
       and trim(p_hora) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return jsonb_build_object('ok', false, 'codigo', 'hora_invalida', 'erro', 'Informe um horário válido no formato HH:MM.');
    end if;
  end if;

  v_agenda_id := case when p_operacao = 'criar_followup' then gen_random_uuid() else v_agenda.id end;
  v_titulo := case
    when p_operacao = 'criar_followup' then 'Follow-up — ' || coalesce(nullif(trim(v_imovel.codigo), ''), 'imóvel sem código')
    else v_agenda.title
  end;
  insert into public.assistente_acoes (
    id, user_id, sessao_id, action_type, status, payload, result, origin,
    autonomy_level, confirmation_required, reason_code, expires_at, executed_at
  ) values (
    v_acao_id, v_user, p_sessao_id, p_operacao, 'succeeded',
    jsonb_build_object(
      'agendaId', v_agenda_id,
      'imovelId', v_imovel.id,
      'codigo', coalesce(nullif(trim(v_imovel.codigo), ''), 'Sem código'),
      'endereco', v_endereco,
      'responsavel', coalesce(nullif(trim(v_imovel.responsavel), ''), 'Não informado'),
      'title', v_titulo,
      'type', 'Follow-up',
      'dataAnterior', case when p_operacao = 'reagendar_followup' then v_agenda.date::text else null end,
      'horaAnterior', case when p_operacao = 'reagendar_followup' then v_agenda.hora else null end,
      'date', case when p_operacao = 'concluir_followup' then v_agenda.date::text else p_data::text end,
      'hora', case when p_operacao = 'concluir_followup' then v_agenda.hora else nullif(trim(coalesce(p_hora, '')), '') end,
      'notes', case when p_operacao = 'criar_followup' then 'Criado pelo Assistente para acompanhar uma resposta do proprietário.' else v_agenda.notes end
    ),
    jsonb_build_object('agendaId', v_agenda_id),
    'assistente', 'low', false,
    case p_operacao
      when 'criar_followup' then 'followup_solicitado_usuario'
      when 'reagendar_followup' then 'followup_reagendado_usuario'
      else 'followup_concluido_usuario'
    end,
    null, now()
  ) returning * into v_acao;

  perform pg_catalog.set_config('angario.agenda_source', 'assistente', true);
  perform pg_catalog.set_config(
    'angario.agenda_reason',
    case when p_operacao = 'criar_followup' then 'aguardando_resposta' else v_acao.reason_code end,
    true
  );
  perform pg_catalog.set_config('angario.agenda_action_id', v_acao.id::text, true);
  if p_operacao = 'criar_followup' then
    insert into public.agenda (
      id, user_id, title, type, date, hora, imovel_id, notes, done, is_verificacao_disponibilidade
    ) values (
      v_agenda_id, v_user, v_titulo, 'Follow-up', p_data,
      nullif(trim(coalesce(p_hora, '')), ''), v_imovel.id,
      'Criado pelo Assistente para acompanhar uma resposta do proprietário.', false, false
    );
  elsif p_operacao = 'reagendar_followup' then
    update public.agenda
       set date = p_data, hora = nullif(trim(coalesce(p_hora, '')), '')
     where id = v_agenda.id and user_id = v_user and done = false;
    if not found then
      raise exception 'O follow-up mudou durante a operação.' using errcode = '40001';
    end if;
  else
    update public.agenda set done = true
     where id = v_agenda.id and user_id = v_user and done = false;
    if not found then
      raise exception 'O follow-up mudou durante a operação.' using errcode = '40001';
    end if;
  end if;
  perform pg_catalog.set_config('angario.agenda_source', '', true);
  perform pg_catalog.set_config('angario.agenda_reason', '', true);
  perform pg_catalog.set_config('angario.agenda_action_id', '', true);

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

drop function if exists confirmar_acao_assistente(uuid);
create or replace function confirmar_acao_assistente(p_acao_id uuid, p_sessao_id uuid)
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
  v_item jsonb;
  v_imovel public.imoveis;
  v_alterados jsonb := '[]'::jsonb;
  v_ignorados jsonb := '[]'::jsonb;
  v_codigo text;
  v_tentativas jsonb;
  v_tentativa jsonb;
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
  if v_acao.expires_at is null or v_acao.expires_at <= now() then
    update public.assistente_acoes
       set status = 'expired', error_code = 'acao_expirada', updated_at = now()
     where id = v_acao.id
     returning * into v_acao;
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;

  if v_acao.confirmation_required is distinct from true
     or v_acao.autonomy_level not in ('high', 'critical') then
    update public.assistente_acoes
       set status = 'failed', error_code = 'payload_invalido', updated_at = now()
     where id = v_acao.id
     returning * into v_acao;
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;

  if v_acao.action_type = 'registrar_tentativa' then
    if coalesce(v_acao.payload->>'tentativaId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or v_acao.payload->>'canal' not in ('Ligação telefônica', 'WhatsApp', 'Visita presencial', 'Indicação', 'Panfletagem', 'E-mail', 'Rede social', 'Outro')
       or v_acao.payload->>'resultado' not in ('sem-resposta', 'respondeu', 'vai-retornar', 'agendou', 'recusou', 'outro-contato', 'numero-errado') then
      update public.assistente_acoes
         set status = 'failed', error_code = 'payload_invalido', updated_at = now()
       where id = v_acao.id
       returning * into v_acao;
      return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
    end if;

    v_imovel_id := (v_acao.payload->>'imovelId')::uuid;
    select * into v_imovel
      from public.imoveis i
     where i.id = v_imovel_id and i.user_id = v_user
     for update;
    if not found or coalesce(v_imovel.retirado, false) then
      update public.assistente_acoes
         set status = 'failed', error_code = 'estado_incompativel', updated_at = now()
       where id = v_acao.id
       returning * into v_acao;
      return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
    end if;

    v_tentativas := coalesce(v_imovel.tentativas, '[]'::jsonb);
    if jsonb_typeof(v_tentativas) is distinct from 'array' then
      v_tentativas := '[]'::jsonb;
    end if;
    v_tentativa := jsonb_strip_nulls(jsonb_build_object(
      'id', v_acao.payload->>'tentativaId',
      'data', v_acao.payload->>'data',
      'abordagemId', null,
      'canal', v_acao.payload->>'canal',
      'resultado', v_acao.payload->>'resultado',
      'observacao', v_acao.payload->>'observacao',
      'origem', 'assistente',
      'acaoId', v_acao.id
    ));
    if not exists (
      select 1 from jsonb_array_elements(v_tentativas) t
       where t->>'id' = v_acao.payload->>'tentativaId'
    ) then
      update public.imoveis
         set tentativas = v_tentativas || jsonb_build_array(v_tentativa),
             forma_abordagem = case
               when nullif(trim(coalesce(forma_abordagem, '')), '') is null then v_acao.payload->>'canal'
               else forma_abordagem
             end
       where id = v_imovel.id and user_id = v_user;
    end if;

    update public.assistente_acoes
       set status = 'succeeded',
           result = jsonb_build_object('tentativaId', v_acao.payload->>'tentativaId', 'imovelId', v_imovel.id),
           error_code = null, executed_at = now(), confirmed_by = v_user,
           confirmed_at = now(), updated_at = now()
     where id = v_acao.id
     returning * into v_acao;
    return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
  end if;

  if v_acao.action_type = 'alterar_status_sem_resposta_em_lote' then
    if v_acao.payload->>'statusDestino' is distinct from 'Sem resposta'
       or jsonb_typeof(v_acao.payload->'imoveis') is distinct from 'array' then
      update public.assistente_acoes
         set status = 'failed', error_code = 'payload_invalido', updated_at = now()
       where id = v_acao.id
       returning * into v_acao;
      return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
    end if;

    -- O trigger continua sendo o único autor do status_history. A marca local
    -- apenas informa a origem confiável desta transação; o usuário e a sessão
    -- já foram validados e o navegador não escreve na tabela de ações.
    perform pg_catalog.set_config('angario.status_history_source', 'assistente', true);
    for v_item in
      select value
        from jsonb_array_elements(v_acao.payload->'imoveis')
       order by value->>'id'
    loop
      v_imovel_id := (v_item->>'id')::uuid;
      v_codigo := coalesce(nullif(v_item->>'codigo', ''), 'Sem código');

      select * into v_imovel
        from public.imoveis i
       where i.id = v_imovel_id and i.user_id = v_user
       for update;

      if not found then
        v_ignorados := v_ignorados || jsonb_build_array(jsonb_build_object(
          'id', v_imovel_id,
          'codigo', v_codigo,
          'motivo', 'imovel_indisponivel'
        ));
      elsif v_imovel.status is distinct from v_item->>'statusPreparado' then
        v_ignorados := v_ignorados || jsonb_build_array(jsonb_build_object(
          'id', v_imovel.id,
          'codigo', coalesce(nullif(trim(v_imovel.codigo), ''), v_codigo),
          'motivo', 'status_alterado'
        ));
      elsif not private.imovel_elegivel_status_sem_resposta(v_imovel) then
        v_ignorados := v_ignorados || jsonb_build_array(jsonb_build_object(
          'id', v_imovel.id,
          'codigo', coalesce(nullif(trim(v_imovel.codigo), ''), v_codigo),
          'motivo', 'nao_elegivel'
        ));
      else
        update public.imoveis
           set status = 'Sem resposta'
         where id = v_imovel.id and user_id = v_user;
        v_alterados := v_alterados || jsonb_build_array(jsonb_build_object(
          'id', v_imovel.id,
          'codigo', coalesce(nullif(trim(v_imovel.codigo), ''), v_codigo)
        ));
      end if;
    end loop;
    perform pg_catalog.set_config('angario.status_history_source', '', true);

    update public.assistente_acoes
       set status = 'succeeded',
           result = jsonb_build_object(
             'alterados', v_alterados,
             'ignorados', v_ignorados,
             'totalAlterados', jsonb_array_length(v_alterados),
             'totalIgnorados', jsonb_array_length(v_ignorados)
           ),
           error_code = null,
           executed_at = now(),
           confirmed_by = v_user,
           confirmed_at = now(),
           updated_at = now()
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

  perform pg_catalog.set_config('angario.agenda_source', 'assistente', true);
  perform pg_catalog.set_config('angario.agenda_reason', v_acao.reason_code, true);
  perform pg_catalog.set_config('angario.agenda_action_id', v_acao.id::text, true);
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
  perform pg_catalog.set_config('angario.agenda_source', '', true);
  perform pg_catalog.set_config('angario.agenda_reason', '', true);
  perform pg_catalog.set_config('angario.agenda_action_id', '', true);

  update public.assistente_acoes
     set status = 'succeeded',
         result = jsonb_build_object('agendaId', v_agenda_id),
         error_code = null,
         executed_at = now(),
         confirmed_by = v_user,
         confirmed_at = now(),
         updated_at = now()
   where id = v_acao.id
   returning * into v_acao;

  return jsonb_build_object('ok', true, 'acao', private.assistente_acao_json(v_acao));
end;
$$;

drop function if exists cancelar_acao_assistente(uuid);
create or replace function cancelar_acao_assistente(p_acao_id uuid, p_sessao_id uuid)
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

-- Evento determinístico do webhook. A service role recebe o usuário a partir
-- da instância já autenticada, e a função repete o filtro por user_id. Só
-- conclui follow-ups criados pelo Assistente para aguardar uma resposta;
-- compromissos manuais e mensagens externas permanecem intocados.
create or replace function processar_evento_resposta_acompanhamento(
  p_user_id uuid,
  p_imovel_id uuid,
  p_evento_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acao public.assistente_acoes;
  v_ids jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Operação disponível somente para o serviço.' using errcode = '42501';
  end if;
  if p_user_id is null or p_imovel_id is null or nullif(trim(coalesce(p_evento_id, '')), '') is null then
    raise exception 'Evento de resposta inválido.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.imoveis i where i.id = p_imovel_id and i.user_id = p_user_id
  ) then
    raise exception 'Imóvel não encontrado para este usuário.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':resposta:' || p_evento_id, 0)
  );
  select * into v_acao
    from public.assistente_acoes a
   where a.user_id = p_user_id
     and a.origin = 'evento_whatsapp'
     and a.source_event_key = p_evento_id
     and a.action_type = 'concluir_followups_por_resposta';
  if found then
    return jsonb_build_object('ok', true, 'repetido', true, 'agendaIds', coalesce(v_acao.result->'agendaIds', '[]'::jsonb), 'total', coalesce((v_acao.result->>'total')::integer, 0));
  end if;

  insert into public.assistente_acoes (
    user_id, sessao_id, action_type, status, payload, result, origin,
    autonomy_level, confirmation_required, reason_code, reason_data,
    source_event_key, expires_at, executed_at
  ) values (
    p_user_id, null, 'concluir_followups_por_resposta', 'succeeded',
    jsonb_build_object('imovelId', p_imovel_id, 'eventoId', p_evento_id),
    jsonb_build_object('agendaIds', '[]'::jsonb, 'total', 0),
    'evento_whatsapp', 'low', false, 'proprietario_respondeu',
    jsonb_build_object('eventoId', p_evento_id), p_evento_id, null, now()
  ) returning * into v_acao;

  perform pg_catalog.set_config('angario.agenda_source', 'evento_whatsapp', true);
  perform pg_catalog.set_config('angario.agenda_reason', 'proprietario_respondeu', true);
  perform pg_catalog.set_config('angario.agenda_action_id', v_acao.id::text, true);
  with atualizados as (
    update public.agenda a
       set done = true
     where a.user_id = p_user_id
       and a.imovel_id = p_imovel_id
       and a.type = 'Follow-up'
       and a.done = false
       and a.origin in ('assistente', 'automacao')
       and a.reason_code = 'aguardando_resposta'
     returning a.id
  )
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb), count(*)::integer
    into v_ids, v_total
    from atualizados;
  perform pg_catalog.set_config('angario.agenda_source', '', true);
  perform pg_catalog.set_config('angario.agenda_reason', '', true);
  perform pg_catalog.set_config('angario.agenda_action_id', '', true);

  update public.assistente_acoes
     set result = jsonb_build_object('agendaIds', v_ids, 'total', v_total), updated_at = now()
   where id = v_acao.id;
  return jsonb_build_object('ok', true, 'repetido', false, 'agendaIds', v_ids, 'total', v_total, 'acaoId', v_acao.id);
end;
$$;

revoke all on function preparar_acao_assistente_agendar_visita(uuid, date, text, uuid) from public, anon;
revoke all on function preparar_acao_assistente_criar_compromisso(text, text, date, text, uuid, text, uuid) from public, anon;
revoke all on function preparar_acao_assistente_status_sem_resposta(uuid) from public, anon;
revoke all on function confirmar_acao_assistente(uuid, uuid) from public, anon;
revoke all on function cancelar_acao_assistente(uuid, uuid) from public, anon;
revoke all on function operar_acao_assistente_acompanhamento(text, uuid, uuid, uuid, date, text, text, text, text) from public, anon;
revoke all on function processar_evento_resposta_acompanhamento(uuid, uuid, text) from public, anon, authenticated;
grant execute on function preparar_acao_assistente_agendar_visita(uuid, date, text, uuid) to authenticated;
grant execute on function preparar_acao_assistente_criar_compromisso(text, text, date, text, uuid, text, uuid) to authenticated;
grant execute on function preparar_acao_assistente_status_sem_resposta(uuid) to authenticated;
grant execute on function confirmar_acao_assistente(uuid, uuid) to authenticated;
grant execute on function cancelar_acao_assistente(uuid, uuid) to authenticated;
grant execute on function operar_acao_assistente_acompanhamento(text, uuid, uuid, uuid, date, text, text, text, text) to authenticated;
grant execute on function processar_evento_resposta_acompanhamento(uuid, uuid, text) to service_role;
;
