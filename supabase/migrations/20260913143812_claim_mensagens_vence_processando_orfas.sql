-- Mensagens agendadas: o claim passa a vencer linhas `processando` órfãs.
--
-- O worker (/api/cron/mensagens, maxDuration de 300 s) marca o lote como
-- `processando` e só então envia. Se a resposta do claim se perde depois
-- do commit (falha transitória entre a Vercel e o gateway do Supabase) ou
-- o worker morre no meio do lote, a linha fica `processando` para sempre:
-- nunca é reenviada, nunca vira erro, e `excluir_imovel_com_dependencias`
-- recusa a exclusão daquele imóvel enquanto ela existir.
--
-- Dez minutos depois do claim o worker que a reclamou certamente já
-- morreu. A linha vira `erro`/`processamento-interrompido` — nunca volta
-- para `agendada`: o envio pode ter acontecido antes da morte, e a regra
-- "nunca envia de surpresa" vale mais que recuperar uma mensagem atrasada.
create or replace function public.claim_mensagens_agendadas(p_limite integer default 20)
returns setof public.mensagens_agendadas
language sql
security definer
set search_path = public, pg_temp
as $$
  -- Uma indisponibilidade nunca pode transformar uma mensagem de ontem em
  -- um disparo surpresa hoje. Antes de obter o lote, vence o que perdeu a
  -- janela operacional. Dez minutos cobrem atraso do scheduler/deploy sem
  -- fingir que uma mensagem antiga ainda saiu no horario combinado.
  with expiradas as (
    update mensagens_agendadas
       set status = 'erro', erro = 'janela-expirada', updated_at = now()
     where status = 'agendada'
       and data_envio < now() - interval '10 minutes'
    returning id
  ),
  -- Linha reclamada por um worker que nao concluiu (resposta do claim
  -- perdida, funcao encerrada). Dez minutos apos o claim ele ja morreu;
  -- vira erro, nunca volta a fila: o envio pode ter saido antes.
  interrompidas as (
    update mensagens_agendadas
       set status = 'erro', erro = 'processamento-interrompido', updated_at = now()
     where status = 'processando'
       and updated_at < now() - interval '10 minutes'
    returning id
  ),
  candidatas as (
    select id
      from mensagens_agendadas
     where status = 'agendada'
       and data_envio >= now() - interval '10 minutes'
       and data_envio <= now()
     order by data_envio, id
     for update skip locked
     limit greatest(1, least(coalesce(p_limite, 20), 100))
  )
  update mensagens_agendadas m
     set status = 'processando', updated_at = now(), erro = null
    from candidatas c
   where m.id = c.id
  returning m.*;
$$;

revoke all on function public.claim_mensagens_agendadas(integer) from public, anon, authenticated;
grant execute on function public.claim_mensagens_agendadas(integer) to service_role;
