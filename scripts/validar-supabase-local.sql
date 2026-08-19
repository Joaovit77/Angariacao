\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_true(condicao boolean, mensagem text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condicao, false) then
    raise exception 'Falha de validação: %', mensagem;
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'local-1@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'local-2@example.invalid');

-- Contrato estático de grants, RLS, policies, funções e triggers.
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.imoveis', 'select'),
  'anon não pode consultar imóveis'
);
select pg_temp.assert_true(
  has_table_privilege('authenticated', 'public.imoveis', 'select,insert,update,delete'),
  'authenticated precisa do CRUD de imóveis'
);
select pg_temp.assert_true(
  has_table_privilege('authenticated', 'public.mensagens_agendadas', 'select,insert,update')
    and not has_table_privilege('authenticated', 'public.mensagens_agendadas', 'delete'),
  'mensagens agendadas não podem ser excluídas diretamente pelo cliente'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.whatsapp_instancias', 'select')
    and not has_table_privilege('authenticated', 'public.google_contas', 'select')
    and not has_table_privilege('authenticated', 'public.admins', 'select')
    and not has_table_privilege('authenticated', 'public.log_eventos', 'select'),
  'tabelas internas devem permanecer exclusivas do servidor'
);
select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.imoveis', 'select,insert,update,delete')
    and not has_table_privilege('service_role', 'public.imoveis', 'truncate,references,trigger'),
  'service_role deve ter somente CRUD nas tabelas da aplicação'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.excluir_imovel_com_dependencias(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.excluir_imovel_com_dependencias(uuid)', 'execute')
    and not has_function_privilege('service_role', 'public.excluir_imovel_com_dependencias(uuid)', 'execute'),
  'somente authenticated pode executar a RPC de exclusão'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.claim_mensagens_agendadas(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_mensagens_agendadas(integer)', 'execute')
    and not has_function_privilege('anon', 'public.claim_mensagens_agendadas(integer)', 'execute'),
  'somente service_role pode reclamar mensagens do worker'
);
select pg_temp.assert_true(
  not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity
  ),
  'todas as tabelas públicas da aplicação devem manter RLS habilitada'
);
select pg_temp.assert_true(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'imoveis') = 4
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'agenda') = 4
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mensagens_agendadas') = 3,
  'policies das tabelas afetadas devem estar completas'
);
select pg_temp.assert_true(
  (select count(*) from information_schema.triggers
    where trigger_schema = 'public' and event_object_table = 'mensagens_agendadas'
      and trigger_name = 'trg_destinatario_mensagem_agendada') = 2
    and (select count(*) from information_schema.triggers
    where trigger_schema = 'public' and event_object_table = 'imoveis'
      and trigger_name in ('trg_imoveis_status_history', 'trg_imoveis_updated_at')) = 3,
  'triggers afetados devem estar ativos para todos os eventos previstos'
);

-- anon falha por grant antes mesmo de alcançar a RLS ou a RPC.
set local role anon;
do $$
begin
  begin
    perform 1 from public.imoveis limit 1;
    raise exception 'anon conseguiu consultar imóveis';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.excluir_imovel_com_dependencias(
      '20000000-0000-0000-0000-000000000001'
    );
    raise exception 'anon conseguiu executar a RPC';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- Usuário 1 cria somente dados próprios pela mesma role usada pela Data API.
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.imoveis (
  id, user_id, endereco, proprietario_nome, proprietario_telefone
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Rua Local, 1', 'Proprietário Local', '(41) 99999-0001'
);

do $$
begin
  begin
    insert into public.imoveis (id, user_id, endereco)
    values (
      '20000000-0000-0000-0000-000000000099',
      '10000000-0000-0000-0000-000000000002',
      'Tentativa cruzada'
    );
    raise exception 'RLS aceitou escrita para outro usuário';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

insert into public.agenda (id, user_id, title, type, date, imovel_id)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Visita local', 'Visita', current_date + 1,
  '20000000-0000-0000-0000-000000000001'
);

insert into public.mensagens_agendadas (
  id, user_id, imovel_id, nome_proprietario, telefone, mensagem, data_envio
) values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Nome adulterado', '11999999999', 'Mensagem futura', now() + interval '1 hour'
);

select pg_temp.assert_true(
  (select nome_proprietario = 'Proprietário Local'
       and telefone = '(41) 99999-0001'
     from public.mensagens_agendadas
    where id = '40000000-0000-0000-0000-000000000001'),
  'trigger deve fotografar o destinatário a partir do imóvel'
);
update public.imoveis
   set status = 'Contato iniciado', status_history = '[]'::jsonb
 where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  (select jsonb_array_length(status_history) = 1
       and status_history->0->>'status' = 'Contato iniciado'
       and status_history->0->>'userId' = '10000000-0000-0000-0000-000000000001'
       and status_history->0->>'source' = 'usuario'
     from public.imoveis
    where id = '20000000-0000-0000-0000-000000000001'),
  'trigger deve registrar a transição de status com autoria autenticada'
);

-- Histórico concluído é preservado e apenas perde o vínculo pela FK.
reset role;
set local role service_role;
insert into public.mensagens_agendadas (
  id, user_id, imovel_id, nome_proprietario, telefone, mensagem, data_envio,
  status, enviado_em
) values (
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'ignorado', '41999990001', 'Mensagem enviada', now() - interval '1 minute',
  'enviada', now()
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
declare
  resultado jsonb;
begin
  select public.excluir_imovel_com_dependencias(
    '20000000-0000-0000-0000-000000000001'
  ) into resultado;
  perform pg_temp.assert_true(
    resultado = '{"mensagens_excluidas": 1, "compromissos_excluidos": 1}'::jsonb,
    'RPC deve informar as dependências removidas'
  );
end;
$$;

select pg_temp.assert_true(
  not exists (select 1 from public.imoveis where id = '20000000-0000-0000-0000-000000000001')
    and not exists (select 1 from public.agenda where id = '30000000-0000-0000-0000-000000000001')
    and not exists (select 1 from public.mensagens_agendadas where id = '40000000-0000-0000-0000-000000000001'),
  'reload não pode reencontrar imóvel, agenda ou mensagem pendente excluídos'
);
select pg_temp.assert_true(
  (select status = 'enviada' and imovel_id is null
     from public.mensagens_agendadas
    where id = '40000000-0000-0000-0000-000000000002'),
  'mensagem concluída deve permanecer como histórico sem vínculo órfão'
);

-- Outro usuário não enxerga nem consegue excluir dados do usuário 1.
reset role;
set local role service_role;
insert into public.imoveis (
  id, user_id, endereco, proprietario_nome, proprietario_telefone
) values (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Rua Local, 2', 'Proprietário Dois', '(41) 99999-0002'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  not exists (select 1 from public.imoveis where id = '20000000-0000-0000-0000-000000000002'),
  'RLS deve ocultar imóveis de outro usuário'
);
do $$
begin
  begin
    perform public.excluir_imovel_com_dependencias(
      '20000000-0000-0000-0000-000000000002'
    );
    raise exception 'usuário cruzado conseguiu excluir o imóvel';
  exception
    when no_data_found then null;
  end;
end;
$$;
reset role;

-- Uma mensagem em processamento bloqueia a exclusão inteira.
set local role service_role;
insert into public.agenda (id, user_id, title, type, date, imovel_id)
values (
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Visita bloqueada', 'Visita', current_date + 1,
  '20000000-0000-0000-0000-000000000002'
);
insert into public.mensagens_agendadas (
  id, user_id, imovel_id, nome_proprietario, telefone, mensagem, data_envio,
  status
) values (
  '40000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'ignorado', '41999990002', 'Mensagem em processamento', now(), 'processando'
);
reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.excluir_imovel_com_dependencias(
      '20000000-0000-0000-0000-000000000002'
    );
    raise exception 'RPC não bloqueou mensagem em processamento';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;
select pg_temp.assert_true(
  exists (select 1 from public.imoveis where id = '20000000-0000-0000-0000-000000000002')
    and exists (select 1 from public.agenda where id = '30000000-0000-0000-0000-000000000002')
    and exists (select 1 from public.mensagens_agendadas
      where id = '40000000-0000-0000-0000-000000000003' and status = 'processando'),
  'bloqueio por processamento não pode deixar estado parcial'
);
reset role;

-- Falha injetada no segundo DELETE comprova rollback do primeiro DELETE.
set local role service_role;
insert into public.imoveis (
  id, user_id, endereco, proprietario_nome, proprietario_telefone
) values (
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Rua Local, 4', 'Proprietário Quatro', '(41) 99999-0004'
);
insert into public.agenda (id, user_id, title, type, date, imovel_id)
values (
  '30000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'Falha injetada', 'Visita', current_date + 1,
  '20000000-0000-0000-0000-000000000004'
);
insert into public.mensagens_agendadas (
  id, user_id, imovel_id, nome_proprietario, telefone, mensagem, data_envio
) values (
  '40000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004',
  'ignorado', '41999990004', 'Deve sobreviver ao rollback', now() + interval '1 hour'
);
reset role;

create function pg_temp.falhar_delete_agenda()
returns trigger
language plpgsql
as $$
begin
  if old.id = '30000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'falha local injetada';
  end if;
  return old;
end;
$$;
create trigger trg_validacao_falha_agenda
before delete on public.agenda
for each row execute function pg_temp.falhar_delete_agenda();

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
do $$
begin
  begin
    perform public.excluir_imovel_com_dependencias(
      '20000000-0000-0000-0000-000000000004'
    );
    raise exception 'falha injetada não interrompeu a RPC';
  exception
    when raise_exception then
      if sqlerrm <> 'falha local injetada' then
        raise;
      end if;
  end;
end;
$$;
select pg_temp.assert_true(
  exists (select 1 from public.imoveis where id = '20000000-0000-0000-0000-000000000004')
    and exists (select 1 from public.agenda where id = '30000000-0000-0000-0000-000000000004')
    and exists (select 1 from public.mensagens_agendadas
      where id = '40000000-0000-0000-0000-000000000004' and status = 'agendada'),
  'falha no DELETE da agenda deve restaurar mensagem, agenda e imóvel'
);
reset role;

-- Caminho do worker: somente service_role reclama, reconsulta e conclui.
set local role service_role;
insert into public.imoveis (
  id, user_id, endereco, proprietario_nome, proprietario_telefone
) values (
  '20000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  'Rua Local, 5', 'Proprietário Cinco', '(41) 99999-0005'
);
insert into public.mensagens_agendadas (
  id, user_id, imovel_id, nome_proprietario, telefone, mensagem, data_envio
) values (
  '40000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000005',
  'ignorado', '41999990005', 'Mensagem do worker', now() - interval '1 minute'
);
select pg_temp.assert_true(
  (select count(*) from public.claim_mensagens_agendadas(20)
    where id = '40000000-0000-0000-0000-000000000005') = 1,
  'worker deve reclamar exatamente a mensagem vencida dentro da janela'
);
select pg_temp.assert_true(
  (select status = 'processando' from public.mensagens_agendadas
    where id = '40000000-0000-0000-0000-000000000005'),
  'claim deve persistir processando antes do efeito externo'
);
update public.mensagens_agendadas
   set status = 'enviada', enviado_em = now()
 where id = '40000000-0000-0000-0000-000000000005'
   and status = 'processando';
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select public.excluir_imovel_com_dependencias(
  '20000000-0000-0000-0000-000000000005'
);
reset role;

set local role service_role;
select pg_temp.assert_true(
  (select status = 'enviada' and imovel_id is null
     from public.mensagens_agendadas
    where id = '40000000-0000-0000-0000-000000000005'),
  'worker concluído deve permanecer como histórico sem vínculo ativo'
);
select pg_temp.assert_true(
  not exists (
    select 1
      from public.mensagens_agendadas
     where status in ('agendada', 'processando')
       and imovel_id is null
  ),
  'não pode restar mensagem ativa órfã após reload'
);
reset role;

select 'VALIDAÇÃO LOCAL APROVADA' as resultado;

rollback;
