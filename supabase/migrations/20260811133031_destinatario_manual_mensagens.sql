alter table public.mensagens_agendadas
  drop constraint if exists mensagens_agendadas_imovel_id_fkey;
alter table public.mensagens_agendadas
  alter column imovel_id drop not null;
alter table public.mensagens_agendadas
  add constraint mensagens_agendadas_imovel_id_fkey
  foreign key (imovel_id) references public.imoveis(id) on delete set null;

drop policy if exists "insert_own_mensagens_agendadas" on public.mensagens_agendadas;
create policy "insert_own_mensagens_agendadas" on public.mensagens_agendadas
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'agendada' and data_envio > now()
    and (imovel_id is null or exists (
      select 1 from public.imoveis i
      where i.id = imovel_id and i.user_id = (select auth.uid())
    ))
  );

drop policy if exists "update_own_mensagens_agendadas" on public.mensagens_agendadas;
create policy "update_own_mensagens_agendadas" on public.mensagens_agendadas
  for update to authenticated
  using ((select auth.uid()) = user_id and status = 'agendada')
  with check (
    (select auth.uid()) = user_id and status in ('agendada', 'cancelada')
    and (status = 'cancelada' or data_envio > now())
    and (imovel_id is null or exists (
      select 1 from public.imoveis i
      where i.id = imovel_id and i.user_id = (select auth.uid())
    ))
  );

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
  if new.imovel_id is null then
    new.nome_proprietario := nullif(trim(new.nome_proprietario), '');
    new.telefone := nullif(trim(new.telefone), '');
    if new.nome_proprietario is null then raise exception 'Informe o nome do proprietário.'; end if;
    if new.telefone is null or char_length(regexp_replace(new.telefone, '[^0-9]', '', 'g')) not between 10 and 13 then
      raise exception 'Telefone inválido.';
    end if;
    new.updated_at := now();
    return new;
  end if;

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
revoke all on function public.preencher_destinatario_mensagem_agendada() from public, anon, authenticated;;
