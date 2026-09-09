alter table public.protocolos add column if not exists tipo text;

insert into public.protocolos (
  id, user_id, tipo, titulo, conteudo, arquivado, created_at, updated_at
)
select
  gen_random_uuid(),
  protocolo.user_id,
  'informacao_comercial',
  'Visita ao imóvel para divulgação',
  'A Imobiliária pode visitar o imóvel, conhecê-lo e produzir fotos e vídeos para divulgação.',
  protocolo.arquivado,
  protocolo.created_at,
  now()
from public.protocolos protocolo
where protocolo.tipo is null
  and lower(btrim(protocolo.titulo)) = 'agendamento de visita'
  and btrim(protocolo.conteudo) = 'Quando houver autorização para divulgação, a IA pode sugerir o agendamento de uma visita ao imóvel para conhecer o imóvel, tirar fotos e vídeos e preparar a divulgação.'
  and not exists (
    select 1
    from public.protocolos existente
    where existente.user_id = protocolo.user_id
      and lower(btrim(existente.titulo)) = 'visita ao imóvel para divulgação'
  );

update public.protocolos
set
  tipo = 'regra_conduta',
  conteudo = 'Quando houver autorização para divulgação, a IA pode conduzir a conversa para o agendamento da visita.',
  updated_at = now()
where tipo is null
  and lower(btrim(titulo)) = 'agendamento de visita'
  and btrim(conteudo) = 'Quando houver autorização para divulgação, a IA pode sugerir o agendamento de uma visita ao imóvel para conhecer o imóvel, tirar fotos e vídeos e preparar a divulgação.';

update public.protocolos
set tipo = 'regra_conduta'
where tipo is null
  and lower(btrim(titulo)) in (
    'não repetir informações',
    'proprietário interessado',
    'outra imobiliária',
    'outra imobiliária com contrato de exclusividade',
    'outra imobiliaria contrato de exclusividade',
    'sem interesse',
    'imóvel com reparos',
    'informação não cadastrada',
    'estilo de resposta',
    'agendamento de visita'
  );

update public.protocolos
set tipo = 'informacao_comercial'
where tipo is null;

alter table public.protocolos alter column tipo set default 'informacao_comercial';
alter table public.protocolos alter column tipo set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'protocolos_tipo_check'
      and conrelid = 'public.protocolos'::regclass
  ) then
    alter table public.protocolos
      add constraint protocolos_tipo_check
      check (tipo in ('informacao_comercial', 'regra_conduta'));
  end if;
end $$;

create index if not exists idx_protocolos_ativos_tipo
  on public.protocolos (user_id, tipo, created_at)
  where arquivado = false;

notify pgrst, 'reload schema';;
