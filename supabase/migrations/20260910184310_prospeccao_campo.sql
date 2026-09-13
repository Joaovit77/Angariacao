-- Garimpo em Campo — C2a: somente tabelas, constraints e índices.
-- Policies, grants, triggers, RPCs e Storage pertencem aos próximos checkpoints.

create table if not exists public.imoveis_identificados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'identificado'
    constraint imoveis_identificados_situacao_check check (
      situacao in ('identificado', 'investigando', 'promovendo', 'promovido', 'descartado', 'fundido')
    ),
  logradouro text
    constraint imoveis_identificados_logradouro_check check (
      logradouro is null or char_length(trim(logradouro)) between 1 and 200
    ),
  numero text,
  unidade text,
  bloco text,
  edificio text,
  bairro text,
  cidade text,
  estado text
    constraint imoveis_identificados_estado_check check (
      estado is null or (
        estado = upper(trim(estado))
        and estado ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'
      )
    ),
  cep text,
  ponto_referencia text,
  endereco_chave text not null default '',
  cidade_chave text not null default '',
  bairro_chave text not null default '',
  latitude double precision
    constraint imoveis_identificados_latitude_check check (
      latitude is null or latitude between -90 and 90
    ),
  longitude double precision
    constraint imoveis_identificados_longitude_check check (
      longitude is null or longitude between -180 and 180
    ),
  acuracia_metros numeric
    constraint imoveis_identificados_acuracia_check check (
      acuracia_metros is null or acuracia_metros > 0
    ),
  precisao_localizacao text not null default 'desconhecida'
    constraint imoveis_identificados_precisao_check check (
      precisao_localizacao in ('gps', 'mapa', 'geocodificado', 'desconhecida')
    ),
  tipo text
    constraint imoveis_identificados_tipo_check check (
      tipo is null or tipo in (
        'Apartamento', 'Casa', 'Casa de Condomínio', 'Kitnet/Studio', 'Sobrado',
        'Sala Comercial', 'Galpão', 'Terreno', 'Outro'
      )
    ),
  tipo_origem text
    constraint imoveis_identificados_tipo_origem_check check (
      tipo_origem is null or tipo_origem in ('manual', 'ia-texto', 'carteira')
    ),
  tipo_confianca smallint
    constraint imoveis_identificados_tipo_confianca_check check (
      tipo_confianca is null or tipo_confianca between 0 and 100
    ),
  tipo_estado text
    constraint imoveis_identificados_tipo_estado_check check (
      tipo_estado is null or tipo_estado in ('declarado', 'inferido', 'confirmado')
    ),
  tipo_definido_em timestamptz,
  tipo_classificacao_id uuid,
  tipo_avistamento_id uuid,
  tipo_confirmado_por uuid references auth.users(id) on delete set null,
  tipo_confirmado_em timestamptz,
  primeiro_avistamento_em timestamptz,
  ultimo_avistamento_em timestamptz,
  avistamentos_total integer not null default 0
    constraint imoveis_identificados_avistamentos_total_check check (avistamentos_total >= 0),
  avistamento_corrente_id uuid,
  origem_identificacao text not null default 'campo'
    constraint imoveis_identificados_origem_check check (
      origem_identificacao in ('campo', 'placa')
    ),
  ultima_investigacao_em timestamptz,
  imovel_id uuid references public.imoveis(id) on delete set null,
  promovido_em timestamptz,
  descartado_em timestamptz,
  descartado_motivo text,
  fundido_em timestamptz,
  fundido_em_imovel_id uuid,
  exclusao_solicitada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint imoveis_identificados_fundido_destino_check check (
    fundido_em_imovel_id is null or fundido_em_imovel_id <> id
  ),
  constraint imoveis_identificados_fundido_coerente_check check (
    (situacao = 'fundido') = (fundido_em is not null and fundido_em_imovel_id is not null)
  ),
  constraint imoveis_identificados_promovido_coerente_check check (
    situacao <> 'promovido'
    or (imovel_id is not null and promovido_em is not null and fundido_em is null)
  ),
  constraint imoveis_identificados_promovendo_coerente_check check (
    situacao <> 'promovendo' or (imovel_id is null and promovido_em is null)
  ),
  constraint imoveis_identificados_descartado_coerente_check check (
    situacao <> 'descartado' or descartado_em is not null
  ),
  constraint imoveis_identificados_tipo_metadados_check check (
    (
      tipo is null
      and tipo_origem is null
      and tipo_confianca is null
      and tipo_estado is null
      and tipo_definido_em is null
      and tipo_classificacao_id is null
      and tipo_avistamento_id is null
      and tipo_confirmado_por is null
      and tipo_confirmado_em is null
    )
    or (
      tipo is not null
      and tipo_origem is not null
      and tipo_estado is not null
      and tipo_definido_em is not null
    )
  ),
  constraint imoveis_identificados_tipo_ia_check check (
    tipo_origem <> 'ia-texto'
    or (
      tipo_confianca is not null
      and tipo_classificacao_id is not null
      and tipo_avistamento_id is not null
    )
  ),
  constraint imoveis_identificados_tipo_manual_check check (
    tipo_origem <> 'manual'
    or (
      tipo_confianca is null
      and tipo_classificacao_id is null
      and tipo_avistamento_id is null
    )
  ),
  constraint imoveis_identificados_tipo_confirmado_check check (
    (tipo_estado = 'confirmado')
    = (tipo_confirmado_por is not null and tipo_confirmado_em is not null)
  )
);

create table if not exists public.imoveis_identificados_avistamentos (
  id uuid primary key default gen_random_uuid(),
  imovel_identificado_id uuid not null
    references public.imoveis_identificados(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  observado_em timestamptz not null,
  latitude double precision
    constraint imoveis_identificados_avistamentos_latitude_check check (
      latitude is null or latitude between -90 and 90
    ),
  longitude double precision
    constraint imoveis_identificados_avistamentos_longitude_check check (
      longitude is null or longitude between -180 and 180
    ),
  acuracia_metros numeric
    constraint imoveis_identificados_avistamentos_acuracia_check check (
      acuracia_metros is null or acuracia_metros > 0
    ),
  precisao_localizacao text not null default 'desconhecida'
    constraint imoveis_identificados_avistamentos_precisao_check check (
      precisao_localizacao in ('gps', 'mapa', 'geocodificado', 'desconhecida')
    ),
  observacao text not null default ''
    constraint imoveis_identificados_avistamentos_observacao_check check (
      char_length(observacao) <= 2000
    ),
  observacao_revisao integer not null default 1
    constraint imoveis_identificados_avistamentos_revisao_check check (
      observacao_revisao >= 1
    ),
  revisao_conflito_em timestamptz,
  classificacao_estado text not null default 'pendente'
    constraint imoveis_identificados_avistamentos_classificacao_estado_check check (
      classificacao_estado in ('pendente', 'concluida', 'indisponivel', 'nao_aplicavel')
    ),
  classificacao_id uuid,
  classificacao_em timestamptz,
  fingerprint text,
  created_at timestamptz not null default now(),
  constraint imoveis_identificados_avistamentos_classificacao_coerente_check check (
    (classificacao_estado = 'concluida')
    = (classificacao_id is not null and classificacao_em is not null and fingerprint is not null)
  )
);

create table if not exists public.imoveis_identificados_fotos (
  id uuid primary key default gen_random_uuid(),
  avistamento_id uuid not null
    references public.imoveis_identificados_avistamentos(id) on delete cascade,
  imovel_identificado_id uuid not null
    references public.imoveis_identificados(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'reservada'
    constraint imoveis_identificados_fotos_estado_check check (estado in ('reservada', 'ativa')),
  caminho text not null unique,
  caminho_miniatura text not null unique,
  largura integer not null
    constraint imoveis_identificados_fotos_largura_check check (largura > 0),
  altura integer not null
    constraint imoveis_identificados_fotos_altura_check check (altura > 0),
  bytes integer not null
    constraint imoveis_identificados_fotos_bytes_check check (bytes > 0 and bytes <= 5242880),
  capturada_em timestamptz,
  reservada_em timestamptz not null default now(),
  ativada_em timestamptz,
  created_at timestamptz not null default now(),
  constraint imoveis_identificados_fotos_estado_coerente_check check (
    (estado = 'ativa') = (ativada_em is not null)
  )
);

create table if not exists public.imoveis_identificados_classificacoes (
  id uuid primary key default gen_random_uuid(),
  avistamento_id uuid not null
    references public.imoveis_identificados_avistamentos(id) on delete cascade,
  imovel_identificado_id uuid not null
    references public.imoveis_identificados(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  estado text not null default 'processando'
    constraint imoveis_identificados_classificacoes_estado_check check (
      estado in ('processando', 'concluida', 'falhou', 'abandonada')
    ),
  modo text not null
    constraint imoveis_identificados_classificacoes_modo_check check (modo in ('modelo', 'reuso')),
  reusada_de_classificacao_id uuid
    references public.imoveis_identificados_classificacoes(id) on delete set null,
  observacao_revisao integer not null
    constraint imoveis_identificados_classificacoes_revisao_check check (observacao_revisao >= 1),
  fingerprint text not null,
  modelo text,
  esforco text,
  versao_catalogo integer not null
    constraint imoveis_identificados_classificacoes_versao_catalogo_check check (versao_catalogo > 0),
  versao_classificador integer not null
    constraint imoveis_identificados_classificacoes_versao_classificador_check check (
      versao_classificador > 0
    ),
  confianca_minima smallint not null
    constraint imoveis_identificados_classificacoes_confianca_minima_check check (
      confianca_minima between 0 and 100
    ),
  tipo_sugerido text
    constraint imoveis_identificados_classificacoes_tipo_check check (
      tipo_sugerido is null or tipo_sugerido in (
        'Apartamento', 'Casa', 'Casa de Condomínio', 'Kitnet/Studio', 'Sobrado',
        'Sala Comercial', 'Galpão', 'Terreno', 'Outro'
      )
    ),
  tipo_confianca smallint
    constraint imoveis_identificados_classificacoes_tipo_confianca_check check (
      tipo_confianca is null or tipo_confianca between 0 and 100
    ),
  snapshot_aplicado boolean not null default false,
  sugeridas integer not null default 0 check (sugeridas >= 0),
  aplicadas integer not null default 0 check (aplicadas >= 0),
  abaixo_do_piso integer not null default 0 check (abaixo_do_piso >= 0),
  fora_do_catalogo integer not null default 0 check (fora_do_catalogo >= 0),
  sem_evidencia integer not null default 0 check (sem_evidencia >= 0),
  ja_confirmada integer not null default 0 check (ja_confirmada >= 0),
  falha_codigo text
    constraint imoveis_identificados_classificacoes_falha_codigo_check check (
      falha_codigo is null or falha_codigo in (
        'nao-configurado', 'sem-permissao', 'sessao-expirada', 'requisicao-invalida',
        'sem-dados', 'intervencao-humana', 'historico-insuficiente', 'contexto-incompleto',
        'baixa-confianca', 'geracao-reprovada', 'protocolo-inadequado',
        'falha-carregamento-contexto', 'falha-modelo', 'limite-excedido', 'falha-ia',
        'indisponivel', 'limite-diario', 'saida-invalida'
      )
    ),
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  lease_token uuid,
  lease_expira_em timestamptz,
  constraint imoveis_identificados_classificacoes_reuso_check check (
    (modo = 'reuso') = (reusada_de_classificacao_id is not null)
  ),
  constraint imoveis_identificados_classificacoes_lease_check check (
    (lease_token is null) = (lease_expira_em is null)
  ),
  constraint imoveis_identificados_classificacoes_concluida_check check (
    estado <> 'concluida' or concluida_em is not null
  ),
  constraint imoveis_identificados_classificacoes_falhou_check check (
    estado <> 'falhou' or falha_codigo is not null
  ),
  constraint imoveis_identificados_classificacoes_reuso_sem_falha_check check (
    modo <> 'reuso' or falha_codigo is null
  )
);

create table if not exists public.imoveis_identificados_etiquetas (
  id bigint generated always as identity primary key,
  imovel_identificado_id uuid not null
    references public.imoveis_identificados(id) on delete cascade,
  avistamento_id uuid
    references public.imoveis_identificados_avistamentos(id) on delete cascade,
  classificacao_id uuid
    references public.imoveis_identificados_classificacoes(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  categoria text not null,
  codigo text not null,
  origem text not null
    constraint imoveis_identificados_etiquetas_origem_check check (
      origem in ('manual', 'ia-texto', 'ia-visao')
    ),
  confianca smallint
    constraint imoveis_identificados_etiquetas_confianca_check check (
      confianca is null or confianca between 0 and 100
    ),
  estado text not null default 'inferida'
    constraint imoveis_identificados_etiquetas_estado_check check (
      estado in ('inferida', 'confirmada', 'contestada', 'substituida', 'desatualizada')
    ),
  modelo text,
  versao_catalogo integer not null
    constraint imoveis_identificados_etiquetas_versao_catalogo_check check (versao_catalogo > 0),
  versao_classificador integer
    constraint imoveis_identificados_etiquetas_versao_classificador_check check (
      versao_classificador is null or versao_classificador > 0
    ),
  revisao_observacao integer
    constraint imoveis_identificados_etiquetas_revisao_check check (
      revisao_observacao is null or revisao_observacao >= 1
    ),
  observado_em timestamptz,
  confirmada_por uuid references auth.users(id) on delete set null,
  confirmada_em timestamptz,
  substituida_em timestamptz,
  substituida_por_classificacao_id uuid
    references public.imoveis_identificados_classificacoes(id),
  desatualizada_em timestamptz,
  created_at timestamptz not null default now(),
  constraint imoveis_identificados_etiquetas_confirmada_check check (
    estado <> 'confirmada' or (confirmada_por is not null and confirmada_em is not null)
  ),
  constraint imoveis_identificados_etiquetas_ia_texto_check check (
    origem <> 'ia-texto'
    or (
      confianca is not null
      and modelo is not null
      and classificacao_id is not null
      and avistamento_id is not null
      and revisao_observacao is not null
    )
  ),
  constraint imoveis_identificados_etiquetas_manual_check check (
    origem <> 'manual' or (confianca is null and modelo is null)
  ),
  constraint imoveis_identificados_etiquetas_substituida_check check (
    estado <> 'substituida'
    or (substituida_em is not null and substituida_por_classificacao_id is not null)
  ),
  constraint imoveis_identificados_etiquetas_desatualizada_check check (
    estado <> 'desatualizada' or desatualizada_em is not null
  )
);

-- FKs cíclicas entram depois que as cinco relações existem.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_identificados_tipo_classificacao_fkey'
      and conrelid = 'public.imoveis_identificados'::regclass
  ) then
    alter table public.imoveis_identificados
      add constraint imoveis_identificados_tipo_classificacao_fkey
      foreign key (tipo_classificacao_id)
      references public.imoveis_identificados_classificacoes(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_identificados_tipo_avistamento_fkey'
      and conrelid = 'public.imoveis_identificados'::regclass
  ) then
    alter table public.imoveis_identificados
      add constraint imoveis_identificados_tipo_avistamento_fkey
      foreign key (tipo_avistamento_id)
      references public.imoveis_identificados_avistamentos(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_identificados_avistamento_corrente_fkey'
      and conrelid = 'public.imoveis_identificados'::regclass
  ) then
    alter table public.imoveis_identificados
      add constraint imoveis_identificados_avistamento_corrente_fkey
      foreign key (avistamento_corrente_id)
      references public.imoveis_identificados_avistamentos(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_identificados_avistamentos_classificacao_fkey'
      and conrelid = 'public.imoveis_identificados_avistamentos'::regclass
  ) then
    alter table public.imoveis_identificados_avistamentos
      add constraint imoveis_identificados_avistamentos_classificacao_fkey
      foreign key (classificacao_id)
      references public.imoveis_identificados_classificacoes(id) on delete set null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'imoveis_identificados_fundido_em_imovel_fkey'
      and conrelid = 'public.imoveis_identificados'::regclass
  ) then
    alter table public.imoveis_identificados
      add constraint imoveis_identificados_fundido_em_imovel_fkey
      foreign key (fundido_em_imovel_id)
      references public.imoveis_identificados(id) on delete cascade;
  end if;
end;
$$;

create index if not exists idx_imoveis_identificados_user_situacao_ultimo
  on public.imoveis_identificados (user_id, situacao, ultimo_avistamento_em desc);
create index if not exists idx_imoveis_identificados_user_cidade_bairro
  on public.imoveis_identificados (user_id, cidade_chave, bairro_chave);
create index if not exists idx_imoveis_identificados_user_coordenadas
  on public.imoveis_identificados (user_id, latitude, longitude)
  where latitude is not null;
create index if not exists idx_imoveis_identificados_user_endereco
  on public.imoveis_identificados (user_id, endereco_chave)
  where endereco_chave <> '';
create index if not exists idx_imoveis_identificados_imovel
  on public.imoveis_identificados (imovel_id)
  where imovel_id is not null;
create index if not exists idx_imoveis_identificados_avistamento_corrente
  on public.imoveis_identificados (avistamento_corrente_id);
create index if not exists idx_imoveis_identificados_fundido_destino
  on public.imoveis_identificados (fundido_em_imovel_id)
  where fundido_em_imovel_id is not null;
create index if not exists idx_imoveis_identificados_exclusao_pendente
  on public.imoveis_identificados (user_id)
  where exclusao_solicitada_em is not null;
create index if not exists idx_imoveis_identificados_promocao_pendente
  on public.imoveis_identificados (user_id)
  where situacao = 'promovendo';

create index if not exists idx_identificados_avistamentos_imovel_ordem
  on public.imoveis_identificados_avistamentos (
    imovel_identificado_id, observado_em desc, created_at desc, id desc
  );
create index if not exists idx_identificados_avistamentos_user_observado
  on public.imoveis_identificados_avistamentos (user_id, observado_em desc);
create index if not exists idx_identificados_avistamentos_pendentes
  on public.imoveis_identificados_avistamentos (user_id, classificacao_estado)
  where classificacao_estado = 'pendente';

create unique index if not exists idx_identificados_fotos_avistamento_unico
  on public.imoveis_identificados_fotos (avistamento_id);
create index if not exists idx_identificados_fotos_imovel_capturada
  on public.imoveis_identificados_fotos (imovel_identificado_id, capturada_em desc);
create index if not exists idx_identificados_fotos_reservadas
  on public.imoveis_identificados_fotos (user_id)
  where estado = 'reservada';

create unique index if not exists idx_identificados_classificacoes_processando
  on public.imoveis_identificados_classificacoes (avistamento_id)
  where estado = 'processando';
create unique index if not exists idx_identificados_classificacoes_concluida
  on public.imoveis_identificados_classificacoes (
    avistamento_id, observacao_revisao, fingerprint
  ) where estado = 'concluida';
create index if not exists idx_identificados_classificacoes_avistamento_inicio
  on public.imoveis_identificados_classificacoes (avistamento_id, iniciada_em desc);
create index if not exists idx_identificados_classificacoes_reuso
  on public.imoveis_identificados_classificacoes (imovel_identificado_id, fingerprint)
  where estado = 'concluida';
create index if not exists idx_identificados_classificacoes_user_inicio
  on public.imoveis_identificados_classificacoes (user_id, iniciada_em desc);

create unique index if not exists idx_identificados_etiquetas_avistamento_vigente
  on public.imoveis_identificados_etiquetas (avistamento_id, categoria, codigo)
  where avistamento_id is not null and estado in ('inferida', 'confirmada');
create unique index if not exists idx_identificados_etiquetas_imovel_vigente
  on public.imoveis_identificados_etiquetas (imovel_identificado_id, categoria, codigo)
  where avistamento_id is null and estado in ('inferida', 'confirmada');
create index if not exists idx_identificados_etiquetas_analiticas
  on public.imoveis_identificados_etiquetas (user_id, categoria, codigo)
  where estado in ('inferida', 'confirmada');
create index if not exists idx_identificados_etiquetas_avistamento_estado
  on public.imoveis_identificados_etiquetas (avistamento_id, estado);
create index if not exists idx_identificados_etiquetas_imovel_estado_observado
  on public.imoveis_identificados_etiquetas (
    imovel_identificado_id, estado, observado_em desc
  );
create index if not exists idx_identificados_etiquetas_classificacao
  on public.imoveis_identificados_etiquetas (classificacao_id);

-- A proteção fica ligada no mesmo arquivo da criação. As policies e os
-- grants continuam reservados integralmente ao C2b.
alter table public.imoveis_identificados enable row level security;
alter table public.imoveis_identificados_avistamentos enable row level security;
alter table public.imoveis_identificados_fotos enable row level security;
alter table public.imoveis_identificados_classificacoes enable row level security;
alter table public.imoveis_identificados_etiquetas enable row level security;
