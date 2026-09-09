-- Catálogo de roteiros de captação do usuário (o QUE se diz ao proprietário).
-- Não confundir com imoveis.forma_abordagem, que é o CANAL.
create table if not exists abordagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  roteiro text,
  canal_sugerido text,
  arquivada boolean not null default false,
  created_at timestamptz default now()
);

alter table abordagens enable row level security;

drop policy if exists "select_own_abordagens" on abordagens;
create policy "select_own_abordagens" on abordagens
  for select using (auth.uid() = user_id);
drop policy if exists "insert_own_abordagens" on abordagens;
create policy "insert_own_abordagens" on abordagens
  for insert with check (auth.uid() = user_id);
drop policy if exists "update_own_abordagens" on abordagens;
create policy "update_own_abordagens" on abordagens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete_own_abordagens" on abordagens;
create policy "delete_own_abordagens" on abordagens
  for delete using (auth.uid() = user_id);

create index if not exists abordagens_user_id_idx on abordagens(user_id);

-- Tentativas de abordagem por imóvel: jsonb na própria linha, mesmo padrão de
-- notas/status_history, herdando o RLS do imóvel.
alter table imoveis add column if not exists tentativas jsonb not null default '[]'::jsonb;;
