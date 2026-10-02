-- ============================================================
-- Retirados, Fase C / C1: quando e por que o imóvel saiu da carteira.
--
-- `imoveis.retirado` era só uma marca: retirar não gravava data, motivo,
-- nota nem evento, e o relatório não tinha como contar a retirada no mês em
-- que ela aconteceu. Daqui em diante, imóvel captado que sai (locado pelo
-- proprietário, por outra imobiliária, reservado...) vira retirado em vez de
-- Perdido, e estas três colunas guardam o que aconteceu:
--
--   retirado_em          dia civil da retirada (horário de Brasília);
--                        null = não se sabe (retiradas anteriores);
--   retirado_motivo      um valor da lista fechada, ou null = não informado;
--   retirado_observacao  texto livre, obrigatório quando o motivo é 'outro'.
--
-- Regras (valem para qualquer papel, inclusive o service role):
--   1. imóvel fora de Retirados não tem data, motivo nem observação;
--   2. 'outro' exige observação preenchida;
--   3. a retirada que chega sem data recebe o dia de hoje; reativar apaga os
--      três campos (a próxima retirada começa do zero).
--
-- Compatível com o que já está no ar: o botão "Retirar da carteira" grava só
-- `retirado = true` e continua funcionando (data de hoje, motivo null). O
-- upsert do cadastro não manda estas colunas, então não as apaga.
--
-- Sem backfill: nenhuma linha existente é tocada (o `updated_at` dos
-- imóveis retirados de hoje fica como está; o casamento legado do webhook
-- usa essa data para escolher entre imóveis do mesmo telefone). Os dados
-- reais das retiradas antigas entram num checkpoint próprio (C5).
--
-- O que NÃO muda: RLS, `status_history`, o trigger de disponibilidade
-- (M3/M4) e o da retomada (B2), que continuam reagindo a `retirado`.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colunas
-- ------------------------------------------------------------
alter table public.imoveis add column if not exists retirado_em date;
alter table public.imoveis add column if not exists retirado_motivo text;
alter table public.imoveis add column if not exists retirado_observacao text;

-- ------------------------------------------------------------
-- 2. Lista fechada e coerência
-- ------------------------------------------------------------
-- A lista espelha `MOTIVOS_RETIRADA` (web/lib/constantes.ts).
alter table public.imoveis drop constraint if exists imoveis_retirado_motivo_check;
alter table public.imoveis
  add constraint imoveis_retirado_motivo_check
  check (
    retirado_motivo is null
    or retirado_motivo in (
      'locado-proprietario',
      'locado-outra-imobiliaria',
      'reservado-outra-imobiliaria',
      'vendido',
      'desistiu',
      'nao-e-mais-proprietario',
      'outro'
    )
  );

alter table public.imoveis drop constraint if exists imoveis_retirada_coerente_check;
alter table public.imoveis
  add constraint imoveis_retirada_coerente_check
  check (
    retirado
    or (retirado_em is null and retirado_motivo is null and retirado_observacao is null)
  );

alter table public.imoveis drop constraint if exists imoveis_retirada_outro_check;
alter table public.imoveis
  add constraint imoveis_retirada_outro_check
  check (
    retirado_motivo is distinct from 'outro'
    or nullif(btrim(retirado_observacao), '') is not null
  );

alter table public.imoveis drop constraint if exists imoveis_retirado_observacao_tamanho_check;
alter table public.imoveis
  add constraint imoveis_retirado_observacao_tamanho_check
  check (retirado_observacao is null or char_length(retirado_observacao) <= 1000);

-- ------------------------------------------------------------
-- 3. Data na retirada, limpeza na reativação
-- ------------------------------------------------------------
-- Só UPDATE carimba a data: um INSERT com `retirado = true` é a linha
-- proposta pelo upsert do cadastro (que, havendo conflito, vira UPDATE sem
-- tocar estas colunas) ou uma carga de dados antigos, cuja data não se sabe.
-- Reativar limpa em vez de recusar: o botão "Reativar" grava só
-- `retirado = false`, e a retirada encerrada não descreve mais o imóvel.
-- Fora dessas duas transições nada é corrigido em silêncio: um valor
-- incoerente cai nos checks acima.
create or replace function private.preencher_dados_retirada_imovel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.retirado and not new.retirado then
    new.retirado_em := null;
    new.retirado_motivo := null;
    new.retirado_observacao := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.retirado and not old.retirado and new.retirado_em is null then
    new.retirado_em := (now() at time zone 'America/Sao_Paulo')::date;
  end if;

  new.retirado_observacao := nullif(btrim(new.retirado_observacao), '');
  return new;
end;
$$;
revoke all on function private.preencher_dados_retirada_imovel() from public, anon, authenticated;

drop trigger if exists trg_retirada_dados_imovel on public.imoveis;
create trigger trg_retirada_dados_imovel
  before insert or update of retirado, retirado_em, retirado_motivo, retirado_observacao
  on public.imoveis
  for each row execute function private.preencher_dados_retirada_imovel();
