-- M1 — Modelo estruturado das mensagens de disponibilidade.
--
-- Não há backfill por texto nesta migration. O default `livre` preserva as
-- linhas antigas sem atribuir uma origem que o banco não consegue provar.

alter table public.mensagens_agendadas
  add column if not exists tipo text not null default 'livre',
  add column if not exists agenda_id uuid,
  add column if not exists cancelamento_motivo text,
  add column if not exists cancelamento_origem text,
  add column if not exists cancelada_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_tipo_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_tipo_check
      check (tipo in ('livre', 'verificacao-disponibilidade'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_cancelamento_motivo_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_cancelamento_motivo_check
      check (
        cancelamento_motivo is null
        or cancelamento_motivo in (
          'usuario',
          'imovel-indisponivel',
          'disponibilidade-confirmada',
          'imovel-excluido'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_cancelamento_origem_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_cancelamento_origem_check
      check (
        cancelamento_origem is null
        or cancelamento_origem in ('usuario', 'automacao', 'worker')
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_cancelamento_auditavel_check'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_cancelamento_auditavel_check
      check (
        (
          cancelamento_motivo is null
          and cancelamento_origem is null
          and cancelada_em is null
        )
        or (
          status = 'cancelada'
          and cancelamento_motivo is not null
          and cancelamento_origem is not null
          and cancelada_em is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'agenda_id_user_id_key'
       and conrelid = 'public.agenda'::regclass
  ) then
    alter table public.agenda
      add constraint agenda_id_user_id_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'mensagens_agendadas_agenda_usuario_fkey'
       and conrelid = 'public.mensagens_agendadas'::regclass
  ) then
    alter table public.mensagens_agendadas
      add constraint mensagens_agendadas_agenda_usuario_fkey
      foreign key (agenda_id, user_id)
      references public.agenda (id, user_id)
      on delete set null (agenda_id)
      not valid;
  end if;
end $$;

alter table public.mensagens_agendadas
  validate constraint mensagens_agendadas_agenda_usuario_fkey;

create index if not exists mensagens_agendadas_agenda_idx
  on public.mensagens_agendadas (agenda_id)
  where agenda_id is not null;

create index if not exists mensagens_agendadas_disponibilidade_pendente_idx
  on public.mensagens_agendadas (imovel_id)
  where status = 'agendada' and tipo = 'verificacao-disponibilidade';

drop policy if exists "insert_own_mensagens_agendadas" on public.mensagens_agendadas;
create policy "insert_own_mensagens_agendadas" on public.mensagens_agendadas
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and status = 'agendada'
    and data_envio > now()
    and cancelamento_motivo is null
    and cancelamento_origem is null
    and cancelada_em is null
    and (
      imovel_id is null
      or exists (
        select 1 from public.imoveis i
         where i.id = imovel_id
           and i.user_id = (select auth.uid())
      )
    )
    and (
      agenda_id is null
      or exists (
        select 1 from public.agenda a
         where a.id = agenda_id
           and a.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "update_own_mensagens_agendadas" on public.mensagens_agendadas;
create policy "update_own_mensagens_agendadas" on public.mensagens_agendadas
  for update to authenticated
  using ((select auth.uid()) = user_id and status = 'agendada')
  with check (
    (select auth.uid()) = user_id
    and status in ('agendada', 'cancelada')
    and (status = 'cancelada' or data_envio > now())
    and (
      imovel_id is null
      or exists (
        select 1 from public.imoveis i
         where i.id = imovel_id
           and i.user_id = (select auth.uid())
      )
    )
    and (
      agenda_id is null
      or exists (
        select 1 from public.agenda a
         where a.id = agenda_id
           and a.user_id = (select auth.uid())
      )
    )
    and (
      (
        status = 'agendada'
        and cancelamento_motivo is null
        and cancelamento_origem is null
        and cancelada_em is null
      )
      or (
        status = 'cancelada'
        and cancelamento_motivo = 'usuario'
        and cancelamento_origem = 'usuario'
        and cancelada_em is not null
      )
    )
  );
