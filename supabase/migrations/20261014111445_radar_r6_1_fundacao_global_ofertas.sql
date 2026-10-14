-- Radar R6.1-A: fundação global inerte, sem writer, coleta, seed ou backfill.
-- Baseline observacional não comprova publicação recente nem cobertura integral do portal.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.radar_universos (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('zap', 'viva-real', 'chaves-na-mao', 'olx', 'wimoveis')),
  finalidade text not null check (finalidade in ('locacao', 'venda')),
  uf text not null check (uf in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  cidade text not null check (char_length(btrim(cidade)) > 0),
  tipo_recorte text not null check (tipo_recorte in ('casa', 'apartamento')),
  anunciante_recorte text not null check (anunciante_recorte = 'todos'),
  versao_semantica integer not null check (versao_semantica > 0),
  baseline_varredura_id uuid,
  baseline_concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint radar_universos_identidade_key unique (
    portal, finalidade, uf, cidade, tipo_recorte, anunciante_recorte, versao_semantica
  ),
  constraint radar_universos_baseline_par_check check (
    (baseline_varredura_id is null) = (baseline_concluido_em is null)
  )
);

create table public.radar_varreduras (
  id uuid primary key default gen_random_uuid(),
  universo_id uuid not null references public.radar_universos(id) on delete restrict,
  chave_idempotencia text not null check (char_length(btrim(chave_idempotencia)) > 0),
  iniciada_em timestamptz not null,
  concluida_em timestamptz,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  expira_em timestamptz,
  iniciador text not null check (char_length(btrim(iniciador)) > 0),
  aquisicao_id text check (aquisicao_id is null or char_length(btrim(aquisicao_id)) > 0),
  aquisicao_em timestamptz,
  origem_aquisicao text check (origem_aquisicao is null or char_length(btrim(origem_aquisicao)) > 0),
  versao_aquisicao text check (versao_aquisicao is null or char_length(btrim(versao_aquisicao)) > 0),
  cobertura text not null check (cobertura in ('amostra', 'universo_comprovado', 'desconhecida')),
  codigo_resultado text check (codigo_resultado is null or char_length(btrim(codigo_resultado)) > 0),
  contagem_bruta integer check (contagem_bruta >= 0),
  contagem_admitida integer check (contagem_admitida >= 0),
  paginas_lidas integer check (paginas_lidas >= 0),
  paginas_planejadas integer check (paginas_planejadas >= 0),
  criado_em timestamptz not null default now(),
  constraint radar_varreduras_idempotencia_key unique (universo_id, chave_idempotencia),
  -- Chave referenciada pelo baseline composto; não cria outro conceito de identidade.
  constraint radar_varreduras_id_universo_key unique (id, universo_id),
  constraint radar_varreduras_conclusao_check check (
    (status = 'running' and concluida_em is null)
    or (status in ('success', 'partial', 'failed') and concluida_em is not null)
  ),
  constraint radar_varreduras_tempo_check check (concluida_em >= iniciada_em),
  constraint radar_varreduras_expiracao_check check (expira_em >= iniciada_em),
  constraint radar_varreduras_contagem_check check (contagem_admitida <= contagem_bruta),
  constraint radar_varreduras_paginas_check check (paginas_lidas <= paginas_planejadas)
);

-- O ciclo de referências é criado depois das tabelas, sem trigger nem dados.
-- MATCH SIMPLE permite universo ainda sem baseline; quando existe, deve ser do próprio universo.
alter table public.radar_universos
  add constraint radar_universos_baseline_varredura_fkey
  foreign key (baseline_varredura_id, id)
  references public.radar_varreduras (id, universo_id) on delete restrict;

create table public.radar_anuncios_globais (
  id uuid primary key default gen_random_uuid(),
  portal text not null check (portal in ('zap', 'viva-real', 'chaves-na-mao', 'olx', 'wimoveis')),
  finalidade text not null check (finalidade in ('locacao', 'venda')),
  id_externo text not null check (char_length(btrim(id_externo)) > 0),
  url_canonica text not null check (char_length(btrim(url_canonica)) > 0),
  primeira_varredura_id uuid not null references public.radar_varreduras(id) on delete restrict,
  primeiro_visto_em timestamptz not null,
  ultimo_visto_em timestamptz not null,
  dados_objetivos jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_objetivos) = 'object'),
  criado_em timestamptz not null default now(),
  constraint radar_anuncios_globais_oferta_key unique (portal, finalidade, id_externo),
  constraint radar_anuncios_globais_observacao_check check (ultimo_visto_em >= primeiro_visto_em)
);

create table public.radar_presencas (
  varredura_id uuid not null references public.radar_varreduras(id) on delete restrict,
  anuncio_global_id uuid not null references public.radar_anuncios_globais(id) on delete restrict,
  observado_em timestamptz not null,
  preco_observado numeric check (preco_observado > 0),
  tipo_observado text check (tipo_observado in ('casa', 'apartamento')),
  uf_observada text check (uf_observada in (
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
    'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  )),
  cidade_observada text check (cidade_observada is null or char_length(btrim(cidade_observada)) > 0),
  url_observada text check (url_observada is null or char_length(btrim(url_observada)) > 0),
  dados_objetivos jsonb not null default '{}'::jsonb check (jsonb_typeof(dados_objetivos) = 'object'),
  primary key (varredura_id, anuncio_global_id)
);

create unique index idx_radar_varreduras_universo_running
  on public.radar_varreduras (universo_id) where status = 'running';
create index idx_radar_varreduras_universo_inicio
  on public.radar_varreduras (universo_id, iniciada_em desc);
create index idx_radar_anuncios_globais_primeira_varredura
  on public.radar_anuncios_globais (primeira_varredura_id);
create index idx_radar_universos_baseline_varredura
  on public.radar_universos (baseline_varredura_id, id) where baseline_varredura_id is not null;
create index idx_radar_presencas_anuncio_observacao
  on public.radar_presencas (anuncio_global_id, observado_em desc);

comment on table public.radar_universos is
  'Universo global de aquisição, independente de usuário e filtros pessoais. R6.1-A inerte, sem callers.';
comment on column public.radar_universos.cidade is
  'Chave canônica produzida pela fronteira futura com chaveNormalizada e validação de cidade/UF; não é label nem slug do portal. A UNIQUE compara chaves já canonicalizadas.';
comment on column public.radar_universos.anunciante_recorte is
  'Somente todos nesta fase. Filtro particular não comprova autoria individual.';
comment on column public.radar_universos.versao_semantica is
  'Versão positiva do contrato de aquisição/admissão e alcance; não é commit, deploy nem cada revisão equivalente de parser. Nova versão exige baseline próprio, preservando conhecidos globais.';
comment on column public.radar_universos.baseline_varredura_id is
  'Varredura do próprio universo que fundamentará o baseline OBSERVACIONAL do alcance comprovado. Não significa cobertura completa do portal, snapshot integral do mercado nem recência/publicação. Sucesso/qualidade e formação transacional serão protegidos no R6.1-B/R6.2/R6.3.';
comment on column public.radar_universos.baseline_concluido_em is
  'Instante de formação do baseline OBSERVACIONAL, em par com baseline_varredura_id. Não comprova publicação recente ou entrada cronológica no portal. Coerência com conclusão/status pertence ao R6.1-B.';
comment on table public.radar_anuncios_globais is
  'Uma oferta individual qualificada por portal + finalidade + ID nativo. Novo no Radar será primeira observação global confirmada após baseline observacional confiável; não é booleano mutável nem publicação recente comprovada. R6.1-A não classifica novidade.';
comment on column public.radar_anuncios_globais.id_externo is
  'ID nativo previamente qualificado pelo writer futuro. Sem ID confiável, R6.2 recusa ingresso. Não promover fallback posicional de idDoAnuncio, URL, fingerprint, título, hash ou endereço a identidade automática.';
comment on column public.radar_anuncios_globais.finalidade is
  'Parte da identidade da oferta: Locação e Venda do mesmo portal/ID coexistem sem sobrescrever histórico. Sem inferência de finalidade nesta fundação.';
comment on column public.radar_anuncios_globais.primeira_varredura_id is
  'Proveniência da primeira admissão global confirmada. Concordância de portal/finalidade com o universo e proteções cross-table serão endurecidas no R6.1-B.';
comment on column public.radar_anuncios_globais.primeiro_visto_em is
  'Primeira observação confirmada pela plataforma; não é data de publicação. Sem atualização automática por trigger.';
comment on column public.radar_anuncios_globais.ultimo_visto_em is
  'Última observação positiva confirmada; não afirma disponibilidade atual, retirada, recência ou ausência. R6.2 controlará a proveniência.';
comment on column public.radar_anuncios_globais.dados_objetivos is
  'Objeto mínimo de fatos objetivos sanitizados; allowlist será definida pelo writer. Proibido telefone, e-mail, proprietário, contato, HTML bruto, cookie, token ou dado privado de usuário. Não copiar JSON legado automaticamente.';
comment on table public.radar_varreduras is
  'Execução de um universo global. UNIQUE de execução lógica e uma running por universo. Sem scheduler, claim, writer ou recuperação automática no R6.1-A.';
comment on column public.radar_varreduras.chave_idempotencia is
  'Chave estável da execução lógica no universo; retry futuro deve reutilizá-la. Não substitui idempotência operacional ou validação de payload.';
comment on column public.radar_varreduras.status is
  'running, success, partial ou failed. CHECKs validam o formato da linha; transições terminais, execução expirada e baseline válido pertencem ao R6.1-B.';
comment on column public.radar_varreduras.expira_em is
  'Prazo opcional para futura recuperação de running abandonada. Expiração não libera sozinha o índice running; recuperação/fencing são posteriores.';
comment on column public.radar_varreduras.aquisicao_id is
  'Identificador da aquisição de origem, preservado na reutilização futura de cache/single-flight. R6.1-A não cria nem preenche proveniência.';
comment on column public.radar_varreduras.aquisicao_em is
  'Instante da aquisição de origem, não o instante de reler cache antigo. Proveniência operacional pertence ao R6.2.';
comment on column public.radar_varreduras.origem_aquisicao is
  'Transporte/fonte observado, definido pelo backend futuro; não recebe URL, token ou identificador privado de usuário.';
comment on column public.radar_varreduras.versao_aquisicao is
  'Versão técnica da aquisição/interpretação, separada da versão semântica do universo.';
comment on column public.radar_varreduras.cobertura is
  'amostra, universo_comprovado ou desconhecida. Sucesso não implica completude. Primeira página por relevância é amostra; universo_comprovado exige evidência adicional. Nenhum valor comprova publicação recente.';
comment on table public.radar_presencas is
  'Fato positivo por varredura/oferta, orientado a inserção. Universo deriva da varredura. Sem ausência, remoção, ranking ou estado individual. Concordância de contexto, inserção em execução aberta e payload divergente pertencem ao R6.1-B.';
comment on column public.radar_presencas.tipo_observado is
  'Recorte observacional casa/apartamento, comprovado pelo anúncio, nunca fabricado pelo filtro. Subtipo declarado, como Sobrado no caminho aprovado do ZAP, pode ser preservado no objeto sanitizado futuro.';
comment on column public.radar_presencas.dados_objetivos is
  'Objeto mínimo de fatos objetivos sanitizados; allowlist futura. Proibido telefone, e-mail, proprietário, contato, HTML bruto, cookie, token ou dado privado de usuário. Não copiar JSON legado automaticamente.';

alter table public.radar_universos enable row level security;
alter table public.radar_anuncios_globais enable row level security;
alter table public.radar_varreduras enable row level security;
alter table public.radar_presencas enable row level security;

-- Fecha defaults efetivos na mesma transação; nenhuma policy de cliente.
revoke all on table public.radar_universos, public.radar_anuncios_globais,
  public.radar_varreduras, public.radar_presencas
  from public, anon, authenticated, service_role;

grant select, insert on table public.radar_universos, public.radar_anuncios_globais,
  public.radar_varreduras, public.radar_presencas to service_role;
grant update (baseline_varredura_id, baseline_concluido_em)
  on public.radar_universos to service_role;
grant update (url_canonica, ultimo_visto_em, dados_objetivos)
  on public.radar_anuncios_globais to service_role;
grant update (concluida_em, status, expira_em, aquisicao_id, aquisicao_em,
  origem_aquisicao, versao_aquisicao, cobertura, codigo_resultado,
  contagem_bruta, contagem_admitida, paginas_lidas, paginas_planejadas)
  on public.radar_varreduras to service_role;
-- Presenças sem UPDATE; nenhuma tabela recebe DELETE/TRUNCATE.
-- Grants por coluna não implementam a máquina de estados ou toda integridade cross-table.
commit;
