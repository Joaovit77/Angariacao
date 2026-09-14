-- Garimpo em Campo — reuso restrito a execução reconstruível (V7, §8.3).
-- Substitui somente a busca de reuso de iniciar_classificacao da definição C2d:
-- a candidata precisa ter TODO o resultado materializado em linhas próprias
-- (`ja_confirmada = 0` e `aplicadas` = número de etiquetas com o seu
-- classificacao_id). Reuso é otimização: sem prova de reconstrução integral,
-- não há reuso parcial — cai para `modo='modelo'`. Claim, lease, advisory lock,
-- idempotência, exclusão e permissões permanecem intactos por CREATE OR REPLACE.

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
  --
  -- Só é fonte a execução cujo resultado o banco PROVA reconstruir inteiro
  -- pelas linhas dela (classificacao_id). `concluir_classificacao` não
  -- duplica etiqueta reafirmada (fica na linha do run anterior) nem toca a já
  -- confirmada — e não registra QUAL código foi reafirmado. Logo, um run com
  -- `ja_confirmada > 0` ou com `aplicadas` maior que o número de linhas
  -- próprias tem parte do resultado fora das suas linhas e não serve de
  -- fonte: cai para o modelo. Correção vale mais que token. As linhas de um
  -- run nunca somem (append-only, sem delete, o reuso copia em vez de mover),
  -- então a contagem é determinística. Entre as seguras, a mais recente.
  select c.id into v_reuso
    from public.imoveis_identificados_classificacoes c
   where c.user_id = p_user_id
     and c.imovel_identificado_id = v_avistamento.imovel_identificado_id
     and c.fingerprint = p_fingerprint
     and c.estado = 'concluida'
     and c.ja_confirmada = 0
     and c.aplicadas = (
       select count(*)
         from public.imoveis_identificados_etiquetas e
        where e.classificacao_id = c.id
     )
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
