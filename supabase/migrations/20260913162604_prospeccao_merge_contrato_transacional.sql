-- Garimpo em Campo — correção contratual da RPC de merge (V7, §12.1).
-- Substitui somente o lock e a precedência das validações da definição C2e.
-- Uma chave user_id|menor_id|maior_id; exclusão bloqueia também a repetição.
-- Assinatura e permissões existentes são preservadas por CREATE OR REPLACE.
-- Lápide, histórico, denormalizados, agregados e tipo permanecem intactos.

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
