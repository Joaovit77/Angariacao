-- Radar: ponte aditiva de ingestão global e distribuição privada, sem backfill.
-- A/B permanecem imutáveis. Somente o servidor pode certificar novidade.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.radar_buscas
  add column universo_id uuid references public.radar_universos(id),
  add column comparacao_desde_varredura_id uuid references public.radar_varreduras(id),
  add column comparacao_desde_em timestamptz;
alter table public.radar_buscas add constraint radar_buscas_comparacao_par check (
  (comparacao_desde_varredura_id is null) = (comparacao_desde_em is null));
alter table public.radar_anuncios
  add column anuncio_global_id uuid references public.radar_anuncios_globais(id),
  add column novidade_varredura_id uuid references public.radar_varreduras(id),
  add column cobertura_coleta text check (cobertura_coleta in ('completa','parcial','desconhecida','truncada'));
alter table public.radar_anuncios add constraint radar_anuncios_novidade_global check (
  novidade_varredura_id is null or anuncio_global_id is not null);
create index idx_radar_buscas_universo on public.radar_buscas(universo_id);
create index idx_radar_anuncios_global on public.radar_anuncios(anuncio_global_id);

create function radar_integridade.chave(p_texto text) returns text
language sql immutable strict set search_path = '' as $$
  select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.translate(pg_catalog.btrim(p_texto),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[[:space:]]+', ' ', 'g');
$$;

-- Bairro é dimensão opcional do universo, não da identidade forte da oferta.
create function radar_integridade.chave_bairro(p_texto text) returns text
language sql immutable strict set search_path = '' as $$
  select nullif(pg_catalog.regexp_replace(radar_integridade.chave(pg_catalog.replace(p_texto,'-',' ')),
    '[̀-ͯ]', '', 'g'),'');
$$;
alter table public.radar_universos add column bairro text;
alter table public.radar_universos add constraint radar_universos_bairro_canonico check (
  bairro is null or (radar_integridade.chave_bairro(bairro) is not null
    and bairro=radar_integridade.chave_bairro(bairro) and bairro<>'' and char_length(bairro)<=120));
alter table public.radar_universos drop constraint radar_universos_identidade_key;
-- NULL significa cidade inteira; dois NULL também representam o mesmo universo.
create unique index radar_universos_identidade_key on public.radar_universos (
  portal,finalidade,uf,cidade,tipo_recorte,anunciante_recorte,versao_semantica,coalesce(bairro,''));

-- Complementa a proteção B sem substituir sua função nem enfraquecer seus invariantes.
create function radar_integridade.proteger_bairro_universo() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.bairro is distinct from old.bairro then raise exception 'Bairro do universo imutável'; end if;
  return new;
end;
$$;
create trigger radar_universos_bairro_imutavel before update on public.radar_universos
  for each row execute function radar_integridade.proteger_bairro_universo();

create function radar_integridade.busca_no_contexto(p_filtros jsonb,p_contexto jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_filtros->>'portal'=p_contexto->>'portal'
    and p_filtros->>'finalidade'=p_contexto->>'finalidade'
    and p_filtros->>'tipoRecorte'=p_contexto->>'tipo_recorte'
    and pg_catalog.upper(p_filtros->>'estado')=p_contexto->>'uf'
    and radar_integridade.chave(p_filtros->>'cidade')=p_contexto->>'cidade'
    and radar_integridade.chave_bairro(p_filtros->>'bairro') is not distinct from radar_integridade.chave_bairro(p_contexto->>'bairro'),false);
$$;

-- SECURITY INVOKER: a função pública definer escreve como postgres; o cliente não certifica fatos.
create function radar_integridade.proteger_ponte_privada() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name='radar_buscas' then
    if current_user='authenticated' then
      if tg_op='INSERT' then
        if new.universo_id is not null or new.comparacao_desde_varredura_id is not null or new.comparacao_desde_em is not null then
          raise exception 'Comparação do Radar reservada ao servidor' using errcode='42501';
        end if;
      elsif row(new.universo_id,new.comparacao_desde_varredura_id,new.comparacao_desde_em)
        is distinct from row(old.universo_id,old.comparacao_desde_varredura_id,old.comparacao_desde_em)
        or (old.universo_id is not null and row(new.filtros,new.user_id) is distinct from row(old.filtros,old.user_id)) then
        raise exception 'Contexto do Radar reservado ao servidor' using errcode='42501';
      end if;
    end if;
  else
    if not exists(select 1 from public.radar_buscas b where b.id=new.busca_id and b.user_id=new.user_id) then
      raise exception 'Busca de outra conta' using errcode='42501';
    end if;
    if current_user='authenticated' then
      if tg_op='INSERT' then
        if new.anuncio_global_id is not null or new.novidade_varredura_id is not null or new.cobertura_coleta is not null then
          raise exception 'Novidade do Radar reservada ao servidor' using errcode='42501';
        end if;
      elsif row(new.anuncio_global_id,new.novidade_varredura_id,new.busca_id,new.portal,new.id_externo,new.cobertura_coleta)
        is distinct from row(old.anuncio_global_id,old.novidade_varredura_id,old.busca_id,old.portal,old.id_externo,old.cobertura_coleta)
        or (old.anuncio_global_id is not null and row(new.dados,new.url) is distinct from row(old.dados,old.url)) then
        raise exception 'Identidade do Radar reservada ao servidor' using errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger radar_buscas_ponte before insert or update on public.radar_buscas
  for each row execute function radar_integridade.proteger_ponte_privada();
create trigger radar_anuncios_ponte before insert or update on public.radar_anuncios
  for each row execute function radar_integridade.proteger_ponte_privada();

create function radar_integridade.atende_busca(p_dados jsonb,p_filtros jsonb,p_observada timestamptz) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if nullif(pg_catalog.btrim(p_filtros->>'bairro'),'') is not null
    and radar_integridade.chave_bairro(p_dados->>'bairro') is distinct from radar_integridade.chave_bairro(p_filtros->>'bairro') then return false; end if;
  if nullif(pg_catalog.btrim(p_filtros->>'regiao'),'') is not null and radar_integridade.chave(p_dados->>'regiao') is distinct from radar_integridade.chave(p_filtros->>'regiao') then return false; end if;
  if p_filtros->>'somenteProprietario'='true' and p_dados->>'anunciante' is distinct from 'proprietario' then return false; end if;
  if jsonb_typeof(p_filtros->'valorMin')='number' and (p_dados->>'preco' is null or (p_dados->>'preco')::numeric < (p_filtros->>'valorMin')::numeric) then return false; end if;
  if jsonb_typeof(p_filtros->'valorMax')='number' and (p_dados->>'preco' is null or (p_dados->>'preco')::numeric > (p_filtros->>'valorMax')::numeric) then return false; end if;
  if jsonb_typeof(p_filtros->'dormitorios')='number' and (p_dados->>'quartos' is null or (p_dados->>'quartos')::numeric < (p_filtros->>'dormitorios')::numeric) then return false; end if;
  -- Sem publicação comprovada, um filtro de período não é satisfeito por inferência.
  if jsonb_typeof(p_filtros->'diasPublicacao')='number' then
    if p_filtros->>'diasPublicacao' not in ('1','7','30') or p_dados->>'publicadoEm' is null then return false; end if;
    if (p_dados->>'publicadoEm')::timestamptz>p_observada or (p_dados->>'publicadoEm')::timestamptz<
      p_observada-pg_catalog.make_interval(days=>(p_filtros->>'diasPublicacao')::integer) then return false; end if;
  end if;
  return true;
end;
$$;

alter table public.radar_varreduras add column payload_coleta jsonb;

-- A prova paginada é fechada: sequência contígua, total estável, fim e IDs sem lacunas/duplicação.
create function radar_integridade.cobertura_paginada_valida(p jsonb, anuncios jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  pagina jsonb; i integer:=0; ids jsonb:='[]'::jsonb; total integer; observada timestamptz;
  primeira timestamptz; ultima timestamptz; n integer;
begin
  if jsonb_typeof(p->'paginas') is distinct from 'array' or p->>'motivo_termino' is distinct from 'fim_comprovado' then return false; end if;
  n:=jsonb_array_length(p->'paginas'); total:=(p->>'total')::integer;
  if n<1 or n>100 or p->>'paginas_lidas' is distinct from n::text or p->>'paginas_planejadas' is distinct from n::text then return false; end if;
  for pagina in select value from jsonb_array_elements(p->'paginas') loop
    i:=i+1;
    if pagina->>'numero' is distinct from i::text or pagina->>'total' is distinct from total::text
      or pagina->>'confiavel' is distinct from 'true' or nullif(pagina->>'aquisicao_id','') is null
      or pagina->>'proxima' is distinct from (i<n)::text or jsonb_typeof(pagina->'ids') is distinct from 'array'
      then return false; end if;
    if jsonb_array_length(pagina->'ids')<1 or jsonb_array_length(pagina->'ids')>50 then return false; end if;
    observada:=(pagina->>'em')::timestamptz;
    if observada is null or not pg_catalog.isfinite(observada) or observada>pg_catalog.clock_timestamp() then return false; end if;
    primeira:=least(primeira,observada); ultima:=greatest(ultima,observada);
    ids:=ids || (pagina->'ids');
  end loop;
  if ultima-primeira>interval '20 minutes' or primeira is distinct from (p->>'em')::timestamptz then return false; end if;
  if jsonb_array_length(ids)<>total or (select count(distinct x) from jsonb_array_elements_text(ids) x)<>total
    or (select jsonb_agg(x order by x) from jsonb_array_elements_text(ids) x)
      is distinct from (select jsonb_agg(x->>'idExterno' order by x->>'idExterno') from jsonb_array_elements(anuncios) x) then return false; end if;
  return true;
end;
$$;

create function public.registrar_coleta_radar(
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
        or item->>'tipoDeclarado' is distinct from u.tipo_recorte
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


create or replace function public.candidatos_pendentes_radar()
returns table(id uuid,busca_id uuid,portal text,id_externo text,url text,titulo text,descricao text,endereco text,cidade text,estado text)
language sql stable security invoker set search_path = '' as $$
  select r.id,r.busca_id,r.portal,r.id_externo,r.url,r.dados->>'titulo',r.dados->>'descricao',r.dados->>'endereco',r.dados->>'cidade',r.dados->>'estado'
  from public.radar_anuncios r where r.user_id=(select auth.uid()) and not r.visto and r.novidade_varredura_id is not null
    -- Visualização legada não tem finalidade: ofertas globais usam visto por identidade qualificada.
  order by r.encontrado_em desc,r.id;
$$;
alter function public.registrar_coleta_radar(uuid,uuid,jsonb,jsonb,jsonb,text,jsonb) owner to postgres;
revoke all on function public.registrar_coleta_radar(uuid,uuid,jsonb,jsonb,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.registrar_coleta_radar(uuid,uuid,jsonb,jsonb,jsonb,text,jsonb) to service_role;
revoke all on function radar_integridade.chave_bairro(text),radar_integridade.proteger_bairro_universo(),radar_integridade.chave(text),radar_integridade.busca_no_contexto(jsonb,jsonb),
  radar_integridade.cobertura_paginada_valida(jsonb,jsonb),radar_integridade.atende_busca(jsonb,jsonb,timestamptz),radar_integridade.proteger_ponte_privada() from public,anon,authenticated,service_role;
revoke all on function public.candidatos_pendentes_radar() from public,anon,authenticated,service_role;
grant execute on function public.candidatos_pendentes_radar() to authenticated;
comment on column public.radar_universos.bairro is 'Dimensão canônica opcional do universo. NULL: cidade inteira. Baselines nunca atravessam bairros/cidade.';
comment on column public.radar_anuncios.novidade_varredura_id is 'Novidade certificada pelo servidor. NULL: Base não revisada; visto continua privado. Legado não é backfill global.';
comment on function public.registrar_coleta_radar(uuid,uuid,jsonb,jsonb,jsonb,text,jsonb) is 'Ponte transacional exclusiva do servidor; coleta parcial nunca forma baseline ou Novo. Sem efeitos externos.';
commit;
