-- ============================================================
-- Retirados, Fase B / B2: o banco reconhece e protege `retomada-retirado`.
--
-- A retomada é a mensagem que o corretor programa para recontatar o
-- proprietário de um imóvel retirado da carteira ("daqui a 6 meses,
-- pergunte se quer voltar"). Este arquivo só prepara o BANCO: nenhum fluxo
-- da aplicação cria o tipo ainda, e o worker em Production (B1) recusa o
-- envio de qualquer `retomada-retirado` (`erro`/`retomada-envio-desabilitado`).
--
-- O que muda:
--   1. o check de `tipo` ganha `retomada-retirado`;
--   2. o check de `cancelamento_motivo` ganha `imovel-reativado`;
--   3. no máximo uma retomada ativa (`agendada`/`processando`) por imóvel;
--   4. a identidade da retomada é fixa: nenhuma linha entra nem sai do tipo
--      depois de criada, e o imóvel dela não é trocado por outro;
--   5. uma retomada `agendada` só existe para imóvel do mesmo dono,
--      retirado, no status-alvo, com data futura, sem agenda e sem
--      `imoveis_consultados`;
--   6. reativar o imóvel, ou tirá-lo do status-alvo, cancela as retomadas
--      `agendada` dele, sem nunca impedir a mudança no imóvel.
--
-- O que NÃO muda: claim, `aplicar_transicao_disponibilidade` (M3/M4),
-- `efetivar_consolidacao_contato`, o trigger do destinatário, a RLS e os
-- tipos `livre`/`verificacao-disponibilidade` entre si. Sem backfill: nenhuma
-- linha existente é tocada.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tipos e motivos
-- ------------------------------------------------------------
alter table public.mensagens_agendadas
  drop constraint if exists mensagens_agendadas_tipo_check;
alter table public.mensagens_agendadas
  add constraint mensagens_agendadas_tipo_check
  check (tipo in ('livre', 'verificacao-disponibilidade', 'retomada-retirado'));

alter table public.mensagens_agendadas
  drop constraint if exists mensagens_agendadas_cancelamento_motivo_check;
alter table public.mensagens_agendadas
  add constraint mensagens_agendadas_cancelamento_motivo_check
  check (
    cancelamento_motivo is null
    or cancelamento_motivo in (
      'usuario',
      'imovel-indisponivel',
      'disponibilidade-confirmada',
      'imovel-excluido',
      'contato-consolidado',
      'imovel-reativado'
    )
  );

-- ------------------------------------------------------------
-- 2. Uma retomada ativa por imóvel
-- ------------------------------------------------------------
-- `processando` conta como ativa: a linha que o worker reclamou ainda pode
-- sair. Cancelada, enviada ou em erro libera o imóvel para outra.
create unique index if not exists mensagens_agendadas_retomada_ativa_idx
  on public.mensagens_agendadas (imovel_id)
  where tipo = 'retomada-retirado' and status in ('agendada', 'processando');

-- ------------------------------------------------------------
-- 3. Identidade da retomada
-- ------------------------------------------------------------
-- Só protege a retomada: livre ↔ verificação continua sendo assunto do
-- modelo antigo, sem regra nova aqui. Vale também para o service role.
-- O imóvel é fixo; a única troca aceita é para nulo, que é o que a FK
-- `on delete set null` faz quando o imóvel é excluído (o trigger de
-- validação abaixo decide o que acontece com a linha nesse caso).
create or replace function private.proteger_identidade_retomada_retirado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.tipo = 'retomada-retirado') is distinct from (new.tipo = 'retomada-retirado') then
    raise exception 'Uma mensagem existente não entra nem sai do tipo retomada-retirado.'
      using errcode = '23514';
  end if;
  if new.tipo = 'retomada-retirado'
     and new.imovel_id is not null
     and new.imovel_id is distinct from old.imovel_id then
    raise exception 'O imóvel de uma retomada não pode ser trocado.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.proteger_identidade_retomada_retirado() from public, anon, authenticated;

drop trigger if exists trg_retomada_identidade_mensagem on public.mensagens_agendadas;
create trigger trg_retomada_identidade_mensagem
  before update of tipo, imovel_id on public.mensagens_agendadas
  for each row execute function private.proteger_identidade_retomada_retirado();

-- ------------------------------------------------------------
-- 4. Invariantes de uma retomada agendada
-- ------------------------------------------------------------
-- Só a linha que RESULTA `agendada` é validada. O claim reserva o lote num
-- UPDATE só (`agendada` → `processando`), e a expiração, o worker e os
-- cancelamentos também atualizam em lote: uma exceção ali abortaria o lote
-- de todas as contas. Por isso `processando`, `enviada`, `erro` e
-- `cancelada` passam direto. O INSERT é a exceção: uma retomada nasce
-- `agendada`, sempre.
--
-- Exclusão do imóvel: a FK `on delete set null` atualiza a linha depois de
-- o imóvel sumir. Uma retomada `agendada` que perde o imóvel desse jeito é
-- cancelada (`imovel-excluido`), em vez de impedir a exclusão. Um
-- `imovel_id` nulo com o imóvel ainda existindo, ou num INSERT, continua
-- inválido.
create or replace function private.validar_retomada_retirado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imovel record;
begin
  if new.tipo is distinct from 'retomada-retirado' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.status is distinct from 'agendada' then
    raise exception 'Uma retomada nasce agendada.' using errcode = '23514';
  end if;
  if new.status is distinct from 'agendada' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.imovel_id is null
     and old.imovel_id is not null
     and not exists (select 1 from public.imoveis i where i.id = old.imovel_id) then
    new.status := 'cancelada';
    new.cancelamento_motivo := 'imovel-excluido';
    new.cancelamento_origem := 'automacao';
    new.cancelada_em := now();
    new.updated_at := now();
    return new;
  end if;

  if new.imovel_id is null then
    raise exception 'Uma retomada exige o imóvel.' using errcode = '23514';
  end if;
  if new.agenda_id is not null then
    raise exception 'Uma retomada não se vincula à Agenda.' using errcode = '23514';
  end if;
  if new.imoveis_consultados is not null then
    raise exception 'Uma retomada pergunta só pelo próprio imóvel.' using errcode = '23514';
  end if;
  if new.data_envio is null or new.data_envio <= now() then
    raise exception 'Uma retomada precisa de data futura.' using errcode = '23514';
  end if;

  select i.retirado, i.status
    into v_imovel
    from public.imoveis i
   where i.id = new.imovel_id
     and i.user_id = new.user_id;
  if not found then
    raise exception 'Imóvel não pertence ao usuário.' using errcode = '23514';
  end if;
  if v_imovel.retirado is not true then
    raise exception 'Retomada só para imóvel retirado da carteira.' using errcode = '23514';
  end if;
  if not (v_imovel.status = any (private.disponibilidade_status_alvo())) then
    raise exception 'Retomada só para imóvel no status-alvo.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.validar_retomada_retirado() from public, anon, authenticated;

drop trigger if exists trg_retomada_validacao_mensagem on public.mensagens_agendadas;
create trigger trg_retomada_validacao_mensagem
  before insert or update on public.mensagens_agendadas
  for each row execute function private.validar_retomada_retirado();

-- ------------------------------------------------------------
-- 5. O imóvel muda: reativação e saída do status-alvo
-- ------------------------------------------------------------
-- Separado do trigger M3/M4 (`trg_transicao_disponibilidade_imovel`), que
-- só cuida de verificações e não reage à reativação. Cancela apenas
-- retomadas `agendada` do imóvel e do dono dele; `processando` é do worker,
-- e o resto é histórico.
--
-- Se a mesma atualização reativa E tira do status-alvo, o motivo é
-- `imovel-indisponivel`: ele descreve o estado final do imóvel.
--
-- Fail-open: uma falha aqui nunca impede a mudança no imóvel. Ela tenta ir
-- para `log_eventos`; se nem o log puder ser gravado, segue mesmo assim. O
-- worker continua sendo a barreira do envio (B1 hoje recusa toda retomada).
create or replace function private.reagir_retomada_retirado_imovel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text;
begin
  if new.status is distinct from old.status
     and not (new.status = any (private.disponibilidade_status_alvo())) then
    v_motivo := 'imovel-indisponivel';
  elsif old.retirado is true and new.retirado is not true then
    v_motivo := 'imovel-reativado';
  else
    return new;
  end if;

  begin
    update public.mensagens_agendadas m
       set status = 'cancelada',
           cancelamento_motivo = v_motivo,
           cancelamento_origem = 'automacao',
           cancelada_em = now(),
           updated_at = now()
     where m.user_id = new.user_id
       and m.imovel_id = new.id
       and m.tipo = 'retomada-retirado'
       and m.status = 'agendada';
  exception when others then
    begin
      insert into public.log_eventos (user_id, categoria, nivel, evento, detalhe)
      values (new.user_id, 'whatsapp', 'erro', 'retomada-cancelamento-falhou', v_motivo || ':' || sqlstate);
    exception when others then
      null;
    end;
  end;
  return new;
end;
$$;
revoke all on function private.reagir_retomada_retirado_imovel() from public, anon, authenticated;

drop trigger if exists trg_retomada_retirado_imovel on public.imoveis;
create trigger trg_retomada_retirado_imovel
  after update of retirado, status on public.imoveis
  for each row execute function private.reagir_retomada_retirado_imovel();
