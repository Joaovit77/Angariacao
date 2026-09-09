create table if not exists whatsapp_instancias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  instancia text not null unique,
  token text,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table whatsapp_instancias enable row level security;

create or replace function telefone_canonico(telefone text)
returns text
language sql
immutable
as $$
  select case
           when length(n.nac) = 11 and substr(n.nac, 3, 1) = '9'
             then left(n.nac, 2) || substr(n.nac, 4)
           when length(n.nac) = 10 then n.nac
           else null
         end
  from (
    select case
             when length(g.d) in (12, 13) and left(g.d, 2) = '55' then substr(g.d, 3)
             else g.d
           end as nac
    from (
      select regexp_replace(
               regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'),
               '^0+', ''
             ) as d
    ) g
  ) n
$$;

alter table imoveis
  add column if not exists proprietario_telefone_canonico text
  generated always as (telefone_canonico(proprietario_telefone)) stored;

create index if not exists imoveis_telefone_canonico_idx
  on imoveis(user_id, proprietario_telefone_canonico)
  where proprietario_telefone_canonico is not null;;
