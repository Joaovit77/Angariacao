-- Radar R6.1-B: integridade local sobre A imutável, sem caller ou migração remota.
-- Primitivas internas; Novo continua derivado e não é implementado aqui.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema radar_integridade authorization postgres;
revoke all on schema radar_integridade from public, anon, authenticated, service_role;
grant usage on schema radar_integridade to service_role;

-- Ordem de locks: universo -> varredura no baseline; varredura antes de oferta/presença.
-- Nenhuma operação que segura varredura tenta atualizar/lockar o universo.
create function radar_integridade.exigir_running(p_id uuid)
returns public.radar_varreduras
language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype;
begin
  select * into v from public.radar_varreduras where id = p_id for update;
  if not found then raise exception 'Varredura inexistente'; end if;
  if v.status <> 'running' then raise exception 'Varredura encerrada'; end if;
  if v.expira_em is not null and v.expira_em <= pg_catalog.clock_timestamp() then
    raise exception 'Varredura expirada; fechamento explícito obrigatório';
  end if;
  return v;
end;
$$;

create function radar_integridade.validar_baseline(p_universo uuid, p_varredura uuid)
returns public.radar_varreduras
language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype;
begin
  select * into v from public.radar_varreduras where id = p_varredura for share;
  if not found or v.universo_id <> p_universo then raise exception 'Baseline de outro universo ou inexistente'; end if;
  if v.status <> 'success' or v.concluida_em is null then raise exception 'Baseline exige success terminal'; end if;
  if v.cobertura not in ('amostra', 'universo_comprovado') then raise exception 'Cobertura inadequada para baseline'; end if;
  if v.aquisicao_id is null or v.aquisicao_em is null or v.origem_aquisicao is null or v.versao_aquisicao is null
    or v.aquisicao_em > v.concluida_em then raise exception 'Proveniência insuficiente para baseline'; end if;
  -- Fail closed: vazio legítimo depende de contrato explícito futuro R6.2/R6.3.
  if v.contagem_admitida is null or v.contagem_admitida <= 0 then raise exception 'Baseline vazio não autorizado'; end if;
  return v;
end;
$$;

create function radar_integridade.proteger_universo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype;
begin
  if not pg_catalog.isfinite(new.criado_em) then raise exception 'Instante de criação inválido'; end if;
  if tg_op = 'INSERT' then
    if new.baseline_varredura_id is not null or new.baseline_concluido_em is not null then
      raise exception 'Universo deve nascer sem baseline';
    end if;
    return new;
  end if;
  if row(new.id,new.portal,new.finalidade,new.uf,new.cidade,new.tipo_recorte,new.anunciante_recorte,new.versao_semantica,new.criado_em)
    is distinct from row(old.id,old.portal,old.finalidade,old.uf,old.cidade,old.tipo_recorte,old.anunciante_recorte,old.versao_semantica,old.criado_em)
    then raise exception 'Identidade do universo imutável'; end if;
  if old.baseline_varredura_id is not null and row(new.baseline_varredura_id,new.baseline_concluido_em)
    is distinct from row(old.baseline_varredura_id,old.baseline_concluido_em)
    then raise exception 'Baseline não pode ser substituído ou apagado'; end if;
  if new.baseline_varredura_id is distinct from old.baseline_varredura_id then
    v := radar_integridade.validar_baseline(new.id,new.baseline_varredura_id);
    if new.baseline_concluido_em is null or not pg_catalog.isfinite(new.baseline_concluido_em)
      or new.baseline_concluido_em < v.concluida_em or new.baseline_concluido_em > pg_catalog.clock_timestamp()
      then raise exception 'Instante de formação do baseline inválido'; end if;
  end if;
  return new;
end;
$$;

create function radar_integridade.proteger_varredura()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not pg_catalog.isfinite(new.iniciada_em) or not pg_catalog.isfinite(new.criado_em)
    or (new.expira_em is not null and not pg_catalog.isfinite(new.expira_em))
    or (new.aquisicao_em is not null and not pg_catalog.isfinite(new.aquisicao_em))
    then raise exception 'Instante de execução ou aquisição inválido'; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'running' or new.concluida_em is not null then raise exception 'Varredura deve nascer running'; end if;
    return new;
  end if;
  if row(new.id,new.universo_id,new.chave_idempotencia,new.iniciada_em,new.criado_em,new.iniciador,new.expira_em)
    is distinct from row(old.id,old.universo_id,old.chave_idempotencia,old.iniciada_em,old.criado_em,old.iniciador,old.expira_em)
    then raise exception 'Identidade ou prazo da varredura imutável'; end if;
  if old.status <> 'running' then
    if new is distinct from old then raise exception 'Varredura terminal imutável'; end if;
    return new;
  end if;
  if (old.aquisicao_id is not null and new.aquisicao_id is distinct from old.aquisicao_id)
    or (old.aquisicao_em is not null and new.aquisicao_em is distinct from old.aquisicao_em)
    or (old.origem_aquisicao is not null and new.origem_aquisicao is distinct from old.origem_aquisicao)
    or (old.versao_aquisicao is not null and new.versao_aquisicao is distinct from old.versao_aquisicao)
    then raise exception 'Proveniência de aquisição imutável depois de definida'; end if;
  if new.status <> 'running' then
    if new.concluida_em is null or not pg_catalog.isfinite(new.concluida_em) or new.concluida_em < new.iniciada_em
      then raise exception 'Conclusão inválida'; end if;
    if new.codigo_resultado = 'execucao_expirada' then
      if new.status <> 'failed' or old.expira_em is null or old.expira_em > new.concluida_em
        or new.concluida_em > pg_catalog.clock_timestamp() then raise exception 'Expiração inválida'; end if;
    elsif old.expira_em is not null and old.expira_em <= pg_catalog.clock_timestamp() then
      raise exception 'Worker expirado não pode finalizar';
    end if;
    if new.status in ('success','partial') then
      if new.aquisicao_id is null or new.aquisicao_em is null or new.origem_aquisicao is null or new.versao_aquisicao is null
        then raise exception 'Success/partial exigem proveniência completa'; end if;
      if new.contagem_bruta is null or new.contagem_admitida is null
        or new.contagem_admitida <> (select count(*) from public.radar_presencas p where p.varredura_id=new.id)
        then raise exception 'Contagens finais incompatíveis com presenças'; end if;
    end if;
    if new.aquisicao_em > new.concluida_em then raise exception 'Aquisição posterior à conclusão'; end if;
    if exists(select 1 from public.radar_presencas p where p.varredura_id=new.id and p.observado_em>new.concluida_em)
      or exists(select 1 from public.radar_anuncios_globais a where a.primeira_varredura_id=new.id and a.primeiro_visto_em>new.concluida_em)
      then raise exception 'Conclusão anterior aos fatos observados'; end if;
  end if;
  return new;
end;
$$;

create function radar_integridade.proteger_oferta()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype; u public.radar_universos%rowtype;
begin
  if not pg_catalog.isfinite(new.primeiro_visto_em) or not pg_catalog.isfinite(new.ultimo_visto_em)
    or not pg_catalog.isfinite(new.criado_em) then raise exception 'Instante da oferta inválido'; end if;
  if tg_op = 'UPDATE' then
    if row(new.id,new.portal,new.finalidade,new.id_externo,new.primeira_varredura_id,new.primeiro_visto_em,new.criado_em)
      is distinct from row(old.id,old.portal,old.finalidade,old.id_externo,old.primeira_varredura_id,old.primeiro_visto_em,old.criado_em)
      then raise exception 'Identidade e primeira proveniência da oferta imutáveis'; end if;
    if new.ultimo_visto_em < old.ultimo_visto_em then raise exception 'Última observação não pode regredir'; end if;
  else
    v := radar_integridade.exigir_running(new.primeira_varredura_id);
    select * into strict u from public.radar_universos where id=v.universo_id;
    if new.portal <> u.portal or new.finalidade <> u.finalidade then raise exception 'Oferta incompatível com portal/finalidade do universo'; end if;
    if new.primeiro_visto_em < v.iniciada_em then raise exception 'Primeira observação anterior à execução'; end if;
  end if;
  return new;
end;
$$;

create function radar_integridade.proteger_presenca()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype; u public.radar_universos%rowtype; a public.radar_anuncios_globais%rowtype;
begin
  if tg_op <> 'INSERT' then raise exception 'Presença imutável'; end if;
  v := radar_integridade.exigir_running(new.varredura_id);
  select * into strict u from public.radar_universos where id=v.universo_id;
  select * into a from public.radar_anuncios_globais where id=new.anuncio_global_id;
  if not found then raise exception 'Oferta inexistente'; end if;
  if a.portal <> u.portal or a.finalidade <> u.finalidade then raise exception 'Presença incompatível com portal/finalidade'; end if;
  if new.observado_em < v.iniciada_em or not pg_catalog.isfinite(new.observado_em)
    then raise exception 'Instante de presença inválido'; end if;
  return new;
end;
$$;

create function radar_integridade.impedir_exclusao()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Fato histórico do Radar não pode ser excluído';
end;
$$;

-- Baseline explícito: lock do universo, validação da execução pelo trigger e gravação do par.
-- Retry do mesmo ID retorna o universo existente sem reescrever o instante de formação.
create function radar_integridade.formar_baseline(p_universo uuid,p_varredura uuid)
returns public.radar_universos
language plpgsql security definer set search_path = '' as $$
declare u public.radar_universos%rowtype;
begin
  select * into u from public.radar_universos where id=p_universo for update;
  if not found then raise exception 'Universo inexistente'; end if;
  if p_varredura is null then raise exception 'Baseline exige varredura'; end if;
  if u.baseline_varredura_id is not null then
    if u.baseline_varredura_id=p_varredura then return u; end if;
    raise exception 'Baseline não pode ser substituído';
  end if;
  perform radar_integridade.validar_baseline(p_universo,p_varredura);
  update public.radar_universos set baseline_varredura_id=p_varredura,baseline_concluido_em=pg_catalog.clock_timestamp()
    where id=p_universo returning * into u;
  return u;
end;
$$;

-- Payload final tipado: todos os fatos terminais participam da igualdade do retry.
create function radar_integridade.finalizar_varredura(
  p_id uuid,p_status text,p_concluida_em timestamptz,p_aquisicao_id text,p_aquisicao_em timestamptz,
  p_origem_aquisicao text,p_versao_aquisicao text,p_cobertura text,p_codigo_resultado text,
  p_contagem_bruta integer,p_contagem_admitida integer,p_paginas_lidas integer,p_paginas_planejadas integer
) returns public.radar_varreduras
language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype; nova public.radar_varreduras%rowtype;
begin
  select * into v from public.radar_varreduras where id=p_id for update;
  if not found then raise exception 'Varredura inexistente'; end if;
  if p_status is null or p_status not in ('success','partial','failed') then raise exception 'Estado final inválido'; end if;
  if p_codigo_resultado='execucao_expirada' then raise exception 'Use a primitiva de expiração'; end if;
  nova := v;
  nova.status:=p_status; nova.concluida_em:=p_concluida_em;
  nova.aquisicao_id:=p_aquisicao_id; nova.aquisicao_em:=p_aquisicao_em;
  nova.origem_aquisicao:=p_origem_aquisicao; nova.versao_aquisicao:=p_versao_aquisicao;
  nova.cobertura:=p_cobertura; nova.codigo_resultado:=p_codigo_resultado;
  nova.contagem_bruta:=p_contagem_bruta; nova.contagem_admitida:=p_contagem_admitida;
  nova.paginas_lidas:=p_paginas_lidas; nova.paginas_planejadas:=p_paginas_planejadas;
  if v.codigo_resultado='execucao_expirada' then raise exception 'Worker expirado não pode finalizar'; end if;
  if v.status <> 'running' then
    if v is not distinct from nova then return v; end if;
    raise exception 'Payload final divergente ou varredura encerrada';
  end if;
  update public.radar_varreduras set status=nova.status,concluida_em=nova.concluida_em,
    aquisicao_id=nova.aquisicao_id,aquisicao_em=nova.aquisicao_em,origem_aquisicao=nova.origem_aquisicao,
    versao_aquisicao=nova.versao_aquisicao,cobertura=nova.cobertura,codigo_resultado=nova.codigo_resultado,
    contagem_bruta=nova.contagem_bruta,contagem_admitida=nova.contagem_admitida,
    paginas_lidas=nova.paginas_lidas,paginas_planejadas=nova.paginas_planejadas
    where id=p_id returning * into nova;
  return nova;
end;
$$;

-- Referência explícita e estável para retry; nunca pode antecipar o relógio do banco.
create function radar_integridade.expirar_varredura(p_id uuid,p_referencia timestamptz)
returns public.radar_varreduras
language plpgsql security definer set search_path = '' as $$
declare v public.radar_varreduras%rowtype;
begin
  select * into v from public.radar_varreduras where id=p_id for update;
  if not found then raise exception 'Varredura inexistente'; end if;
  if p_referencia is null or not pg_catalog.isfinite(p_referencia) or p_referencia>pg_catalog.clock_timestamp()
    then raise exception 'Referência de expiração inválida'; end if;
  if v.status='failed' and v.codigo_resultado='execucao_expirada' and v.concluida_em=p_referencia then return v; end if;
  if v.status <> 'running' or v.expira_em is null or v.expira_em>p_referencia then raise exception 'Varredura não pode expirar'; end if;
  update public.radar_varreduras set status='failed',concluida_em=p_referencia,codigo_resultado='execucao_expirada'
    where id=p_id returning * into v;
  return v;
end;
$$;

-- Igualdade material: TODOS os campos observacionais da presença, inclusive JSONB.
-- Retry idêntico é leitura idempotente somente enquanto running e dentro do prazo.
create function radar_integridade.registrar_presenca(
  p_varredura uuid,p_anuncio uuid,p_observado_em timestamptz,p_preco numeric default null,
  p_tipo text default null,p_uf text default null,p_cidade text default null,p_url text default null,
  p_dados jsonb default '{}'::jsonb
) returns public.radar_presencas
language plpgsql security definer set search_path = '' as $$
declare existente public.radar_presencas%rowtype;
begin
  perform radar_integridade.exigir_running(p_varredura);
  select * into existente from public.radar_presencas where varredura_id=p_varredura and anuncio_global_id=p_anuncio;
  if found then
    if row(existente.observado_em,existente.preco_observado,existente.tipo_observado,existente.uf_observada,
      existente.cidade_observada,existente.url_observada,existente.dados_objetivos)
      is distinct from row(p_observado_em,p_preco,p_tipo,p_uf,p_cidade,p_url,p_dados)
      then raise exception 'Payload divergente da presença'; end if;
    return existente;
  end if;
  insert into public.radar_presencas(varredura_id,anuncio_global_id,observado_em,preco_observado,tipo_observado,
    uf_observada,cidade_observada,url_observada,dados_objetivos)
    values(p_varredura,p_anuncio,p_observado_em,p_preco,p_tipo,p_uf,p_cidade,p_url,p_dados) returning * into existente;
  return existente;
end;
$$;

create trigger radar_universos_integridade before insert or update on public.radar_universos
  for each row execute function radar_integridade.proteger_universo();
create trigger radar_varreduras_integridade before insert or update on public.radar_varreduras
  for each row execute function radar_integridade.proteger_varredura();
create trigger radar_anuncios_globais_integridade before insert or update on public.radar_anuncios_globais
  for each row execute function radar_integridade.proteger_oferta();
create trigger radar_presencas_integridade before insert or update on public.radar_presencas
  for each row execute function radar_integridade.proteger_presenca();
create trigger radar_universos_sem_exclusao before delete on public.radar_universos
  for each row execute function radar_integridade.impedir_exclusao();
create trigger radar_varreduras_sem_exclusao before delete on public.radar_varreduras
  for each row execute function radar_integridade.impedir_exclusao();
create trigger radar_anuncios_globais_sem_exclusao before delete on public.radar_anuncios_globais
  for each row execute function radar_integridade.impedir_exclusao();
create trigger radar_presencas_sem_exclusao before delete on public.radar_presencas
  for each row execute function radar_integridade.impedir_exclusao();

-- Fecha DML que poderia evitar as primitivas. REVOKE de tabela não remove grants por coluna.
revoke update (baseline_varredura_id,baseline_concluido_em) on public.radar_universos from service_role;
revoke update (concluida_em,status,expira_em,aquisicao_id,aquisicao_em,origem_aquisicao,versao_aquisicao,
  cobertura,codigo_resultado,contagem_bruta,contagem_admitida,paginas_lidas,paginas_planejadas)
  on public.radar_varreduras from service_role;
revoke insert on public.radar_presencas from service_role;
-- Oferta mantém apenas os três UPDATEs evolutivos de A, protegidos pelo trigger.
-- Nenhuma policy, permissão de cliente ou acesso a dados legados é criado.

alter function radar_integridade.exigir_running(uuid) owner to postgres;
alter function radar_integridade.validar_baseline(uuid,uuid) owner to postgres;
alter function radar_integridade.proteger_universo() owner to postgres;
alter function radar_integridade.proteger_varredura() owner to postgres;
alter function radar_integridade.proteger_oferta() owner to postgres;
alter function radar_integridade.proteger_presenca() owner to postgres;
alter function radar_integridade.impedir_exclusao() owner to postgres;
alter function radar_integridade.formar_baseline(uuid,uuid) owner to postgres;
alter function radar_integridade.finalizar_varredura(uuid,text,timestamptz,text,timestamptz,text,text,text,text,integer,integer,integer,integer) owner to postgres;
alter function radar_integridade.expirar_varredura(uuid,timestamptz) owner to postgres;
alter function radar_integridade.registrar_presenca(uuid,uuid,timestamptz,numeric,text,text,text,text,jsonb) owner to postgres;
revoke all on all functions in schema radar_integridade from public, anon, authenticated, service_role;
grant execute on function radar_integridade.formar_baseline(uuid,uuid) to service_role;
grant execute on function radar_integridade.finalizar_varredura(uuid,text,timestamptz,text,timestamptz,text,text,text,text,integer,integer,integer,integer) to service_role;
grant execute on function radar_integridade.expirar_varredura(uuid,timestamptz) to service_role;
grant execute on function radar_integridade.registrar_presenca(uuid,uuid,timestamptz,numeric,text,text,text,text,jsonb) to service_role;

comment on schema radar_integridade is 'Primitivas internas R6.1-B sem caller, endpoint ou exposição de produto. Validação real de ACL/RLS/locks/PostgREST permanece no R6.1-C.';
comment on column public.radar_universos.baseline_concluido_em is 'Instante de formação explícita e única do baseline OBSERVACIONAL. Amostra não implica universo completo. Zero admitidos é recusado até contrato explícito de vazio legítimo em R6.2/R6.3.';
comment on column public.radar_varreduras.contagem_admitida is 'Contagem final de presenças distintas da execução em success/partial. Baseline não é preenchido automaticamente. Partial/failed não formam baseline, novidade ou ausência.';
comment on column public.radar_varreduras.expira_em is 'Prazo imutável de execução. Expiração exige primitiva explícita; não há scheduler. Uma running expirada continua bloqueando nova execução até ser fechada.';
comment on column public.radar_varreduras.aquisicao_em is 'Instante original imutável depois de definido, inclusive cache antigo. R6.2 deverá decidir admissão temporal de aquisição reutilizada sem reescrever a origem como nova.';
comment on table public.radar_presencas is 'Fatos positivos imutáveis, inseridos somente durante running válida. Retry exato aceita igualdade de todos os campos observacionais. Presenças de partial/failed são preservadas sem promoção retroativa a Novo por execução posterior; contrato do writer R6.2.';
commit;
