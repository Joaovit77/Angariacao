create table if not exists radar_buscas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  filtros jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  ultimo_check timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists radar_anuncios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  busca_id uuid not null references radar_buscas(id) on delete cascade,
  portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real')),
  id_externo text not null,
  url text not null,
  dados jsonb not null default '{}'::jsonb,
  visto boolean not null default false,
  encontrado_em timestamptz not null default now(),
  unique (busca_id, portal, id_externo)
);

alter table radar_buscas enable row level security;
alter table radar_anuncios enable row level security;

drop policy if exists "select_own_radar_buscas" on radar_buscas;
create policy "select_own_radar_buscas" on radar_buscas
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_radar_buscas" on radar_buscas;
create policy "insert_own_radar_buscas" on radar_buscas
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update_own_radar_buscas" on radar_buscas;
create policy "update_own_radar_buscas" on radar_buscas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "delete_own_radar_buscas" on radar_buscas;
create policy "delete_own_radar_buscas" on radar_buscas
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "select_own_radar_anuncios" on radar_anuncios;
create policy "select_own_radar_anuncios" on radar_anuncios
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_radar_anuncios" on radar_anuncios;
create policy "insert_own_radar_anuncios" on radar_anuncios
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from radar_buscas busca
      where busca.id = busca_id and busca.user_id = (select auth.uid())
    )
  );
drop policy if exists "update_own_radar_anuncios" on radar_anuncios;
create policy "update_own_radar_anuncios" on radar_anuncios
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "delete_own_radar_anuncios" on radar_anuncios;
create policy "delete_own_radar_anuncios" on radar_anuncios
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on radar_buscas to authenticated;
grant select, insert, update, delete on radar_anuncios to authenticated;

create index if not exists idx_radar_buscas_user_ativo
  on radar_buscas (user_id, ativo, ultimo_check);
create index if not exists idx_radar_anuncios_user_visto
  on radar_anuncios (user_id, visto, encontrado_em desc);
create index if not exists idx_radar_anuncios_busca
  on radar_anuncios (busca_id, encontrado_em desc);

;
