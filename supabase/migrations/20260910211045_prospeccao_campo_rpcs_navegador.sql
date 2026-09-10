-- Garimpo em Campo — C2e: somente as dez RPCs do modelo Navegador.
-- RPCs de exclusão do modelo Servidor, bucket, policies de Storage, rota HTTP,
-- fronteira lib/prospeccao.ts, APIs e UI permanecem reservados ao C2f em diante.
--
-- MODELO DE IDENTIDADE — Navegador (as dez usam, nenhuma mistura):
--   identidade por `(select auth.uid())`. NENHUMA recebe `p_user_id` — isso é do
--   modelo Servidor do C2d, e os dois modelos não se encontram em função alguma.
--   `grant execute` só para `authenticated`.
--
-- Todas são `security definer` por necessidade: escrevem em colunas e tabelas
-- que o C2b deliberadamente NÃO concedeu ao cliente — `..._fotos` e
-- `..._etiquetas` são `select` apenas, e na identidade o cliente não alcança
-- `situacao`, `imovel_id`, `fundido_*`, `exclusao_solicitada_em` nem a
-- proveniência de tipo. Como o definer passa por cima da RLS, CADA uma valida
-- a posse explicitamente por `auth.uid()`, e posse cruzada devolve o MESMO erro
-- de inexistência — nem a existência do registro alheio é revelada.
--
-- REGRA GLOBAL: toda operação mutável recusa enquanto
-- `exclusao_solicitada_em` estiver preenchido. A única exceção é o próprio
-- cancelamento da exclusão, que existe justamente para sair desse estado.

-- ============================================================
-- RESERVAR FOTO — a linha nasce ANTES do objeto, e é ela que gera o caminho
--
-- Inverter a ordem é o que torna impossível objeto órfão: se o processo morrer
-- no upload, a linha `reservada` já existe e o objeto continua descobrível.
-- E o caminho é gerado AQUI, nunca aceito do browser — é o que a policy de
-- insert do bucket vai exigir (C2f), e é o que torna caminho forjado
-- impossível em vez de apenas improvável.
-- ============================================================
create or replace function public.reservar_foto_avistamento(
  p_avistamento_id uuid,
  p_largura integer,
  p_altura integer,
  p_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_avistamento public.imoveis_identificados_avistamentos;
  v_identidade public.imoveis_identificados;
  v_foto public.imoveis_identificados_fotos;
  v_base text;
  v_uuid text;
  v_id uuid;
  v_caminho text;
  v_miniatura text;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_largura is null or p_largura <= 0
     or p_altura is null or p_altura <= 0
     or p_bytes is null or p_bytes <= 0 then
    raise exception 'Dimensões e tamanho da foto obrigatórios.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reservar-foto:' || p_avistamento_id::text, 0)
  );

  select a.* into v_avistamento
    from public.imoveis_identificados_avistamentos a
   where a.id = p_avistamento_id
     and a.user_id = v_user;

  if v_avistamento.id is null then
    raise exception 'Avistamento não encontrado.' using errcode = 'P0002';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = v_avistamento.imovel_identificado_id;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_fundido');
  end if;

  -- Idempotente: a reserva aberta daquele avistamento é devolvida como está,
  -- com os MESMOS caminhos. Retry sobe o que falta e chama finalizar de novo.
  select f.* into v_foto
    from public.imoveis_identificados_fotos f
   where f.avistamento_id = p_avistamento_id;

  if v_foto.id is not null then
    if v_foto.estado = 'reservada' then
      return jsonb_build_object(
        'ok', true, 'repetida', true,
        'foto_id', v_foto.id,
        'caminho', v_foto.caminho,
        'caminho_miniatura', v_foto.caminho_miniatura
      );
    end if;
    -- Uma foto por avistamento é garantia do índice único do C2a. Trocar a
    -- foto é remover a atual pelo fluxo de exclusão e reservar outra — em
    -- sistema longitudinal, substituir evidência é ato deliberado.
    return jsonb_build_object('ok', false, 'codigo', 'foto_ja_ativa', 'foto_id', v_foto.id);
  end if;

  v_uuid := gen_random_uuid()::text;
  v_base := v_user::text || '/' || v_avistamento.imovel_identificado_id::text
            || '/' || p_avistamento_id::text || '/' || v_uuid;
  v_caminho := v_base || '.jpg';
  v_miniatura := v_base || '_thumb.jpg';

  insert into public.imoveis_identificados_fotos (
    avistamento_id, imovel_identificado_id, user_id, estado,
    caminho, caminho_miniatura, largura, altura, bytes, capturada_em
  ) values (
    p_avistamento_id, v_avistamento.imovel_identificado_id, v_user, 'reservada',
    v_caminho, v_miniatura, p_largura, p_altura, p_bytes, v_avistamento.observado_em
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'repetida', false,
    'foto_id', v_id, 'caminho', v_caminho, 'caminho_miniatura', v_miniatura
  );
end;
$$;

-- ============================================================
-- FINALIZAR FOTO — ativa só com PROVA, nunca por confiança no browser
--
-- Lê `storage.objects` e exige os DOIS caminhos exatos daquela reserva. Em
-- qualquer recusa a linha permanece `reservada`: estado recuperável, e o
-- objeto que já subiu continua descoberto pela linha.
--
-- Nunca escreve nem apaga objeto: só LÊ o catálogo do Storage.
-- ============================================================
create or replace function public.finalizar_foto_avistamento(p_foto_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_foto public.imoveis_identificados_fotos;
  v_identidade public.imoveis_identificados;
  v_tem_original boolean;
  v_tem_miniatura boolean;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  select f.* into v_foto
    from public.imoveis_identificados_fotos f
   where f.id = p_foto_id
     and f.user_id = v_user
   for update;

  if v_foto.id is null then
    raise exception 'Foto não encontrada.' using errcode = 'P0002';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = v_foto.imovel_identificado_id;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_fundido');
  end if;

  -- Posse dos objetos é garantida pela construção do caminho: o primeiro
  -- segmento é o user_id, e a reserva já foi filtrada por `f.user_id = v_user`.
  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'fachadas' and o.name = v_foto.caminho
  ) into v_tem_original;

  select exists (
    select 1 from storage.objects o
     where o.bucket_id = 'fachadas' and o.name = v_foto.caminho_miniatura
  ) into v_tem_miniatura;

  if v_foto.estado = 'ativa' then
    if v_tem_original and v_tem_miniatura then
      return jsonb_build_object('ok', true, 'repetida', true, 'foto_id', v_foto.id);
    end if;
    -- Rebaixar `ativa` por ausência seria reescrever história a partir de uma
    -- leitura que pode ter falhado. Reporta, e a UI oferece o caminho honesto.
    return jsonb_build_object(
      'ok', false, 'codigo', 'objeto_ausente', 'foto_id', v_foto.id,
      'tem_original', v_tem_original, 'tem_miniatura', v_tem_miniatura
    );
  end if;

  if not v_tem_original and not v_tem_miniatura then
    return jsonb_build_object('ok', false, 'codigo', 'nenhum_objeto', 'foto_id', v_foto.id);
  end if;
  if v_tem_original and not v_tem_miniatura then
    return jsonb_build_object('ok', false, 'codigo', 'miniatura_ausente', 'foto_id', v_foto.id);
  end if;
  if v_tem_miniatura and not v_tem_original then
    return jsonb_build_object('ok', false, 'codigo', 'original_ausente', 'foto_id', v_foto.id);
  end if;

  update public.imoveis_identificados_fotos f
     set estado = 'ativa',
         ativada_em = now()
   where f.id = v_foto.id;

  return jsonb_build_object('ok', true, 'repetida', false, 'foto_id', v_foto.id);
end;
$$;

-- ============================================================
-- APLICAR ETIQUETA HUMANA
--
-- Codifica `origem='manual'` e não existe parâmetro de origem: o cliente não
-- tem onde escrever 'ia-texto'. Aplicar uma etiqueta à mão É assinar, então o
-- estado nasce `confirmada` com autoria de `auth.uid()` — nunca recebida.
--
-- `avistamento_id` nulo significa etiqueta sobre o LUGAR, não sobre um momento
-- (§6.1); quando vem preenchido, o avistamento tem de pertencer ao imóvel
-- informado, senão a etiqueta ficaria pendurada em duas identidades.
--
-- A VERSÃO DO CATÁLOGO NÃO VEM DO NAVEGADOR. O catálogo vive em código (D3) e
-- `VERSAO_CATALOGO_ETIQUETAS` é a fonte única; deixar o cliente informá-la
-- permitiria declarar que uma etiqueta nasceu sob um catálogo que não era o
-- vigente. A constante é resolvida aqui dentro, e o que impede as duas cópias
-- de divergirem é o mecanismo que o próprio plano usa para o schema do modelo:
-- um teste amarra este literal a `lib/calculo/catalogoEtiquetas.ts`. Ao subir a
-- versão lá, este número sobe junto — e o teste recusa esquecer.
-- ============================================================
create or replace function public.aplicar_etiqueta_humana(
  p_imovel_identificado_id uuid,
  p_avistamento_id uuid,
  p_categoria text,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_avistamento public.imoveis_identificados_avistamentos;
  v_categoria text := nullif(trim(coalesce(p_categoria, '')), '');
  v_codigo text := nullif(trim(coalesce(p_codigo, '')), '');
  -- Espelho de VERSAO_CATALOGO_ETIQUETAS (lib/calculo/catalogoEtiquetas.ts).
  -- Amarrado por teste: subir a versão lá obriga subir aqui.
  v_versao_catalogo constant integer := 1;
  v_existente bigint;
  v_id bigint;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if v_categoria is null or v_codigo is null then
    raise exception 'Categoria e código da etiqueta obrigatórios.' using errcode = '22023';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = v_user;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_fundido');
  end if;

  if p_avistamento_id is not null then
    select a.* into v_avistamento
      from public.imoveis_identificados_avistamentos a
     where a.id = p_avistamento_id
       and a.user_id = v_user
       and a.imovel_identificado_id = p_imovel_identificado_id;

    if v_avistamento.id is null then
      raise exception 'Avistamento não encontrado.' using errcode = 'P0002';
    end if;
  end if;

  -- Vigente é `inferida` ou `confirmada`, e o único parcial do C2a garante um
  -- por escopo. Repetir a mesma etiqueta não cria segunda linha.
  select e.id into v_existente
    from public.imoveis_identificados_etiquetas e
   where e.categoria = v_categoria
     and e.codigo = v_codigo
     and e.estado in ('inferida', 'confirmada')
     and (
       (p_avistamento_id is not null and e.avistamento_id = p_avistamento_id)
       or (p_avistamento_id is null
           and e.avistamento_id is null
           and e.imovel_identificado_id = p_imovel_identificado_id)
     )
   limit 1;

  if v_existente is not null then
    return jsonb_build_object('ok', true, 'repetida', true, 'etiqueta_id', v_existente);
  end if;

  insert into public.imoveis_identificados_etiquetas (
    imovel_identificado_id, avistamento_id, classificacao_id, user_id,
    categoria, codigo, origem, confianca, estado, modelo,
    versao_catalogo, versao_classificador, revisao_observacao,
    observado_em, confirmada_por, confirmada_em
  ) values (
    p_imovel_identificado_id, p_avistamento_id, null, v_user,
    v_categoria, v_codigo, 'manual', null, 'confirmada', null,
    v_versao_catalogo, null,
    case when p_avistamento_id is null then null else v_avistamento.observacao_revisao end,
    coalesce(v_avistamento.observado_em, now()), v_user, now()
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'repetida', false, 'etiqueta_id', v_id);
end;
$$;

-- ============================================================
-- DEFINIR ESTADO DA ETIQUETA — confirmar ou contestar
--
-- Autoria SEMPRE de `auth.uid()`: nenhum id vindo do navegador é confiado.
-- Precedentes literais: `recebido_por = v_user` em receber_repasses_em_lote e
-- proteger_status_history_imovel trocando o `userId` do cliente pelo real.
--
-- Só age sobre etiqueta VIGENTE: `substituida` e `desatualizada` são história,
-- e história não se reabre por aqui.
-- ============================================================
create or replace function public.definir_estado_etiqueta(
  p_etiqueta_id bigint,
  p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_etiqueta public.imoveis_identificados_etiquetas;
  v_identidade public.imoveis_identificados;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_estado is null or p_estado not in ('confirmada', 'contestada') then
    raise exception 'Estado humano inválido para etiqueta.' using errcode = '22023';
  end if;

  select e.* into v_etiqueta
    from public.imoveis_identificados_etiquetas e
   where e.id = p_etiqueta_id
     and e.user_id = v_user
   for update;

  if v_etiqueta.id is null then
    raise exception 'Etiqueta não encontrada.' using errcode = 'P0002';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = v_etiqueta.imovel_identificado_id;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  if v_etiqueta.estado = p_estado then
    return jsonb_build_object('ok', true, 'repetida', true, 'etiqueta_id', v_etiqueta.id);
  end if;

  if v_etiqueta.estado not in ('inferida', 'confirmada', 'contestada') then
    return jsonb_build_object(
      'ok', false, 'codigo', 'etiqueta_nao_vigente', 'estado', v_etiqueta.estado
    );
  end if;

  if p_estado = 'confirmada' then
    update public.imoveis_identificados_etiquetas e
       set estado = 'confirmada',
           confirmada_por = v_user,
           confirmada_em = now()
     where e.id = v_etiqueta.id;
  else
    -- Contestar não apaga a assinatura anterior: que alguém havia confirmado
    -- continua sendo fato. O que muda é a etiqueta deixar de valer.
    update public.imoveis_identificados_etiquetas e
       set estado = 'contestada'
     where e.id = v_etiqueta.id;
  end if;

  return jsonb_build_object(
    'ok', true, 'repetida', false, 'etiqueta_id', v_etiqueta.id, 'estado', p_estado
  );
end;
$$;

-- ============================================================
-- DEFINIR TIPO MANUAL — a porta humana do tipo
--
-- Uma das três portas nomeadas do tipo (§7.2), e a razão de `tipo` estar fora
-- do grant de `update` do cliente: sem porta ambígua, o gatilho não precisa
-- adivinhar quem escreveu. Manual SEMPRE vence — e ao vencer, zera a
-- proveniência de IA em vez de mascará-la.
--
-- `p_tipo` nulo limpa o tipo e todos os metadados: "não sei mais" é resposta
-- legítima, e o CHECK do C2a exige que tudo caia junto.
-- ============================================================
create or replace function public.definir_tipo_manual(
  p_imovel_identificado_id uuid,
  p_tipo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = v_user
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_fundido');
  end if;

  update public.imoveis_identificados i
     set tipo = v_tipo,
         tipo_origem = case when v_tipo is null then null else 'manual' end,
         tipo_estado = case when v_tipo is null then null else 'declarado' end,
         tipo_definido_em = case when v_tipo is null then null else now() end,
         tipo_confianca = null,
         tipo_classificacao_id = null,
         tipo_avistamento_id = null,
         tipo_confirmado_por = null,
         tipo_confirmado_em = null
   where i.id = p_imovel_identificado_id;

  return jsonb_build_object('ok', true, 'imovel_identificado_id', p_imovel_identificado_id, 'tipo', v_tipo);
end;
$$;

-- ============================================================
-- CONFIRMAR TIPO INFERIDO — o humano assina a leitura da IA
--
-- Mantém `tipo_origem='ia-texto'` e a cadeia inteira de proveniência, de
-- propósito: a história "a IA sugeriu, o humano assinou" tem de sobreviver.
-- Só confirma inferência válida — tipo manual não tem o que confirmar.
-- ============================================================
create or replace function public.confirmar_tipo_identificado(p_imovel_identificado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = v_user
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;

  if v_identidade.tipo_estado = 'confirmado' then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;

  if v_identidade.tipo is null
     or v_identidade.tipo_origem is distinct from 'ia-texto'
     or v_identidade.tipo_estado is distinct from 'inferido' then
    return jsonb_build_object('ok', false, 'codigo', 'tipo_nao_inferido');
  end if;

  update public.imoveis_identificados i
     set tipo_estado = 'confirmado',
         tipo_confirmado_por = v_user,
         tipo_confirmado_em = now()
   where i.id = p_imovel_identificado_id;

  return jsonb_build_object('ok', true, 'repetida', false, 'tipo', v_identidade.tipo);
end;
$$;

-- ============================================================
-- DEFINIR SITUAÇÃO — descartar, reativar, investigar, iniciar promoção
--
-- `promovido` e `fundido` são INALCANÇÁVEIS por aqui: o primeiro só nasce de
-- `vincular_promocao_imovel_identificado`, o segundo só da fusão. Descartar é
-- `update` de estado e preserva tudo — avistamentos, fotos, classificações,
-- etiquetas e datas.
--
-- `promovendo` é o estado transitório que impede uma segunda oportunidade
-- quando o vínculo falha no meio (§13.2); o CHECK do C2a exige `imovel_id` e
-- `promovido_em` nulos nele.
-- ============================================================
create or replace function public.definir_situacao_identificado(
  p_imovel_identificado_id uuid,
  p_situacao text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_situacao is null
     or p_situacao not in ('identificado', 'investigando', 'promovendo', 'descartado') then
    raise exception 'Situação não definível pelo usuário.' using errcode = '22023';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = v_user
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_fundido');
  end if;
  -- Despromover não é decisão deste módulo: a oportunidade vive no Pipeline.
  if v_identidade.situacao = 'promovido' then
    return jsonb_build_object('ok', false, 'codigo', 'ja_promovido');
  end if;

  if v_identidade.situacao = p_situacao then
    return jsonb_build_object('ok', true, 'repetida', true, 'situacao', p_situacao);
  end if;

  update public.imoveis_identificados i
     set situacao = p_situacao,
         descartado_em = case when p_situacao = 'descartado' then now() else null end,
         descartado_motivo = case when p_situacao = 'descartado' then v_motivo else null end
   where i.id = p_imovel_identificado_id;

  return jsonb_build_object('ok', true, 'repetida', false, 'situacao', p_situacao);
end;
$$;

-- ============================================================
-- VINCULAR PROMOÇÃO — o único caminho de `imovel_id`/`promovido_em`
--
-- NÃO cria `Imovel` e NÃO promove sozinha: o `Imovel` nasce no ModalImovel,
-- por ato humano, e esta função apenas grava o vínculo que já foi decidido.
-- É o que torna o invariante "nada promove automaticamente" verificável.
--
-- Idempotente com o MESMO `imovel_id` (é a recuperação de promoção parcial de
-- §13.2) e RECUSADA com outro: um registro promovido não troca de oportunidade
-- em silêncio. E um `Imovel` já vinculado a outro identificado é recusado,
-- senão dois registros reivindicariam a mesma oportunidade.
-- ============================================================
create or replace function public.vincular_promocao_imovel_identificado(
  p_imovel_identificado_id uuid,
  p_imovel_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_tem_imovel boolean;
  v_outro uuid;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;
  if p_imovel_id is null then
    raise exception 'Oportunidade do Pipeline obrigatória.' using errcode = '22023';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = v_user
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
  end if;
  if v_identidade.situacao = 'fundido' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_fundido');
  end if;

  -- Posse da ponta do Pipeline conferida explicitamente: o definer passa por
  -- cima da RLS, então a validação é desta função.
  select exists (
    select 1 from public.imoveis m
     where m.id = p_imovel_id and m.user_id = v_user
  ) into v_tem_imovel;

  if not v_tem_imovel then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;

  if v_identidade.situacao = 'promovido' then
    if v_identidade.imovel_id = p_imovel_id then
      return jsonb_build_object(
        'ok', true, 'repetida', true,
        'imovel_id', v_identidade.imovel_id,
        'promovido_em', v_identidade.promovido_em
      );
    end if;
    return jsonb_build_object('ok', false, 'codigo', 'ja_promovido_em_outra');
  end if;

  if v_identidade.situacao = 'descartado' then
    return jsonb_build_object('ok', false, 'codigo', 'registro_descartado');
  end if;

  select o.id into v_outro
    from public.imoveis_identificados o
   where o.imovel_id = p_imovel_id
     and o.id <> p_imovel_identificado_id
   limit 1;

  if v_outro is not null then
    return jsonb_build_object('ok', false, 'codigo', 'imovel_ja_vinculado', 'vinculado_a', v_outro);
  end if;

  update public.imoveis_identificados i
     set situacao = 'promovido',
         imovel_id = p_imovel_id,
         promovido_em = now()
   where i.id = p_imovel_identificado_id;

  return jsonb_build_object(
    'ok', true, 'repetida', false, 'imovel_id', p_imovel_id
  );
end;
$$;

-- ============================================================
-- FUNDIR — reparenteamento controlado, nada apagado e recriado
--
-- O absorvido NÃO é apagado: vira lápide `fundido` apontando o sobrevivente.
-- Essa lápide é a própria AUTORIZAÇÃO do reparenteamento para o gatilho do
-- C2c — condição de DADO, não de sessão, que fica no banco para sempre.
--
-- Ponteiro canônico: ao fundir B em C, as lápides que apontavam para B são
-- repontuadas para C. Então `fundido_em_imovel_id` é sempre o sobrevivente
-- VIVO FINAL, resolução em um salto, sem recursão e sem lápide quebrada.
--
-- Uma função = uma transação: falha em qualquer ponto faz rollback integral,
-- e nenhuma metade fica migrada. Os caminhos do Storage NÃO se movem (o
-- caminho é identificador opaco e a policy decide pelo user_id); o que muda é
-- o `imovel_identificado_id` denormalizado na linha.
-- ============================================================
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
  if p_sobrevivente_id = p_absorvido_id then
    return jsonb_build_object('ok', false, 'codigo', 'fusao_em_si_mesmo');
  end if;

  -- Ordem estável do lock: duas fusões cruzadas não se esperam em ciclo.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'fundir:' || v_user::text || ':' || least(p_sobrevivente_id::text, p_absorvido_id::text),
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'fundir:' || v_user::text || ':' || greatest(p_sobrevivente_id::text, p_absorvido_id::text),
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

  -- Já fundido NESTE sobrevivente: idempotente.
  if v_absorvido.situacao = 'fundido'
     and v_absorvido.fundido_em_imovel_id = p_sobrevivente_id then
    return jsonb_build_object('ok', true, 'repetida', true,
      'sobrevivente_id', p_sobrevivente_id, 'absorvido_id', p_absorvido_id);
  end if;

  if v_sobrevivente.exclusao_solicitada_em is not null
     or v_absorvido.exclusao_solicitada_em is not null then
    return jsonb_build_object('ok', false, 'codigo', 'exclusao_em_andamento');
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

-- ============================================================
-- CANCELAR EXCLUSÃO — a única saída humana do estado congelado
--
-- Limpa somente `exclusao_solicitada_em`, que é o que o gatilho do C2c deixa
-- passar enquanto a exclusão está em andamento. NÃO restaura foto: objeto já
-- removido do Storage não volta, e a UI avisa isso antes de confirmar.
-- ============================================================
create or replace function public.cancelar_exclusao_imovel_identificado(
  p_imovel_identificado_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_identidade public.imoveis_identificados;
  v_fotos integer;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  select i.* into v_identidade
    from public.imoveis_identificados i
   where i.id = p_imovel_identificado_id
     and i.user_id = v_user
   for update;

  if v_identidade.id is null then
    raise exception 'Imóvel identificado não encontrado.' using errcode = 'P0002';
  end if;

  if v_identidade.exclusao_solicitada_em is null then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;

  select count(*) into v_fotos
    from public.imoveis_identificados_fotos f
   where f.imovel_identificado_id = p_imovel_identificado_id;

  update public.imoveis_identificados i
     set exclusao_solicitada_em = null
   where i.id = p_imovel_identificado_id;

  -- `fotos_restantes` é o que sobrou de verdade: o que a exclusão já removeu
  -- não é ressuscitado por este cancelamento.
  return jsonb_build_object('ok', true, 'repetida', false, 'fotos_restantes', v_fotos);
end;
$$;

-- ------------------------------------------------------------
-- Modelo Navegador: execute só para `authenticated`. `service_role` não entra
-- aqui — o caminho do servidor é o do C2d, com `p_user_id` explícito.
-- ------------------------------------------------------------
revoke all on function public.reservar_foto_avistamento(uuid, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finalizar_foto_avistamento(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.aplicar_etiqueta_humana(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.definir_estado_etiqueta(bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.definir_tipo_manual(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.confirmar_tipo_identificado(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.definir_situacao_identificado(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.vincular_promocao_imovel_identificado(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fundir_imoveis_identificados(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.cancelar_exclusao_imovel_identificado(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.reservar_foto_avistamento(uuid, integer, integer, integer)
  to authenticated;
grant execute on function public.finalizar_foto_avistamento(uuid) to authenticated;
grant execute on function public.aplicar_etiqueta_humana(uuid, uuid, text, text) to authenticated;
grant execute on function public.definir_estado_etiqueta(bigint, text) to authenticated;
grant execute on function public.definir_tipo_manual(uuid, text) to authenticated;
grant execute on function public.confirmar_tipo_identificado(uuid) to authenticated;
grant execute on function public.definir_situacao_identificado(uuid, text, text) to authenticated;
grant execute on function public.vincular_promocao_imovel_identificado(uuid, uuid)
  to authenticated;
grant execute on function public.fundir_imoveis_identificados(uuid, uuid) to authenticated;
grant execute on function public.cancelar_exclusao_imovel_identificado(uuid) to authenticated;
