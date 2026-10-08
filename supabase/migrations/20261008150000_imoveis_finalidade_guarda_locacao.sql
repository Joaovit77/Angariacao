-- ============================================================
-- Imóvel de venda, IV-4A: guarda do ledger de locação.
--
-- `private.prever_locacoes` é o ponto único por onde passam a prévia
-- (`prever_repasses_locacao`) e a confirmação (`locar_imoveis_em_lote`, que a
-- chama de novo depois de travar as linhas e só grava quando ela volta ok).
-- Recusar o item aqui impede, numa chamada direta à RPC, a locação, o
-- repasse, o status Locado, o `locado_em` e a limpeza dos lembretes de
-- disponibilidade que a confirmação faz.
--
--   locacao        passa (como hoje)
--   locacao_venda  passa (como hoje)
--   null           passa (como hoje; não informado, sem inferir locação)
--   venda          recusado com `finalidade_venda`, pelo erro por item que a
--                  função já usa; o lote continua tudo-ou-nada.
--
-- O corpo é o da 20260908132609 com um único bloco novo, depois do de
-- retirado. CREATE OR REPLACE mantém assinatura, retorno, owner, SECURITY
-- DEFINER, search_path e ACL; o revoke repete o da migration original.
-- Sem coluna, tabela, enum, trigger, policy, índice ou DML.
-- ============================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.prever_locacoes(
  p_user_id uuid,
  p_politica_id uuid,
  p_itens jsonb,
  p_validar_status boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_politica public.politicas_repasse;
  v_item jsonb;
  v_imovel public.imoveis;
  v_id uuid;
  v_data date;
  v_dia integer;
  v_primeiro_manual date;
  v_prevista_manual date;
  v_datas record;
  v_itens jsonb := '[]'::jsonb;
  v_erros jsonb := '[]'::jsonb;
  v_vistos uuid[] := '{}'::uuid[];
begin
  select * into v_politica
    from public.politicas_repasse p
   where p.id = p_politica_id and p.user_id = p_user_id and p.ativo;
  if not found then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'politica_indisponivel', 'mensagem', 'A política de repasse não foi encontrada ou está inativa.'
    )));
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'erros', jsonb_build_array(jsonb_build_object(
      'codigo', 'lote_vazio', 'mensagem', 'Selecione ao menos um imóvel.'
    )));
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    begin
      v_id := nullif(v_item->>'imovel_id', '')::uuid;
    exception when others then
      v_id := null;
    end;
    if v_id is null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'codigo', 'imovel_invalido', 'mensagem', 'Um item do lote possui imóvel inválido.'
      ));
      continue;
    end if;
    if v_id = any(v_vistos) then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'codigo', 'imovel_repetido', 'mensagem', 'O mesmo imóvel aparece mais de uma vez no lote.'
      ));
      continue;
    end if;
    v_vistos := array_append(v_vistos, v_id);

    select * into v_imovel from public.imoveis i
     where i.id = v_id and i.user_id = p_user_id;
    if not found then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'codigo', 'imovel_indisponivel', 'mensagem', 'Imóvel não encontrado nesta imobiliária.'
      ));
      continue;
    end if;
    if p_validar_status and v_imovel.status = 'Locado' then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'locacao_ativa', 'mensagem', 'Já possui uma locação ativa.'
      ));
      continue;
    end if;
    if p_validar_status and v_imovel.retirado then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'imovel_retirado',
        'mensagem', 'O imóvel foi retirado da carteira e não pode gerar uma locação da imobiliária.'
      ));
      continue;
    end if;
    -- IV-4A: imóvel só de venda não entra no ledger de locação. Comparação
    -- explícita com 'venda': `locacao`, `locacao_venda` e null (não informado,
    -- compatibilidade com o legado, sem classificar) seguem como antes.
    if v_imovel.finalidade = 'venda' then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'finalidade_venda',
        'mensagem', 'Imóvel com finalidade Venda não pode ser marcado como locado.'
      ));
      continue;
    end if;

    v_data := private.ler_data_iso(v_item->>'data_locacao');
    v_primeiro_manual := private.ler_data_iso(v_item->>'primeiro_vencimento');
    v_prevista_manual := private.ler_data_iso(v_item->>'data_prevista');
    begin
      v_dia := nullif(v_item->>'dia_vencimento', '')::integer;
    exception when others then
      v_dia := null;
    end;
    if v_data is null then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'data_locacao_invalida', 'mensagem', 'Informe uma data de locação válida.'
      ));
      continue;
    end if;

    begin
      select * into v_datas from private.calcular_datas_repasse(
        v_data, v_politica, v_dia, v_primeiro_manual, v_prevista_manual
      );
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_imovel.id,
        'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), nullif(trim(v_imovel.referencia_crm), ''), v_imovel.endereco),
        'endereco', v_imovel.endereco,
        'data_locacao', v_data,
        'dia_vencimento', v_dia,
        'primeiro_vencimento', v_datas.primeiro_vencimento,
        'data_prevista', v_datas.data_prevista
      ));
    exception when others then
      v_erros := v_erros || jsonb_build_array(jsonb_build_object(
        'imovel_id', v_id, 'rotulo', coalesce(nullif(trim(v_imovel.codigo), ''), v_imovel.endereco),
        'codigo', 'dados_invalidos', 'mensagem', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_erros) = 0,
    'politica', jsonb_build_object('id', v_politica.id, 'nome', v_politica.nome),
    'itens', v_itens,
    'erros', v_erros
  );
end;
$$;

revoke all on function private.prever_locacoes(uuid, uuid, jsonb, boolean) from public, anon, authenticated;

commit;
