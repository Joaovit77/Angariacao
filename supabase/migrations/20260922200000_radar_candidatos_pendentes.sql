-- R4: candidatos a pendência do Radar para o contador de anúncios que ainda
-- exigem atenção. Somente leitura: não altera `visto`, não copia visualizações
-- e não decide "no pipeline" (isso continua em `situacaoRepeticaoCentral`, no
-- TypeScript, sobre os imóveis do usuário).
--
-- Candidato = anúncio do próprio usuário com `visto = false` e sem registro em
-- `central_anuncios_visualizados` pela identidade real user_id + portal +
-- id_externo. Devolve só os campos leves que a regra de pipeline lê.
create or replace function public.candidatos_pendentes_radar()
returns table (
  id uuid,
  busca_id uuid,
  portal text,
  id_externo text,
  url text,
  titulo text,
  descricao text,
  endereco text,
  cidade text,
  estado text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.busca_id,
    r.portal,
    r.id_externo,
    r.url,
    r.dados ->> 'titulo',
    r.dados ->> 'descricao',
    r.dados ->> 'endereco',
    r.dados ->> 'cidade',
    r.dados ->> 'estado'
  from public.radar_anuncios r
  where r.user_id = (select auth.uid())
    and r.visto = false
    and not exists (
      select 1
      from public.central_anuncios_visualizados v
      where v.user_id = r.user_id
        and v.portal = r.portal
        and v.id_externo = r.id_externo
    )
  order by r.encontrado_em desc, r.id;
$$;

revoke all on function public.candidatos_pendentes_radar() from public, anon, authenticated, service_role;
grant execute on function public.candidatos_pendentes_radar() to authenticated;

notify pgrst, 'reload schema';
