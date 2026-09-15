-- Garimpo em Campo — correção contratual do reuso em concluir_classificacao (V7, §8.3).
-- Substitui somente a seleção de origem do ramo `modo='reuso'` da definição C2d:
-- a fonte é a execução apontada por `reusada_de_classificacao_id`, e o estado
-- mutável das linhas dela deixa de condicionar a cópia. Caso que motivou: rev 1
-- classificada, rev 2 corrige o texto (etiquetas viram `desatualizada`), rev 3
-- volta ao texto original — o reuso concluía com zero etiquetas.
-- Assinatura, permissões, claim, supersessão, `ja_confirmada`, snapshot temporal
-- e o ramo modelo permanecem intactos por CREATE OR REPLACE.

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
    -- Payload ignorado: reconstrói a SAÍDA da execução de origem, ancorada
    -- no `classificacao_id` que `iniciar_classificacao` escolheu. O estado
    -- atual de cada linha (`desatualizada`, `substituida`, `contestada`…) é
    -- ciclo de vida da afirmação histórica, não identidade do resultado:
    -- filtrar por ele fazia o reuso perder etiquetas quando a observação
    -- foi corrigida e depois voltou ao texto original. A linha nova nasce
    -- sempre 'inferida' — confirmação humana NUNCA é copiada.
    select coalesce(jsonb_agg(jsonb_build_object(
             'categoria', e.categoria,
             'codigo', e.codigo,
             'confianca', e.confianca,
             'modelo', e.modelo,
             'versao_classificador', e.versao_classificador
           )), '[]'::jsonb)
      into v_etiquetas
      from public.imoveis_identificados_etiquetas e
     where e.classificacao_id = v_run.reusada_de_classificacao_id;

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
