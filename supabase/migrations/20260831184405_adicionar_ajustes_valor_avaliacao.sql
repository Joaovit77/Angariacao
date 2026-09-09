create table if not exists public.ajustes_valor_avaliacao (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.avaliacoes_imoveis(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  valor_final numeric not null check (valor_final > 0),
  justificativa text check (justificativa is null or char_length(justificativa) <= 500),
  created_at timestamptz not null default now()
);

alter table public.ajustes_valor_avaliacao enable row level security;

drop policy if exists "select_own_ajustes_valor_avaliacao" on public.ajustes_valor_avaliacao;
create policy "select_own_ajustes_valor_avaliacao" on public.ajustes_valor_avaliacao
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_ajustes_valor_avaliacao" on public.ajustes_valor_avaliacao;
create policy "insert_own_ajustes_valor_avaliacao" on public.ajustes_valor_avaliacao
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.avaliacoes_imoveis avaliacao
      where avaliacao.id = avaliacao_id
        and avaliacao.user_id = (select auth.uid())
    )
  );

create index if not exists idx_ajustes_valor_avaliacao_user_avaliacao_data
  on public.ajustes_valor_avaliacao (user_id, avaliacao_id, created_at desc);
create index if not exists idx_ajustes_valor_avaliacao_avaliacao
  on public.ajustes_valor_avaliacao (avaliacao_id);

revoke all on table public.ajustes_valor_avaliacao from public, anon, authenticated, service_role;
grant select, insert on table public.ajustes_valor_avaliacao to authenticated;
grant select, insert on table public.ajustes_valor_avaliacao to service_role;

notify pgrst, 'reload schema';;
