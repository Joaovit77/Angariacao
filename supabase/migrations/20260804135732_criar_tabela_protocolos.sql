create table if not exists protocolos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  conteudo text not null,
  arquivado boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table protocolos enable row level security;

drop policy if exists "select_own_protocolos" on protocolos;
create policy "select_own_protocolos" on protocolos
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_protocolos" on protocolos;
create policy "insert_own_protocolos" on protocolos
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_protocolos" on protocolos;
create policy "update_own_protocolos" on protocolos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_protocolos" on protocolos;
create policy "delete_own_protocolos" on protocolos
  for delete using (auth.uid() = user_id);

create index if not exists idx_protocolos_user on protocolos (user_id, created_at);;
