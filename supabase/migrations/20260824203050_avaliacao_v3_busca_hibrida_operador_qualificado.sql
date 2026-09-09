-- Os filtros objetivos estão dentro da função, antes do ORDER BY vetorial.
-- SECURITY INVOKER + filtro explícito por auth.uid() mantém a RLS ativa.
drop function if exists buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, text, text, numeric, numeric, integer, integer, integer
);
create or replace function buscar_comparaveis_mercado_hibridos(
  p_query_embedding extensions.vector(512),
  p_embedding_modelo text,
  p_embedding_dimensoes integer,
  p_finalidade text,
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
  endereco text, bairro text, cidade text, area_m2 numeric, quartos smallint,
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
  select
    c.id, c.portal, c.id_externo, c.url, c.titulo, c.tipo, c.endereco,
    c.bairro, c.cidade, coalesce(c.area_privativa_m2, c.area_m2),
    c.quartos, c.banheiros, c.vagas, c.latitude, c.longitude,
    c.valor_anunciado, c.publicado_em, c.ultimo_visto_em, c.status_anuncio,
    greatest(-1::double precision, least(
      1::double precision,
      1 - (c.embedding OPERATOR(extensions.<=>) p_query_embedding)
    )) as similaridade_vetorial
  from public.comparaveis_mercado c
  where c.user_id = (select auth.uid())
    and c.finalidade = p_finalidade
    and c.embedding_modelo = p_embedding_modelo
    and c.embedding_dimensoes = p_embedding_dimensoes
    and c.cidade_chave = p_cidade_chave
    and c.tipo_familia = p_tipo_familia
    and coalesce(c.area_privativa_m2, c.area_m2) between p_area_min and p_area_max
    and c.quartos between p_quartos_min and p_quartos_max
    and c.embedding is not null
  order by c.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit least(greatest(p_limite, 1), 200);
$$;

revoke all on function buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, numeric, numeric, integer, integer, integer
) from public;
grant execute on function buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, numeric, numeric, integer, integer, integer
) to authenticated, service_role;

grant select, insert, update on table public.comparaveis_mercado to authenticated;
grant select, insert, update on table public.comparaveis_mercado to service_role;
;
