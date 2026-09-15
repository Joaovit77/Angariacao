-- Garimpo em Campo — C13: memória de identidade do imóvel (V7, Fase 3 reduzida).
--
-- Duas tabelas aditivas, ligadas ao mesmo `imoveis_identificados.id`:
--   investigacoes  = UMA execução concluída do Investigador para UM imóvel
--                    identificado; evento histórico, nunca sobrescrito.
--   atributos      = afirmações estruturadas descobertas externamente, uma linha
--                    por afirmação COM a sua procedência (fonte, data, faixa);
--                    append-only; a única mutação é a confirmação humana.
--
-- O que já está estruturado (passagens, fotos, classificações, etiquetas,
-- tipo, promoção) NÃO é copiado para cá: a memória compõe tudo na leitura.
-- "Vigente" é derivado em código; não há coluna de vigência nem snapshot.
-- Ausência não gera afirmação; hipótese só vira confirmada por RPC humana.
--
-- Divisão de papéis herdada do C2: grant = autorização; CHECK = invariante de
-- linha; RPC = porta nomeada. Sem trigger novo. Sem dado pessoal: as colunas
-- de valor são numéricas ou texto curto de catálogo, e a RPC de servidor só
-- aceita atributos do catálogo fechado. A consulta digitada pela pessoa é texto
-- livre (pode carregar nome, telefone, e-mail) e por isso NÃO é gravada.

-- ============================================================
-- TABELAS
-- ============================================================
create table if not exists public.imoveis_identificados_investigacoes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_identificado_id uuid not null
    references public.imoveis_identificados(id) on delete cascade,
  origem text not null default 'investigador-web'
    constraint imoveis_identificados_investigacoes_origem_check check (
      origem in ('investigador-web')
    ),
  resultados_total integer not null default 0
    constraint imoveis_identificados_investigacoes_resultados_check check (resultados_total >= 0),
  atributos_total integer not null default 0
    constraint imoveis_identificados_investigacoes_atributos_check check (atributos_total >= 0),
  recusados_total integer not null default 0
    constraint imoveis_identificados_investigacoes_recusados_check check (recusados_total >= 0),
  concluida_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_identificados_investigacoes_imovel_concluida
  on public.imoveis_identificados_investigacoes (imovel_identificado_id, concluida_em desc);
create index if not exists idx_identificados_investigacoes_user
  on public.imoveis_identificados_investigacoes (user_id);

alter table public.imoveis_identificados_investigacoes enable row level security;

create table if not exists public.imoveis_identificados_atributos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_identificado_id uuid not null
    references public.imoveis_identificados(id) on delete cascade,
  investigacao_id uuid not null
    references public.imoveis_identificados_investigacoes(id) on delete cascade,
  atributo text not null
    constraint imoveis_identificados_atributos_catalogo_check check (
      atributo in ('area_m2', 'quartos', 'vagas', 'valor_anunciado', 'condominio', 'referencia_anuncio')
    ),
  valor_texto text
    constraint imoveis_identificados_atributos_valor_texto_check check (
      valor_texto is null or char_length(valor_texto) between 1 and 200
    ),
  valor_num numeric
    constraint imoveis_identificados_atributos_valor_num_check check (
      valor_num is null or valor_num >= 0
    ),
  origem text not null default 'investigador-web'
    constraint imoveis_identificados_atributos_origem_check check (
      origem in ('investigador-web')
    ),
  estado text not null default 'hipotese'
    constraint imoveis_identificados_atributos_estado_check check (
      estado in ('hipotese', 'confirmada')
    ),
  confianca text
    constraint imoveis_identificados_atributos_confianca_check check (
      confianca is null or confianca in ('muito-forte', 'forte', 'possivel', 'indicio')
    ),
  fonte_url text not null
    constraint imoveis_identificados_atributos_fonte_url_check check (
      char_length(fonte_url) between 8 and 2048 and fonte_url ~* '^https?://'
    ),
  fonte_dominio text not null
    constraint imoveis_identificados_atributos_fonte_dominio_check check (
      char_length(fonte_dominio) between 1 and 255
    ),
  observado_em timestamptz not null,
  confirmado_por uuid references auth.users(id) on delete cascade,
  confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  -- Exatamente um tipo de valor, e o tipo certo para o atributo.
  constraint imoveis_identificados_atributos_um_valor_check check (
    (valor_texto is null) <> (valor_num is null)
  ),
  constraint imoveis_identificados_atributos_tipo_valor_check check (
    case atributo
      when 'area_m2' then valor_num is not null
      when 'quartos' then valor_num is not null
      when 'vagas' then valor_num is not null
      when 'valor_anunciado' then valor_num is not null
      when 'condominio' then valor_texto is not null
      when 'referencia_anuncio' then valor_texto is not null
      else false
    end
  ),
  -- Hipótese não tem confirmação nenhuma; confirmada tem autor e instante.
  constraint imoveis_identificados_atributos_confirmacao_check check (
    (estado = 'confirmada' and confirmado_por is not null and confirmado_em is not null)
    or (estado = 'hipotese' and confirmado_por is null and confirmado_em is null)
  )
);

create index if not exists idx_identificados_atributos_imovel_atributo_observado
  on public.imoveis_identificados_atributos (imovel_identificado_id, atributo, observado_em desc);
create index if not exists idx_identificados_atributos_investigacao
  on public.imoveis_identificados_atributos (investigacao_id);
create index if not exists idx_identificados_atributos_user
  on public.imoveis_identificados_atributos (user_id);

alter table public.imoveis_identificados_atributos enable row level security;

-- ============================================================
-- RLS: cada usuário lê só a própria memória. Nenhuma policy de escrita para
-- o navegador: inserir é do servidor (RPC), confirmar é RPC nomeada.
-- ============================================================
drop policy if exists "select_own_imoveis_identificados_investigacoes"
  on public.imoveis_identificados_investigacoes;
create policy "select_own_imoveis_identificados_investigacoes"
  on public.imoveis_identificados_investigacoes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "select_own_imoveis_identificados_atributos"
  on public.imoveis_identificados_atributos;
create policy "select_own_imoveis_identificados_atributos"
  on public.imoveis_identificados_atributos
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
-- GRANTS: autorização é grant, não trigger (D9).
-- ============================================================
revoke all on table
  public.imoveis_identificados_investigacoes,
  public.imoveis_identificados_atributos
from public, anon, authenticated, service_role;

grant select on table
  public.imoveis_identificados_investigacoes,
  public.imoveis_identificados_atributos
to authenticated;

grant select, insert, update, delete on table
  public.imoveis_identificados_investigacoes,
  public.imoveis_identificados_atributos
to service_role;

revoke all on sequence public.imoveis_identificados_atributos_id_seq
  from public, anon, authenticated, service_role;
grant usage, select on sequence public.imoveis_identificados_atributos_id_seq
  to service_role;

-- ============================================================
-- RPC DE SERVIDOR: registra UMA execução concluída e as afirmações que ela
-- produziu, na mesma transação, e marca `ultima_investigacao_em`.
--
-- Modelo Servidor (D11): `p_user_id` vem de `auth.getUser()` na rota, nunca
-- do corpo; com JWT presente, ele tem de coincidir. Idempotente POR
-- EXECUÇÃO: o `id` da investigação é o id da execução; repetir a mesma
-- execução devolve `repetida` e não duplica nada; outra execução, mesmo com
-- os mesmos valores, é evidência temporal nova e grava de novo.
--
-- Cada item de `p_atributos`: {"atributo","valor_texto"|"valor_num",
-- "confianca","fonte_url","fonte_dominio"}. Fora do catálogo é recusado e
-- contado, não gravado. Nenhum campo livre é aceito.
-- ============================================================
create or replace function public.registrar_investigacao_identificado(
  p_user_id uuid,
  p_investigacao_id uuid,
  p_imovel_identificado_id uuid,
  p_resultados_total integer,
  p_recusados_total integer,
  p_atributos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_existente public.imoveis_identificados_investigacoes;
  v_item jsonb;
  v_atributo text;
  v_valor_texto text;
  v_valor_num numeric;
  v_confianca text;
  v_fonte_url text;
  v_fonte_dominio text;
  v_inseridos integer := 0;
  v_recusados integer := greatest(coalesce(p_recusados_total, 0), 0);
  v_agora timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário incompatível com a sessão.' using errcode = '42501';
  end if;
  if p_investigacao_id is null or p_imovel_identificado_id is null then
    raise exception 'Investigação e imóvel identificado são obrigatórios.' using errcode = '22023';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = p_user_id
   for update;
  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;
  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'situacao_incompativel');
  end if;

  -- Idempotência por execução: a mesma execução, gravada de novo, não muda nada.
  select x.* into v_existente
    from public.imoveis_identificados_investigacoes x
   where x.id = p_investigacao_id;
  if v_existente.id is not null then
    if v_existente.user_id <> p_user_id
       or v_existente.imovel_identificado_id <> p_imovel_identificado_id then
      raise exception 'Investigação pertence a outro registro.' using errcode = '42501';
    end if;
    return jsonb_build_object(
      'ok', true, 'repetida', true,
      'investigacao_id', p_investigacao_id,
      'atributos_salvos', v_existente.atributos_total,
      'atributos_recusados', v_existente.recusados_total
    );
  end if;

  insert into public.imoveis_identificados_investigacoes (
    id, user_id, imovel_identificado_id, origem, resultados_total,
    atributos_total, recusados_total, concluida_em
  ) values (
    p_investigacao_id, p_user_id, p_imovel_identificado_id, 'investigador-web',
    greatest(coalesce(p_resultados_total, 0), 0), 0, 0, v_agora
  );

  for v_item in select value from jsonb_array_elements(coalesce(p_atributos, '[]'::jsonb)) loop
    v_atributo := v_item->>'atributo';
    v_valor_texto := nullif(btrim(coalesce(v_item->>'valor_texto', '')), '');
    v_valor_num := case
      when jsonb_typeof(v_item->'valor_num') = 'number' then (v_item->>'valor_num')::numeric
      else null
    end;
    v_confianca := nullif(v_item->>'confianca', '');
    v_fonte_url := nullif(btrim(coalesce(v_item->>'fonte_url', '')), '');
    v_fonte_dominio := nullif(btrim(coalesce(v_item->>'fonte_dominio', '')), '');

    -- Catálogo fechado e forma válida; o resto é recusado e contado.
    if v_atributo is null
       or v_atributo not in ('area_m2', 'quartos', 'vagas', 'valor_anunciado', 'condominio', 'referencia_anuncio')
       or (v_atributo in ('area_m2', 'quartos', 'vagas', 'valor_anunciado') and (v_valor_num is null or v_valor_num < 0))
       or (v_atributo in ('condominio', 'referencia_anuncio') and (v_valor_texto is null or char_length(v_valor_texto) > 200))
       or v_fonte_url is null or v_fonte_url !~* '^https?://' or char_length(v_fonte_url) > 2048
       or v_fonte_dominio is null or char_length(v_fonte_dominio) > 255
       or (v_confianca is not null and v_confianca not in ('muito-forte', 'forte', 'possivel', 'indicio')) then
      v_recusados := v_recusados + 1;
      continue;
    end if;

    insert into public.imoveis_identificados_atributos (
      user_id, imovel_identificado_id, investigacao_id, atributo,
      valor_texto, valor_num, origem, estado, confianca,
      fonte_url, fonte_dominio, observado_em
    ) values (
      p_user_id, p_imovel_identificado_id, p_investigacao_id, v_atributo,
      case when v_atributo in ('condominio', 'referencia_anuncio') then v_valor_texto else null end,
      case when v_atributo in ('area_m2', 'quartos', 'vagas', 'valor_anunciado') then v_valor_num else null end,
      'investigador-web', 'hipotese', v_confianca,
      v_fonte_url, v_fonte_dominio, v_agora
    );
    v_inseridos := v_inseridos + 1;
  end loop;

  update public.imoveis_identificados_investigacoes
     set atributos_total = v_inseridos,
         recusados_total = v_recusados
   where id = p_investigacao_id;

  -- A mesma transação marca a data da investigação (o gatilho da identidade
  -- normaliza para now(); é o mesmo instante).
  update public.imoveis_identificados
     set ultima_investigacao_em = v_agora
   where id = p_imovel_identificado_id;

  return jsonb_build_object(
    'ok', true, 'repetida', false,
    'investigacao_id', p_investigacao_id,
    'atributos_salvos', v_inseridos,
    'atributos_recusados', v_recusados
  );
end;
$$;

-- ============================================================
-- RPC DO NAVEGADOR: confirmação humana de uma hipótese. Não muda atributo,
-- valor, origem, fonte nem observado_em — só diz que um humano validou.
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

  update public.imoveis_identificados_atributos a
     set estado = 'confirmada',
         confirmado_por = v_user,
         confirmado_em = now()
   where a.id = p_atributo_id;

  return jsonb_build_object('ok', true, 'repetida', false,
    'atributo_id', p_atributo_id, 'confirmado_em', now());
end;
$$;

-- ------------------------------------------------------------
-- Permissões das RPCs: servidor só para service_role; confirmação só para
-- authenticated. Ninguém mais.
-- ------------------------------------------------------------
revoke all on function public.registrar_investigacao_identificado(uuid, uuid, uuid, integer, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.registrar_investigacao_identificado(uuid, uuid, uuid, integer, integer, jsonb)
  to service_role;

revoke all on function public.confirmar_atributo_identificado(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.confirmar_atributo_identificado(bigint)
  to authenticated;

-- ============================================================
-- MERGE: a memória do absorvido acompanha o sobrevivente. Mesma função do
-- C7b (ordem, lock, lápide, recusas e recálculo intactos); só entram dois
-- reparenteamentos no passo 4, preservando id, timestamps, fontes,
-- confirmações e histórico. `ultima_investigacao_em` do sobrevivente não é
-- tocada: a data de cada investigação vive na própria linha do evento.
-- ============================================================
create or replace function public.fundir_imoveis_identificados(
  p_sobrevivente_id uuid,
  p_absorvido_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sobrevivente public.imoveis_identificados;
  v_absorvido public.imoveis_identificados;
  v_movidos integer := 0;
  v_lapides integer := 0;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_sobrevivente_id is null or p_absorvido_id is null then
    raise exception 'Os dois registros da fusão são obrigatórios.' using errcode = '22023';
  end if;
  -- Par canônico da V7: A/B e B/A disputam o mesmo lock transacional.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user::text || '|' || least(p_sobrevivente_id::text, p_absorvido_id::text)
        || '|' || greatest(p_sobrevivente_id::text, p_absorvido_id::text),
      0
    )
  );

  select i.* into v_sobrevivente
    from public.imoveis_identificados i
   where i.id = p_sobrevivente_id and i.user_id = v_user
   for update;
  select i.* into v_absorvido
    from public.imoveis_identificados i
   where i.id = p_absorvido_id and i.user_id = v_user
   for update;

  if v_sobrevivente.id is null or v_absorvido.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if p_sobrevivente_id = p_absorvido_id then
    return jsonb_build_object('ok', false, 'codigo', 'fusao_em_si_mesmo');
  end if;

  -- Exclusão bloqueia os dois lados, inclusive uma repetição já concluída.
  if v_sobrevivente.exclusao_solicitada_em is not null
     or v_absorvido.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  -- Já fundido NESTE sobrevivente e sem exclusão pendente: idempotente.
  if v_absorvido.situacao = 'fundido'
     and v_absorvido.fundido_em_imovel_id = p_sobrevivente_id then
    return jsonb_build_object('ok', true, 'repetida', true,
      'sobrevivente_id', p_sobrevivente_id, 'absorvido_id', p_absorvido_id);
  end if;

  -- Lápide nem absorve nem é absorvida de novo; promovido/promovendo ficariam
  -- com o vínculo do Pipeline órfão. É o que torna cadeia e loop impossíveis.
  if v_sobrevivente.situacao in ('fundido', 'promovido', 'promovendo')
     or v_absorvido.situacao in ('fundido', 'promovido', 'promovendo') then
    return jsonb_build_object('ok', false, 'codigo', 'situacao_incompativel',
      'sobrevivente', v_sobrevivente.situacao, 'absorvido', v_absorvido.situacao);
  end if;

  -- 1. A lápide primeiro: é ela que autoriza o reparenteamento no gatilho.
  update public.imoveis_identificados i
     set situacao = 'fundido',
         fundido_em = now(),
         fundido_em_imovel_id = p_sobrevivente_id
   where i.id = p_absorvido_id;

  -- 2. Ponteiro canônico: quem apontava para o absorvido passa a apontar o
  --    sobrevivente. Nunca se forma cadeia A→B→C.
  update public.imoveis_identificados i
     set fundido_em_imovel_id = p_sobrevivente_id
   where i.user_id = v_user
     and i.fundido_em_imovel_id = p_absorvido_id
     and i.id <> p_absorvido_id;
  get diagnostics v_lapides = row_count;

  -- 3. Histórico muda de pai preservando `id`, `observado_em` e revisão. O
  --    gatilho do C2c recalcula os dois lados a cada linha movida.
  update public.imoveis_identificados_avistamentos a
     set imovel_identificado_id = p_sobrevivente_id
   where a.imovel_identificado_id = p_absorvido_id;
  get diagnostics v_movidos = row_count;

  -- 4. O denormalizado acompanha. Caminho de Storage NÃO muda.
  update public.imoveis_identificados_fotos f
     set imovel_identificado_id = p_sobrevivente_id
   where f.imovel_identificado_id = p_absorvido_id;

  update public.imoveis_identificados_classificacoes c
     set imovel_identificado_id = p_sobrevivente_id
   where c.imovel_identificado_id = p_absorvido_id;

  update public.imoveis_identificados_etiquetas e
     set imovel_identificado_id = p_sobrevivente_id
   where e.imovel_identificado_id = p_absorvido_id;

  -- 4b. C13: a memória de identidade (investigações e afirmações) muda de
  --     pai do mesmo jeito: mesmas linhas, mesmos ids, mesmas datas, mesmas
  --     fontes e confirmações. Nada é recriado, reavaliado ou reinvestigado.
  update public.imoveis_identificados_investigacoes x
     set imovel_identificado_id = p_sobrevivente_id
   where x.imovel_identificado_id = p_absorvido_id;

  update public.imoveis_identificados_atributos t
     set imovel_identificado_id = p_sobrevivente_id
   where t.imovel_identificado_id = p_absorvido_id;

  -- 5. Recálculo explícito dos DOIS lados: determinístico mesmo quando zero
  --    avistamentos se moveram. É total, logo idempotente.
  perform private.recalcular_agregados_identificado(p_absorvido_id);
  perform private.recalcular_agregados_identificado(p_sobrevivente_id);

  -- 6. Tipo NÃO é reinferido: é decisão, não derivação. Só herda quando o
  --    sobrevivente não tinha nenhum, e aí a proveniência vem inteira.
  if v_sobrevivente.tipo is null and v_absorvido.tipo is not null then
    update public.imoveis_identificados i
       set tipo = v_absorvido.tipo,
           tipo_origem = v_absorvido.tipo_origem,
           tipo_confianca = v_absorvido.tipo_confianca,
           tipo_estado = v_absorvido.tipo_estado,
           tipo_definido_em = v_absorvido.tipo_definido_em,
           tipo_classificacao_id = v_absorvido.tipo_classificacao_id,
           tipo_avistamento_id = v_absorvido.tipo_avistamento_id,
           tipo_confirmado_por = v_absorvido.tipo_confirmado_por,
           tipo_confirmado_em = v_absorvido.tipo_confirmado_em
     where i.id = p_sobrevivente_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'repetida', false,
    'sobrevivente_id', p_sobrevivente_id,
    'absorvido_id', p_absorvido_id,
    'avistamentos_movidos', v_movidos,
    'lapides_repontuadas', v_lapides
  );
end;
$$;
