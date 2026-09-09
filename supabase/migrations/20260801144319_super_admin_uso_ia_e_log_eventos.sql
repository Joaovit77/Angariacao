-- Ver supabase-schema.sql (raiz do repo) para os comentários completos.
-- Puramente aditivo: 3 tabelas novas, índices e 1 função. Nenhuma tabela
-- existente é lida ou alterada.

-- ADMINS: RLS ligada e NENHUMA política, nem de select. Uma política de
-- select devolveria ao browser a lista de quem manda no sistema; uma de
-- escrita seria autopromoção com a anon key (que é pública por design).
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  observacao text,
  criado_em timestamptz not null default now()
);
alter table admins enable row level security;

-- USO DE IA: grava o FATO (modelo + tokens). O preço NÃO entra no banco —
-- ele muda por decisão da OpenAI e congelaria as linhas antigas. A conta é
-- feita na leitura, em lib/calculo/custoIa.ts.
-- `on delete set null`: conta encerrada não apaga a contabilidade do mês.
create table if not exists ia_uso (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  tipo text not null,
  modelo text not null,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  criado_em timestamptz not null default now()
);
alter table ia_uso enable row level security;
create index if not exists idx_ia_uso_user_data on ia_uso (user_id, criado_em desc);
create index if not exists idx_ia_uso_data on ia_uso (criado_em desc);

-- LOG DE EVENTOS: só o que alguém precisaria AGIR para consertar, mais os
-- envios. NUNCA gravar aqui conteúdo de conversa nem telefone de
-- proprietário: é lido por quem opera o sistema, não pelo dono da carteira.
create table if not exists log_eventos (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  categoria text not null,
  nivel text not null default 'info',
  evento text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);
alter table log_eventos enable row level security;
create index if not exists idx_log_user_data on log_eventos (user_id, criado_em desc);
create index if not exists idx_log_nivel_data on log_eventos (nivel, criado_em desc);
create index if not exists idx_log_data on log_eventos (criado_em desc);

-- Limpeza. Não roda sozinha (agendar exige pg_cron) — ver DEPLOY.md.
create or replace function limpar_registros_antigos(p_dias int default 180)
returns table (logs_apagados bigint, usos_apagados bigint)
language plpgsql
as $$
declare
  corte timestamptz := now() - make_interval(days => p_dias);
  n_logs bigint;
  n_usos bigint;
begin
  delete from log_eventos where criado_em < corte;
  get diagnostics n_logs = row_count;
  delete from ia_uso where criado_em < corte;
  get diagnostics n_usos = row_count;
  return query select n_logs, n_usos;
end;
$$;;
