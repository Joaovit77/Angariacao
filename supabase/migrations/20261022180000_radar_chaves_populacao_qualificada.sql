-- Chaves: o total da busca reconcilia a população qualificada; IDs brutos provam progresso.
-- Não altera tabelas, RLS, marcos históricos ou as primitivas A/B. Sem backfill.
create function radar_integridade.cobertura_populacao_chaves_valida(p jsonb, anuncios jsonb, contexto jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  pagina jsonb; item jsonb; i integer:=0; n integer; total integer; ids jsonb:='[]'::jsonb;
  qualificados jsonb:='[]'::jsonb; fora jsonb:='[]'::jsonb; esperados jsonb; restantes jsonb;
  observada timestamptz; primeira timestamptz; ultima timestamptz;
begin
  if contexto->>'portal' is distinct from 'chaves-na-mao' or p->>'motivo_termino' is distinct from 'fim_comprovado'
    or jsonb_typeof(p->'paginas') is distinct from 'array' or jsonb_typeof(p->'populacao') is distinct from 'object' then return false; end if;
  total:=(p->>'total')::integer; n:=jsonb_array_length(p->'paginas');
  if total<=0 or n<1 or n>100 or p->>'paginas_lidas' is distinct from n::text
    or p->>'paginas_planejadas' is distinct from n::text then return false; end if;
  -- Todo ID bruto precisa estar representado na ingestão global apropriada.
  -- Campo ausente nunca é tratado como extra fora do universo.
  if contexto->>'bairro' is not null and exists(select 1 from jsonb_array_elements(anuncios) x
    where radar_integridade.chave_bairro(x->>'bairro') is null) then return false; end if;
  for pagina in select value from jsonb_array_elements(p->'paginas') loop
    i:=i+1;
    if pagina->>'numero' is distinct from i::text or pagina->>'total' is distinct from total::text
      or pagina->>'confiavel' is distinct from 'true' or nullif(pagina->>'aquisicao_id','') is null
      or pagina->>'proxima' is distinct from (i<n)::text or jsonb_typeof(pagina->'ids') is distinct from 'array'
      or jsonb_typeof(pagina->'ids_qualificados') is distinct from 'array'
      or jsonb_typeof(pagina->'ids_fora_universo') is distinct from 'array'
      or pagina->'ids_indeterminados' is distinct from '[]'::jsonb then return false; end if;
    if jsonb_array_length(pagina->'ids')<1 or jsonb_array_length(pagina->'ids')>50 then return false; end if;
    observada:=(pagina->>'em')::timestamptz;
    if observada is null or not pg_catalog.isfinite(observada) or observada>pg_catalog.clock_timestamp() then return false; end if;
    primeira:=least(primeira,observada); ultima:=greatest(ultima,observada);
    select coalesce(jsonb_agg(x->>'idExterno' order by x->>'idExterno'),'[]'::jsonb) into esperados
      from jsonb_array_elements(anuncios) x where (pagina->'ids') ? (x->>'idExterno')
        and (contexto->>'bairro' is null or radar_integridade.chave_bairro(x->>'bairro')=contexto->>'bairro');
    select coalesce(jsonb_agg(x order by x),'[]'::jsonb) into restantes
      from jsonb_array_elements_text(pagina->'ids') x where not esperados ? x;
    if esperados is distinct from (select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from jsonb_array_elements_text(pagina->'ids_qualificados') x)
      or restantes is distinct from (select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from jsonb_array_elements_text(pagina->'ids_fora_universo') x) then return false; end if;
    ids:=ids || (pagina->'ids'); qualificados:=qualificados || esperados; fora:=fora || restantes;
  end loop;
  if ultima-primeira>interval '20 minutes' or primeira is distinct from (p->>'em')::timestamptz then return false; end if;
  if jsonb_array_length(ids)<>(select count(distinct x) from jsonb_array_elements_text(ids) x)
    or (select jsonb_agg(x order by x) from jsonb_array_elements_text(ids) x)
      is distinct from (select jsonb_agg(x->>'idExterno' order by x->>'idExterno') from jsonb_array_elements(anuncios) x)
    or jsonb_array_length(qualificados)<>total then return false; end if;
  if p->'populacao'->>'raw_count' is distinct from jsonb_array_length(ids)::text
    or p->'populacao'->>'qualified_count' is distinct from total::text
    or p->'populacao'->>'declared_total' is distinct from total::text
    or p->'populacao'->>'out_of_scope_count' is distinct from jsonb_array_length(fora)::text
    or p->'populacao'->>'indeterminate_count' is distinct from '0' then return false; end if;
  return true;
exception when others then return false;
end;
$$;
revoke all on function radar_integridade.cobertura_populacao_chaves_valida(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function radar_integridade.cobertura_populacao_chaves_valida(jsonb,jsonb,jsonb) to service_role;

create or replace function public.registrar_coleta_radar(
  p_user_id uuid,p_busca_id uuid,p_contexto jsonb,p_aquisicao jsonb,p_anuncios jsonb,p_origem text,
  p_anuncios_base jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u public.radar_universos%rowtype; v public.radar_varreduras%rowtype;
  b public.radar_buscas%rowtype; a public.radar_anuncios_globais%rowtype;
  item jsonb; dados jsonb; payload jsonb; lista jsonb; retorno jsonb := '[]'::jsonb;
  agora timestamptz := pg_catalog.clock_timestamp(); observada timestamptz; observada_oferta timestamptz;
  id_inserido uuid; cobertura text; valida boolean; anterior boolean; repetida boolean := false;
  novo boolean; n integer; bruta integer; total integer; inseridos integer := 0;
begin
  if p_origem not in ('manual','navegador','cron') or p_origem is null then raise exception 'Origem inválida'; end if;
  if jsonb_typeof(p_contexto) is distinct from 'object' or jsonb_typeof(p_aquisicao) is distinct from 'object'
    or jsonb_typeof(p_anuncios_base) is distinct from 'array' or jsonb_array_length(p_anuncios_base)>5000
    or jsonb_typeof(p_anuncios) is distinct from 'array' or jsonb_array_length(p_anuncios)>5000 then raise exception 'Coleta inválida'; end if;
  if p_contexto ? 'bairro' and jsonb_typeof(p_contexto->'bairro') not in ('string','null') then raise exception 'Bairro inválido'; end if;
  if radar_integridade.chave_bairro(p_contexto->>'bairro') is null then
    p_contexto:=p_contexto-'bairro';
  else
    p_contexto:=jsonb_set(p_contexto,'{bairro}',to_jsonb(radar_integridade.chave_bairro(p_contexto->>'bairro')));
  end if;
  if p_contexto->>'cidade' is distinct from radar_integridade.chave(p_contexto->>'cidade')
    or nullif(p_contexto->>'cidade','') is null or p_contexto->>'versao_semantica' is distinct from '2'
    or p_contexto->>'portal' is null or p_contexto->>'finalidade' is null or p_contexto->>'tipo_recorte' is null
    or p_contexto->>'uf' is null then raise exception 'Contexto inválido'; end if;
  select * into b from public.radar_buscas where id=p_busca_id and user_id=p_user_id;
  if not found or not b.ativo or not radar_integridade.busca_no_contexto(b.filtros,p_contexto) then
    raise exception 'Busca incompatível ou indisponível' using errcode='42501';
  end if;
  observada := (p_aquisicao->>'em')::timestamptz;
  if observada is null or not pg_catalog.isfinite(observada) or observada>agora
    or nullif(p_aquisicao->>'id','') is null or nullif(p_aquisicao->>'origem','') is null then raise exception 'Proveniência inválida'; end if;
  select coalesce(jsonb_agg(x order by x->>'idExterno'),'[]'::jsonb) into lista from
    (select distinct value as x from jsonb_array_elements(p_anuncios)) s;
  n:=jsonb_array_length(lista);
  if (select count(distinct x->>'idExterno') from jsonb_array_elements(lista) x)<>n then raise exception 'Identidade com payload divergente'; end if;
  bruta:=(p_aquisicao->>'contagem_bruta')::integer;
  total:=(p_aquisicao->>'total')::integer;
  if bruta is null or bruta<n or bruta<0 then raise exception 'Contagem inválida'; end if;
  cobertura:=coalesce(p_aquisicao->>'cobertura','desconhecida');
  valida:=coalesce(cobertura='completa' and p_aquisicao->>'confiavel'='true' and total=n and n>0 and bruta=n
    and ((p_aquisicao->>'evidencia'='itemlist_total_integral_v1' and n<=50
      and p_aquisicao->>'paginas_lidas'='1' and p_aquisicao->>'paginas_planejadas'='1' and not p_aquisicao ? 'paginas')
    or (p_aquisicao->>'evidencia'='itemlist_paginado_integral_v1'
      and radar_integridade.cobertura_paginada_valida(p_aquisicao,lista))),false);
  if p_contexto->>'portal'='chaves-na-mao' and p_aquisicao->>'evidencia'='itemlist_paginado_qualificado_v1' then
    valida:=coalesce(cobertura='completa' and p_aquisicao->>'confiavel'='true' and bruta=n and n>0
      and radar_integridade.cobertura_populacao_chaves_valida(p_aquisicao,lista,p_contexto),false);
  end if;
  -- O servidor atesta a rota publicada; o SQL confere sua compatibilidade com o contexto.
  -- Esta comparação não gera URL de aquisição: o coletor usa somente rotas qualificadas.
  if p_contexto->>'bairro' is not null and not coalesce(
    p_aquisicao->>'bairro_rota_comprovada'='true'
    and p_contexto->>'portal'='chaves-na-mao'
    and p_aquisicao->>'url_universo' = ('https://www.chavesnamao.com.br/'
      || case p_contexto->>'tipo_recorte' when 'casa' then 'casas' else 'apartamentos' end
      || case p_contexto->>'finalidade' when 'locacao' then '-para-alugar/' else '-a-venda/' end
      || pg_catalog.lower(p_contexto->>'uf') || '-' || pg_catalog.replace(p_contexto->>'cidade',' ','-')
      || '/' || pg_catalog.replace(p_contexto->>'bairro',' ','-') || '/'),false) then
    valida:=false;
    if cobertura='completa' then cobertura:='desconhecida'; end if;
  end if;
  if cobertura='completa' and not valida then cobertura:='parcial'; end if;
  payload:=jsonb_build_object('contexto',p_contexto,'aquisicao',p_aquisicao,'anuncios',lista,'base_digest',pg_catalog.md5(p_anuncios_base::text));
  insert into public.radar_universos(portal,finalidade,uf,cidade,tipo_recorte,anunciante_recorte,versao_semantica,bairro)
    values(p_contexto->>'portal',p_contexto->>'finalidade',p_contexto->>'uf',p_contexto->>'cidade',p_contexto->>'tipo_recorte','todos',2,p_contexto->>'bairro')
    on conflict do nothing;
  select * into strict u from public.radar_universos where portal=p_contexto->>'portal' and finalidade=p_contexto->>'finalidade'
    and uf=p_contexto->>'uf' and cidade=p_contexto->>'cidade' and tipo_recorte=p_contexto->>'tipo_recorte'
    and anunciante_recorte='todos' and versao_semantica=2
    and bairro is not distinct from (p_contexto->>'bairro') for update;
  -- Novo contrato de cobertura não reutiliza baseline amostral das primitivas A/B.
  anterior:=exists(select 1 from public.radar_varreduras base where base.id=u.baseline_varredura_id
    and base.status='success' and base.cobertura='universo_comprovado' and base.codigo_resultado='cobertura_integral'
    and base.payload_coleta->'contexto'=p_contexto);
  if u.baseline_varredura_id is not null and not anterior then raise exception 'Baseline incompatível com o contrato de cobertura'; end if;
  select * into v from public.radar_varreduras where universo_id=u.id and chave_idempotencia=p_aquisicao->>'id';
  if found then
    if v.payload_coleta is distinct from payload or v.status='running' then raise exception 'Retry divergente ou execução incompleta'; end if;
    repetida:=true;
  else
    insert into public.radar_varreduras(universo_id,chave_idempotencia,iniciada_em,status,iniciador,cobertura,payload_coleta)
      values(u.id,p_aquisicao->>'id',observada,'running',p_origem,'desconhecida',payload) returning * into v;
    for item in select value from jsonb_array_elements(lista) loop
      if item->>'idExterno' is null or item->>'idExterno' !~ '^[0-9]{6,}$'
        or item->>'portal' is distinct from u.portal or item->>'finalidade' is distinct from u.finalidade
        or (case when radar_integridade.chave(item->>'tipoDeclarado')='sobrado' then 'casa' else item->>'tipoDeclarado' end) is distinct from u.tipo_recorte
        or item->>'estado' is distinct from u.uf or radar_integridade.chave(item->>'cidade') is distinct from u.cidade
        or item->>'url' !~ '^https://' then raise exception 'Oferta não qualificada'; end if;
      observada_oferta:=observada;
      if jsonb_typeof(p_aquisicao->'paginas')='array' then
        select coalesce(min((pagina->>'em')::timestamptz),observada) into observada_oferta
          from jsonb_array_elements(p_aquisicao->'paginas') pagina
          where pagina->>'confiavel'='true' and (pagina->'ids') ? (item->>'idExterno');
        if not pg_catalog.isfinite(observada_oferta) or observada_oferta<observada or observada_oferta>agora then
          raise exception 'Instante da página inválido';
        end if;
      end if;
      -- Allowlist de fatos objetivos. Nunca copiar payload privado ou HTML para o global.
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into dados from jsonb_each(item)
        where key=any(array['idExterno','portal','finalidade','tipo','tipoDeclarado','titulo','preco','cidade','estado','bairro','regiao','endereco','publicadoEm','imagem','url','areaM2','quartos','banheiros','vagas','anunciante']);
      insert into public.radar_anuncios_globais(portal,finalidade,id_externo,url_canonica,primeira_varredura_id,primeiro_visto_em,ultimo_visto_em,dados_objetivos)
        values(u.portal,u.finalidade,item->>'idExterno',item->>'url',v.id,observada_oferta,observada_oferta,dados)
        on conflict on constraint radar_anuncios_globais_oferta_key do update set
          url_canonica=case when excluded.ultimo_visto_em>=radar_anuncios_globais.ultimo_visto_em then excluded.url_canonica else radar_anuncios_globais.url_canonica end,
          dados_objetivos=case when excluded.ultimo_visto_em>=radar_anuncios_globais.ultimo_visto_em then excluded.dados_objetivos else radar_anuncios_globais.dados_objetivos end,
          ultimo_visto_em=greatest(radar_anuncios_globais.ultimo_visto_em,excluded.ultimo_visto_em)
        returning * into a;
      perform radar_integridade.registrar_presenca(v.id,a.id,observada_oferta,(dados->>'preco')::numeric,u.tipo_recorte,u.uf,u.cidade,item->>'url',dados);
    end loop;
    perform radar_integridade.finalizar_varredura(v.id,case when valida then 'success' else 'partial' end,agora,
      p_aquisicao->>'id',observada,p_aquisicao->>'origem','radar-cobertura-v1',case when valida then 'universo_comprovado' else 'desconhecida' end,
      case when valida then 'cobertura_integral' else 'cobertura_insuficiente' end,bruta,n,(p_aquisicao->>'paginas_lidas')::integer,(p_aquisicao->>'paginas_planejadas')::integer);
    if valida and not anterior then perform radar_integridade.formar_baseline(u.id,v.id); end if;
  end if;
  -- Ordem de locks: universo, ofertas por ID, assinaturas por UUID. Nenhuma ação privada é lida de outra assinatura.
  for b in select * from public.radar_buscas where ativo and radar_integridade.busca_no_contexto(filtros,p_contexto) order by id for update loop
    if b.universo_id is not null and b.universo_id<>u.id then
      -- Uma mudança servidora de contexto não transporta certificados privados do universo anterior.
      update public.radar_anuncios set novidade_varredura_id=null where busca_id=b.id and user_id=b.user_id;
    end if;
    for item in select value from jsonb_array_elements(lista) loop
      select * into strict a from public.radar_anuncios_globais where portal=u.portal and finalidade=u.finalidade and id_externo=item->>'idExterno';
      -- Distribui o snapshot desta aquisição, mesmo se o global já recebeu observação posterior.
      select dados_objetivos,observado_em into strict dados,observada_oferta from public.radar_presencas where varredura_id=v.id and anuncio_global_id=a.id;
      if not radar_integridade.atende_busca(item,b.filtros,observada_oferta) then continue; end if;
      novo:=not repetida and valida and anterior and a.primeira_varredura_id=v.id
        and b.universo_id=u.id and b.comparacao_desde_varredura_id is not null
        and observada_oferta>b.comparacao_desde_em and observada_oferta>u.baseline_concluido_em;
      id_inserido:=null;
      insert into public.radar_anuncios(user_id,busca_id,portal,id_externo,url,dados,visto,anuncio_global_id,novidade_varredura_id,cobertura_coleta)
        values(b.user_id,b.id,u.portal,a.id_externo,item->>'url',dados,false,a.id,case when novo then v.id else null end,cobertura)
        on conflict(busca_id,portal,id_externo) do nothing returning id into id_inserido;
      if id_inserido is null then
        -- Associa apenas uma observação atual; não importa nem promove o histórico legado.
        update public.radar_anuncios set anuncio_global_id=a.id where busca_id=b.id and user_id=b.user_id
          and portal=u.portal and id_externo=a.id_externo and anuncio_global_id is null;
      elsif novo and b.id=p_busca_id and b.user_id=p_user_id then
        inseridos:=inseridos+1;
        retorno:=retorno || (select jsonb_agg(to_jsonb(r)) from public.radar_anuncios r where r.id=id_inserido and r.user_id=p_user_id);
      end if;
    end loop;
    update public.radar_buscas set universo_id=u.id,
      comparacao_desde_varredura_id=case when universo_id is distinct from u.id then case when valida then v.id end
        when valida and comparacao_desde_varredura_id is null then v.id else comparacao_desde_varredura_id end,
      comparacao_desde_em=case when universo_id is distinct from u.id then case when valida then agora end
        when valida and comparacao_desde_em is null then agora else comparacao_desde_em end
      where id=b.id and user_id=b.user_id;
  end loop;
  select * into strict b from public.radar_buscas where id=p_busca_id and user_id=p_user_id;
  for item in select value from jsonb_array_elements(p_anuncios_base) loop
    if item->>'portal' is distinct from u.portal or item->>'finalidade' is distinct from u.finalidade
      or radar_integridade.chave(item->>'cidade') is distinct from u.cidade or pg_catalog.upper(item->>'estado') is distinct from u.uf
      or nullif(item->>'idExterno','') is null or item->>'url' is null or item->>'url' !~ '^https://'
      then raise exception 'Anúncio privado incompatível'; end if;
    if not radar_integridade.atende_busca(item,b.filtros,observada) then continue; end if;
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into dados from jsonb_each(item)
      where key=any(array['idExterno','portal','finalidade','tipo','tipoDeclarado','titulo','preco','cidade','estado','bairro','regiao','endereco','publicadoEm','imagem','url','areaM2','quartos','banheiros','vagas','anunciante']);
    insert into public.radar_anuncios(user_id,busca_id,portal,id_externo,url,dados,visto,cobertura_coleta)
      values(p_user_id,p_busca_id,u.portal,item->>'idExterno',item->>'url',dados,false,
        case when exists(select 1 from jsonb_array_elements(lista) x where x->>'idExterno'=item->>'idExterno') then cobertura else 'desconhecida' end)
      on conflict(busca_id,portal,id_externo) do nothing;
  end loop;
  update public.radar_buscas set ultimo_check=agora,ultimo_check_origem=p_origem,
    ultimo_check_automatico=case when p_origem='cron' then agora else ultimo_check_automatico end
    where id=p_busca_id and user_id=p_user_id;
  return jsonb_build_object('novos',inseridos,'anuncios',retorno,'varreduraId',v.id,
    'cobertura',case when valida then 'completa' else cobertura end,'baselineFormada',valida and not anterior,
    'anunciosColetados',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.radar_anuncios r
      where r.busca_id=p_busca_id and r.user_id=p_user_id and r.portal=u.portal and (exists(select 1 from jsonb_array_elements(lista) x where x->>'idExterno'=r.id_externo)
        or exists(select 1 from jsonb_array_elements(p_anuncios_base) x where x->>'idExterno'=r.id_externo))));
end;
$$;
