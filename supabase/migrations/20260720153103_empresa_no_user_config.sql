-- Nome da empresa/imobiliária do usuário, para as sugestões de abordagem
-- por IA. Aditivo e idempotente.
alter table user_config add column if not exists empresa text;;
