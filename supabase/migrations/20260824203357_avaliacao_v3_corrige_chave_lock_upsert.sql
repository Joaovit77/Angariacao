-- Uma única transação escolhe a identidade existente e a atualiza. A função
-- é invoker: a RLS e os privilégios do chamador continuam valendo, e o user_id
-- autenticado nunca é aceito do corpo da requisição.
create or replace function registrar_comparavel_mercado(p_dados jsonb)
returns table (id uuid, criado boolean, precisa_embedding boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_criado boolean := false;
  v_precisa_embedding boolean := true;
  v_url_canonica text := nullif(trim(p_dados->>'url_canonica'), '');
  v_fingerprint text := nullif(trim(p_dados->>'anuncio_fingerprint'), '');
  v_fingerprint_forte boolean := coalesce((p_dados->>'fingerprint_forte')::boolean, false);
  v_observado_em timestamptz := coalesce((p_dados->>'observado_em')::timestamptz, now());
  v_embedding_hash text := nullif(p_dados->>'embedding_hash', '');
  v_embedding_modelo text := nullif(p_dados->>'embedding_modelo', '');
  v_embedding_dimensoes smallint := (p_dados->>'embedding_dimensoes')::smallint;
begin
  if v_user_id is null and current_user = 'service_role' then
    v_user_id := nullif(p_dados->>'user_id', '')::uuid;
  end if;
  if v_user_id is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_user_id::text || '|' || coalesce(
      v_fingerprint,
      v_url_canonica,
      (p_dados->>'portal') || ':' || (p_dados->>'id_externo')
    ),
    0
  ));

  select
    c.id,
    c.embedding is null
      or c.embedding_hash is distinct from v_embedding_hash
      or c.embedding_modelo is distinct from v_embedding_modelo
      or c.embedding_dimensoes is distinct from v_embedding_dimensoes
  into v_id, v_precisa_embedding
  from public.comparaveis_mercado c
  where c.user_id = v_user_id
    and (
      (c.portal = p_dados->>'portal' and c.id_externo = p_dados->>'id_externo')
      or (v_url_canonica is not null and c.url_canonica = v_url_canonica)
      or (
        v_fingerprint_forte and c.fingerprint_forte and v_fingerprint is not null
        and c.anuncio_fingerprint = v_fingerprint
      )
    )
  order by
    case
      when c.portal = p_dados->>'portal' and c.id_externo = p_dados->>'id_externo' then 0
      when v_url_canonica is not null and c.url_canonica = v_url_canonica then 1
      else 2
    end,
    c.ultimo_visto_em desc
  limit 1
  for update;

  if v_id is null then
    insert into public.comparaveis_mercado as inserido (
      user_id, portal, id_externo, url, url_canonica, anuncio_fingerprint,
      fingerprint_forte, finalidade, titulo, descricao, tipo, tipo_familia,
      endereco, endereco_chave, logradouro, numero, bairro, cidade, estado,
      cidade_chave, bairro_chave, area_m2, area_privativa_m2, area_total_m2,
      area_terreno_m2, quartos, suites, banheiros, vagas, andar, pavimentos,
      mobiliado, valor_anunciado, valor_condominio, valor_iptu, publicado_em,
      primeiro_visto_em, ultimo_visto_em, anunciante_tipo, anunciante_nome,
      status_anuncio, status_atualizado_em, embedding_texto, embedding_hash,
      embedding_modelo, embedding_dimensoes, dados_originais
    ) values (
      v_user_id, p_dados->>'portal', p_dados->>'id_externo', p_dados->>'url',
      v_url_canonica, v_fingerprint, v_fingerprint_forte,
      coalesce(p_dados->>'finalidade', 'locacao'), p_dados->>'titulo',
      nullif(p_dados->>'descricao', ''), nullif(p_dados->>'tipo', ''),
      nullif(p_dados->>'tipo_familia', ''), nullif(p_dados->>'endereco', ''),
      nullif(p_dados->>'endereco_chave', ''), nullif(p_dados->>'logradouro', ''),
      nullif(p_dados->>'numero', ''), nullif(p_dados->>'bairro', ''),
      p_dados->>'cidade', nullif(p_dados->>'estado', ''), p_dados->>'cidade_chave',
      nullif(p_dados->>'bairro_chave', ''), nullif(p_dados->>'area_m2', '')::numeric,
      nullif(p_dados->>'area_privativa_m2', '')::numeric,
      nullif(p_dados->>'area_total_m2', '')::numeric,
      nullif(p_dados->>'area_terreno_m2', '')::numeric,
      nullif(p_dados->>'quartos', '')::smallint, nullif(p_dados->>'suites', '')::smallint,
      nullif(p_dados->>'banheiros', '')::smallint, nullif(p_dados->>'vagas', '')::smallint,
      nullif(p_dados->>'andar', '')::smallint, nullif(p_dados->>'pavimentos', '')::smallint,
      nullif(p_dados->>'mobiliado', '')::boolean, (p_dados->>'valor_anunciado')::numeric,
      nullif(p_dados->>'valor_condominio', '')::numeric,
      nullif(p_dados->>'valor_iptu', '')::numeric,
      nullif(p_dados->>'publicado_em', '')::timestamptz, v_observado_em, v_observado_em,
      nullif(p_dados->>'anunciante_tipo', ''), nullif(p_dados->>'anunciante_nome', ''),
      coalesce(p_dados->>'status_anuncio', 'ativo'), v_observado_em,
      nullif(p_dados->>'embedding_texto', ''), v_embedding_hash, v_embedding_modelo,
      v_embedding_dimensoes, coalesce(p_dados->'dados_originais', '{}'::jsonb)
    )
    returning inserido.id into v_id;
    v_criado := true;
    v_precisa_embedding := true;
  else
    update public.comparaveis_mercado c
    set
      url = p_dados->>'url',
      url_canonica = coalesce(v_url_canonica, c.url_canonica),
      anuncio_fingerprint = coalesce(v_fingerprint, c.anuncio_fingerprint),
      fingerprint_forte = c.fingerprint_forte or v_fingerprint_forte,
      finalidade = coalesce(p_dados->>'finalidade', c.finalidade),
      titulo = p_dados->>'titulo',
      descricao = coalesce(nullif(p_dados->>'descricao', ''), c.descricao),
      tipo = coalesce(nullif(p_dados->>'tipo', ''), c.tipo),
      tipo_familia = coalesce(nullif(p_dados->>'tipo_familia', ''), c.tipo_familia),
      endereco = coalesce(nullif(p_dados->>'endereco', ''), c.endereco),
      endereco_chave = coalesce(nullif(p_dados->>'endereco_chave', ''), c.endereco_chave),
      logradouro = coalesce(nullif(p_dados->>'logradouro', ''), c.logradouro),
      numero = coalesce(nullif(p_dados->>'numero', ''), c.numero),
      bairro = coalesce(nullif(p_dados->>'bairro', ''), c.bairro),
      cidade = p_dados->>'cidade',
      estado = coalesce(nullif(p_dados->>'estado', ''), c.estado),
      cidade_chave = p_dados->>'cidade_chave',
      bairro_chave = coalesce(nullif(p_dados->>'bairro_chave', ''), c.bairro_chave),
      area_m2 = coalesce(nullif(p_dados->>'area_m2', '')::numeric, c.area_m2),
      area_privativa_m2 = coalesce(nullif(p_dados->>'area_privativa_m2', '')::numeric, c.area_privativa_m2),
      area_total_m2 = coalesce(nullif(p_dados->>'area_total_m2', '')::numeric, c.area_total_m2),
      area_terreno_m2 = coalesce(nullif(p_dados->>'area_terreno_m2', '')::numeric, c.area_terreno_m2),
      quartos = coalesce(nullif(p_dados->>'quartos', '')::smallint, c.quartos),
      suites = coalesce(nullif(p_dados->>'suites', '')::smallint, c.suites),
      banheiros = coalesce(nullif(p_dados->>'banheiros', '')::smallint, c.banheiros),
      vagas = coalesce(nullif(p_dados->>'vagas', '')::smallint, c.vagas),
      andar = coalesce(nullif(p_dados->>'andar', '')::smallint, c.andar),
      pavimentos = coalesce(nullif(p_dados->>'pavimentos', '')::smallint, c.pavimentos),
      mobiliado = coalesce(nullif(p_dados->>'mobiliado', '')::boolean, c.mobiliado),
      valor_anunciado = (p_dados->>'valor_anunciado')::numeric,
      valor_condominio = coalesce(nullif(p_dados->>'valor_condominio', '')::numeric, c.valor_condominio),
      valor_iptu = coalesce(nullif(p_dados->>'valor_iptu', '')::numeric, c.valor_iptu),
      publicado_em = coalesce(nullif(p_dados->>'publicado_em', '')::timestamptz, c.publicado_em),
      ultimo_visto_em = v_observado_em,
      anunciante_tipo = coalesce(nullif(p_dados->>'anunciante_tipo', ''), c.anunciante_tipo),
      anunciante_nome = coalesce(nullif(p_dados->>'anunciante_nome', ''), c.anunciante_nome),
      status_anuncio = coalesce(p_dados->>'status_anuncio', 'ativo'),
      status_atualizado_em = case
        when c.status_anuncio is distinct from coalesce(p_dados->>'status_anuncio', 'ativo')
          then v_observado_em
        else c.status_atualizado_em
      end,
      embedding_texto = nullif(p_dados->>'embedding_texto', ''),
      embedding_hash = v_embedding_hash,
      embedding_modelo = v_embedding_modelo,
      embedding_dimensoes = v_embedding_dimensoes,
      embedding = case when v_precisa_embedding then null else c.embedding end,
      embedding_gerado_em = case when v_precisa_embedding then null else c.embedding_gerado_em end,
      dados_originais = coalesce(p_dados->'dados_originais', c.dados_originais)
    where c.id = v_id and c.user_id = v_user_id;
  end if;

  return query select v_id, v_criado, v_precisa_embedding;
end;
$$;

revoke all on function registrar_comparavel_mercado(jsonb) from public;
grant execute on function registrar_comparavel_mercado(jsonb) to authenticated, service_role;
;
