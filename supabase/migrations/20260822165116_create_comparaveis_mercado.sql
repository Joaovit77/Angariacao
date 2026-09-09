
create table if not exists public.comparaveis_mercado (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real')),
  id_externo text not null,
  url text not null,
  finalidade text not null default 'locacao' check (finalidade in ('locacao', 'venda')),
  titulo text not null,
  tipo text,
  endereco text,
  bairro text,
  cidade text not null,
  estado text check (estado is null or char_length(estado) = 2),
  cidade_chave text not null,
  bairro_chave text,
  area_m2 numeric check (area_m2 is null or area_m2 between 10 and 10000),
  quartos smallint check (quartos is null or quartos between 0 and 30),
  banheiros smallint check (banheiros is null or banheiros between 0 and 30),
  vagas smallint check (vagas is null or vagas between 0 and 30),
  valor_anunciado numeric not null check (valor_anunciado > 0),
  publicado_em timestamptz,
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  dados_originais jsonb not null default '{}'::jsonb,
  unique (user_id, portal, id_externo)
);

alter table public.comparaveis_mercado enable row level security;

drop policy if exists "select_own_comparaveis_mercado" on public.comparaveis_mercado;
create policy "select_own_comparaveis_mercado" on public.comparaveis_mercado
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_comparaveis_mercado" on public.comparaveis_mercado;
create policy "insert_own_comparaveis_mercado" on public.comparaveis_mercado
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_comparaveis_mercado" on public.comparaveis_mercado;
create policy "update_own_comparaveis_mercado" on public.comparaveis_mercado
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_comparaveis_mercado_busca
  on public.comparaveis_mercado (user_id, cidade_chave, finalidade, ultimo_visto_em desc);
create index if not exists idx_comparaveis_mercado_bairro_tipo
  on public.comparaveis_mercado (user_id, cidade_chave, bairro_chave, tipo);

revoke all on table public.comparaveis_mercado
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.comparaveis_mercado to authenticated;
grant select, insert, update on table public.comparaveis_mercado to service_role;
;
