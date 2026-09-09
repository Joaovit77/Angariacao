create table if not exists public.avaliacoes_imoveis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid references public.imoveis(id) on delete set null,
  finalidade text not null check (finalidade in ('locacao', 'venda')),
  valor_proprietario numeric check (valor_proprietario is null or valor_proprietario >= 0),
  valor_minimo numeric check (valor_minimo is null or valor_minimo >= 0),
  valor_recomendado numeric check (valor_recomendado is null or valor_recomendado >= 0),
  valor_maximo numeric check (valor_maximo is null or valor_maximo >= 0),
  nivel_confianca text not null check (nivel_confianca in ('Baixa', 'Moderada', 'Boa', 'Alta')),
  score_confianca smallint not null check (score_confianca between 0 and 100),
  quantidade_comparaveis integer not null check (quantidade_comparaveis >= 0),
  dados_entrada jsonb not null,
  metodologia jsonb not null,
  comparaveis_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.avaliacoes_imoveis enable row level security;

drop policy if exists "select_own_avaliacoes_imoveis" on public.avaliacoes_imoveis;
create policy "select_own_avaliacoes_imoveis" on public.avaliacoes_imoveis
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_avaliacoes_imoveis" on public.avaliacoes_imoveis;
create policy "insert_own_avaliacoes_imoveis" on public.avaliacoes_imoveis
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      imovel_id is null
      or exists (
        select 1
        from public.imoveis imovel
        where imovel.id = imovel_id
          and imovel.user_id = (select auth.uid())
      )
    )
  );

create index if not exists idx_avaliacoes_imoveis_user_data
  on public.avaliacoes_imoveis (user_id, created_at desc);
create index if not exists idx_avaliacoes_imoveis_imovel_data
  on public.avaliacoes_imoveis (user_id, imovel_id, created_at desc)
  where imovel_id is not null;

revoke all on table public.avaliacoes_imoveis
  from public, anon, authenticated, service_role;
grant select, insert on table public.avaliacoes_imoveis to authenticated;
grant select, insert on table public.avaliacoes_imoveis to service_role;;
