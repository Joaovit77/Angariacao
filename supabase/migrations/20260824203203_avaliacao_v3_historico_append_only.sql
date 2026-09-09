
revoke all on table public.observacoes_comparaveis_mercado
from public, anon, authenticated, service_role;
grant select on table public.observacoes_comparaveis_mercado to authenticated;
grant select, insert on table public.observacoes_comparaveis_mercado to service_role;
;
