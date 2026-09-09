create or replace function proteger_status_history_imovel()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ator uuid := auth.uid();
  proposta jsonb;
  evento jsonb;
  data_evento text;
  historico_sanitizado jsonb;
begin
  if tg_op = 'INSERT' then
    if ator is not null and jsonb_array_length(coalesce(new.status_history, '[]'::jsonb)) > 0 then
      select coalesce(
        jsonb_agg(
          case
            when entrada ? 'status' and entrada ? 'date' then
              (entrada - 'userId' - 'authorName' - 'source') ||
              jsonb_build_object('userId', ator::text, 'source', 'usuario')
            else entrada
          end
          order by ordem
        ),
        '[]'::jsonb
      )
      into historico_sanitizado
      from jsonb_array_elements(coalesce(new.status_history, '[]'::jsonb))
        with ordinality as historico(entrada, ordem);
      new.status_history := historico_sanitizado;
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    -- Não existe operação administrativa de correção desta trilha. Uma edição
    -- comum preserva exatamente o que já estava gravado.
    new.status_history := coalesce(old.status_history, '[]'::jsonb);
    return new;
  end if;

  -- Só aceita metadados propostos quando o chamador realmente acrescentou
  -- uma entrada nova no fim. Num UPDATE direto apenas de `status`, NEW traz o
  -- histórico antigo inteiro; reutilizar uma ocorrência antiga daria à nova
  -- transição a data da primeira passagem, em vez de hoje.
  if jsonb_array_length(coalesce(new.status_history, '[]'::jsonb)) >
     jsonb_array_length(coalesce(old.status_history, '[]'::jsonb)) then
    proposta := new.status_history->-1;
    if proposta->>'status' is distinct from new.status then proposta := null; end if;
  end if;

  data_evento := case
    when coalesce(proposta->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then proposta->>'date'
    else current_date::text
  end;
  evento := jsonb_build_object('status', new.status, 'date', data_evento);

  if ator is not null then
    evento := evento || jsonb_build_object('userId', ator::text, 'source', 'usuario');
  elsif proposta is not null then
    -- Eventos externos não ganham um user_id fictício. Conserva apenas os
    -- metadados explicitamente fornecidos pela integração confiável.
    if proposta ? 'userId' then evento := evento || jsonb_build_object('userId', proposta->'userId'); end if;
    if proposta ? 'authorName' then evento := evento || jsonb_build_object('authorName', proposta->'authorName'); end if;
    if proposta ? 'source' then evento := evento || jsonb_build_object('source', proposta->'source'); end if;
  end if;

  new.status_history := coalesce(old.status_history, '[]'::jsonb) || jsonb_build_array(evento);
  return new;
end;
$$;;
