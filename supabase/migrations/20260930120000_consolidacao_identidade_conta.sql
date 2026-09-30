-- ============================================================
-- Fase 1a-C2.1b.2 — a consolidação M3/M4 entra na identidade por conta.
--
-- A consolidação grava a MESMA mensagem em N imóveis de propósito: uma
-- verificação de disponibilidade perguntou por A, B e C numa mensagem só,
-- e o histórico dos três precisa dela. Até aqui essas N notas entravam
-- por `registrar_nota_imovel`, que deduplica só dentro de cada imóvel e
-- não participa do advisory lock da 1a-C2.1b.1. Um eco `fromMe` da mesma
-- mensagem atribuído a D (fora do conjunto) ficava em D; um eco em B
-- ficava no lugar da nota da origem; e um eco concorrente com a
-- efetivação podia entrar em D enquanto A, B e C eram gravados.
--
-- O invariante: para a identidade X (user_id + id externo) e o conjunto
-- declarado S = imóveis consultados, ao fim da efetivação sem conflito,
-- os imóveis que têm X são exatamente S. N cópias em S são deliberadas;
-- nenhuma fora de S.
--
-- Isso é o que `registrar_nota_whatsapp_origem` já faz para qualquer
-- conjunto (grava no que falta, substitui o eco dentro de S, remove só o
-- eco `webhook-evolution` fora de S, conflito para qualquer outra coisa
-- fora de S), sob a mesma chave de advisory lock do webhook, do painel e
-- do cron sem consolidação. A efetivação passa a chamá-la UMA vez, dentro
-- da própria transação, no lugar do laço por imóvel. Nenhuma regra nova.
--
-- EFEITO DO ENVIO × CÓPIA DO HISTÓRICO. A efetivação só roda depois de a
-- Evolution aceitar o envio: a âncora `enviada` e as absorvidas
-- `contato-consolidado` são fatos do envio e acontecem exatamente uma vez
-- (a âncora `processando` sob `for update` é o gate). O histórico roda
-- num bloco com `exception` (subtransação): conflito, imóvel que sumiu
-- ou erro SQL desfazem SÓ o histórico, inteiro, e são devolvidos em
-- `historico` e `notas_falhas`; os efeitos ficam. Um envio confirmado
-- nunca vira resultado incerto por causa da nota.
--
-- Mesma assinatura, mesmo retorno de antes mais a chave `historico`: o
-- código anterior continua funcionando entre esta migration e o deploy.
-- ============================================================

create or replace function public.efetivar_consolidacao_contato(
  p_mensagem_id uuid,
  p_user_id uuid,
  p_texto text,
  p_imoveis_consultados uuid[],
  p_notas jsonb default '[]'::jsonb,
  p_enviado_em timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancora record;
  v_absorvidas uuid[] := array[]::uuid[];
  v_entrada jsonb;
  v_imovel uuid;
  v_conjunto uuid[];
  v_nota jsonb;
  v_notas_incoerentes boolean := false;
  v_historico jsonb;
  v_notas_gravadas integer := 0;
  v_notas_falhas jsonb := '[]'::jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Somente o servidor efetiva uma consolidação.' using errcode = '42501';
  end if;
  if p_mensagem_id is null or p_user_id is null or p_texto is null
     or p_imoveis_consultados is null or cardinality(p_imoveis_consultados) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'parametros-invalidos');
  end if;

  select m.id, m.user_id, m.status, m.imovel_id, m.tipo
    into v_ancora
    from public.mensagens_agendadas m
   where m.id = p_mensagem_id
     and m.user_id = p_user_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'ancora-nao-encontrada');
  end if;
  if v_ancora.status <> 'processando' then
    return jsonb_build_object('ok', false, 'motivo', 'ancora-nao-processando', 'status', v_ancora.status);
  end if;
  if v_ancora.tipo <> 'verificacao-disponibilidade' then
    return jsonb_build_object('ok', false, 'motivo', 'ancora-nao-verificacao');
  end if;
  -- A lista diz por quais imóveis se perguntou: começa pelo da âncora e só
  -- contém imóveis desta conta.
  if v_ancora.imovel_id is null or p_imoveis_consultados[1] <> v_ancora.imovel_id then
    return jsonb_build_object('ok', false, 'motivo', 'imoveis-consultados-incoerentes');
  end if;
  if exists (
    select 1 from unnest(p_imoveis_consultados) as c(id)
     where not exists (select 1 from public.imoveis i where i.id = c.id and i.user_id = p_user_id)
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'imovel-de-outra-conta');
  end if;

  with fechadas as (
    update public.mensagens_agendadas m
       set status = 'cancelada',
           cancelamento_motivo = 'contato-consolidado',
           cancelamento_origem = 'worker',
           cancelada_em = p_enviado_em,
           consolidada_em_mensagem_id = p_mensagem_id,
           reservada_para_mensagem_id = null,
           updated_at = p_enviado_em
     where m.user_id = p_user_id
       and m.reservada_para_mensagem_id = p_mensagem_id
       and m.status = 'processando'
       and m.tipo = 'verificacao-disponibilidade'
    returning m.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_absorvidas from fechadas;

  -- Histórico. S é o conjunto consultado, sem repetição. `p_notas` traz a
  -- nota (o formato pertence ao TypeScript), a mesma para cada imóvel de
  -- S; uma entrada fora de S é devolvida como falha e não grava nada.
  v_conjunto := array(select distinct c.id from unnest(p_imoveis_consultados) as c(id) order by c.id);
  for v_entrada in
    select value from jsonb_array_elements(
      case when jsonb_typeof(p_notas) = 'array' then p_notas else '[]'::jsonb end
    )
  loop
    begin
      v_imovel := nullif(v_entrada->>'imovel_id', '')::uuid;
      if v_imovel is null or not (v_imovel = any (v_conjunto)) then
        raise exception 'Nota fora dos imóveis consultados.' using errcode = '22023';
      end if;
      if v_nota is null then
        v_nota := v_entrada->'nota';
      elsif v_nota is distinct from v_entrada->'nota' then
        v_notas_incoerentes := true;
        raise exception 'Notas diferentes para a mesma mensagem.' using errcode = '22023';
      end if;
    exception when others then
      v_notas_falhas := v_notas_falhas || jsonb_build_object('imovel_id', v_entrada->>'imovel_id', 'erro', sqlstate);
    end;
  end loop;

  if v_notas_incoerentes then
    v_historico := jsonb_build_object('resultado', 'notas-incoerentes', 'imoveis_eco', '[]'::jsonb);
  elsif v_nota is not null then
    -- Uma chamada, na transação desta função, pela MESMA regra e o MESMO
    -- advisory lock da origem conhecida. O bloco com `exception` é a
    -- subtransação: qualquer resultado que não deixe S completo desfaz
    -- todo o histórico, nunca os efeitos acima.
    begin
      v_historico := public.registrar_nota_whatsapp_origem(p_user_id, v_conjunto, v_nota);
      if coalesce(v_historico->>'resultado', '') not in ('gravada', 'duplicada', 'origem-reconciliou-eco') then
        raise exception 'Histórico da consolidação não gravado.' using errcode = 'P0001';
      end if;
      v_notas_gravadas := cardinality(v_conjunto);
    exception when others then
      if v_historico is null then
        v_historico := jsonb_build_object('resultado', 'falha', 'erro', sqlstate, 'imoveis_eco', '[]'::jsonb);
      end if;
      v_notas_falhas := v_notas_falhas || jsonb_build_object('imovel_id', null, 'erro', v_historico->>'resultado');
    end;
  end if;

  update public.mensagens_agendadas m
     set status = 'enviada',
         enviado_em = p_enviado_em,
         mensagem = p_texto,
         imoveis_consultados = p_imoveis_consultados,
         erro = null,
         updated_at = p_enviado_em
   where m.id = p_mensagem_id
     and m.user_id = p_user_id
     and m.status = 'processando';

  return jsonb_build_object(
    'ok', true,
    'absorvidas', to_jsonb(v_absorvidas),
    'absorvidas_total', cardinality(v_absorvidas),
    'notas_gravadas', v_notas_gravadas,
    'notas_falhas', v_notas_falhas,
    'historico', v_historico
  );
end;
$$;

revoke all on function public.efetivar_consolidacao_contato(uuid, uuid, text, uuid[], jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.efetivar_consolidacao_contato(uuid, uuid, text, uuid[], jsonb, timestamptz)
  to service_role;
