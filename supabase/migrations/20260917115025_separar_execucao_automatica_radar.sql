-- R2: separa a última coleta geral da última execução programada do Radar.
alter table public.radar_buscas
  add column if not exists ultimo_check_automatico timestamptz,
  add column if not exists ultimo_check_origem text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_buscas_ultimo_check_origem_check'
      and conrelid = 'public.radar_buscas'::regclass
  ) then
    alter table public.radar_buscas
      add constraint radar_buscas_ultimo_check_origem_check
      check (ultimo_check_origem in ('manual', 'navegador', 'cron'));
  end if;
end;
$$;

create or replace function private.proteger_execucao_automatica_radar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.ultimo_check_automatico is not null or new.ultimo_check_origem = 'cron' then
        raise exception 'Execução automática do Radar reservada ao servidor' using errcode = '42501';
      end if;
    elsif new.ultimo_check_automatico is distinct from old.ultimo_check_automatico
      or (new.ultimo_check_origem = 'cron'
        and new.ultimo_check_origem is distinct from old.ultimo_check_origem) then
      raise exception 'Execução automática do Radar reservada ao servidor' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.proteger_execucao_automatica_radar()
  from public, anon, authenticated, service_role;
drop trigger if exists trg_radar_buscas_execucao_automatica on public.radar_buscas;
create trigger trg_radar_buscas_execucao_automatica
  before insert or update on public.radar_buscas
  for each row execute function private.proteger_execucao_automatica_radar();

create index if not exists idx_radar_buscas_automatico_ativo
  on public.radar_buscas (ultimo_check_automatico, created_at) where ativo;

notify pgrst, 'reload schema';
