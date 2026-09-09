-- Guarda "aceitou ESTA VERSÃO, nesta data" — a versão é o que faz o
-- aceite significar algo. Uma linha por versão; o histórico é o registro.
-- RLS com select e insert, sem update nem delete: aceite não se edita.
-- Sem IP nem user agent de propósito: seriam mais dado pessoal para
-- proteger num sistema cujo problema já é ter dado pessoal demais.
create table if not exists aceites_termos (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  versao text not null,
  aceito_em timestamptz not null default now(),
  unique (user_id, versao)
);

alter table aceites_termos enable row level security;

drop policy if exists "select_own_aceite" on aceites_termos;
create policy "select_own_aceite" on aceites_termos
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_aceite" on aceites_termos;
create policy "insert_own_aceite" on aceites_termos
  for insert with check (auth.uid() = user_id);

create index if not exists idx_aceites_user on aceites_termos (user_id, aceito_em desc);;
