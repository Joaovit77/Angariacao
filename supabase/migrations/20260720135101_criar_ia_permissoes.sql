-- Permissão de uso da IA. Diferente das outras tabelas do schema: não é
-- dado do usuário, é uma decisão do dono do sistema sobre ele.
create table if not exists ia_permissoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  liberado boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table ia_permissoes enable row level security;

-- Só LEITURA da própria linha. A AUSÊNCIA de política de insert/update/delete
-- é o bloqueio: com RLS ligada, ninguém escreve aqui pelo browser, nem na
-- própria linha. É isso que impede alguém de se autoliberar com a anon key.
drop policy if exists "select_own_ia" on ia_permissoes;
create policy "select_own_ia" on ia_permissoes
  for select using (auth.uid() = user_id);;
