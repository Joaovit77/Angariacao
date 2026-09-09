-- Fatos que vêm do Sistema Principal (Sophia). Todos anuláveis e aditivos.
alter table imoveis add column if not exists autorizacao_assinada_em date;
alter table imoveis add column if not exists autorizacao_responsavel text;
alter table imoveis add column if not exists locado_em date;
alter table imoveis add column if not exists contrato_numero text;
alter table imoveis add column if not exists comissao_forma_pagamento text;
alter table imoveis add column if not exists comissao_observacao text;

create index if not exists imoveis_referencia_crm_idx
  on imoveis(user_id, referencia_crm)
  where referencia_crm is not null and referencia_crm <> '';

create index if not exists imoveis_referencia_crm_global_idx
  on imoveis(referencia_crm)
  where referencia_crm is not null and referencia_crm <> '';

-- Nome canônico da primitiva de append idempotente de nota.
create or replace function registrar_nota_imovel(
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
$$;

-- Nome antigo mantido como casca que delega, nunca como segunda cópia.
create or replace function registrar_nota_whatsapp(
  p_imovel_id uuid,
  p_user_id uuid,
  p_nota jsonb
)
returns boolean
language sql
as $$
  select registrar_nota_imovel(p_imovel_id, p_user_id, p_nota);
$$;;
