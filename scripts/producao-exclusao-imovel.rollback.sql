begin;

set local lock_timeout = '5s';

drop function if exists public.excluir_imovel_com_dependencias(uuid);

commit;
