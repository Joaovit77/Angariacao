-- Garimpo em Campo — C2c: somente triggers e a função privada de recálculo.
-- RPCs, Storage, bucket, APIs e UI permanecem reservados aos checkpoints seguintes.
--
-- Divisão de papéis que o plano fixa e este arquivo respeita:
--   grant  = autorização (fechada no C2b)
--   CHECK  = invariante de linha (fechado no C2a)
--   trigger = derivação, bloqueio e invalidação  ← é só isto que entra aqui
--
-- Três destas funções são `security definer` por necessidade, não por
-- conveniência: elas escrevem em colunas e tabelas que o C2b deliberadamente
-- NÃO concedeu ao cliente (agregados da identidade, etiquetas). Sem isso a
-- correção de uma observação falharia com 42501 para o próprio dono do
-- registro. Precedente idêntico: private.registrar_observacao_comparavel.

-- ============================================================
-- RECÁLCULO TOTAL DOS AGREGADOS DA IDENTIDADE
--
-- Total, nunca incremental. Recontar do zero é idempotente e auto-corretivo:
-- rodar de novo conserta qualquer divergência, inclusive a que um
-- reparenteamento de fusão poderia deixar. Precedente de recálculo total em
-- vez de soma: receber_repasses_em_lote refaz max(data_recebimento).
--
-- Corrente é o avistamento de maior `observado_em` — a DATA DO EVENTO —, com
-- desempate por `created_at` e `id`. É exatamente isso que impede um
-- avistamento antigo registrado hoje de virar o corrente e mover o snapshot.
--
-- A melhor localização é a do avistamento de MENOR `acuracia_metros`: um fix
-- de ±80 m nunca apaga um de ±7 m. Acurácia desconhecida fica por último
-- (`nulls last`) e só vence quando nenhuma é conhecida; aí decide o mais
-- recente. Avistamento sem coordenada não concorre.
--
-- Só escreve quando algum valor muda, então chamar à vontade é barato e uma
-- correção de observação não suja o `updated_at` da identidade. Identidade
-- inexistente é no-op: no cascade da exclusão o pai já foi embora quando o
-- gatilho do filho roda, e o UPDATE simplesmente não casa linha nenhuma.
-- ============================================================
create or replace function private.recalcular_agregados_identificado(p_imovel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_primeiro timestamptz;
  v_ultimo timestamptz;
  v_corrente uuid;
  v_latitude double precision;
  v_longitude double precision;
  v_acuracia numeric;
  v_precisao text;
begin
  if p_imovel_id is null then
    return;
  end if;

  select count(*), min(a.observado_em), max(a.observado_em)
    into v_total, v_primeiro, v_ultimo
    from public.imoveis_identificados_avistamentos a
   where a.imovel_identificado_id = p_imovel_id;

  select a.id
    into v_corrente
    from public.imoveis_identificados_avistamentos a
   where a.imovel_identificado_id = p_imovel_id
   order by a.observado_em desc, a.created_at desc, a.id desc
   limit 1;

  select a.latitude, a.longitude, a.acuracia_metros, a.precisao_localizacao
    into v_latitude, v_longitude, v_acuracia, v_precisao
    from public.imoveis_identificados_avistamentos a
   where a.imovel_identificado_id = p_imovel_id
     and a.latitude is not null
     and a.longitude is not null
   order by a.acuracia_metros asc nulls last,
            a.observado_em desc, a.created_at desc, a.id desc
   limit 1;

  update public.imoveis_identificados i
     set primeiro_avistamento_em = v_primeiro,
         ultimo_avistamento_em = v_ultimo,
         avistamentos_total = coalesce(v_total, 0),
         avistamento_corrente_id = v_corrente,
         latitude = v_latitude,
         longitude = v_longitude,
         acuracia_metros = v_acuracia,
         precisao_localizacao = coalesce(v_precisao, 'desconhecida')
   where i.id = p_imovel_id
     and (
       i.primeiro_avistamento_em is distinct from v_primeiro
       or i.ultimo_avistamento_em is distinct from v_ultimo
       or i.avistamentos_total is distinct from coalesce(v_total, 0)
       or i.avistamento_corrente_id is distinct from v_corrente
       or i.latitude is distinct from v_latitude
       or i.longitude is distinct from v_longitude
       or i.acuracia_metros is distinct from v_acuracia
       or i.precisao_localizacao is distinct from coalesce(v_precisao, 'desconhecida')
     );
end;
$$;

-- ============================================================
-- SINCRONIZAÇÃO DA LINHA CORRENTE
--
-- `after insert or update or delete`: o UPDATE entra na lista porque o
-- reparenteamento da fusão muda `imovel_identificado_id`, e aí os DOIS lados
-- precisam ser recalculados — a origem fica com zero avistamentos e o destino
-- herda os eventos.
-- ============================================================
create or replace function private.sincronizar_avistamentos_identidade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recalcular_agregados_identificado(old.imovel_identificado_id);
    return old;
  end if;

  perform private.recalcular_agregados_identificado(new.imovel_identificado_id);

  if tg_op = 'UPDATE'
     and old.imovel_identificado_id is distinct from new.imovel_identificado_id then
    perform private.recalcular_agregados_identificado(old.imovel_identificado_id);
  end if;

  return new;
end;
$$;

-- ============================================================
-- O ÚNICO `before update` DO AVISTAMENTO
--
-- Proteção, bloqueio e invalidação numa função só, de propósito: dois
-- gatilhos `before update` na mesma tabela disparariam por ordem de NOME, e
-- correção que depende de ordem alfabética não é correção. Uma função tem
-- ordem interna garantida por construção.
--
-- A invalidação escreve em outra tabela daqui mesmo, e não num `after`
-- separado, porque um `after` teria de REDESCOBRIR "a observação mudou?"
-- comparando OLD/NEW outra vez — a mesma lógica em dois lugares, que é
-- justamente a fragilidade que se quer eliminar. O rollback continua atômico
-- porque tudo roda na transação do próprio UPDATE.
-- ============================================================
create or replace function private.proteger_avistamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pai public.imoveis_identificados;
  v_destino public.imoveis_identificados;
  v_observacao_mudou boolean;
  v_tem_confirmada boolean;
begin
  -- 1. O avistamento é evento: quando e onde são imutáveis.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.observado_em is distinct from old.observado_em
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude
     or new.acuracia_metros is distinct from old.acuracia_metros
     or new.precisao_localizacao is distinct from old.precisao_localizacao
     or new.created_at is distinct from old.created_at then
    raise exception
      'Avistamento é evento histórico: data, localização e autoria são imutáveis. Só a observação pode ser corrigida.'
      using errcode = '42501';
  end if;

  select * into v_pai
    from public.imoveis_identificados
   where id = old.imovel_identificado_id;

  if new.imovel_identificado_id is distinct from old.imovel_identificado_id then
    -- 2. Reparenteamento existe só para a fusão, e a autorização é a LÁPIDE:
    --    a origem precisa já estar `fundido` apontando exatamente o destino.
    --    Condição de DADO, não de sessão — fica no banco para sempre.
    select * into v_destino
      from public.imoveis_identificados
     where id = new.imovel_identificado_id;

    if v_pai.id is null
       or v_destino.id is null
       or v_pai.situacao is distinct from 'fundido'
       or v_pai.fundido_em_imovel_id is distinct from new.imovel_identificado_id
       or v_pai.user_id is distinct from v_destino.user_id
       or v_destino.user_id is distinct from new.user_id then
      raise exception
        'Avistamento só troca de imóvel pela fusão controlada, depois que a origem vira lápide apontando o destino.'
        using errcode = '42501';
    end if;

    if v_pai.exclusao_solicitada_em is not null
       or v_destino.exclusao_solicitada_em is not null then
      raise exception 'Registro com exclusão em andamento não participa de fusão.'
        using errcode = '42501';
    end if;
  elsif v_pai.exclusao_solicitada_em is not null then
    -- 3. Exclusão em andamento congela o avistamento: retomável, não mutável.
    raise exception
      'Registro com exclusão em andamento: o avistamento não aceita alteração até a exclusão terminar ou ser cancelada.'
      using errcode = '42501';
  end if;

  -- 4. A revisão é do gatilho, não do chamador. Sobrescrever o que veio de
  --    fora é o padrão de proteger_status_history_imovel, que troca o `userId`
  --    do navegador pelo `auth.uid()` real.
  v_observacao_mudou := new.observacao is distinct from old.observacao;
  new.observacao_revisao :=
    old.observacao_revisao + (case when v_observacao_mudou then 1 else 0 end);

  if not v_observacao_mudou then
    -- `revisao_conflito_em` fica como veio: quem revisa o conflito precisa
    -- poder limpá-lo sem mexer no texto.
    return new;
  end if;

  -- 5. Texto novo invalida a inferência que se apoiava no texto velho, na
  --    MESMA transação. Nunca existe a janela "texto novo + etiqueta antiga
  --    apresentada como atual".
  new.classificacao_estado := 'pendente';
  new.classificacao_id := null;
  new.classificacao_em := null;
  new.fingerprint := null;

  -- `desatualizada` e não `substituida`: fatos diferentes. Substituída é
  -- "outra execução a trocou"; desatualizada é "o texto que a embasava não
  -- existe mais". A linha CONTINUA na tabela — o histórico não encolhe.
  update public.imoveis_identificados_etiquetas
     set estado = 'desatualizada',
         desatualizada_em = now()
   where avistamento_id = old.id
     and estado = 'inferida';

  -- Confirmação humana NÃO é revogada: confirmar é afirmação sobre o mundo,
  -- não sobre o texto. Mas se o texto corrigido contradisser a confirmação, o
  -- sistema não tem como decidir — então avisa e deixa o humano resolver.
  select exists (
    select 1
      from public.imoveis_identificados_etiquetas
     where avistamento_id = old.id
       and estado = 'confirmada'
  ) into v_tem_confirmada;

  if v_tem_confirmada then
    new.revisao_conflito_em := now();
  end if;

  -- 6. Inferência de tipo cuja evidência desapareceu para de ser afirmada.
  --    Não é importar o passado para o presente: é parar de apresentar como
  --    atual algo que perdeu a base. Manual e confirmado ficam intactos.
  update public.imoveis_identificados i
     set tipo = null,
         tipo_origem = null,
         tipo_confianca = null,
         tipo_estado = null,
         tipo_definido_em = null,
         tipo_classificacao_id = null,
         tipo_avistamento_id = null,
         tipo_confirmado_por = null,
         tipo_confirmado_em = null
   where i.id = old.imovel_identificado_id
     and i.tipo_avistamento_id = old.id
     and i.tipo_origem = 'ia-texto'
     and i.tipo_estado = 'inferido';

  return new;
end;
$$;

-- ============================================================
-- O `before update` DA IDENTIDADE — só derivação e bloqueio
--
-- Assimetria deliberada em relação ao avistamento: ali existe gatilho de
-- IMUTABILIDADE porque a tabela é log append-only, e é onde o projeto sempre
-- põe gatilho (proteger_snapshot_repasse, proteger_status_history_imovel).
-- A identidade é linha corrente mutável: não há garantia de append-only a
-- defender, então a autorização fica inteira no grant de coluna do C2b e este
-- gatilho NÃO policia escrita — ele deriva. Policiar aqui obrigaria a
-- inventar "contextos de exceção" que cada RPC legítima teria de satisfazer,
-- que é onde esse tipo de desenho costuma falhar.
-- ============================================================
create or replace function private.proteger_identificado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- O próprio flag (retomar/cancelar) e as colunas que o recálculo deriva.
  -- Comparar o resto por jsonb em vez de listar coluna por coluna mantém a
  -- regra correta quando uma coluna nova nascer: o padrão é BLOQUEAR.
  v_livres text[] := array[
    'exclusao_solicitada_em',
    'primeiro_avistamento_em', 'ultimo_avistamento_em', 'avistamentos_total',
    'avistamento_corrente_id', 'latitude', 'longitude', 'acuracia_metros',
    'precisao_localizacao', 'updated_at'
  ];
begin
  -- 1. Exclusão em andamento: retomável, não mutável.
  if old.exclusao_solicitada_em is not null
     and (to_jsonb(new) - v_livres) is distinct from (to_jsonb(old) - v_livres) then
    raise exception
      'Registro com exclusão em andamento: retome ou cancele a exclusão antes de alterar qualquer campo.'
      using errcode = '42501';
  end if;

  -- 2. A data da investigação é do servidor, não do navegador. A coluna está
  --    no grant para o fluxo poder marcá-la, mas o instante é sempre `now()` —
  --    mesmo padrão de proteger_status_history_imovel.
  if new.ultima_investigacao_em is distinct from old.ultima_investigacao_em then
    new.ultima_investigacao_em := now();
  end if;

  return new;
end;
$$;

-- ============================================================
-- TIPO DECLARADO NO CADASTRO
--
-- `before insert`, e sem nenhuma heurística para "descobrir" quem escreveu:
-- `concluir_classificacao` NUNCA insere identidade, então tipo presente num
-- INSERT é, por construção, declaração humana. As outras duas portas do tipo
-- (definir_tipo_manual e concluir_classificacao) são RPCs e pertencem aos
-- checkpoints seguintes.
-- ============================================================
create or replace function private.tipo_manual_no_cadastro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo is null then
    -- Sem tipo não há proveniência a guardar; o que vier é descartado.
    new.tipo_origem := null;
    new.tipo_estado := null;
    new.tipo_definido_em := null;
  else
    new.tipo_origem := 'manual';
    new.tipo_estado := 'declarado';
    new.tipo_definido_em := now();
  end if;

  -- Proveniência de IA não nasce num cadastro, em nenhuma hipótese.
  new.tipo_confianca := null;
  new.tipo_classificacao_id := null;
  new.tipo_avistamento_id := null;
  new.tipo_confirmado_por := null;
  new.tipo_confirmado_em := null;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- Ligação dos gatilhos
-- ------------------------------------------------------------
drop trigger if exists trg_identificados_tipo_manual on public.imoveis_identificados;
create trigger trg_identificados_tipo_manual
  before insert on public.imoveis_identificados
  for each row execute function private.tipo_manual_no_cadastro();

drop trigger if exists trg_identificados_proteger on public.imoveis_identificados;
create trigger trg_identificados_proteger
  before update on public.imoveis_identificados
  for each row execute function private.proteger_identificado();

drop trigger if exists trg_identificados_updated_at on public.imoveis_identificados;
create trigger trg_identificados_updated_at
  before update on public.imoveis_identificados
  for each row execute function public.set_updated_at();

drop trigger if exists trg_identificados_avistamentos_proteger
  on public.imoveis_identificados_avistamentos;
create trigger trg_identificados_avistamentos_proteger
  before update on public.imoveis_identificados_avistamentos
  for each row execute function private.proteger_avistamento();

drop trigger if exists trg_identificados_avistamentos_sincronizar
  on public.imoveis_identificados_avistamentos;
create trigger trg_identificados_avistamentos_sincronizar
  after insert or update or delete on public.imoveis_identificados_avistamentos
  for each row execute function private.sincronizar_avistamentos_identidade();

-- ------------------------------------------------------------
-- Nenhuma destas funções é RPC. O schema `private` continua sem USAGE para
-- `anon`/`authenticated`, e o PostgREST não as expõe.
-- ------------------------------------------------------------
revoke all on function private.recalcular_agregados_identificado(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.sincronizar_avistamentos_identidade()
  from public, anon, authenticated, service_role;
revoke all on function private.proteger_avistamento()
  from public, anon, authenticated, service_role;
revoke all on function private.proteger_identificado()
  from public, anon, authenticated, service_role;
revoke all on function private.tipo_manual_no_cadastro()
  from public, anon, authenticated, service_role;
