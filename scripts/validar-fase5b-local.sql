-- Executar somente no container Supabase local. Não altera dados permanentes.
\set ON_ERROR_STOP on
begin;
create function pg_temp.verificar_fase5b(condicao boolean, descricao text)
returns void language plpgsql as $$
begin
  if not coalesce(condicao, false) then raise exception 'Falha: %', descricao; end if;
end;
$$;

select pg_temp.verificar_fase5b(
  (select relrowsecurity from pg_class where oid = 'public.mercados_monitorados'::regclass),
  'RLS de mercados habilitada');
select pg_temp.verificar_fase5b(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mercados_monitorados') = 4,
  'quatro policies de ownership');
select pg_temp.verificar_fase5b(
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'mercados_monitorados') = 4,
  'somente PK, identidade e dois índices operacionais da 5A');
select pg_temp.verificar_fase5b(
  (select count(*) from pg_trigger where tgrelid = 'public.mercados_monitorados'::regclass and not tgisinternal) = 2,
  'triggers de updated_at e proteção operacional');
select pg_temp.verificar_fase5b(
  has_table_privilege('authenticated', 'public.mercados_monitorados', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.mercados_monitorados', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.mercados_monitorados', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.mercados_monitorados', 'truncate,references,trigger')
  and not has_table_privilege('service_role', 'public.mercados_monitorados', 'truncate,references,trigger'),
  'CRUD mínimo, sem privilégios extraordinários');
select pg_temp.verificar_fase5b(
  has_function_privilege('service_role', 'public.claim_mercados_monitorados(integer)', 'execute')
  and not has_function_privilege('anon', 'public.claim_mercados_monitorados(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_mercados_monitorados(integer)', 'execute'),
  'claim somente service role');
select pg_temp.verificar_fase5b(
  has_function_privilege('service_role', 'public.concluir_mercado_monitorado(uuid,uuid,boolean,text)', 'execute')
  and not has_function_privilege('anon', 'public.concluir_mercado_monitorado(uuid,uuid,boolean,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.concluir_mercado_monitorado(uuid,uuid,boolean,text)', 'execute'),
  'conclusão somente service role');
select pg_temp.verificar_fase5b(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname in (
      'claim_mercados_monitorados', 'concluir_mercado_monitorado', 'proteger_operacao_mercado_monitorado'
    ) and not p.prosecdef and p.proconfig @> array['search_path=""']) = 3,
  'três funções invoker com search_path vazio');
select pg_temp.verificar_fase5b(
  (select array_agg(pronargs::integer order by pronargs) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'buscar_comparaveis_mercado_hibridos') = array[11,12],
  'ambos os overloads da Avaliação preservados');
select pg_temp.verificar_fase5b(
  not exists (select 1 from cron.job where jobname ilike '%mercado%'),
  'não existe job SQL para mercados');
select pg_temp.verificar_fase5b(
  not exists (select 1 from information_schema.tables where table_schema = 'public'
    and table_name ~ '(jobs_mercado|execucoes_mercado|cobertura|ausencia|consultas_mercado)'),
  'nenhuma tabela de jobs/execuções/cobertura/ausência');
select '11 verificações de schema/grants aprovadas' as resultado;
rollback;
