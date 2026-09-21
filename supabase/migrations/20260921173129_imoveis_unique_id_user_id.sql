-- Fase 0 (auditoria de modelagem): chave única composta para permitir FKs
-- compostas por tenant nas tabelas filhas de imoveis (contatos, vínculos,
-- mensagens). `id` já é PK; a unicidade composta é redundante para os dados
-- e existe só para o Postgres aceitar `references imoveis (id, user_id)`.
-- Aditiva e idempotente: não altera dados, PK, índices, RLS nem cria FK.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'imoveis_id_user_id_key'
       and conrelid = 'public.imoveis'::regclass
  ) then
    alter table public.imoveis
      add constraint imoveis_id_user_id_key unique (id, user_id);
  end if;
end $$;
