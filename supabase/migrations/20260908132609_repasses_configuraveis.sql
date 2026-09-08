-- Políticas configuráveis, ocorrências de locação e repasses previstos.
-- O tenant do Angario continua sendo `user_id`: hoje uma conta representa
-- uma imobiliária/carteira. Não há backfill dos campos financeiros legados.

create or replace function private.dias_vencimento_validos(p_dias smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select count(*) = count(distinct dia) and bool_and(dia between 1 and 31)
      from unnest(p_dias) as u(dia)
  ), true);
$$;

create table public.politicas_repasse (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  descricao text,
  evento_origem text not null default 'locacao'
    check (evento_origem in ('locacao', 'primeiro_aluguel_pago', 'contrato_assinado', 'manual')),
  regra_primeiro_vencimento text not null default 'mes_seguinte'
    check (regra_primeiro_vencimento in ('mes_seguinte', 'proximo_vencimento', 'informado_manualmente')),
  dias_vencimento smallint[] not null default '{}'::smallint[],
  tipo_prazo text not null default 'apos_primeiro_vencimento'
    check (tipo_prazo in ('apos_primeiro_vencimento', 'apos_locacao', 'apos_recebimento', 'manual')),
  quantidade_dias smallint,
  tipo_contagem text not null default 'corridos'
    check (tipo_contagem in ('corridos', 'uteis')),
  ajuste_fim_semana text not null default 'manter'
    check (ajuste_fim_semana in ('manter', 'proximo_dia_util', 'dia_util_anterior')),
  -- Sem calendário confiável, o MVP só executa `manter`. A enumeração já
  -- preserva o contrato para uma futura fonte de feriados, sem fingir suporte.
  ajuste_feriado text not null default 'manter'
    check (ajuste_feriado in ('manter', 'proximo_dia_util', 'dia_util_anterior')),
  ajuste_dia_inexistente text not null default 'ultimo_dia_mes'
    check (ajuste_dia_inexistente = 'ultimo_dia_mes'),
  ativo boolean not null default true,
  padrao boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    regra_primeiro_vencimento = 'informado_manualmente'
    or cardinality(dias_vencimento) > 0
  ),
  check (
    tipo_prazo = 'manual'
    or (quantidade_dias is not null and quantidade_dias between 0 and 365)
  ),
  check (private.dias_vencimento_validos(dias_vencimento))
);

create unique index politicas_repasse_padrao_ativa_uidx
  on public.politicas_repasse(user_id)
  where ativo and padrao;
create index politicas_repasse_user_idx
  on public.politicas_repasse(user_id, ativo, nome);

create trigger trg_politicas_repasse_updated_at
  before update on public.politicas_repasse
  for each row execute function public.set_updated_at();

create table public.locacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  politica_id uuid references public.politicas_repasse(id) on delete restrict,
  operacao_id uuid not null,
  numero_ciclo integer not null check (numero_ciclo > 0),
  data_locacao date not null,
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  primeiro_vencimento date not null,
  origem text not null default 'usuario' check (origem in ('usuario', 'sophia', 'manual')),
  evento_origem_chave text,
  criado_por uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, operacao_id, imovel_id),
  unique (user_id, imovel_id, numero_ciclo)
);

create unique index locacoes_evento_origem_uidx
  on public.locacoes(user_id, evento_origem_chave)
  where evento_origem_chave is not null;
create index locacoes_imovel_idx
  on public.locacoes(user_id, imovel_id, numero_ciclo desc);

create table public.repasses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  locacao_id uuid not null unique references public.locacoes(id) on delete cascade,
  politica_id uuid references public.politicas_repasse(id) on delete restrict,
  primeiro_vencimento date not null,
  data_prevista date not null,
  status text not null default 'pendente' check (status in ('pendente', 'recebido', 'cancelado')),
  valor_previsto numeric check (valor_previsto is null or valor_previsto >= 0),
  data_recebimento date,
  valor_recebido numeric check (valor_recebido is null or valor_recebido >= 0),
  recebido_por uuid references auth.users(id) on delete restrict,
  recebido_em timestamptz,
  recebimento_operacao_id uuid,
  politica_snapshot jsonb not null check (jsonb_typeof(politica_snapshot) = 'object'),
  criado_por uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (status = 'recebido' and data_recebimento is not null and recebido_por is not null and recebido_em is not null)
    or (status <> 'recebido' and data_recebimento is null and recebido_por is null and recebido_em is null)
  )
);

create index repasses_pendentes_idx
  on public.repasses(user_id, data_prevista, id)
  where status = 'pendente';
create index repasses_imovel_idx
  on public.repasses(user_id, imovel_id, created_at desc);
create index repasses_recebimento_operacao_idx
  on public.repasses(user_id, recebimento_operacao_id)
  where recebimento_operacao_id is not null;

-- Defesa adicional para escritas privilegiadas ou futuras integrações: os
-- FKs simples garantem existência, e estes gatilhos garantem que todas as
-- pontas da relação pertencem ao mesmo tenant.
create or replace function private.validar_tenant_locacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.imoveis i where i.id = new.imovel_id and i.user_id = new.user_id
  ) then
    raise exception 'O imóvel não pertence à imobiliária da locação.' using errcode = '42501';
  end if;
  if new.politica_id is not null and not exists (
    select 1 from public.politicas_repasse p where p.id = new.politica_id and p.user_id = new.user_id
  ) then
    raise exception 'A política não pertence à imobiliária da locação.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_locacoes_tenant
  before insert or update on public.locacoes
  for each row execute function private.validar_tenant_locacao();

create or replace function private.validar_tenant_repasse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.locacoes l
     where l.id = new.locacao_id and l.user_id = new.user_id and l.imovel_id = new.imovel_id
  ) then
    raise exception 'A locação não pertence à imobiliária e ao imóvel do repasse.' using errcode = '42501';
  end if;
  if new.politica_id is not null and not exists (
    select 1 from public.politicas_repasse p where p.id = new.politica_id and p.user_id = new.user_id
  ) then
    raise exception 'A política não pertence à imobiliária do repasse.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_repasses_tenant
  before insert or update on public.repasses
  for each row execute function private.validar_tenant_repasse();

alter table public.politicas_repasse enable row level security;
alter table public.locacoes enable row level security;
alter table public.repasses enable row level security;

create policy "select_own_politicas_repasse" on public.politicas_repasse
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "insert_own_politicas_repasse" on public.politicas_repasse
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "update_own_politicas_repasse" on public.politicas_repasse
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "select_own_locacoes" on public.locacoes
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "select_own_repasses" on public.repasses
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.politicas_repasse, public.locacoes, public.repasses
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.politicas_repasse to authenticated;
grant select on table public.locacoes, public.repasses to authenticated;
grant select, insert, update, delete on table public.politicas_repasse, public.locacoes, public.repasses
  to service_role;

create or replace function private.ler_data_iso(p_valor text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(p_valor, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  return p_valor::date;
exception when others then
  return null;
end;
$$;

create or replace function private.adicionar_dias_uteis(p_data date, p_quantidade integer)
returns date
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_data date := p_data;
  v_restantes integer := p_quantidade;
begin
  while v_restantes > 0 loop
    v_data := v_data + 1;
    if extract(isodow from v_data) between 1 and 5 then
      v_restantes := v_restantes - 1;
    end if;
  end loop;
  return v_data;
end;
$$;

create or replace function private.ajustar_fim_semana(p_data date, p_ajuste text)
returns date
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_data date := p_data;
begin
  if p_ajuste = 'manter' then return v_data; end if;
  if p_ajuste = 'proximo_dia_util' then
    while extract(isodow from v_data) in (6, 7) loop v_data := v_data + 1; end loop;
    return v_data;
  end if;
  while extract(isodow from v_data) in (6, 7) loop v_data := v_data - 1; end loop;
  return v_data;
end;
$$;

-- Fonte única do cálculo. Os dois RPCs (prévia e persistência) passam aqui.
create or replace function private.calcular_datas_repasse(
  p_data_locacao date,
  p_politica public.politicas_repasse,
  p_dia_vencimento integer,
  p_primeiro_vencimento_manual date,
  p_data_prevista_manual date
)
returns table(primeiro_vencimento date, data_prevista date)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_mes date;
  v_ultimo_dia integer;
  v_primeiro date;
  v_base date;
  v_prevista date;
begin
  if p_politica.evento_origem <> 'locacao' then
    raise exception 'O evento de origem desta política ainda não é suportado.';
  end if;
  if p_politica.ajuste_feriado <> 'manter' then
    raise exception 'Ajuste por feriados exige um calendário confiável e ainda não está disponível.';
  end if;
  if p_politica.tipo_prazo = 'apos_recebimento' then
    raise exception 'Prazo após recebimento ainda não é suportado.';
  end if;

  if p_politica.regra_primeiro_vencimento = 'informado_manualmente' then
    if p_primeiro_vencimento_manual is null then
      raise exception 'Informe o primeiro vencimento.';
    end if;
    v_primeiro := p_primeiro_vencimento_manual;
  else
    if p_dia_vencimento is null or not (p_dia_vencimento = any(p_politica.dias_vencimento)) then
      raise exception 'Escolha um dia de vencimento permitido pela política.';
    end if;
    v_mes := date_trunc('month', p_data_locacao)::date;
    if p_politica.regra_primeiro_vencimento = 'mes_seguinte' then
      v_mes := (v_mes + interval '1 month')::date;
    end if;
    v_ultimo_dia := extract(day from (v_mes + interval '1 month - 1 day')::date)::integer;
    v_primeiro := make_date(
      extract(year from v_mes)::integer,
      extract(month from v_mes)::integer,
      least(p_dia_vencimento, v_ultimo_dia)
    );
    if p_politica.regra_primeiro_vencimento = 'proximo_vencimento' and v_primeiro < p_data_locacao then
      v_mes := (v_mes + interval '1 month')::date;
      v_ultimo_dia := extract(day from (v_mes + interval '1 month - 1 day')::date)::integer;
      v_primeiro := make_date(
        extract(year from v_mes)::integer,
        extract(month from v_mes)::integer,
        least(p_dia_vencimento, v_ultimo_dia)
      );
    end if;
  end if;

  if p_politica.tipo_prazo = 'manual' then
    if p_data_prevista_manual is null then raise exception 'Informe a previsão do repasse.'; end if;
    v_prevista := p_data_prevista_manual;
  else
    v_base := case p_politica.tipo_prazo
      when 'apos_locacao' then p_data_locacao
      else v_primeiro
    end;
    v_prevista := case p_politica.tipo_contagem
      when 'uteis' then private.adicionar_dias_uteis(v_base, p_politica.quantidade_dias)
      else v_base + p_politica.quantidade_dias
    end;
    v_prevista := private.ajustar_fim_semana(v_prevista, p_politica.ajuste_fim_semana);
  end if;

  return query select v_primeiro, v_prevista;
end;
$$;

create or replace function private.prever_locacoes(
  p_user_id uuid,
  p_politica_id uuid,
  p_itens jsonb,
  p_validar_status boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_politica public.politicas_repasse;
  v_item jsonb;
  v_imovel public.imoveis;
  v_id uuid;
  v_data date;
  v_dia integer;
  v_primeiro_manual date;
  v_prevista_manual date;
  v_datas record;
  v_itens jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_vistos uuid[] := '{}'::uuid[];
begin
  select * into v_politica
    from public.politicas_repasse p
   where p.id = p_politica_id and p.user_id = p_user_id and p.ativo;
  if not found then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'politica_indisponivel', 'mensagem', 'A política de repasse não foi encontrada ou está inativa.'
    )));
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'lote_vazio', 'mensagem', 'Selecione ao menos um imóvel.'
    )));
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    begin
      v_id := nullif(v_item->>'imovel_id', '')::uuid;
    exception when others then
      v_id := null;
    end;
    if v_id is null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'codigo', 'imovel_invalido', 'mensagem', 'Um item do lote possui imóvel inválido.'
      ));
      continue;
    end if;
    if v_id = any(v_vistos) then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'codigo', 'imovel_repetido', 'mensagem', 'O mesmo imóvel aparece mais de uma vez no lote.'
      ));
      continue;
    end if;
    v_vistos := array_append(v_vistos, v_id);

    select * into v_imovel from public.imoveis i
     where i.id = v_id and i.user_id = p_user_id;
    if not found then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'codigo', 'imovel_indisponivel', 'mensagem', 'Imóvel não encontrado nesta imobiliária.'
      ));
      continue;
    end if;
    if p_validar_status and v_imovel.status = 'Locado' then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'locacao_ativa', 'mensagem', 'Já possui uma locação ativa.'
      ));
      continue;
    end if;
    if p_validar_status and v_imovel.retirado then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'imovel_retirado',
        'mensagem', 'O imóvel foi retirado da carteira e não pode gerar uma locação da imobiliária.'
      ));
      continue;
    end if;

    v_data := private.ler_data_iso(v_item->>'data_locacao');
    v_primeiro_manual := private.ler_data_iso(v_item->>'primeiro_vencimento');
    v_prevista_manual := private.ler_data_iso(v_item->>'data_prevista');
    begin
      v_dia := nullif(v_item->>'dia_vencimento', '')::integer;
    exception when others then
      v_dia := null;
    end;
    if v_data is null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'data_locacao_invalida', 'mensagem', 'Informe uma data de locação válida.'
      ));
      continue;
    end if;

    begin
      select * into v_datas from private.calcular_datas_repasse(
        v_data, v_politica, v_dia, v_primeiro_manual, v_prevista_manual
      );
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_imovel.id,
        'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), nullif(trim(v_imovel.referencia_crm), ''), v_imovel.endereco),
        'endereco', v_imovel.endereco,
        'data_locacao', v_data,
        'dia_vencimento', v_dia,
        'primeiro_vencimento', v_datas.primeiro_vencimento,
        'data_prevista', v_datas.data_prevista
      ));
    exception when others then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'dados_invalidos', 'mensagem', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_erros) = 0,
    'politica', jsonb_build_object('id', v_politica.id, 'nome', v_politica.nome),
    'itens', v_itens,
    'erros', v_erros
  );
end;
$$;

create or replace function public.prever_repasses_locacao(p_politica_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Sessão inválida.' using errcode = '42501'; end if;
  return private.prever_locacoes(v_user, p_politica_id, p_itens, true);
end;
$$;

create or replace function public.locar_imoveis_em_lote(
  p_operacao_id uuid,
  p_politica_id uuid,
  p_itens jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_previa jsonb;
  v_item jsonb;
  v_locacao_id uuid;
  v_repasse_id uuid;
  v_numero integer;
  v_snapshot jsonb;
  v_politica public.politicas_repasse;
  v_resultados jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Sessão inválida.' using errcode = '42501'; end if;
  if p_operacao_id is null then raise exception 'Identificador da operação é obrigatório.'; end if;

  -- Duas confirmações simultâneas com a mesma chave esperam uma pela outra.
  -- Assim o retry só observa a transação concluída, inclusive entre políticas.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('locar:' || v_user::text || ':' || p_operacao_id::text, 0)
  );

  -- Retry da mesma confirmação devolve o lote já persistido, sem nova escrita.
  if exists (select 1 from public.locacoes l where l.user_id = v_user and l.operacao_id = p_operacao_id) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'imovel_id', l.imovel_id, 'locacao_id', l.id, 'repasse_id', r.id,
      'primeiro_vencimento', r.primeiro_vencimento, 'data_prevista', r.data_prevista
    ) order by l.created_at, l.id), '[]'::jsonb)
      into v_resultados
      from public.locacoes l join public.repasses r on r.locacao_id = l.id
     where l.user_id = v_user and l.operacao_id = p_operacao_id;
    return jsonb_build_object('ok', true, 'repetida', true, 'itens', v_resultados);
  end if;

  select * into v_politica from public.politicas_repasse p
   where p.id = p_politica_id and p.user_id = v_user and p.ativo
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'politica_indisponivel', 'mensagem', 'A política de repasse não foi encontrada ou está inativa.'
    )));
  end if;

  -- Ordem estável evita deadlock quando dois lotes compartilham imóveis.
  perform 1 from public.imoveis i
   where i.user_id = v_user
     and i.id in (
       select (value->>'imovel_id')::uuid from jsonb_array_elements(p_itens)
       where coalesce(value->>'imovel_id', '') ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     )
   order by i.id for update;

  v_previa := private.prever_locacoes(v_user, p_politica_id, p_itens, true);
  if not coalesce((v_previa->>'ok')::boolean, false) then return v_previa; end if;

  for v_item in select value from jsonb_array_elements(v_previa->'itens') loop
    select coalesce(max(l.numero_ciclo), 0) + 1 into v_numero
      from public.locacoes l
     where l.user_id = v_user and l.imovel_id = (v_item->>'imovel_id')::uuid;

    v_locacao_id := pg_catalog.gen_random_uuid();
    v_repasse_id := pg_catalog.gen_random_uuid();
    v_snapshot := jsonb_build_object(
      'politica_id', v_politica.id,
      'politica_nome', v_politica.nome,
      'evento_origem', v_politica.evento_origem,
      'regra_primeiro_vencimento', v_politica.regra_primeiro_vencimento,
      'dia_vencimento', nullif(v_item->>'dia_vencimento', '')::integer,
      'tipo_prazo', v_politica.tipo_prazo,
      'quantidade_dias', v_politica.quantidade_dias,
      'tipo_contagem', v_politica.tipo_contagem,
      'ajuste_fim_semana', v_politica.ajuste_fim_semana,
      'ajuste_feriado', v_politica.ajuste_feriado,
      'ajuste_dia_inexistente', v_politica.ajuste_dia_inexistente
    );

    insert into public.locacoes (
      id, user_id, imovel_id, politica_id, operacao_id, numero_ciclo,
      data_locacao, dia_vencimento, primeiro_vencimento, origem, criado_por
    ) values (
      v_locacao_id, v_user, (v_item->>'imovel_id')::uuid, v_politica.id,
      p_operacao_id, v_numero, (v_item->>'data_locacao')::date,
      nullif(v_item->>'dia_vencimento', '')::smallint,
      (v_item->>'primeiro_vencimento')::date, 'usuario', v_user
    );
    insert into public.repasses (
      id, user_id, imovel_id, locacao_id, politica_id, primeiro_vencimento,
      data_prevista, status, politica_snapshot, criado_por
    ) values (
      v_repasse_id, v_user, (v_item->>'imovel_id')::uuid, v_locacao_id,
      v_politica.id, (v_item->>'primeiro_vencimento')::date,
      (v_item->>'data_prevista')::date, 'pendente', v_snapshot, v_user
    );
    update public.imoveis
       set status = 'Locado', locado_em = (v_item->>'data_locacao')::date
     where id = (v_item->>'imovel_id')::uuid and user_id = v_user;

    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'imovel_id', (v_item->>'imovel_id')::uuid,
      'locacao_id', v_locacao_id,
      'repasse_id', v_repasse_id,
      'primeiro_vencimento', v_item->>'primeiro_vencimento',
      'data_prevista', v_item->>'data_prevista'
    ));
  end loop;

  delete from public.agenda a
   where a.user_id = v_user and a.is_verificacao_disponibilidade and not a.done
     and a.imovel_id in (select (value->>'imovel_id')::uuid from jsonb_array_elements(v_previa->'itens'));

  return jsonb_build_object(
    'ok', true, 'repetida', false, 'politica', v_previa->'politica',
    'total_imoveis', jsonb_array_length(v_resultados),
    'total_repasses', jsonb_array_length(v_resultados), 'itens', v_resultados
  );
end;
$$;

create or replace function public.receber_repasses_em_lote(
  p_operacao_id uuid,
  p_repasse_ids uuid[],
  p_data_recebimento date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_total integer;
  v_invalidos jsonb;
  v_resultados jsonb;
begin
  if v_user is null then raise exception 'Sessão inválida.' using errcode = '42501'; end if;
  if p_operacao_id is null or p_data_recebimento is null or coalesce(cardinality(p_repasse_ids), 0) = 0 then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'dados_invalidos', 'mensagem', 'Selecione repasses e informe a data de recebimento.'
    )));
  end if;
  if cardinality(p_repasse_ids) <> (select count(distinct id) from unnest(p_repasse_ids) as u(id)) then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'repasse_repetido', 'mensagem', 'O mesmo repasse aparece mais de uma vez no lote.'
    )));
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('receber:' || v_user::text || ':' || p_operacao_id::text, 0)
  );

  perform 1 from public.repasses r
   where r.user_id = v_user and r.id = any(p_repasse_ids)
   order by r.id for update;

  select count(*) into v_total from public.repasses r
   where r.user_id = v_user and r.id = any(p_repasse_ids);
  if v_total <> cardinality(p_repasse_ids) then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'repasse_indisponivel', 'mensagem', 'Um ou mais repasses não pertencem a esta imobiliária ou não existem.'
    )));
  end if;

  if (select count(*) from public.repasses r
       where r.user_id = v_user and r.id = any(p_repasse_ids)
         and r.recebimento_operacao_id = p_operacao_id) = cardinality(p_repasse_ids)
     and (select count(*) from public.repasses r
           where r.user_id = v_user and r.recebimento_operacao_id = p_operacao_id) = cardinality(p_repasse_ids) then
    select coalesce(jsonb_agg(jsonb_build_object('repasse_id', r.id, 'imovel_id', r.imovel_id)), '[]'::jsonb)
      into v_resultados from public.repasses r
     where r.user_id = v_user and r.id = any(p_repasse_ids);
    return jsonb_build_object('ok', true, 'repetida', true, 'itens', v_resultados);
  end if;
  if exists (
    select 1 from public.repasses r
     where r.user_id = v_user and r.recebimento_operacao_id = p_operacao_id
  ) then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'operacao_reutilizada',
      'mensagem', 'Esta confirmação já foi usada com outro conjunto de repasses.'
    )));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'repasse_id', r.id, 'codigo', 'estado_incompativel',
    'mensagem', 'O repasse já foi recebido ou cancelado.'
  )), '[]'::jsonb)
    into v_invalidos
    from public.repasses r
   where r.user_id = v_user and r.id = any(p_repasse_ids) and r.status <> 'pendente';
  if jsonb_array_length(v_invalidos) > 0 then
    return jsonb_build_object('ok', false, 'erros', v_invalidos);
  end if;

  update public.repasses r
     set status = 'recebido', data_recebimento = p_data_recebimento,
         recebido_por = v_user, recebido_em = now(), recebimento_operacao_id = p_operacao_id
   where r.user_id = v_user and r.id = any(p_repasse_ids);

  -- Compatibilidade: dashboards e integração antigos ainda leem o último fato
  -- financeiro do imóvel. Nenhum valor é inventado neste caminho.
  update public.imoveis i
     set comissao_recebida = true,
         comissao_recebida_data = recebido.ultima_data
    from (
      select r.imovel_id, max(r.data_recebimento) as ultima_data
        from public.repasses r
       where r.user_id = v_user and r.status = 'recebido'
         and r.imovel_id in (
           select selecionado.imovel_id from public.repasses selecionado
            where selecionado.user_id = v_user and selecionado.id = any(p_repasse_ids)
         )
       group by r.imovel_id
    ) recebido
   where i.user_id = v_user and i.id = recebido.imovel_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'repasse_id', r.id, 'imovel_id', r.imovel_id,
    'data_recebimento', r.data_recebimento
  ) order by r.id), '[]'::jsonb)
    into v_resultados from public.repasses r
   where r.user_id = v_user and r.id = any(p_repasse_ids);
  return jsonb_build_object(
    'ok', true, 'repetida', false, 'total_recebidos', cardinality(p_repasse_ids), 'itens', v_resultados
  );
end;
$$;

-- O snapshot e as datas previstas são fatos históricos; só os campos do
-- recebimento podem mudar depois da criação.
create or replace function private.proteger_snapshot_repasse()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.imovel_id is distinct from old.imovel_id
     or new.locacao_id is distinct from old.locacao_id
     or new.politica_id is distinct from old.politica_id
     or new.primeiro_vencimento is distinct from old.primeiro_vencimento
     or new.data_prevista is distinct from old.data_prevista
     or new.valor_previsto is distinct from old.valor_previsto
     or new.politica_snapshot is distinct from old.politica_snapshot
     or new.criado_por is distinct from old.criado_por
     or new.created_at is distinct from old.created_at then
    raise exception 'A regra e a previsão de um repasse existente são imutáveis.';
  end if;
  return new;
end;
$$;

create trigger trg_repasses_snapshot_immutavel
  before update on public.repasses
  for each row execute function private.proteger_snapshot_repasse();

revoke all on function private.ler_data_iso(text) from public, anon, authenticated;
revoke all on function private.dias_vencimento_validos(smallint[]) from public, anon, authenticated;
-- A CHECK de politicas_repasse executa esta função no contexto de quem
-- grava a linha. Sem este EXECUTE, o próprio INSERT permitido pela RLS
-- falha com 42501 antes de validar os dias. O schema private segue sem
-- USAGE para esses papéis, portanto a função não vira uma RPC exposta.
grant execute on function private.dias_vencimento_validos(smallint[]) to authenticated, service_role;
revoke all on function private.adicionar_dias_uteis(date, integer) from public, anon, authenticated;
revoke all on function private.ajustar_fim_semana(date, text) from public, anon, authenticated;
revoke all on function private.calcular_datas_repasse(date, public.politicas_repasse, integer, date, date)
  from public, anon, authenticated;
revoke all on function private.prever_locacoes(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function private.proteger_snapshot_repasse() from public, anon, authenticated;
revoke all on function private.validar_tenant_locacao() from public, anon, authenticated;
revoke all on function private.validar_tenant_repasse() from public, anon, authenticated;

revoke all on function public.prever_repasses_locacao(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.locar_imoveis_em_lote(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.receber_repasses_em_lote(uuid, uuid[], date) from public, anon, authenticated, service_role;
grant execute on function public.prever_repasses_locacao(uuid, jsonb) to authenticated;
grant execute on function public.locar_imoveis_em_lote(uuid, uuid, jsonb) to authenticated;
grant execute on function public.receber_repasses_em_lote(uuid, uuid[], date) to authenticated;
