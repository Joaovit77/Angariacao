create table if not exists public.mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid not null references public.imoveis(id) on delete cascade,
  nome_proprietario text not null,
  telefone text not null,
  mensagem text not null check (char_length(trim(mensagem)) > 0),
  data_envio timestamptz not null,
  status text not null default 'agendada'
    check (status in ('agendada', 'processando', 'enviada', 'erro', 'cancelada')),
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mensagens_agendadas enable row level security;

create policy "select_own_mensagens_agendadas" on public.mensagens_agendadas
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_mensagens_agendadas" on public.mensagens_agendadas
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'agendada' and data_envio > now()
    and exists (select 1 from public.imoveis i where i.id = imovel_id and i.user_id = (select auth.uid()))
  );
create policy "update_own_mensagens_agendadas" on public.mensagens_agendadas
  for update to authenticated
  using ((select auth.uid()) = user_id and status = 'agendada')
  with check (
    (select auth.uid()) = user_id and status in ('agendada', 'cancelada')
    and (status = 'cancelada' or data_envio > now())
    and exists (select 1 from public.imoveis i where i.id = imovel_id and i.user_id = (select auth.uid()))
  );

create index mensagens_agendadas_pendentes_idx
  on public.mensagens_agendadas (data_envio, id) where status = 'agendada';
create index mensagens_agendadas_usuario_idx
  on public.mensagens_agendadas (user_id, data_envio desc);

create or replace function public.preencher_destinatario_mensagem_agendada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dono uuid;
  nome text;
  fone text;
begin
  select i.user_id, nullif(trim(i.proprietario_nome), ''), nullif(trim(i.proprietario_telefone), '')
    into dono, nome, fone from public.imoveis i where i.id = new.imovel_id;
  if dono is null or dono <> new.user_id then
    raise exception 'Imóvel não pertence ao usuário.';
  end if;
  if fone is null then raise exception 'Proprietário sem telefone.'; end if;
  new.nome_proprietario := coalesce(nome, 'Proprietário');
  new.telefone := fone;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.preencher_destinatario_mensagem_agendada() from public, anon, authenticated;
create trigger trg_destinatario_mensagem_agendada
before insert or update of user_id, imovel_id, nome_proprietario, telefone
on public.mensagens_agendadas for each row execute function public.preencher_destinatario_mensagem_agendada();

create or replace function public.claim_mensagens_agendadas(p_limite integer default 20)
returns setof public.mensagens_agendadas
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidatas as (
    select id
      from public.mensagens_agendadas
     where status = 'agendada' and data_envio <= now()
     order by data_envio, id
     for update skip locked
     limit greatest(1, least(coalesce(p_limite, 20), 100))
  )
  update public.mensagens_agendadas m
     set status = 'processando', updated_at = now(), erro = null
    from candidatas c
   where m.id = c.id
  returning m.*;
$$;

revoke all on function public.claim_mensagens_agendadas(integer) from public, anon, authenticated;
grant execute on function public.claim_mensagens_agendadas(integer) to service_role;;
