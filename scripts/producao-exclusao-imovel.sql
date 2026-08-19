begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.excluir_imovel_com_dependencias(p_imovel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario_atual uuid := (select auth.uid());
  dono_imovel uuid;
  mensagens_excluidas integer := 0;
  compromissos_excluidos integer := 0;
begin
  if usuario_atual is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select i.user_id
    into dono_imovel
    from public.imoveis i
   where i.id = p_imovel_id
   for update;

  if dono_imovel is null or dono_imovel <> usuario_atual then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0002';
  end if;

  perform 1
    from public.mensagens_agendadas
   where imovel_id = p_imovel_id
     and user_id = usuario_atual
     and status in ('agendada', 'processando')
   for update;

  if exists (
    select 1
      from public.mensagens_agendadas
     where imovel_id = p_imovel_id
       and user_id = usuario_atual
       and status = 'processando'
  ) then
    raise exception 'Há uma mensagem em processamento. Aguarde o envio terminar e tente novamente.'
      using errcode = '55000';
  end if;

  delete from public.mensagens_agendadas
   where imovel_id = p_imovel_id
     and user_id = usuario_atual
     and status = 'agendada';
  get diagnostics mensagens_excluidas = row_count;

  delete from public.agenda
   where imovel_id = p_imovel_id
     and user_id = usuario_atual;
  get diagnostics compromissos_excluidos = row_count;

  delete from public.imoveis
   where id = p_imovel_id
     and user_id = usuario_atual;

  return jsonb_build_object(
    'mensagens_excluidas', mensagens_excluidas,
    'compromissos_excluidos', compromissos_excluidos
  );
end;
$$;

revoke all on function public.excluir_imovel_com_dependencias(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.excluir_imovel_com_dependencias(uuid)
  to authenticated;

revoke all on table
  public.imoveis,
  public.mensagens_agendadas,
  public.metas,
  public.agenda,
  public.abordagens,
  public.user_config,
  public.ia_permissoes,
  public.whatsapp_instancias,
  public.google_contas,
  public.admins,
  public.ia_uso,
  public.log_eventos,
  public.aceites_termos,
  public.protocolos,
  public.radar_buscas,
  public.radar_anuncios,
  public.central_anuncios_visualizados
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.imoveis to authenticated;
grant select, insert, update on table public.mensagens_agendadas to authenticated;
grant select, insert, update, delete on table public.metas to authenticated;
grant select, insert, update, delete on table public.agenda to authenticated;
grant select, insert, update, delete on table public.abordagens to authenticated;
grant select, insert, update on table public.user_config to authenticated;
grant select on table public.ia_permissoes to authenticated;
grant select, insert on table public.aceites_termos to authenticated;
grant select, insert, update, delete on table public.protocolos to authenticated;
grant select, insert, update, delete on table public.radar_buscas to authenticated;
grant select, insert, update, delete on table public.radar_anuncios to authenticated;
grant select, insert, update on table public.central_anuncios_visualizados to authenticated;

grant select, insert, update, delete on table
  public.imoveis,
  public.mensagens_agendadas,
  public.metas,
  public.agenda,
  public.abordagens,
  public.user_config,
  public.ia_permissoes,
  public.whatsapp_instancias,
  public.google_contas,
  public.admins,
  public.ia_uso,
  public.log_eventos,
  public.aceites_termos,
  public.protocolos,
  public.radar_buscas,
  public.radar_anuncios,
  public.central_anuncios_visualizados
to service_role;

commit;
