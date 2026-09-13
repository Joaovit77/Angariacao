-- Garimpo em Campo — C2f: exclusão coordenada e Storage.
--
-- A migration só instala contratos. Arquivos físicos continuam sendo
-- removidos exclusivamente pela futura rota de servidor, via SDK do Storage.
-- Nenhuma função abaixo escreve em `storage.objects`.

-- ============================================================
-- INICIAR EXCLUSÃO — congela o pai e inventaria todas as fotos
-- ============================================================
create or replace function public.iniciar_exclusao_imovel_identificado(
  p_user_id uuid,
  p_imovel_identificado_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_fotos jsonb;
  v_lapides integer;
  v_repetida boolean;
begin
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário incompatível com a sessão.' using errcode = '42501';
  end if;
  if p_imovel_identificado_id is null then
    raise exception 'Imóvel identificado obrigatório.' using errcode = '22023';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = p_user_id
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  v_repetida := v_identidade.exclusao_solicitada_em is not null;
  if not v_repetida then
    update public.imoveis_identificados i
       set exclusao_solicitada_em = now()
     where i.id = p_imovel_identificado_id
       and i.user_id = p_user_id;
  end if;

  -- Inclui deliberadamente as reservas incompletas: a linha nasce antes do
  -- upload e é o inventário que impede objeto órfão em caso de interrupção.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'foto_id', f.id,
        'caminho', f.caminho,
        'caminho_miniatura', f.caminho_miniatura
      ) order by f.id
    ),
    '[]'::jsonb
  ) into v_fotos
    from public.imoveis_identificados_fotos f
   where f.imovel_identificado_id = p_imovel_identificado_id
     and f.user_id = p_user_id;

  select count(*) into v_lapides
    from public.imoveis_identificados i
   where i.user_id = p_user_id
     and i.situacao = 'fundido'
     and i.fundido_em_imovel_id = p_imovel_identificado_id;

  return jsonb_build_object(
    'ok', true,
    'repetida', v_repetida,
    'imovel_identificado_id', p_imovel_identificado_id,
    'fotos', v_fotos,
    'fotos_total', jsonb_array_length(v_fotos),
    'lapides_total', v_lapides
  );
end;
$$;

-- ============================================================
-- CONFIRMAR OBJETO REMOVIDO — objeto primeiro, linha depois
-- ============================================================
create or replace function public.confirmar_objeto_removido(
  p_user_id uuid,
  p_foto_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_foto public.imoveis_identificados_fotos;
  v_original_presente boolean;
  v_miniatura_presente boolean;
begin
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário incompatível com a sessão.' using errcode = '42501';
  end if;
  if p_foto_id is null then
    raise exception 'Foto obrigatória.' using errcode = '22023';
  end if;

  select f.* into v_foto
    from public.imoveis_identificados_fotos f
   where f.id = p_foto_id
     and f.user_id = p_user_id
   for update;

  if v_foto.id is null then
    raise exception 'Foto não encontrada.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'fachadas'
       and o.name = v_foto.caminho
  ) into v_original_presente;

  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'fachadas'
       and o.name = v_foto.caminho_miniatura
  ) into v_miniatura_presente;

  if v_original_presente or v_miniatura_presente then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'objeto_pendente',
      'foto_id', p_foto_id,
      'original_presente', v_original_presente,
      'miniatura_presente', v_miniatura_presente
    );
  end if;

  delete from public.imoveis_identificados_fotos f
   where f.id = p_foto_id
     and f.user_id = p_user_id;

  return jsonb_build_object('ok', true, 'foto_id', p_foto_id);
end;
$$;

-- ============================================================
-- CONCLUIR EXCLUSÃO — sem linha de foto, pai por último
-- ============================================================
create or replace function public.concluir_exclusao_imovel_identificado(
  p_user_id uuid,
  p_imovel_identificado_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_fotos_pendentes integer;
  v_lapides integer;
begin
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário incompatível com a sessão.' using errcode = '42501';
  end if;
  if p_imovel_identificado_id is null then
    raise exception 'Imóvel identificado obrigatório.' using errcode = '22023';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = p_user_id
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_nao_iniciada');
  end if;

  select count(*) into v_fotos_pendentes
    from public.imoveis_identificados_fotos f
   where f.imovel_identificado_id = p_imovel_identificado_id
     and f.user_id = p_user_id;

  if v_fotos_pendentes > 0 then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'objetos_pendentes',
      'pendentes', v_fotos_pendentes
    );
  end if;

  select count(*) into v_lapides
    from public.imoveis_identificados i
   where i.user_id = p_user_id
     and i.situacao = 'fundido'
     and i.fundido_em_imovel_id = p_imovel_identificado_id;

  delete from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'imovel_identificado_id', p_imovel_identificado_id,
    'lapides_removidas', v_lapides
  );
end;
$$;

-- ============================================================
-- APAGAR TODA A PROSPECÇÃO — versão em lote do mesmo contrato
-- ============================================================
create or replace function public.apagar_prospeccao_do_usuario(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_fotos_pendentes integer;
  v_identidades_removidas integer;
begin
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário incompatível com a sessão.' using errcode = '42501';
  end if;

  -- Serializa duas tentativas de apagar o módulo inteiro para o mesmo tenant.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('apagar-prospeccao:' || p_user_id::text, 0)
  );

  select count(*) into v_fotos_pendentes
    from public.imoveis_identificados_fotos f
   where f.user_id = p_user_id;

  if v_fotos_pendentes > 0 then
    return jsonb_build_object(
      'ok', false,
      'codigo', 'objetos_pendentes',
      'pendentes', v_fotos_pendentes
    );
  end if;

  delete from public.imoveis_identificados i
   where i.user_id = p_user_id;
  get diagnostics v_identidades_removidas = row_count;

  return jsonb_build_object(
    'ok', true,
    'identidades_removidas', v_identidades_removidas
  );
end;
$$;

-- ============================================================
-- BACKSTOP — inventário exaustivo, sem paginação de Storage
-- ============================================================
create or replace function public.listar_objetos_do_usuario(
  p_user_id uuid,
  p_prefixo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_prefixo_valido boolean;
  v_objetos jsonb;
begin
  if p_user_id is null then
    raise exception 'Usuário obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário incompatível com a sessão.' using errcode = '42501';
  end if;
  if p_prefixo is null or p_prefixo = '' then
    raise exception 'Prefixo obrigatório.' using errcode = '22023';
  end if;

  -- Só há dois escopos legítimos: todo o tenant, ou uma identidade que ele
  -- possui. Um UUID alheio recebe o mesmo P0002 de um alvo inexistente.
  select
    p_prefixo = p_user_id::text || '/'
    or exists (
      select 1
        from public.imoveis_identificados i
       where i.user_id = p_user_id
         and p_prefixo = p_user_id::text || '/' || i.id::text || '/'
    )
    into v_prefixo_valido;

  if not v_prefixo_valido then
    raise exception 'Prefixo não encontrado.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb)
    into v_objetos
    from storage.objects o
   where o.bucket_id = 'fachadas'
     and left(o.name, char_length(p_prefixo)) = p_prefixo;

  return jsonb_build_object(
    'ok', true,
    'prefixo', p_prefixo,
    'objetos', v_objetos,
    'total', jsonb_array_length(v_objetos)
  );
end;
$$;

-- ------------------------------------------------------------
-- Modelo Servidor: nenhuma RPC de exclusão é alcançável pelo navegador.
-- ------------------------------------------------------------
revoke all on function public.iniciar_exclusao_imovel_identificado(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.confirmar_objeto_removido(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.concluir_exclusao_imovel_identificado(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apagar_prospeccao_do_usuario(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.listar_objetos_do_usuario(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.iniciar_exclusao_imovel_identificado(uuid, uuid)
  to service_role;
grant execute on function public.confirmar_objeto_removido(uuid, uuid)
  to service_role;
grant execute on function public.concluir_exclusao_imovel_identificado(uuid, uuid)
  to service_role;
grant execute on function public.apagar_prospeccao_do_usuario(uuid)
  to service_role;
grant execute on function public.listar_objetos_do_usuario(uuid, text)
  to service_role;

-- ============================================================
-- STORAGE — bucket privado e superfície mínima do navegador
-- ============================================================
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'fachadas',
  'fachadas',
  false,
  5242880,
  array['image/jpeg', 'image/webp']
)
on conflict do nothing;

drop policy if exists "fachadas_select_proprio_prefixo" on storage.objects;
create policy "fachadas_select_proprio_prefixo"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fachadas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "fachadas_insert_reserva_aberta" on storage.objects;
create policy "fachadas_insert_reserva_aberta"
  on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fachadas'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
        from public.imoveis_identificados_fotos f
        join public.imoveis_identificados_avistamentos a on a.id = f.avistamento_id
        join public.imoveis_identificados i on i.id = f.imovel_identificado_id
       where name in (f.caminho, f.caminho_miniatura)
         and f.estado = 'reservada'
         and f.user_id = (select auth.uid())
         and a.user_id = (select auth.uid())
         and i.user_id = (select auth.uid())
         and i.exclusao_solicitada_em is null
         and i.situacao <> 'fundido'
    )
  );
