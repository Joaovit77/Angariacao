-- Quantos dos tokens_entrada vieram do CACHE da OpenAI (cobrados 10x
-- menos). Coluna separada e não um tokens_entrada já líquido porque
-- `prompt_tokens` da API JÁ INCLUI os cacheados — guardar o total e a
-- parte cacheada preserva o que a API disse e deixa a subtração para a
-- leitura, em lib/calculo/custoIa.ts.
-- `default 0` cobre as linhas já gravadas: antes desta coluna nada era
-- cacheado do ponto de vista do cálculo, que é a leitura conservadora
-- (cobrava tudo cheio) — nenhuma linha antiga muda de valor.
alter table ia_uso add column if not exists tokens_entrada_cache integer not null default 0;;
