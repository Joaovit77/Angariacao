-- Fase 5A: domínio de mercados e fronteira geográfica UF + cidade.
-- Não agenda nem executa coletas; os campos de lease ficam inertes até a Fase 5B.

create table if not exists public.mercados_monitorados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cidade text not null check (char_length(trim(cidade)) between 1 and 100),
  estado text not null check (
    estado = upper(trim(estado))
    and estado ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'
  ),
  cidade_chave text generated always as (
    lower(translate(
      regexp_replace(normalize(trim(cidade), NFC), '[[:space:]]+', ' ', 'g'),
      'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
    ))
  ) stored not null,
  finalidade text not null default 'locacao'
    check (finalidade in ('locacao', 'venda')),
  segmento text not null default 'residencial'
    check (segmento in ('residencial', 'comercial')),
  ativo boolean not null default true,
  frequencia_dias smallint not null default 30
    check (frequencia_dias between 1 and 365),
  proxima_execucao_em timestamptz,
  ultima_tentativa_em timestamptz,
  ultimo_sucesso_em timestamptz,
  falhas_consecutivas integer not null default 0 check (falhas_consecutivas >= 0),
  ultimo_erro_codigo text check (
    ultimo_erro_codigo is null or char_length(ultimo_erro_codigo) between 1 and 120
  ),
  lease_token uuid,
  lease_expira_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mercados_monitorados_identidade_unique
    unique (user_id, estado, cidade_chave, finalidade, segmento),
  constraint mercados_monitorados_lease_coerente
    check ((lease_token is null) = (lease_expira_em is null))
);

alter table public.mercados_monitorados enable row level security;

drop trigger if exists trg_mercados_monitorados_updated_at on public.mercados_monitorados;
create trigger trg_mercados_monitorados_updated_at
  before update on public.mercados_monitorados
  for each row execute function public.set_updated_at();

drop policy if exists "select_own_mercados_monitorados" on public.mercados_monitorados;
create policy "select_own_mercados_monitorados" on public.mercados_monitorados
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_mercados_monitorados" on public.mercados_monitorados;
create policy "insert_own_mercados_monitorados" on public.mercados_monitorados
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_mercados_monitorados" on public.mercados_monitorados;
create policy "update_own_mercados_monitorados" on public.mercados_monitorados
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete_own_mercados_monitorados" on public.mercados_monitorados;
create policy "delete_own_mercados_monitorados" on public.mercados_monitorados
  for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists idx_mercados_monitorados_user_ativo
  on public.mercados_monitorados (user_id, ativo);
create index if not exists idx_mercados_monitorados_ativos_vencidos
  on public.mercados_monitorados (proxima_execucao_em)
  where ativo;

revoke all on table public.mercados_monitorados from anon, authenticated;
grant select, insert, update, delete on table public.mercados_monitorados to authenticated;
grant select, insert, update, delete on table public.mercados_monitorados to service_role;

-- A sigla presente é evidência objetiva; linhas sem estado permanecem NULL.
update public.comparaveis_mercado
set estado = upper(trim(estado))
where estado is not null
  and estado <> upper(trim(estado))
  and upper(trim(estado)) ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$';

drop index if exists public.idx_comparaveis_mercado_busca;
create index idx_comparaveis_mercado_busca
  on public.comparaveis_mercado (user_id, estado, cidade_chave, finalidade, ultimo_visto_em desc);
drop index if exists public.idx_comparaveis_mercado_bairro_tipo;
create index idx_comparaveis_mercado_bairro_tipo
  on public.comparaveis_mercado (user_id, estado, cidade_chave, bairro_chave, tipo);
drop index if exists public.idx_comparaveis_mercado_filtros_vetor;
create index idx_comparaveis_mercado_filtros_vetor
  on public.comparaveis_mercado (
    user_id, embedding_modelo, finalidade, estado, cidade_chave, tipo_familia, area_privativa_m2
  );
drop index if exists public.idx_comparaveis_mercado_catalogo_busca;
create index idx_comparaveis_mercado_catalogo_busca
  on public.comparaveis_mercado (estado, cidade_chave, finalidade, ultimo_visto_em desc);
drop index if exists public.idx_comparaveis_mercado_catalogo_bairro_tipo;
create index idx_comparaveis_mercado_catalogo_bairro_tipo
  on public.comparaveis_mercado (estado, cidade_chave, bairro_chave, tipo);

drop function if exists public.buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, numeric, numeric, integer, integer, integer
);
drop function if exists public.buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, text, numeric, numeric, integer, integer, integer
);

create function public.buscar_comparaveis_mercado_hibridos(
  p_query_embedding extensions.vector(512),
  p_embedding_modelo text,
  p_embedding_dimensoes integer,
  p_finalidade text,
  p_estado text,
  p_cidade_chave text,
  p_tipo_familia text,
  p_area_min numeric,
  p_area_max numeric,
  p_quartos_min integer,
  p_quartos_max integer,
  p_limite integer default 80
)
returns table (
  id uuid, portal text, id_externo text, url text, titulo text, tipo text,
  endereco text, bairro text, cidade text, estado text, area_m2 numeric, quartos smallint,
  banheiros smallint, vagas smallint, latitude double precision,
  longitude double precision, valor_anunciado numeric, publicado_em timestamptz,
  ultimo_visto_em timestamptz, status_anuncio text,
  similaridade_vetorial double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filtrados as (
    select distinct on (c.portal, c.id_externo) c.*
    from public.comparaveis_mercado c
    where c.finalidade = p_finalidade
      and c.embedding_modelo = p_embedding_modelo
      and c.embedding_dimensoes = p_embedding_dimensoes
      and c.estado = upper(trim(p_estado))
      and c.cidade_chave = p_cidade_chave
      and c.tipo_familia = p_tipo_familia
      and coalesce(c.area_privativa_m2, c.area_m2) between p_area_min and p_area_max
      and c.quartos between p_quartos_min and p_quartos_max
      and c.embedding is not null
    order by c.portal, c.id_externo, c.ultimo_visto_em desc
  )
  select
    c.id, c.portal, c.id_externo, c.url, c.titulo, c.tipo, c.endereco,
    c.bairro, c.cidade, c.estado, coalesce(c.area_privativa_m2, c.area_m2),
    c.quartos, c.banheiros, c.vagas, c.latitude, c.longitude,
    c.valor_anunciado, c.publicado_em, c.ultimo_visto_em, c.status_anuncio,
    greatest(-1::double precision, least(
      1::double precision,
      1 - (c.embedding operator(extensions.<=>) p_query_embedding)
    )) as similaridade_vetorial
  from filtrados c
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit least(greatest(p_limite, 1), 200);
$$;

revoke all on function public.buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, text, numeric, numeric, integer, integer, integer
) from public;
grant execute on function public.buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, text, numeric, numeric, integer, integer, integer
) to authenticated, service_role;

-- A observação append-only conserva também a fronteira estadual comprovada.
create or replace function private.registrar_observacao_comparavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento text;
begin
  if tg_op = 'INSERT' then
    v_evento := 'novo';
  elsif old.valor_anunciado is distinct from new.valor_anunciado
    and old.status_anuncio is distinct from new.status_anuncio then
    v_evento := case
      when new.status_anuncio = 'ativo' and old.status_anuncio <> 'ativo' then 'reapareceu'
      else 'preco_e_status_alterados'
    end;
  elsif old.valor_anunciado is distinct from new.valor_anunciado then
    v_evento := 'preco_alterado';
  elsif old.status_anuncio is distinct from new.status_anuncio then
    v_evento := case
      when new.status_anuncio = 'ativo' and old.status_anuncio <> 'ativo' then 'reapareceu'
      else 'status_alterado'
    end;
  elsif old.ultimo_visto_em::date < new.ultimo_visto_em::date then
    v_evento := 'reobservado';
  else
    return new;
  end if;

  insert into public.observacoes_comparaveis_mercado (
    comparavel_id, user_id, observado_em, tipo_evento, valor_anunciado,
    valor_condominio, valor_iptu, status_anuncio, dados_snapshot
  ) values (
    new.id, new.user_id, new.ultimo_visto_em, v_evento, new.valor_anunciado,
    new.valor_condominio, new.valor_iptu, new.status_anuncio,
    jsonb_build_object(
      'url', new.url, 'titulo', new.titulo, 'tipo', new.tipo,
      'endereco', new.endereco, 'bairro', new.bairro, 'cidade', new.cidade,
      'estado', new.estado,
      'areaPrivativaM2', new.area_privativa_m2, 'quartos', new.quartos,
      'banheiros', new.banheiros, 'vagas', new.vagas,
      'valorAnterior', case when tg_op = 'UPDATE' then old.valor_anunciado else null end,
      'statusAnterior', case when tg_op = 'UPDATE' then old.status_anuncio else null end
    )
  );
  return new;
end;
$$;
