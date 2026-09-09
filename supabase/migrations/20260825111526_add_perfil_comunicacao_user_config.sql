alter table public.user_config
  add column if not exists perfil_comunicacao jsonb not null
  default '{"formalidade":"natural","tamanho":"curto","emojis":"poucos","tratamento":"voce","expressoesPreferidas":[],"expressoesEvitar":[]}'::jsonb;;
