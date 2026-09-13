-- Garimpo em Campo — C2d: somente as três RPCs de classificação do modelo Servidor.
-- RPCs do navegador, exclusão, Storage, bucket, API HTTP e UI permanecem
-- reservados aos checkpoints seguintes.
--
-- MODELO DE IDENTIDADE — Servidor (as três usam, nenhuma mistura):
--   `p_user_id` explícito, descoberto por auth.getUser() sobre o Bearer na rota.
--   Nunca do corpo da requisição. Se houver JWT na conexão, ele tem de ser o
--   mesmo usuário. E o registro alvo precisa pertencer a `p_user_id`, senão o
--   erro é INDISTINGUÍVEL de "não existe" — nem a existência do registro de
--   outra conta é revelada. Precedente: registrar_comparavel_mercado, que usa
--   auth.uid() e só cai para o user_id do payload quando é service_role.
--
-- `concluir` jamais pode virar `authenticated`: ela grava origem='ia-texto'
-- com modelo e confiança. Com o lease_token em mãos, o navegador forjaria
-- proveniência de IA. Daí as três serem service_role.
--
-- SEPARAÇÃO DE ESTADOS: `processando` pertence à EXECUÇÃO. O avistamento não
-- tem esse estado e continua `pendente` durante a chamada — a bicondicional
-- criada no C2a (concluida ⇔ os três campos preenchidos) é respeitada, e
-- "está sendo classificado agora?" é derivado por `exists` na execução.

-- ============================================================
-- INICIAR — claim atômico, lease e decisão de reuso
--
-- O claim é forte porque o BANCO recusa o problema: os dois únicos parciais
-- do C2a (`where estado='processando'` e
-- `(avistamento_id, observacao_revisao, fingerprint) where estado='concluida'`)
-- não deixam janela entre "checa" e "escreve". O advisory lock existe para
-- transformar a colisão em RESPOSTA LIMPA em vez de erro de constraint.
--
-- Lease de 2 minutos, não 10: a chamada leva ~2 s, e lease longo travaria
-- reclassificação legítima depois de um crash.
-- ============================================================
create or replace function public.iniciar_classificacao(
  p_user_id uuid,
  p_avistamento_id uuid,
  p_fingerprint text,
  p_modelo text,
  p_esforco text,
  p_versao_catalogo integer,
  p_versao_classificador integer,
  p_confianca_minima smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_avistamento public.imoveis_identificados_avistamentos;
  v_exclusao timestamptz;
  v_concluida uuid;
  v_ocupada uuid;
  v_reuso uuid;
  v_modo text;
  v_lease uuid;
  v_run uuid;
begin
  if p_user_id is null then
    raise exception 'Usuário do servidor obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário do servidor divergente da sessão.' using errcode = '42501';
  end if;
  if p_avistamento_id is null or coalesce(trim(p_fingerprint), '') = ''
     or coalesce(trim(p_modelo), '') = ''
     or p_versao_catalogo is null or p_versao_classificador is null
     or p_confianca_minima is null then
    raise exception 'Dados de classificação incompletos.' using errcode = '22023';
  end if;

  -- Serializa a decisão por avistamento. Avistamentos diferentes do mesmo
  -- imóvel seguem em paralelo, o que é correto.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('classificar:' || p_user_id::text || ':' || p_avistamento_id::text, 0)
  );

  select a.* into v_avistamento
    from public.imoveis_identificados_avistamentos a
   where a.id = p_avistamento_id
     and a.user_id = p_user_id;

  -- Posse cruzada e inexistência caem no MESMO erro, de propósito.
  if v_avistamento.id is null then
    raise exception 'Avistamento não encontrado.' using errcode = 'P0002';
  end if;

  select i.exclusao_solicitada_em into v_exclusao
    from public.imoveis_identificados i
   where i.id = v_avistamento.imovel_identificado_id;

  if v_exclusao is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  -- Idempotência: mesma entrada, na revisão vigente, nunca roda duas vezes.
  select c.id into v_concluida
    from public.imoveis_identificados_classificacoes c
   where c.avistamento_id = p_avistamento_id
     and c.observacao_revisao = v_avistamento.observacao_revisao
     and c.fingerprint = p_fingerprint
     and c.estado = 'concluida'
   limit 1;

  if v_concluida is not null then
    return jsonb_build_object('ok', true, 'repetida', true, 'run_id', v_concluida);
  end if;

  -- Lease vencido é execução abandonada: libera o claim sem perder o evento.
  update public.imoveis_identificados_classificacoes c
     set estado = 'abandonada',
         lease_token = null,
         lease_expira_em = null
   where c.avistamento_id = p_avistamento_id
     and c.estado = 'processando'
     and c.lease_expira_em <= now();

  select c.id into v_ocupada
    from public.imoveis_identificados_classificacoes c
   where c.avistamento_id = p_avistamento_id
     and c.estado = 'processando'
   limit 1;

  if v_ocupada is not null then
    return jsonb_build_object('ok', false, 'ocupado', true, 'run_id', v_ocupada);
  end if;

  -- Reuso: mesmo fingerprint já concluído no MESMO imóvel — seja em outro
  -- avistamento, seja numa revisão anterior deste. Economiza token, nunca
  -- evento: o run de reuso é real e gera as próprias etiquetas.
  select c.id into v_reuso
    from public.imoveis_identificados_classificacoes c
   where c.user_id = p_user_id
     and c.imovel_identificado_id = v_avistamento.imovel_identificado_id
     and c.fingerprint = p_fingerprint
     and c.estado = 'concluida'
   order by c.concluida_em desc nulls last, c.iniciada_em desc
   limit 1;

  v_modo := case when v_reuso is null then 'modelo' else 'reuso' end;
  v_lease := gen_random_uuid();

  insert into public.imoveis_identificados_classificacoes (
    avistamento_id, imovel_identificado_id, user_id, estado, modo,
    reusada_de_classificacao_id, observacao_revisao, fingerprint, modelo, esforco,
    versao_catalogo, versao_classificador, confianca_minima,
    lease_token, lease_expira_em
  ) values (
    p_avistamento_id, v_avistamento.imovel_identificado_id, p_user_id, 'processando', v_modo,
    v_reuso, v_avistamento.observacao_revisao, p_fingerprint, p_modelo,
    nullif(trim(coalesce(p_esforco, '')), ''),
    p_versao_catalogo, p_versao_classificador, p_confianca_minima,
    v_lease, now() + interval '2 minutes'
  )
  returning id into v_run;

  return jsonb_build_object(
    'ok', true,
    'repetida', false,
    'ocupado', false,
    'run_id', v_run,
    'lease_token', v_lease,
    'modo', v_modo,
    'reusada_de', v_reuso
  );
end;
$$;

-- ============================================================
-- CONCLUIR — uma função, uma transação, tudo ou nada
--
-- Persiste num só ato: supersessão das etiquetas que a execução nova não
-- reafirmou, inserção das novas, contadores, estado do avistamento, snapshot
-- de tipo e fecho da execução. Uma chamada de função em Postgres É uma
-- transação: falha em qualquer ponto faz rollback integral, e não existe
-- "etiquetas gravadas com execução ainda processando".
--
-- O cliente não decide reuso nem proveniência: o `modo` já está na linha da
-- execução, e origem/estado/modelo/versões/revisão saem do run e do
-- avistamento — nunca do payload. No ramo de reuso o payload é IGNORADO e as
-- etiquetas são copiadas por `insert ... select` dentro do SQL.
-- ============================================================
create or replace function public.concluir_classificacao(
  p_user_id uuid,
  p_run_id uuid,
  p_lease_token uuid,
  p_tipo_sugerido text,
  p_tipo_confianca smallint,
  p_etiquetas jsonb,
  p_contadores jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_run public.imoveis_identificados_classificacoes;
  v_avistamento public.imoveis_identificados_avistamentos;
  v_identidade public.imoveis_identificados;
  v_etiquetas jsonb;
  v_tipo text;
  v_tipo_confianca smallint;
  v_corrente boolean;
  v_aplica_tipo boolean;
  v_ja_confirmada integer := 0;
  v_reafirmadas integer := 0;
  v_inseridas integer := 0;
begin
  if p_user_id is null then
    raise exception 'Usuário do servidor obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário do servidor divergente da sessão.' using errcode = '42501';
  end if;

  select c.* into v_run
    from public.imoveis_identificados_classificacoes c
   where c.id = p_run_id
     and c.user_id = p_user_id
   for update;

  if v_run.id is null then
    raise exception 'Execução de classificação não encontrada.' using errcode = 'P0002';
  end if;

  -- Idempotência do fecho: concluir de novo não duplica etiqueta nem contador.
  if v_run.estado = 'concluida' then
    return jsonb_build_object('ok', true, 'repetida', true, 'run_id', v_run.id);
  end if;

  if v_run.estado <> 'processando'
     or v_run.lease_token is null
     or v_run.lease_token <> p_lease_token
     or v_run.lease_expira_em <= now() then
    return jsonb_build_object('ok', false, 'codigo', 'lease_invalido');
  end if;

  select a.* into v_avistamento
    from public.imoveis_identificados_avistamentos a
   where a.id = v_run.avistamento_id;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = v_run.imovel_identificado_id
   for update;

  -- Exclusão iniciada depois do claim: não conclui, não toca o avistamento.
  if v_identidade.exclusao_solicitada_em is not null then
    update public.imoveis_identificados_classificacoes
       set estado = 'abandonada', lease_token = null, lease_expira_em = null
     where id = v_run.id;
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  -- A observação foi corrigida durante a chamada: o gatilho do C2c já subiu a
  -- revisão e devolveu o avistamento a `pendente`. Este resultado é de um
  -- texto que não existe mais.
  if v_avistamento.observacao_revisao <> v_run.observacao_revisao then
    update public.imoveis_identificados_classificacoes
       set estado = 'abandonada', lease_token = null, lease_expira_em = null
     where id = v_run.id;
    return jsonb_build_object('ok', false, 'codigo', 'revisao_desatualizada');
  end if;

  if v_run.modo = 'reuso' then
    -- Payload ignorado: copia o que a execução de origem ainda afirma.
    -- `estado` sempre 'inferida' — confirmação humana NUNCA é copiada.
    select coalesce(jsonb_agg(jsonb_build_object(
             'categoria', e.categoria,
             'codigo', e.codigo,
             'confianca', e.confianca,
             'modelo', e.modelo,
             'versao_classificador', e.versao_classificador
           )), '[]'::jsonb)
      into v_etiquetas
      from public.imoveis_identificados_etiquetas e
     where e.classificacao_id = v_run.reusada_de_classificacao_id
       and e.estado in ('inferida', 'confirmada');

    select o.tipo_sugerido, o.tipo_confianca
      into v_tipo, v_tipo_confianca
      from public.imoveis_identificados_classificacoes o
     where o.id = v_run.reusada_de_classificacao_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'categoria', x.categoria,
             'codigo', x.codigo,
             'confianca', x.confianca,
             'modelo', v_run.modelo,
             'versao_classificador', v_run.versao_classificador
           )), '[]'::jsonb)
      into v_etiquetas
      from jsonb_to_recordset(coalesce(p_etiquetas, '[]'::jsonb))
           as x(categoria text, codigo text, confianca smallint)
     where coalesce(trim(x.categoria), '') <> ''
       and coalesce(trim(x.codigo), '') <> ''
       and x.confianca is not null;

    v_tipo := nullif(trim(coalesce(p_tipo_sugerido, '')), '');
    v_tipo_confianca := p_tipo_confianca;
  end if;

  -- Quantas do resultado já têm assinatura humana: não são tocadas.
  select count(*) into v_ja_confirmada
    from jsonb_to_recordset(v_etiquetas) as x(categoria text, codigo text)
   where exists (
     select 1 from public.imoveis_identificados_etiquetas e
      where e.avistamento_id = v_run.avistamento_id
        and e.categoria = x.categoria
        and e.codigo = x.codigo
        and e.estado = 'confirmada'
   );

  -- Supersessão: só o que esta execução NÃO reafirmou sai de vigente. O que
  -- ela reafirmou fica na linha antiga (não duplica), e a confirmada nunca é
  -- rebaixada. A linha substituída CONTINUA na tabela — histórico não encolhe.
  update public.imoveis_identificados_etiquetas e
     set estado = 'substituida',
         substituida_em = now(),
         substituida_por_classificacao_id = v_run.id
   where e.avistamento_id = v_run.avistamento_id
     and e.estado = 'inferida'
     and not exists (
       select 1 from jsonb_to_recordset(v_etiquetas) as x(categoria text, codigo text)
        where x.categoria = e.categoria and x.codigo = e.codigo
     );

  select count(*) into v_reafirmadas
    from jsonb_to_recordset(v_etiquetas) as x(categoria text, codigo text)
   where exists (
     select 1 from public.imoveis_identificados_etiquetas e
      where e.avistamento_id = v_run.avistamento_id
        and e.categoria = x.categoria
        and e.codigo = x.codigo
        and e.estado = 'inferida'
   );

  with desejadas as (
    select distinct on (x.categoria, x.codigo)
           x.categoria, x.codigo, x.confianca, x.modelo, x.versao_classificador
      from jsonb_to_recordset(v_etiquetas)
           as x(categoria text, codigo text, confianca smallint,
                modelo text, versao_classificador integer)
     order by x.categoria, x.codigo, x.confianca desc nulls last
  )
  insert into public.imoveis_identificados_etiquetas (
    imovel_identificado_id, avistamento_id, classificacao_id, user_id,
    categoria, codigo, origem, confianca, estado, modelo,
    versao_catalogo, versao_classificador, revisao_observacao, observado_em
  )
  select v_run.imovel_identificado_id, v_run.avistamento_id, v_run.id, p_user_id,
         d.categoria, d.codigo, 'ia-texto', d.confianca, 'inferida', d.modelo,
         v_run.versao_catalogo, d.versao_classificador,
         v_run.observacao_revisao, v_avistamento.observado_em
    from desejadas d
   where not exists (
     select 1 from public.imoveis_identificados_etiquetas e
      where e.avistamento_id = v_run.avistamento_id
        and e.categoria = d.categoria
        and e.codigo = d.codigo
        and e.estado in ('inferida', 'confirmada')
   );
  get diagnostics v_inseridas = row_count;

  -- O avistamento fecha com os quatro campos juntos: a bicondicional do C2a
  -- não admite meio estado.
  update public.imoveis_identificados_avistamentos a
     set classificacao_estado = 'concluida',
         classificacao_id = v_run.id,
         classificacao_em = now(),
         fingerprint = v_run.fingerprint
   where a.id = v_run.avistamento_id;

  -- SNAPSHOT TEMPORAL: reprocessar o passado não reescreve o presente.
  -- Só a execução do avistamento CORRENTE está autorizada a mover o snapshot.
  v_corrente := v_identidade.avistamento_corrente_id is not null
                and v_identidade.avistamento_corrente_id = v_run.avistamento_id;

  -- Tipo só pelas regras canônicas: manual e confirmado vencem inferência
  -- posterior, e sugestão nula não apaga tipo conhecido. A confiança é
  -- obrigatória porque o CHECK de `ia-texto` exige proveniência completa.
  v_aplica_tipo := v_corrente
                   and v_tipo is not null
                   and v_tipo_confianca is not null
                   and coalesce(v_identidade.tipo_origem, '') <> 'manual'
                   and coalesce(v_identidade.tipo_estado, '') <> 'confirmado';

  if v_aplica_tipo then
    update public.imoveis_identificados i
       set tipo = v_tipo,
           tipo_origem = 'ia-texto',
           tipo_confianca = v_tipo_confianca,
           tipo_estado = 'inferido',
           tipo_definido_em = now(),
           tipo_classificacao_id = v_run.id,
           tipo_avistamento_id = v_run.avistamento_id,
           tipo_confirmado_por = null,
           tipo_confirmado_em = null
     where i.id = v_run.imovel_identificado_id;
  end if;

  update public.imoveis_identificados_classificacoes c
     set estado = 'concluida',
         concluida_em = now(),
         lease_token = null,
         lease_expira_em = null,
         tipo_sugerido = v_tipo,
         tipo_confianca = v_tipo_confianca,
         snapshot_aplicado = v_corrente,
         sugeridas = greatest(
           coalesce((p_contadores->>'sugeridas')::integer, 0),
           v_inseridas + v_reafirmadas + v_ja_confirmada
         ),
         aplicadas = v_inseridas + v_reafirmadas,
         abaixo_do_piso = coalesce((p_contadores->>'abaixo_do_piso')::integer, 0),
         fora_do_catalogo = coalesce((p_contadores->>'fora_do_catalogo')::integer, 0),
         sem_evidencia = coalesce((p_contadores->>'sem_evidencia')::integer, 0),
         ja_confirmada = v_ja_confirmada
   where c.id = v_run.id;

  return jsonb_build_object(
    'ok', true,
    'repetida', false,
    'run_id', v_run.id,
    'modo', v_run.modo,
    'aplicadas', v_inseridas + v_reafirmadas,
    'inseridas', v_inseridas,
    'reafirmadas', v_reafirmadas,
    'ja_confirmada', v_ja_confirmada,
    'snapshot_aplicado', v_corrente,
    'tipo_aplicado', v_aplica_tipo
  );
end;
$$;

-- ============================================================
-- FALHAR — lista fechada, e o avistamento volta a um estado de produto
--
-- IA indisponível não é erro do usuário: a execução guarda o motivo
-- classificado e o avistamento fica `indisponivel` (ambiente/permissão não
-- liberam) ou `pendente` (transitório, vale tentar de novo). Em dev e Preview
-- esse é o caminho CORRETO, não uma falha a consertar.
-- ============================================================
create or replace function public.falhar_classificacao(
  p_user_id uuid,
  p_run_id uuid,
  p_lease_token uuid,
  p_falha_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jwt uuid := (select auth.uid());
  v_run public.imoveis_identificados_classificacoes;
  v_codigo text;
  v_estado_avistamento text;
begin
  if p_user_id is null then
    raise exception 'Usuário do servidor obrigatório.' using errcode = '42501';
  end if;
  if v_jwt is not null and v_jwt <> p_user_id then
    raise exception 'Usuário do servidor divergente da sessão.' using errcode = '42501';
  end if;

  select c.* into v_run
    from public.imoveis_identificados_classificacoes c
   where c.id = p_run_id
     and c.user_id = p_user_id
   for update;

  if v_run.id is null then
    raise exception 'Execução de classificação não encontrada.' using errcode = 'P0002';
  end if;

  if v_run.estado = 'falhou' then
    return jsonb_build_object('ok', true, 'repetida', true, 'run_id', v_run.id);
  end if;

  if v_run.estado <> 'processando'
     or v_run.lease_token is null
     or v_run.lease_token <> p_lease_token
     or v_run.lease_expira_em <= now() then
    return jsonb_build_object('ok', false, 'codigo', 'lease_invalido');
  end if;

  -- Lista fechada, no molde de concluir_mercado_monitorado: mensagem, URL,
  -- token e stack jamais são persistidos. Código desconhecido cai em
  -- 'falha-ia' em vez de vazar texto livre.
  v_codigo := case
    when p_falha_codigo in (
      'nao-configurado', 'sem-permissao', 'sessao-expirada', 'requisicao-invalida',
      'sem-dados', 'intervencao-humana', 'historico-insuficiente', 'contexto-incompleto',
      'baixa-confianca', 'geracao-reprovada', 'protocolo-inadequado',
      'falha-carregamento-contexto', 'falha-modelo', 'limite-excedido', 'falha-ia',
      'indisponivel', 'limite-diario', 'saida-invalida'
    ) then p_falha_codigo
    else 'falha-ia'
  end;

  -- Ambiente/permissão não liberam: o produto diz "classificação
  -- indisponível". O resto é transitório e volta para a fila.
  v_estado_avistamento := case
    when v_codigo in (
      'nao-configurado', 'sem-permissao', 'indisponivel', 'limite-diario', 'limite-excedido'
    ) then 'indisponivel'
    else 'pendente'
  end;

  update public.imoveis_identificados_classificacoes c
     set estado = 'falhou',
         falha_codigo = v_codigo,
         concluida_em = now(),
         lease_token = null,
         lease_expira_em = null,
         snapshot_aplicado = false
   where c.id = v_run.id;

  -- Os três campos da bicondicional seguem nulos: falha não produz
  -- classificação, e o avistamento nunca fica meio concluído.
  update public.imoveis_identificados_avistamentos a
     set classificacao_estado = v_estado_avistamento,
         classificacao_id = null,
         classificacao_em = null,
         fingerprint = null
   where a.id = v_run.avistamento_id;

  return jsonb_build_object(
    'ok', true,
    'repetida', false,
    'run_id', v_run.id,
    'falha_codigo', v_codigo,
    'estado_avistamento', v_estado_avistamento
  );
end;
$$;

-- ------------------------------------------------------------
-- Só o servidor alcança as três. `authenticated` não recebe execute em
-- nenhuma: é o que impede o navegador de pegar um lease e concluir com
-- etiquetas fabricadas.
-- ------------------------------------------------------------
revoke all on function public.iniciar_classificacao(
  uuid, uuid, text, text, text, integer, integer, smallint
) from public, anon, authenticated, service_role;
revoke all on function public.concluir_classificacao(
  uuid, uuid, uuid, text, smallint, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.falhar_classificacao(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;

grant execute on function public.iniciar_classificacao(
  uuid, uuid, text, text, text, integer, integer, smallint
) to service_role;
grant execute on function public.concluir_classificacao(
  uuid, uuid, uuid, text, smallint, jsonb, jsonb
) to service_role;
grant execute on function public.falhar_classificacao(
  uuid, uuid, uuid, text
) to service_role;
