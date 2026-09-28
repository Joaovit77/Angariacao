-- Radar R4.2g — migração multiportal: o banco passa a CONHECER o portal `zap`.
--
-- Só expande o domínio das três CHECKs de portal de quatro para cinco valores,
-- mantendo os nomes atuais. O ZAP continua inerte: a aplicação do R4.2g não o
-- coleta, não o agenda e não o grava. A coleta funcional é do R4.2h.
--
-- Aditiva e compatível nos dois sentidos:
-- - toda linha existente usa um dos quatro valores anteriores e continua válida
--   (o ADD CONSTRAINT valida as linhas atuais na hora; as três tabelas são
--   pequenas, então o bloqueio é breve);
-- - a aplicação anterior nunca grava `zap`, então pode rodar sobre este banco.
--
-- Rollback: recriar as três CHECKs com os quatro valores anteriores. Só é
-- possível enquanto não existir linha com portal = 'zap' (até o R4.2h gravar).

alter table public.radar_anuncios
  drop constraint if exists radar_anuncios_portal_check;
alter table public.radar_anuncios
  add constraint radar_anuncios_portal_check
  check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real', 'zap'));

alter table public.central_anuncios_visualizados
  drop constraint if exists central_anuncios_visualizados_portal_check;
alter table public.central_anuncios_visualizados
  add constraint central_anuncios_visualizados_portal_check
  check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real', 'zap'));

alter table public.comparaveis_mercado
  drop constraint if exists comparaveis_mercado_portal_check;
alter table public.comparaveis_mercado
  add constraint comparaveis_mercado_portal_check
  check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real', 'zap'));
