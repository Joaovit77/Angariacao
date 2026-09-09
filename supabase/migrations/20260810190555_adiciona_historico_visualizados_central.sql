create table if not exists public.central_anuncios_visualizados (
  user_id uuid not null references auth.users(id) on delete cascade,
  portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real')),
  id_externo text not null,
  url text not null,
  visualizado_em timestamptz not null default now(),
  primary key (user_id, portal, id_externo)
);

alter table public.central_anuncios_visualizados enable row level security;

drop policy if exists "select_own_central_anuncios_visualizados" on public.central_anuncios_visualizados;
create policy "select_own_central_anuncios_visualizados" on public.central_anuncios_visualizados
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_central_anuncios_visualizados" on public.central_anuncios_visualizados;
create policy "insert_own_central_anuncios_visualizados" on public.central_anuncios_visualizados
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update_own_central_anuncios_visualizados" on public.central_anuncios_visualizados;
create policy "update_own_central_anuncios_visualizados" on public.central_anuncios_visualizados
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on table public.central_anuncios_visualizados to authenticated;

create index if not exists idx_central_anuncios_visualizados_user_data
  on public.central_anuncios_visualizados (user_id, visualizado_em desc);;
