-- ============================================================
-- Imóvel de venda no Pipeline, IV-1: finalidade, valor de venda e data da
-- venda em `imoveis`. Schema INERTE: nenhuma tela, rotina ou integração lê ou
-- grava estas colunas nesta etapa.
--
--   finalidade   'locacao' | 'venda' | 'locacao_venda'; null = não informado.
--                Mesmo vocabulário de avaliacoes_imoveis, mercados_monitorados
--                e comparaveis_mercado. Sem default: um default classificaria
--                em silêncio a carteira inteira (e todo cadastro novo) como
--                locação, inclusive o que ninguém confirmou.
--   valor_venda  preço pedido na venda; null = não informado, diferente de
--                R$ 0,00. Independente de `valor_aluguel`. Mesmo limite dos
--                valores de Vendas: nem negativo, nem NaN, nem Infinity.
--   vendido_em   dia civil da venda; null = não vendido ou não se sabe. Quem
--                vai gravá-la é a ação própria de Vendido (IV-5), nunca o
--                upsert genérico do cadastro.
--
-- Sem backfill: nenhuma linha existente é tocada; todas ficam com null nas
-- três colunas. O upsert do cadastro (`toDbImovel`) não manda estas colunas,
-- então não as apaga.
--
-- O que NÃO muda: RLS e policies de `imoveis`, índices, triggers,
-- `status_history`, `status`, Locado, locação/repasse, Sophia, Retirados,
-- Vendas. Nenhuma função, policy, índice ou trigger novo.
-- ============================================================
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Um único ALTER TABLE: um lock só. Colunas nulas sem default são mudança de
-- catálogo; os dois checks validam a tabela atual, que nelas é toda null.
alter table public.imoveis
  add column if not exists finalidade text,
  add column if not exists valor_venda numeric,
  add column if not exists vendido_em date,
  drop constraint if exists imoveis_finalidade_check,
  add constraint imoveis_finalidade_check
    check (finalidade is null or finalidade in ('locacao', 'venda', 'locacao_venda')),
  drop constraint if exists imoveis_valor_venda_check,
  add constraint imoveis_valor_venda_check
    check (valor_venda is null or (valor_venda >= 0 and valor_venda < 'Infinity'::numeric));

commit;
