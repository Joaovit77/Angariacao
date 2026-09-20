-- C1: preferência geográfica opcional da conta.
-- A cidade inferida da carteira nunca é escrita nestas colunas.
alter table public.user_config
  add column if not exists cidade_padrao text,
  add column if not exists uf_padrao text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_config_cidade_uf_padrao_validos'
      and conrelid = 'public.user_config'::regclass
  ) then
    alter table public.user_config
      add constraint user_config_cidade_uf_padrao_validos check (
        (cidade_padrao is null and uf_padrao is null)
        or (
          cidade_padrao is not null
          and uf_padrao is not null
          and char_length(trim(cidade_padrao)) between 1 and 100
          and cidade_padrao = trim(cidade_padrao)
          and uf_padrao = any (array[
            'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
            'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
            'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
          ]::text[])
        )
      );
  end if;
end
$$;

comment on column public.user_config.cidade_padrao is
  'Cidade escolhida explicitamente pelo usuário como sugestão padrão; não restringe imóveis de outras cidades.';
comment on column public.user_config.uf_padrao is
  'UF da cidade padrão explícita. Nula junto com cidade_padrao quando não configurada.';
