-- Histórico de interações (notas) do imóvel — mesmo padrão do status_history:
-- jsonb na própria linha, herdando as políticas de RLS existentes.
alter table imoveis add column if not exists notas jsonb not null default '[]'::jsonb;

-- Meta de faturamento estimado em contratos (soma dos aluguéis locados no mês).
alter table metas add column if not exists faturamento numeric default 0;;
