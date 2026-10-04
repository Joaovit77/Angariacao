-- Radar R6.1: infraestrutura global inerte. Sem coleta, seed ou backfill.
-- R6.2 qualificará as entradas: IDs legados não são promovidos automaticamente.
begin;

create table public.radar_universos (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('zap', 'viva-real', 'chaves-na-mao', 'olx', 'wimoveis')),
  finalidade text not null check (finalidade in ('locacao', 'venda')),
  uf text not null check (uf in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  cidade text not null check (char_length(btrim(cidade)) > 0),
  tipo_recorte text not null check (tipo_recorte in ('casa', 'apartamento', 'todos')),
  anunciante_recorte text not null check (anunciante_recorte in ('todos', 'proprietario')),
  versao_semantica integer not null default 1 check (versao_semantica > 0),
  baseline_formado_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint radar_universos_identidade_key unique (
    portal, finalidade, uf, cidade, tipo_recorte, anunciante_recorte, versao_semantica
  )
);

comment on column public.radar_universos.cidade is
  'Chave canônica produzida por chaveNormalizada na fronteira futura; não é label nem slug. A UNIQUE compara valores já canonicalizados.';
comment on column public.radar_universos.versao_semantica is
  'Versão da definição pública do recorte, não do parser, commit, deploy ou aplicação. Contrato inicial: 1.';
comment on column public.radar_universos.baseline_formado_em is
  'NULL: baseline ainda não formado. Instante: formação concluída. Varredura baseline em andamento representa a formação, sem estado duplicado.';

create table public.radar_anuncios_globais (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('zap', 'viva-real', 'chaves-na-mao', 'olx', 'wimoveis')),
  id_externo text not null check (char_length(btrim(id_externo)) > 0),
  url text not null check (char_length(btrim(url)) > 0),
  tipo_declarado text check (tipo_declarado is null or char_length(btrim(tipo_declarado)) > 0),
  dados_objetivos jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_objetivos) = 'object'),
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  constraint radar_anuncios_globais_identidade_key unique (portal, id_externo),
  constraint radar_anuncios_globais_observacao_check check (ultimo_visto_em >= primeiro_visto_em)
);

comment on column public.radar_anuncios_globais.id_externo is
  'Código nativo previamente qualificado pelo backend. A UNIQUE não qualifica IDs legados, fallback, posição, URL ou fingerprint. Sem heurística de formato no banco.';
comment on column public.radar_anuncios_globais.tipo_declarado is
  'Tipo declarado pelo anúncio, quando conhecido; nunca herdado do filtro do universo.';
comment on column public.radar_anuncios_globais.dados_objetivos is
  'Somente fatos públicos objetivos do anúncio. Proibido estado privado de usuário ou cópia automática de radar_anuncios.dados. Contrato de escrita será definido no R6.2.';
comment on column public.radar_anuncios_globais.primeiro_visto_em is
  'Primeira observação positiva conhecida; data publicada pelo portal não é critério de novidade.';
comment on column public.radar_anuncios_globais.ultimo_visto_em is
  'Última observação positiva conhecida; não afirma disponibilidade nem ausência posterior.';

create table public.radar_varreduras (
  id uuid primary key default gen_random_uuid(),
  universo_id uuid not null references public.radar_universos(id) on delete restrict,
  tipo text not null check (tipo in ('baseline', 'hot', 'reconciliation')),
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'falha')),
  origem text not null check (char_length(btrim(origem)) > 0),
  cobertura text check (cobertura in ('completa', 'parcial')),
  paginas_planejadas integer check (paginas_planejadas >= 0),
  paginas_lidas integer not null default 0 check (paginas_lidas >= 0),
  total_informado_portal integer check (total_informado_portal >= 0),
  chamadas_firecrawl integer not null default 0 check (chamadas_firecrawl >= 0),
  constraint radar_varreduras_tempo_check check (finalizada_em >= iniciada_em),
  constraint radar_varreduras_execucao_check check (
    (status = 'em_andamento' and finalizada_em is null and cobertura is null)
    or (status in ('concluida', 'falha') and finalizada_em is not null and cobertura is not null)
  ),
  constraint radar_varreduras_paginas_check check (
    paginas_planejadas is null or paginas_lidas <= paginas_planejadas
  ),
  constraint radar_varreduras_cobertura_paginas_check check (
    cobertura is distinct from 'completa'
    or paginas_planejadas is null or paginas_lidas = paginas_planejadas
  )
);

comment on column public.radar_varreduras.origem is
  'Origem da execução, registrada pelo backend; texto não vazio sem antecipar vocabulário de scheduler ou guardar identificador privado de usuário.';
comment on column public.radar_varreduras.cobertura is
  'NULL durante execução; completa ou parcial ao terminar. Cobertura é independente do sucesso da execução. Parcial não prova desaparecimento.';
comment on column public.radar_varreduras.paginas_planejadas is
  'NULL quando o planejamento ainda não é conhecido; contadores não estimam o comportamento do portal.';

create table public.radar_presencas (
  varredura_id uuid not null references public.radar_varreduras(id) on delete restrict,
  anuncio_global_id uuid not null references public.radar_anuncios_globais(id) on delete restrict,
  observado_em timestamptz not null default now(),
  primary key (varredura_id, anuncio_global_id)
);

comment on table public.radar_presencas is
  'Fato positivo: anúncio observado nesta varredura. Universo deriva da varredura, sem redundância. Não guarda ausência ou estado derivável; backend futuro deve conferir portal e contexto da observação.';

-- Índices de leitura histórica e dos lados das FKs não cobertos pela PK.
create index idx_radar_varreduras_universo_inicio
  on public.radar_varreduras (universo_id, iniciada_em desc);
create index idx_radar_presencas_anuncio_observacao
  on public.radar_presencas (anuncio_global_id, observado_em desc);

-- RLS e permissões entram na mesma transação: nenhuma janela de acesso público.
alter table public.radar_universos enable row level security;
alter table public.radar_anuncios_globais enable row level security;
alter table public.radar_varreduras enable row level security;
alter table public.radar_presencas enable row level security;

revoke all on table public.radar_universos, public.radar_anuncios_globais,
  public.radar_varreduras, public.radar_presencas
  from public, anon, authenticated, service_role;

-- Backend poderá criar/ler fatos; somente campos evolutivos podem ser atualizados.
grant select, insert on table public.radar_universos, public.radar_anuncios_globais,
  public.radar_varreduras, public.radar_presencas to service_role;
grant update (baseline_formado_em) on public.radar_universos to service_role;
grant update (url, tipo_declarado, dados_objetivos, ultimo_visto_em)
  on public.radar_anuncios_globais to service_role;
grant update (finalizada_em, status, cobertura, paginas_planejadas, paginas_lidas,
  total_informado_portal, chamadas_firecrawl) on public.radar_varreduras to service_role;
-- Presenças são somente leitura/inserção. Nenhum DELETE/TRUNCATE é concedido.

commit;
