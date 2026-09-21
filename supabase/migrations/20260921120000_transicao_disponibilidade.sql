-- M3/M4 — Transição de disponibilidade: uma implementação só no banco.
--
-- O que muda:
-- 1. `mensagens_agendadas` ganha a lista estruturada de imóveis consultados
--    (uma mensagem por proprietário, não por imóvel), o vínculo com a
--    mensagem que a absorveu e a auditoria do reagendamento automático.
-- 2. `private.aplicar_transicao_disponibilidade` é a ÚNICA mutação de
--    "encerrar" (imóvel saiu da carteira: apaga lembretes abertos e cancela
--    verificações pendentes) e de "confirmar" (disponibilidade confirmada em
--    E: a próxima verificação passa a valer em E + cadência, sem duplicar).
-- 3. As RPCs públicas só autorizam (dono por auth.uid(), ou pela linha do
--    imóvel sob service_role) e chamam a função interna.
-- 4. O trigger em `imoveis` chama a mesma função com NEW.id e NEW.user_id,
--    sem auth.uid(): cobre webhook, Sophia, assistente, RPC de locação e o
--    cliente. Falha interna vai para `log_eventos` e nunca derruba a
--    mudança de status.
--
-- 5. A consolidação é em dois tempos: `reservada_para_mensagem_id` marca a
--    candidata reservada antes do POST; `efetivar_consolidacao_contato` fecha
--    tudo numa transação só depois do envio aceito; e a varredura do claim
--    trata a reserva órfã como consolidação interrompida, nunca como envio
--    individual nem como contato realizado.
--
-- Nada aqui altera linhas existentes por si só: colunas novas nascem nulas
-- e a função só roda quando chamada ou quando um imóvel muda de estado.

-- ------------------------------------------------------------
-- 1. Colunas e restrições
-- ------------------------------------------------------------
alter table public.mensagens_agendadas
  add column if not exists imoveis_consultados uuid[],
  add column if not exists consolidada_em_mensagem_id uuid,
  add column if not exists reagendada_em timestamptz,
  add column if not exists reagendamento_motivo text,
  add column if not exists data_envio_original timestamptz;

alter table public.mensagens_agendadas
  drop constraint if exists mensagens_agendadas_cancelamento_motivo_check;
alter table public.mensagens_agendadas
  add constraint mensagens_agendadas_cancelamento_motivo_check
  check (
    cancelamento_motivo is null
    or cancelamento_motivo in (
      'usuario',
      'imovel-indisponivel',
      'disponibilidade-confirmada',
      'imovel-excluido',
      'contato-consolidado'
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_consolidada_fkey'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_consolidada_fkey
      foreign key (consolidada_em_mensagem_id)
      references public.mensagens_agendadas (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_consolidada_coerente_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_consolidada_coerente_check
      check (
        consolidada_em_mensagem_id is null
        or cancelamento_motivo = 'contato-consolidado'
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_reagendamento_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_reagendamento_check
      check (
        (reagendada_em is null and reagendamento_motivo is null)
        or (
          reagendada_em is not null
          and reagendamento_motivo in ('disponibilidade-confirmada')
          and data_envio_original is not null
        )
      );
  end if;
end $$;

-- Reserva de consolidação (M3, dois tempos). Enquanto a mensagem única do
-- proprietário ainda não saiu, cada candidata absorvível fica `processando`
-- com `reservada_para_mensagem_id` apontando para a âncora: é isso que
-- distingue, no banco, "reservada para uma consolidação" de "reclamada para
-- envio". A coluna nunca significa consolidação concluída: no sucesso ela é
-- limpa e `consolidada_em_mensagem_id` assume; na desistência antes do POST
-- ela é limpa e a linha volta a `agendada`; na interrupção/resultado incerto
-- a linha vira `erro` e o vínculo fica para auditoria. Sem default, sem
-- backfill: linhas existentes seguem nulas.
alter table public.mensagens_agendadas
  add column if not exists reservada_para_mensagem_id uuid;

do $$
begin
  -- Chave (id, user_id) para a FK composta respeitar o tenant, como
  -- `agenda_id_user_id_key` fez para a agenda no M1.
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_id_user_id_key'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_reserva_usuario_fkey'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_reserva_usuario_fkey
      foreign key (reservada_para_mensagem_id, user_id)
      references public.mensagens_agendadas (id, user_id)
      on delete set null (reservada_para_mensagem_id);
  end if;

  -- Sem autorreserva, e só nos dois estados em que uma reserva faz sentido:
  -- `processando` (viva) ou `erro` (interrompida/incerta, vínculo de
  -- auditoria). `agendada`, `enviada` e `cancelada` nunca carregam reserva,
  -- o que também impede o navegador (RLS só escreve agendada/cancelada) de
  -- forjar uma.
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_reserva_coerente_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_reserva_coerente_check
      check (
        reservada_para_mensagem_id is null
        or (
          reservada_para_mensagem_id <> id
          and status in ('processando', 'erro')
        )
      );
  end if;
end $$;

create index if not exists mensagens_agendadas_reserva_idx
  on public.mensagens_agendadas (reservada_para_mensagem_id)
  where reservada_para_mensagem_id is not null;

-- ------------------------------------------------------------
-- 2. Constantes gêmeas do TypeScript (há teste amarrando as duas)
-- ------------------------------------------------------------
create schema if not exists private;

-- DISPONIBILIDADE_STATUS_ALVO em web/lib/calculo/followup.ts.
create or replace function private.disponibilidade_status_alvo()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Angariado', 'Autorização assinada', 'Publicado']::text[];
$$;

-- VERIFICACAO_DISPONIBILIDADE_DIAS em web/lib/constantes.ts.
create or replace function private.verificacao_disponibilidade_dias()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 60;
$$;

revoke all on function private.disponibilidade_status_alvo() from public, anon, authenticated;
revoke all on function private.verificacao_disponibilidade_dias() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. A função interna única
-- ------------------------------------------------------------
-- Recebe o imóvel E o dono explicitamente. Toda leitura e escrita filtra
-- por p_user_id; um imóvel de outra conta é ignorado sem erro. Idempotente:
-- repetir a mesma chamada não cancela, reagenda nem cria nada de novo.
--
-- p_mensagem_processando: a linha que o worker já reclamou (`processando`)
-- e que precisa participar da transição na mesma transação. Só o servidor
-- passa esse argumento; a RPC pública o ignora para quem não é service_role.
create or replace function private.aplicar_transicao_disponibilidade(
  p_imovel_id uuid,
  p_user_id uuid,
  p_acao text,
  p_data_confirmacao date,
  p_origem text,
  p_motivo text,
  p_mensagem_processando uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imovel record;
  v_alvo date;
  v_origem_agenda text;
  v_lembrete_id uuid;
  v_lembretes_removidos integer := 0;
  v_lembretes_concluidos integer := 0;
  v_mensagens_canceladas integer := 0;
  v_mensagens_reagendadas integer := 0;
  v_lembrete_criado boolean := false;
  v_primeira uuid;
begin
  if p_imovel_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'parametros-invalidos');
  end if;
  if p_origem is null or p_origem not in ('usuario', 'automacao', 'worker') then
    raise exception 'Origem de transição inválida.' using errcode = '22023';
  end if;
  if p_acao is null or p_acao not in ('encerrar', 'confirmar') then
    raise exception 'Ação de transição inválida.' using errcode = '22023';
  end if;

  select i.id, i.user_id, i.status, i.retirado, i.codigo, i.endereco
    into v_imovel
    from public.imoveis i
   where i.id = p_imovel_id
     and i.user_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'imovel-nao-encontrado');
  end if;

  -- A agenda não aceita origem 'worker'; para ela, tudo que não é pessoa é automação.
  v_origem_agenda := case when p_origem = 'usuario' then 'usuario' else 'automacao' end;

  if p_acao = 'encerrar' then
    with removidos as (
      delete from public.agenda a
       where a.user_id = p_user_id
         and a.imovel_id = p_imovel_id
         and a.is_verificacao_disponibilidade
         and coalesce(a.done, false) = false
      returning a.id
    )
    select count(*) into v_lembretes_removidos from removidos;

    with canceladas as (
      update public.mensagens_agendadas m
         set status = 'cancelada',
             cancelamento_motivo = coalesce(p_motivo, 'imovel-indisponivel'),
             cancelamento_origem = p_origem,
             cancelada_em = now(),
             updated_at = now()
       where m.user_id = p_user_id
         and m.imovel_id = p_imovel_id
         and m.tipo = 'verificacao-disponibilidade'
         and (
           m.status = 'agendada'
           or (p_mensagem_processando is not null and m.id = p_mensagem_processando and m.status = 'processando')
         )
      returning m.id
    )
    select count(*) into v_mensagens_canceladas from canceladas;

    return jsonb_build_object(
      'ok', true, 'acao', 'encerrar',
      'lembretes_removidos', v_lembretes_removidos,
      'mensagens_canceladas', v_mensagens_canceladas
    );
  end if;

  -- p_acao = 'confirmar'
  if p_data_confirmacao is null then
    raise exception 'Confirmação de disponibilidade exige a data da evidência.' using errcode = '22023';
  end if;
  if coalesce(v_imovel.retirado, false) or not (v_imovel.status = any (private.disponibilidade_status_alvo())) then
    return jsonb_build_object('ok', true, 'acao', 'ignorada', 'motivo', 'imovel-fora-do-alvo');
  end if;

  v_alvo := p_data_confirmacao + private.verificacao_disponibilidade_dias();

  -- Lembrete: nunca é movido para antes; se já existe um aberto em v_alvo ou
  -- depois, nada muda. Senão, os abertos são concluídos com o motivo e nasce
  -- um só em v_alvo.
  select a.id into v_lembrete_id
    from public.agenda a
   where a.user_id = p_user_id
     and a.imovel_id = p_imovel_id
     and a.is_verificacao_disponibilidade
     and coalesce(a.done, false) = false
     and a.date >= v_alvo
   order by a.date, a.id
   limit 1;

  if v_lembrete_id is null then
    perform pg_catalog.set_config('angario.agenda_source', v_origem_agenda, true);
    perform pg_catalog.set_config('angario.agenda_reason', coalesce(p_motivo, 'disponibilidade-confirmada'), true);
    perform pg_catalog.set_config('angario.agenda_action_id', '', true);

    with concluidos as (
      update public.agenda a
         set done = true
       where a.user_id = p_user_id
         and a.imovel_id = p_imovel_id
         and a.is_verificacao_disponibilidade
         and coalesce(a.done, false) = false
      returning a.id
    )
    select count(*) into v_lembretes_concluidos from concluidos;

    insert into public.agenda (
      user_id, title, type, date, hora, imovel_id, notes, done, is_verificacao_disponibilidade
    ) values (
      p_user_id,
      'Verificar disponibilidade — ' || coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
      'Follow-up',
      v_alvo,
      null,
      p_imovel_id,
      'Lembrete automático: confirme novamente com o proprietário se o imóvel segue disponível.',
      false,
      true
    )
    returning id into v_lembrete_id;
    v_lembrete_criado := true;

    perform pg_catalog.set_config('angario.agenda_source', '', true);
    perform pg_catalog.set_config('angario.agenda_reason', '', true);
  end if;

  -- Mensagens: a mais antiga que venceria antes de v_alvo é movida para
  -- v_alvo (mesma hora do dia, no fuso operacional); as demais do mesmo
  -- imóvel nessa condição são canceladas, porque não se pergunta duas vezes.
  select m.id into v_primeira
    from public.mensagens_agendadas m
   where m.user_id = p_user_id
     and m.imovel_id = p_imovel_id
     and m.tipo = 'verificacao-disponibilidade'
     and (
       m.status = 'agendada'
       or (p_mensagem_processando is not null and m.id = p_mensagem_processando and m.status = 'processando')
     )
     and (m.data_envio at time zone 'America/Sao_Paulo')::date < v_alvo
   order by m.data_envio, m.id
   limit 1;

  if v_primeira is not null then
    update public.mensagens_agendadas m
       set status = 'agendada',
           data_envio_original = coalesce(m.data_envio_original, m.data_envio),
           data_envio = ((v_alvo::timestamp + (m.data_envio at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo'),
           reagendada_em = now(),
           reagendamento_motivo = 'disponibilidade-confirmada',
           erro = null,
           updated_at = now()
     where m.id = v_primeira
       and m.user_id = p_user_id;
    v_mensagens_reagendadas := 1;

    with canceladas as (
      update public.mensagens_agendadas m
         set status = 'cancelada',
             cancelamento_motivo = 'disponibilidade-confirmada',
             cancelamento_origem = p_origem,
             cancelada_em = now(),
             updated_at = now()
       where m.user_id = p_user_id
         and m.imovel_id = p_imovel_id
         and m.tipo = 'verificacao-disponibilidade'
         and m.id <> v_primeira
         and (
           m.status = 'agendada'
           or (p_mensagem_processando is not null and m.id = p_mensagem_processando and m.status = 'processando')
         )
         and (m.data_envio at time zone 'America/Sao_Paulo')::date < v_alvo
      returning m.id
    )
    select count(*) into v_mensagens_canceladas from canceladas;
  end if;

  return jsonb_build_object(
    'ok', true, 'acao', 'confirmar',
    'proxima_verificacao', v_alvo,
    'lembrete_id', v_lembrete_id,
    'lembrete_criado', v_lembrete_criado,
    'lembretes_concluidos', v_lembretes_concluidos,
    'mensagens_reagendadas', v_mensagens_reagendadas,
    'mensagens_canceladas', v_mensagens_canceladas
  );
end;
$$;

revoke all on function private.aplicar_transicao_disponibilidade(uuid, uuid, text, date, text, text, uuid)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. RPCs públicas: só autorização e contexto
-- ------------------------------------------------------------
-- Dono: auth.uid() no browser; sob service_role, o user_id da própria linha
-- do imóvel (padrão de registrar_comparavel_mercado). Origem: 'usuario' com
-- sessão, 'worker' sem ela. `p_mensagem_processando` só vale sob service_role.
create or replace function private.dono_para_transicao_disponibilidade(p_imovel_id uuid)
returns table (user_id uuid, origem text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null then
    return query select v_uid, 'usuario'::text;
    return;
  end if;
  -- Em função security definer `current_user` é o dono da função, não o
  -- papel da requisição: o papel vem do JWT, como em proteger_auditoria_agenda.
  if (select auth.role()) = 'service_role' then
    return query
      select i.user_id, 'worker'::text
        from public.imoveis i
       where i.id = p_imovel_id;
    return;
  end if;
  raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
end;
$$;
revoke all on function private.dono_para_transicao_disponibilidade(uuid) from public, anon, authenticated;

create or replace function public.registrar_confirmacao_disponibilidade(
  p_imovel_id uuid,
  p_data_confirmacao date,
  p_motivo text default 'disponibilidade-confirmada',
  p_mensagem_processando uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dono record;
begin
  select * into v_dono from private.dono_para_transicao_disponibilidade(p_imovel_id);
  if v_dono.user_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'imovel-nao-encontrado');
  end if;
  return private.aplicar_transicao_disponibilidade(
    p_imovel_id,
    v_dono.user_id,
    'confirmar',
    p_data_confirmacao,
    v_dono.origem,
    coalesce(p_motivo, 'disponibilidade-confirmada'),
    case when v_dono.origem = 'worker' then p_mensagem_processando else null end
  );
end;
$$;

create or replace function public.encerrar_disponibilidade_imovel(
  p_imovel_id uuid,
  p_motivo text default 'imovel-indisponivel',
  p_mensagem_processando uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dono record;
begin
  select * into v_dono from private.dono_para_transicao_disponibilidade(p_imovel_id);
  if v_dono.user_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'imovel-nao-encontrado');
  end if;
  if p_motivo is not null and p_motivo not in ('imovel-indisponivel', 'imovel-excluido') then
    raise exception 'Motivo de encerramento inválido.' using errcode = '22023';
  end if;
  return private.aplicar_transicao_disponibilidade(
    p_imovel_id,
    v_dono.user_id,
    'encerrar',
    null,
    v_dono.origem,
    coalesce(p_motivo, 'imovel-indisponivel'),
    case when v_dono.origem = 'worker' then p_mensagem_processando else null end
  );
end;
$$;

revoke all on function public.registrar_confirmacao_disponibilidade(uuid, date, text, uuid) from public, anon;
grant execute on function public.registrar_confirmacao_disponibilidade(uuid, date, text, uuid) to authenticated, service_role;
revoke all on function public.encerrar_disponibilidade_imovel(uuid, text, uuid) from public, anon;
grant execute on function public.encerrar_disponibilidade_imovel(uuid, text, uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Trigger: rede final, com NEW.id e NEW.user_id
-- ------------------------------------------------------------
create or replace function public.reagir_transicao_disponibilidade_imovel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saiu_do_alvo boolean;
begin
  v_saiu_do_alvo :=
    (coalesce(new.retirado, false) and not coalesce(old.retirado, false))
    or (
      new.status is distinct from old.status
      and not (new.status = any (private.disponibilidade_status_alvo()))
    );
  if not v_saiu_do_alvo then
    return new;
  end if;

  begin
    perform private.aplicar_transicao_disponibilidade(
      new.id, new.user_id, 'encerrar', null, 'automacao', 'imovel-indisponivel', null
    );
  exception when others then
    -- Nunca derruba a mudança de status; fica registrado para quem opera.
    insert into public.log_eventos (user_id, categoria, nivel, evento, detalhe)
    values (new.user_id, 'whatsapp', 'erro', 'transicao-disponibilidade-falhou', sqlstate);
  end;
  return new;
end;
$$;
revoke all on function public.reagir_transicao_disponibilidade_imovel() from public, anon, authenticated;

drop trigger if exists trg_transicao_disponibilidade_imovel on public.imoveis;
create trigger trg_transicao_disponibilidade_imovel
  after update of status, retirado on public.imoveis
  for each row execute function public.reagir_transicao_disponibilidade_imovel();

-- ------------------------------------------------------------
-- 6. Efetivação atômica da consolidação (só depois do POST aceito)
-- ------------------------------------------------------------
-- Uma transação só, ou nada: as reservadas da âncora (`reservada_para_mensagem_id`
-- = âncora, `processando`, mesma conta) viram `cancelada`/`contato-consolidado`
-- apontando para a âncora, com a reserva limpa; as notas `wa:` (já montadas
-- pelo servidor: o formato pertence ao TypeScript) entram por
-- `registrar_nota_imovel`; e a âncora `processando` → `enviada` com o texto
-- que de fato saiu e `imoveis_consultados`. `registrar_nota_imovel` é plpgsql
-- chamada daqui: roda na transação desta função (não existe commit autônomo
-- em função), então um erro no fim desfaz tudo, inclusive as notas. Uma nota
-- individual que falhe fica num savepoint (bloco `exception`) e é devolvida em
-- `notas_falhas`, porque o envio já aconteceu e a linha nunca volta à fila.
-- Só service_role, pelo papel do JWT (auth.role()), como nas RPCs acima.
create or replace function public.efetivar_consolidacao_contato(
  p_mensagem_id uuid,
  p_user_id uuid,
  p_texto text,
  p_imoveis_consultados uuid[],
  p_notas jsonb default '[]'::jsonb,
  p_enviado_em timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancora record;
  v_absorvidas uuid[] := array[]::uuid[];
  v_nota jsonb;
  v_imovel uuid;
  v_notas_gravadas integer := 0;
  v_notas_falhas jsonb := '[]'::jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Somente o servidor efetiva uma consolidação.' using errcode = '42501';
  end if;
  if p_mensagem_id is null or p_user_id is null or p_texto is null
     or p_imoveis_consultados is null or cardinality(p_imoveis_consultados) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametros-invalidos');
  end if;

  select m.id, m.user_id, m.status, m.imovel_id, m.tipo
    into v_ancora
    from public.mensagens_agendadas m
   where m.id = p_mensagem_id
     and m.user_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'ancora-nao-encontrada');
  end if;
  if v_ancora.status <> 'processando' then
    return jsonb_build_object('ok', false, 'motivo', 'ancora-nao-processando', 'status', v_ancora.status);
  end if;
  if v_ancora.tipo <> 'verificacao-disponibilidade' then
    return jsonb_build_object('ok', false, 'motivo', 'ancora-nao-verificacao');
  end if;
  -- A lista diz por quais imóveis se perguntou: começa pelo da âncora e só
  -- contém imóveis desta conta.
  if v_ancora.imovel_id is null or p_imoveis_consultados[1] <> v_ancora.imovel_id then
    return jsonb_build_object('ok', false, 'motivo', 'imoveis-consultados-incoerentes');
  end if;
  if exists (
    select 1 from unnest(p_imoveis_consultados) as c(id)
     where not exists (select 1 from public.imoveis i where i.id = c.id and i.user_id = p_user_id)
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'imovel-de-outra-conta');
  end if;

  with fechadas as (
    update public.mensagens_agendadas m
       set status = 'cancelada',
           cancelamento_motivo = 'contato-consolidado',
           cancelamento_origem = 'worker',
           cancelada_em = p_enviado_em,
           consolidada_em_mensagem_id = p_mensagem_id,
           reservada_para_mensagem_id = null,
           updated_at = p_enviado_em
     where m.user_id = p_user_id
       and m.reservada_para_mensagem_id = p_mensagem_id
       and m.status = 'processando'
       and m.tipo = 'verificacao-disponibilidade'
    returning m.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_absorvidas from fechadas;

  -- `registrar_nota_imovel` resolve `imoveis` pelo search_path: o da
  -- transação passa a `public, pg_temp` só para estas chamadas (transação
  -- local; a função restaura o seu ao sair).
  perform pg_catalog.set_config('search_path', 'public, pg_temp', true);
  for v_nota in select value from jsonb_array_elements(coalesce(p_notas, '[]'::jsonb)) loop
    begin
      v_imovel := nullif(v_nota->>'imovel_id', '')::uuid;
      if v_imovel is null or not (v_imovel = any (p_imoveis_consultados)) then
        raise exception 'Nota fora dos imóveis consultados.' using errcode = '22023';
      end if;
      if public.registrar_nota_imovel(v_imovel, p_user_id, v_nota->'nota') then
        v_notas_gravadas := v_notas_gravadas + 1;
      end if;
    exception when others then
      v_notas_falhas := v_notas_falhas || jsonb_build_object('imovel_id', v_nota->>'imovel_id', 'erro', sqlstate);
    end;
  end loop;
  perform pg_catalog.set_config('search_path', '', true);

  update public.mensagens_agendadas m
     set status = 'enviada',
         enviado_em = p_enviado_em,
         mensagem = p_texto,
         imoveis_consultados = p_imoveis_consultados,
         erro = null,
         updated_at = p_enviado_em
   where m.id = p_mensagem_id
     and m.user_id = p_user_id
     and m.status = 'processando';

  return jsonb_build_object(
    'ok', true,
    'absorvidas', to_jsonb(v_absorvidas),
    'absorvidas_total', cardinality(v_absorvidas),
    'notas_gravadas', v_notas_gravadas,
    'notas_falhas', v_notas_falhas
  );
end;
$$;

revoke all on function public.efetivar_consolidacao_contato(uuid, uuid, text, uuid[], jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.efetivar_consolidacao_contato(uuid, uuid, text, uuid[], jsonb, timestamptz)
  to service_role;

-- ------------------------------------------------------------
-- 7. Varredura de órfãs distingue reserva de consolidação de claim
-- ------------------------------------------------------------
-- Mesmo claim de 20260913143812, com um ramo a mais antes do genérico: a
-- reserva órfã não é um envio individual comum. (O schema canônico mantém
-- a definição no lugar de sempre.)
create or replace function public.claim_mensagens_agendadas(p_limite integer default 20)
returns setof public.mensagens_agendadas
language sql
security definer
set search_path = public, pg_temp
as $$
  -- Uma indisponibilidade nunca pode transformar uma mensagem de ontem em
  -- um disparo surpresa hoje. Antes de obter o lote, vence o que perdeu a
  -- janela operacional. Dez minutos cobrem atraso do scheduler/deploy sem
  -- fingir que uma mensagem antiga ainda saiu no horario combinado.
  with expiradas as (
    update mensagens_agendadas
       set status = 'erro', erro = 'janela-expirada', updated_at = now()
     where status = 'agendada'
       and data_envio < now() - interval '10 minutes'
    returning id
  ),
  -- Reserva de consolidação órfã (M3): candidata reservada por um worker que
  -- morreu entre reservar, enviar a mensagem única e efetivar. Não é um envio
  -- individual: o texto único pode ter saído com a âncora, então não volta à
  -- fila; e não há prova de contato, então não vira `contato-consolidado`.
  -- Vira erro com semântica própria e o vínculo com a âncora fica.
  reservas_interrompidas as (
    update mensagens_agendadas
       set status = 'erro', erro = 'consolidacao-interrompida', updated_at = now()
     where status = 'processando'
       and reservada_para_mensagem_id is not null
       and updated_at < now() - interval '10 minutes'
    returning id
  ),
  -- Linha reclamada por um worker que nao concluiu (resposta do claim
  -- perdida, funcao encerrada). Dez minutos apos o claim ele ja morreu;
  -- vira erro, nunca volta a fila: o envio pode ter saido antes.
  interrompidas as (
    update mensagens_agendadas
       set status = 'erro', erro = 'processamento-interrompido', updated_at = now()
     where status = 'processando'
       and reservada_para_mensagem_id is null
       and updated_at < now() - interval '10 minutes'
    returning id
  ),
  candidatas as (
    select id
      from mensagens_agendadas
     where status = 'agendada'
       and data_envio >= now() - interval '10 minutes'
       and data_envio <= now()
     order by data_envio, id
     for update skip locked
     limit greatest(1, least(coalesce(p_limite, 20), 100))
  )
  update mensagens_agendadas m
     set status = 'processando', updated_at = now(), erro = null
    from candidatas c
   where m.id = c.id
  returning m.*;
$$;

revoke all on function public.claim_mensagens_agendadas(integer) from public, anon, authenticated;
grant execute on function public.claim_mensagens_agendadas(integer) to service_role;
