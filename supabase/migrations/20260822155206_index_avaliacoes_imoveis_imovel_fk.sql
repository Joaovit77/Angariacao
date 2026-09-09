create index if not exists idx_avaliacoes_imoveis_imovel
  on public.avaliacoes_imoveis (imovel_id)
  where imovel_id is not null;;
