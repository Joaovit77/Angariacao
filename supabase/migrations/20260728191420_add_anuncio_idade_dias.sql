alter table imoveis add column if not exists anuncio_idade_dias integer;

comment on column imoveis.anuncio_idade_dias is
  'Idade do anuncio (em dias) no momento em que o imovel foi garimpado. Congelada: a pergunta e se anuncio velho converte, e para isso vale a idade na descoberta, nao a de hoje.';;
