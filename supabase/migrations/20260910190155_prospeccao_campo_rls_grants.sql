-- Garimpo em Campo — C2b: somente RLS e grants explícitos.
-- Triggers, RPCs e Storage permanecem reservados aos checkpoints seguintes.

drop policy if exists "select_own_imoveis_identificados" on public.imoveis_identificados;
create policy "select_own_imoveis_identificados" on public.imoveis_identificados
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_imoveis_identificados" on public.imoveis_identificados;
create policy "insert_own_imoveis_identificados" on public.imoveis_identificados
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_imoveis_identificados" on public.imoveis_identificados;
create policy "update_own_imoveis_identificados" on public.imoveis_identificados
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      imoveis_identificados.imovel_id is null
      or exists (
        select 1
        from public.imoveis carteira
        where carteira.id = imoveis_identificados.imovel_id
          and carteira.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "select_own_imoveis_identificados_avistamentos"
  on public.imoveis_identificados_avistamentos;
create policy "select_own_imoveis_identificados_avistamentos"
  on public.imoveis_identificados_avistamentos
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_imoveis_identificados_avistamentos"
  on public.imoveis_identificados_avistamentos;
create policy "insert_own_imoveis_identificados_avistamentos"
  on public.imoveis_identificados_avistamentos
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.imoveis_identificados pai
      where pai.id = imoveis_identificados_avistamentos.imovel_identificado_id
        and pai.user_id = (select auth.uid())
        and pai.situacao not in ('fundido', 'promovido', 'promovendo')
        and pai.exclusao_solicitada_em is null
    )
  );

drop policy if exists "update_own_imoveis_identificados_avistamentos"
  on public.imoveis_identificados_avistamentos;
create policy "update_own_imoveis_identificados_avistamentos"
  on public.imoveis_identificados_avistamentos
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.imoveis_identificados pai
      where pai.id = imoveis_identificados_avistamentos.imovel_identificado_id
        and pai.user_id = (select auth.uid())
    )
  );

drop policy if exists "select_own_imoveis_identificados_fotos"
  on public.imoveis_identificados_fotos;
create policy "select_own_imoveis_identificados_fotos"
  on public.imoveis_identificados_fotos
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "select_own_imoveis_identificados_classificacoes"
  on public.imoveis_identificados_classificacoes;
create policy "select_own_imoveis_identificados_classificacoes"
  on public.imoveis_identificados_classificacoes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "select_own_imoveis_identificados_etiquetas"
  on public.imoveis_identificados_etiquetas;
create policy "select_own_imoveis_identificados_etiquetas"
  on public.imoveis_identificados_etiquetas
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table
  public.imoveis_identificados,
  public.imoveis_identificados_avistamentos,
  public.imoveis_identificados_fotos,
  public.imoveis_identificados_classificacoes,
  public.imoveis_identificados_etiquetas
from public, anon, authenticated, service_role;

grant select on table public.imoveis_identificados to authenticated;
grant insert (
  user_id, logradouro, numero, unidade, bloco, edificio, bairro, cidade,
  estado, cep, ponto_referencia, endereco_chave, cidade_chave,
  bairro_chave, origem_identificacao, tipo
) on table public.imoveis_identificados to authenticated;
grant update (
  logradouro, numero, unidade, bloco, edificio, bairro, cidade,
  estado, cep, ponto_referencia, endereco_chave, cidade_chave,
  bairro_chave, origem_identificacao, ultima_investigacao_em
) on table public.imoveis_identificados to authenticated;

grant select, insert on table public.imoveis_identificados_avistamentos to authenticated;
grant update (observacao)
  on table public.imoveis_identificados_avistamentos to authenticated;

grant select on table
  public.imoveis_identificados_fotos,
  public.imoveis_identificados_classificacoes,
  public.imoveis_identificados_etiquetas
to authenticated;

grant select, insert, update, delete on table
  public.imoveis_identificados,
  public.imoveis_identificados_avistamentos,
  public.imoveis_identificados_fotos,
  public.imoveis_identificados_classificacoes,
  public.imoveis_identificados_etiquetas
to service_role;

revoke all on sequence public.imoveis_identificados_etiquetas_id_seq
  from public, anon, authenticated, service_role;
grant usage, select on sequence public.imoveis_identificados_etiquetas_id_seq
  to service_role;
