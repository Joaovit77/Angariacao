-- ============================================================
-- Fase 1a-C2.1b.1 — uma mensagem do WhatsApp, uma identidade por conta,
-- e a origem conhecida vence o eco.
--
-- Até aqui o dedupe da mensagem era POR LINHA: `registrar_nota_imovel`
-- recusa um id que já existe no mesmo imóvel, e só nele. Com a atribuição
-- da 1a-C2.1a, uma reentrega da Evolution pode resolver outro imóvel (o
-- contexto mudou entre as entregas) e a mesma mensagem entraria de novo,
-- rodando IA, tentativa e agenda outra vez. E um envio feito pelo próprio
-- Angario para o imóvel A pode ter o eco `fromMe` atribuído a B antes de a
-- rota de envio gravar a nota.
--
-- Três funções, nenhuma tabela, nenhum backfill: a verdade continua sendo
-- o JSONB `imoveis.notas`, e as notas antigas participam da detecção como
-- estão.
--
--   whatsapp_mensagem_externa_id   a família de identidade (única regra)
--   registrar_nota_whatsapp_conta  ingresso pelo webhook: grava uma vez
--                                  por conta; nunca remove nada
--   registrar_nota_whatsapp_origem envio do Angario com imóveis declarados:
--                                  a origem vence o eco `fromMe`
--
-- As duas RPCs serializam pela MESMA chave de advisory lock
-- (user_id + id externo). Sem o lock, duas entregas simultâneas em imóveis
-- diferentes leem "não existe" antes de qualquer uma gravar: o lock de
-- linha não ajuda, porque as linhas são outras.
--
-- Fora daqui, e de propósito: a consolidação M3/M4
-- (`efetivar_consolidacao_contato`) continua gravando o mesmo
-- `wa-enviada:<id>` em N imóveis pela primitiva por linha, a importação de
-- conversa idem, e `wa:<id>:encerrado` é nota derivada, fora da família.
--
-- Security invoker: quem chama é sempre a service role (webhook, envio
-- pelo painel com o usuário da sessão validada, cron), que já ignora a
-- RLS. Ninguém mais executa: anon e authenticated não têm grant.
-- ============================================================

-- A família de identidade de uma nota do WhatsApp. É a mesma regra de
-- `idExternoDaNotaWhatsapp` (web/lib/calculo/importacaoConversaWhatsapp.ts),
-- e um teste confere as duas. `wa:<id>:encerrado` devolve null: é a nota
-- que o sistema escreve sobre a mensagem, não a mensagem.
create or replace function public.whatsapp_mensagem_externa_id(p_nota_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    case
      when p_nota_id like 'wa-contexto-recebida:%' then pg_catalog.substr(p_nota_id, 22)
      when p_nota_id like 'wa-contexto-enviada:%' then pg_catalog.substr(p_nota_id, 21)
      when p_nota_id like 'wa-enviada:%' then pg_catalog.substr(p_nota_id, 12)
      when p_nota_id like 'wa:%' and p_nota_id not like '%:encerrado' then pg_catalog.substr(p_nota_id, 4)
      else null
    end,
    ''
  );
$$;

revoke all on function public.whatsapp_mensagem_externa_id(text) from public, anon, authenticated;
grant execute on function public.whatsapp_mensagem_externa_id(text) to service_role;

-- Ingresso pelo webhook (recebida `wa:` e eco/saída `fromMe` `wa-enviada:`).
-- Grava no imóvel operacional que a atribuição escolheu SE a mensagem não
-- existe em nenhum imóvel da conta; senão, não grava. Nunca remove nada:
-- quem pode desfazer um eco é só a origem.
create or replace function public.registrar_nota_whatsapp_conta(
  p_user_id uuid,
  p_imovel_id uuid,
  p_nota jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text;
  v_mid text;
  v_existente uuid;
  v_afetadas integer;
begin
  if p_user_id is null or p_imovel_id is null or p_nota is null
     or pg_catalog.jsonb_typeof(p_nota) <> 'object' then
    raise exception 'Nota de WhatsApp inválida.' using errcode = '22023';
  end if;
  v_id := p_nota->>'id';
  if not (v_id like 'wa:%' or v_id like 'wa-enviada:%') then
    raise exception 'Só o ingresso do webhook usa esta função.' using errcode = '22023';
  end if;
  v_mid := public.whatsapp_mensagem_externa_id(v_id);
  if v_mid is null then
    raise exception 'Nota sem identidade externa.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wa-msg:' || p_user_id::text || ':' || v_mid, 0)
  );

  select i.id
    into v_existente
    from public.imoveis as i
   where i.user_id = p_user_id
     and exists (
       select 1
         from pg_catalog.jsonb_array_elements(coalesce(i.notas, '[]'::jsonb)) as n(nota)
        where public.whatsapp_mensagem_externa_id(n.nota->>'id') = v_mid
     )
   order by (i.id = p_imovel_id) desc, i.id
   limit 1;

  if v_existente is not null then
    return case when v_existente = p_imovel_id
      then 'duplicada-mesmo-imovel'
      else 'duplicada-outro-imovel'
    end;
  end if;

  update public.imoveis
     set notas = coalesce(notas, '[]'::jsonb) || pg_catalog.jsonb_build_array(p_nota)
   where id = p_imovel_id
     and user_id = p_user_id;
  get diagnostics v_afetadas = row_count;
  return case when v_afetadas > 0 then 'gravada' else 'imovel-inexistente' end;
end;
$$;

revoke all on function public.registrar_nota_whatsapp_conta(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_nota_whatsapp_conta(uuid, uuid, jsonb) to service_role;

-- Envio feito pelo Angario (painel, cron sem consolidação), que conhece o
-- conjunto de imóveis de destino. A ORIGEM VENCE O ECO:
--
--   A. nada na conta             -> grava a nota da origem no conjunto
--   B. nota da origem no conjunto -> idempotente
--   C. eco dentro do conjunto    -> substitui o eco, no lugar, pela nota
--                                   da origem (mais rica: confirmacaoVisita)
--   D. eco fora do conjunto      -> remove o eco e grava no conjunto
--   E. qualquer outra ocorrência fora do conjunto -> `conflito`: nada é
--      removido, movido nem gravado
--
-- "Eco" é estritamente `wa-enviada:<mesmo id>` com origem
-- `webhook-evolution`. Recebida, importada, outra origem ou nota sem origem
-- nunca se movem: isto não é reatribuição de mensagem.
--
-- Devolve `{ resultado, imoveis_eco }`, onde `imoveis_eco` são os imóveis
-- FORA do conjunto de onde um eco saiu (para a observabilidade).
create or replace function public.registrar_nota_whatsapp_origem(
  p_user_id uuid,
  p_imovel_ids uuid[],
  p_nota jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text;
  v_mid text;
  v_conjunto uuid[];
  v_fora uuid[];
  v_fora_invalida boolean;
  v_alvo uuid;
  v_afetadas integer;
  v_substituiu boolean := false;
  v_gravou boolean := false;
begin
  if p_user_id is null or p_nota is null or pg_catalog.jsonb_typeof(p_nota) <> 'object' then
    raise exception 'Nota de WhatsApp inválida.' using errcode = '22023';
  end if;
  v_id := p_nota->>'id';
  if not (v_id like 'wa-enviada:%') then
    raise exception 'A origem só registra mensagem enviada.' using errcode = '22023';
  end if;
  v_mid := public.whatsapp_mensagem_externa_id(v_id);
  if v_mid is null then
    raise exception 'Nota sem identidade externa.' using errcode = '22023';
  end if;
  v_conjunto := array(
    select distinct c.id from pg_catalog.unnest(p_imovel_ids) as c(id) where c.id is not null order by c.id
  );
  if coalesce(pg_catalog.cardinality(v_conjunto), 0) = 0 then
    raise exception 'Conjunto de imóveis vazio.' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_conjunto) as c(id)
     where not exists (select 1 from public.imoveis as i where i.id = c.id and i.user_id = p_user_id)
  ) then
    return pg_catalog.jsonb_build_object('resultado', 'imovel-inexistente', 'imoveis_eco', '[]'::jsonb);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wa-msg:' || p_user_id::text || ':' || v_mid, 0)
  );

  -- Trava, em ordem de id, as linhas que esta decisão pode tocar: o
  -- conjunto e toda linha da conta que já tem a mensagem. Um writer por
  -- linha concorrente (que não usa o advisory lock) espera aqui.
  perform 1
     from public.imoveis as i
    where i.user_id = p_user_id
      and (
        i.id = any (v_conjunto)
        or exists (
          select 1
            from pg_catalog.jsonb_array_elements(coalesce(i.notas, '[]'::jsonb)) as n(nota)
           where public.whatsapp_mensagem_externa_id(n.nota->>'id') = v_mid
        )
      )
    order by i.id
    for update;

  -- Fora do conjunto: só eco reconciliável; qualquer outra coisa é conflito.
  select pg_catalog.array_agg(distinct i.id order by i.id),
         pg_catalog.bool_or(not coalesce(n.nota->>'id' = v_id and n.nota->>'origem' = 'webhook-evolution', false))
    into v_fora, v_fora_invalida
    from public.imoveis as i
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(i.notas, '[]'::jsonb)) as n(nota)
   where i.user_id = p_user_id
     and not (i.id = any (v_conjunto))
     and public.whatsapp_mensagem_externa_id(n.nota->>'id') = v_mid;

  if coalesce(v_fora_invalida, false) then
    return pg_catalog.jsonb_build_object('resultado', 'conflito', 'imoveis_eco', '[]'::jsonb);
  end if;

  if coalesce(pg_catalog.cardinality(v_fora), 0) > 0 then
    update public.imoveis as i
       set notas = coalesce((
             select pg_catalog.jsonb_agg(t.e order by t.o)
               from pg_catalog.jsonb_array_elements(i.notas) with ordinality as t(e, o)
              where not coalesce(t.e->>'id' = v_id and t.e->>'origem' = 'webhook-evolution', false)
           ), '[]'::jsonb)
     where i.user_id = p_user_id
       and i.id = any (v_fora);
  end if;

  foreach v_alvo in array v_conjunto loop
    -- C. eco no próprio alvo: a nota da origem toma o lugar dele.
    update public.imoveis as i
       set notas = (
             select pg_catalog.jsonb_agg(
                      case when coalesce(t.e->>'id' = v_id and t.e->>'origem' = 'webhook-evolution', false)
                           then p_nota else t.e end
                      order by t.o)
               from pg_catalog.jsonb_array_elements(i.notas) with ordinality as t(e, o)
           )
     where i.id = v_alvo
       and i.user_id = p_user_id
       and exists (
         select 1
           from pg_catalog.jsonb_array_elements(coalesce(i.notas, '[]'::jsonb)) as n(nota)
          where n.nota->>'id' = v_id and n.nota->>'origem' = 'webhook-evolution'
       );
    get diagnostics v_afetadas = row_count;
    if v_afetadas > 0 then
      v_substituiu := true;
      continue;
    end if;

    -- A/B. grava só se o alvo ainda não tem a mensagem.
    update public.imoveis as i
       set notas = coalesce(i.notas, '[]'::jsonb) || pg_catalog.jsonb_build_array(p_nota)
     where i.id = v_alvo
       and i.user_id = p_user_id
       and not exists (
         select 1
           from pg_catalog.jsonb_array_elements(coalesce(i.notas, '[]'::jsonb)) as n(nota)
          where public.whatsapp_mensagem_externa_id(n.nota->>'id') = v_mid
       );
    get diagnostics v_afetadas = row_count;
    if v_afetadas > 0 then
      v_gravou := true;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'resultado',
    case
      when coalesce(pg_catalog.cardinality(v_fora), 0) > 0 or v_substituiu then 'origem-reconciliou-eco'
      when v_gravou then 'gravada'
      else 'duplicada'
    end,
    'imoveis_eco',
    pg_catalog.to_jsonb(coalesce(v_fora, '{}'::uuid[]))
  );
end;
$$;

revoke all on function public.registrar_nota_whatsapp_origem(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.registrar_nota_whatsapp_origem(uuid, uuid[], jsonb) to service_role;
