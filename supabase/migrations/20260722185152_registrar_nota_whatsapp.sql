create or replace function registrar_nota_whatsapp(
  p_imovel_id uuid,
  p_user_id uuid,
  p_nota jsonb
)
returns boolean
language plpgsql
as $$
declare
  afetadas int;
begin
  update imoveis
     set notas = coalesce(notas, '[]'::jsonb) || p_nota
   where id = p_imovel_id
     and user_id = p_user_id
     and not exists (
       select 1
       from jsonb_array_elements(coalesce(notas, '[]'::jsonb)) as n
       where n->>'id' = p_nota->>'id'
     );
  get diagnostics afetadas = row_count;
  return afetadas > 0;
end;
$$;;
