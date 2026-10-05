-- Vendas V1-B1: fundação aditiva. Sem backfill, RPC comercial ou escrita de cliente.
-- A aplicação incremental requer PostgreSQL 17 e as chaves compostas já versionadas.
-- O bloco BEGIN/END abaixo também é o espelho literal no schema canônico.
-- BEGIN VENDAS V1-B1
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- private já é protegido pelo baseline. Não altera grants/exposição globais.
create schema if not exists private;

-- Mesma definição de texto útil do trim do V1-A; somente primitiva estrutural.
create function private.vendas_texto_util(p_texto text)
returns boolean language sql immutable set search_path = ''
as $$
  select nullif(btrim(p_texto, chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(160) || chr(5760) || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)), '') is not null;
$$;
revoke all on function private.vendas_texto_util(text) from public, anon, authenticated, service_role;

create table public.vendas_imoveis_referencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid,
  imovel_id_original uuid not null,
  codigo text,
  referencia text,
  endereco text,
  unidade text,
  bloco text,
  capturado_em timestamptz(3) not null,
  constraint vendas_referencias_id_usuario_key unique (id, user_id),
  constraint vendas_referencias_identidade_check check (
    imovel_id is null or imovel_id = imovel_id_original
  ),
  constraint vendas_referencias_instante_check check (
    capturado_em > '-infinity'::timestamptz and capturado_em < 'infinity'::timestamptz
  ),
  constraint vendas_referencias_imovel_usuario_fkey
    foreign key (imovel_id, user_id) references public.imoveis (id, user_id)
    on delete set null (imovel_id)
);

create table public.vendas_oportunidades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contato_id uuid not null,
  estado text not null,
  versao bigint not null,
  imovel_modo text,
  imovel_referencia_id uuid,
  manual_endereco text,
  manual_referencia text,
  manual_unidade text,
  manual_bloco text,
  manual_descricao_curta text,
  origem_tipo text,
  origem_descricao text,
  valor_negocio_previsto numeric,
  valor_negocio_fechado numeric,
  receita_prevista numeric,
  criado_por uuid not null,
  responsavel_usuario_id uuid not null,
  encerramento_tipo text,
  data_fato date,
  confirmacao_explicita boolean,
  registro_formalizacao text,
  motivo_perda text,
  justificativa_perda text,
  encerrado_em timestamptz(3),
  created_at timestamptz(3) not null,
  updated_at timestamptz(3) not null,
  arquivado_em timestamptz(3),
  constraint vendas_oportunidades_id_usuario_key unique (id, user_id),
  constraint vendas_oportunidades_contato_usuario_fkey
    foreign key (contato_id, user_id) references public.contatos (id, user_id)
    on delete no action,
  constraint vendas_oportunidades_referencia_usuario_fkey
    foreign key (imovel_referencia_id, user_id)
    references public.vendas_imoveis_referencias (id, user_id) on delete no action,
  constraint vendas_oportunidades_estado_check check (
    estado in ('nova', 'em_atendimento', 'em_negociacao', 'ganha', 'perdida')
  ),
  constraint vendas_oportunidades_versao_check check (versao between 1 and 9007199254740991),
  -- Regra do V1, sem antecipar organização/equipe/transferência.
  constraint vendas_oportunidades_responsabilidade_check check (
    criado_por = user_id and responsavel_usuario_id = user_id
  ),
  -- CASE impede que UNKNOWN (NULL) deixe passar uma combinação inválida.
  constraint vendas_oportunidades_imovel_check check (case
    when imovel_modo is null then
      imovel_referencia_id is null and manual_endereco is null and manual_referencia is null
      and manual_unidade is null and manual_bloco is null and manual_descricao_curta is null
    when imovel_modo = 'referencia' then
      imovel_referencia_id is not null and manual_endereco is null and manual_referencia is null
      and manual_unidade is null and manual_bloco is null and manual_descricao_curta is null
    when imovel_modo = 'manual' then
      imovel_referencia_id is null
      and  (private.vendas_texto_util(manual_endereco) or private.vendas_texto_util(manual_referencia))
    else false end
  ),
  constraint vendas_oportunidades_imovel_obrigatorio_check check (
    estado not in ('em_negociacao', 'ganha') or imovel_modo is not null
  ),
  constraint vendas_oportunidades_origem_check check (case
    when origem_tipo is null then origem_descricao is null
    else origem_tipo in ('indicacao', 'portal', 'whatsapp', 'telefone', 'formulario',
                        'atendimento_presencial', 'outro') end
  ),
  -- NaN ordena acima de Infinity no PostgreSQL; o limite estrito recusa ambos.
  -- Sem escala/teto monetário: não arredonda nem restringe números finitos do V1-A.
  constraint vendas_oportunidades_previsto_check check (
    valor_negocio_previsto is null or
    (valor_negocio_previsto >= 0 and valor_negocio_previsto < 'Infinity'::numeric)
  ),
  constraint vendas_oportunidades_fechado_check check (
    valor_negocio_fechado is null or
    (valor_negocio_fechado >= 0 and valor_negocio_fechado < 'Infinity'::numeric)
  ),
  constraint vendas_oportunidades_receita_check check (
    receita_prevista is null or (receita_prevista >= 0 and receita_prevista < 'Infinity'::numeric)
  ),
  constraint vendas_oportunidades_fechado_estado_check check (
    estado = 'ganha' or valor_negocio_fechado is null
  ),
  constraint vendas_oportunidades_motivo_check check (
    motivo_perda is null or motivo_perda in ('desistencia_interessado', 'condicoes_incompativeis',
      'imovel_indisponivel', 'compra_outro_canal', 'outro')
  ),
  constraint vendas_oportunidades_encerramento_check check ((case
    when estado = 'ganha' then
      encerramento_tipo = 'ganho' and data_fato is not null and encerrado_em is not null
      and confirmacao_explicita is true
      and private.vendas_texto_util(registro_formalizacao)
      and motivo_perda is null and justificativa_perda is null
    when estado = 'perdida' then
      encerramento_tipo = 'perda' and data_fato is not null and encerrado_em is not null
      and motivo_perda is not null and confirmacao_explicita is null and registro_formalizacao is null
      and (motivo_perda <> 'outro' or private.vendas_texto_util(justificativa_perda))
    else
      encerramento_tipo is null and data_fato is null and encerrado_em is null
      and confirmacao_explicita is null and registro_formalizacao is null
      and motivo_perda is null and justificativa_perda is null
    end) is true
  ),
  constraint vendas_oportunidades_data_fato_check check (
    data_fato is null or data_fato between date '0100-01-01' and date '9999-12-31'
  ),
  constraint vendas_oportunidades_instantes_check check (
    created_at > '-infinity'::timestamptz and updated_at < 'infinity'::timestamptz
    and updated_at >= created_at
    and (encerrado_em is null or encerrado_em between created_at and updated_at)
  ),
  constraint vendas_oportunidades_arquivamento_check check (
    arquivado_em is null or (estado in ('ganha', 'perdida') and arquivado_em between created_at and updated_at)
  )
);

create table public.vendas_oportunidades_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  oportunidade_id uuid not null,
  tipo text not null,
  ator_usuario_id uuid not null,
  registrado_em timestamptz(3) not null,
  data_fato date,
  versao bigint not null,
  payload jsonb not null,
  chave_idempotencia text not null,
  constraint vendas_eventos_oportunidade_usuario_fkey
    foreign key (oportunidade_id, user_id) references public.vendas_oportunidades (id, user_id)
    on delete no action,
  constraint vendas_eventos_oportunidade_versao_key unique (oportunidade_id, versao),
  -- Alvo composto do recibo: evento precisa pertencer à oportunidade E à conta.
  constraint vendas_eventos_identidade_key unique (id, oportunidade_id, user_id),
  constraint vendas_eventos_tipo_check check (tipo in (
    'oportunidade_criada', 'etapa_alterada', 'imovel_alterado', 'valor_alterado',
    'oportunidade_ganha', 'oportunidade_perdida', 'oportunidade_arquivada'
  )),
  constraint vendas_eventos_autoria_check check (ator_usuario_id = user_id),
  constraint vendas_eventos_versao_check check (versao between 1 and 9007199254740991),
  -- B2 construirá/validará o payload fechado por tipo; B1 não oferece construtor.
  constraint vendas_eventos_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint vendas_eventos_chave_check check (private.vendas_texto_util(chave_idempotencia)),
  constraint vendas_eventos_instante_check check (
    registrado_em > '-infinity'::timestamptz and registrado_em < 'infinity'::timestamptz
  ),
  constraint vendas_eventos_data_fato_check check (
    (case when tipo in ('oportunidade_ganha', 'oportunidade_perdida') then data_fato is not null
      else data_fato is null end)
    and (data_fato is null or data_fato between date '0100-01-01' and date '9999-12-31')
  )
);

create table private.vendas_comandos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chave_idempotencia text not null,
  operacao text not null,
  fingerprint text not null,
  oportunidade_id uuid not null,
  evento_id uuid,
  resposta jsonb not null,
  created_at timestamptz(3) not null,
  concluido_em timestamptz(3) not null,
  constraint vendas_comandos_usuario_chave_key unique (user_id, chave_idempotencia),
  constraint vendas_comandos_oportunidade_usuario_fkey
    foreign key (oportunidade_id, user_id) references public.vendas_oportunidades (id, user_id)
    on delete no action,
  constraint vendas_comandos_evento_oportunidade_usuario_fkey
    foreign key (evento_id, oportunidade_id, user_id)
    references public.vendas_oportunidades_eventos (id, oportunidade_id, user_id) on delete no action,
  constraint vendas_comandos_operacao_check check (
    operacao in ('criar', 'transicionar', 'alterar_imovel', 'alterar_valores', 'arquivar')
  ),
  constraint vendas_comandos_chave_check check (private.vendas_texto_util(chave_idempotencia)),
  constraint vendas_comandos_fingerprint_check check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint vendas_comandos_resposta_check check (jsonb_typeof(resposta) = 'object'),
  constraint vendas_comandos_instantes_check check (
    created_at > '-infinity'::timestamptz and concluido_em < 'infinity'::timestamptz
    and concluido_em >= created_at
  )
);

create index vendas_oportunidades_estado_idx on public.vendas_oportunidades (user_id, estado, created_at, id);
create index vendas_oportunidades_criacao_idx on public.vendas_oportunidades (user_id, created_at, id);
create index vendas_oportunidades_encerramento_idx on public.vendas_oportunidades (user_id, encerrado_em, id);
create index vendas_oportunidades_contato_idx on public.vendas_oportunidades (user_id, contato_id);
create index vendas_oportunidades_referencia_idx on public.vendas_oportunidades (user_id, imovel_referencia_id);
create index vendas_referencias_vivo_idx on public.vendas_imoveis_referencias (user_id, imovel_id);
create index vendas_referencias_original_idx on public.vendas_imoveis_referencias (user_id, imovel_id_original);
create index vendas_eventos_historico_idx on public.vendas_oportunidades_eventos (user_id, oportunidade_id, registrado_em, id);
-- A unicidade conta/chave cobre a leitura dos recibos; FKs também precisam de índice na filha.
create index vendas_comandos_oportunidade_idx on private.vendas_comandos (user_id, oportunidade_id);
create index vendas_comandos_evento_idx on private.vendas_comandos (evento_id, oportunidade_id, user_id);

alter table public.vendas_imoveis_referencias enable row level security;
alter table public.vendas_oportunidades enable row level security;
alter table public.vendas_oportunidades_eventos enable row level security;
alter table private.vendas_comandos enable row level security;

create policy select_own_vendas_referencias on public.vendas_imoveis_referencias
  for select to authenticated using ((select auth.uid()) = user_id);
create policy select_own_vendas_oportunidades on public.vendas_oportunidades
  for select to authenticated using ((select auth.uid()) = user_id);
create policy select_own_vendas_eventos on public.vendas_oportunidades_eventos
  for select to authenticated using ((select auth.uid()) = user_id);

-- Revoga inclusive defaults herdados; nenhuma escrita de service role é necessária no B1.
-- O owner de migração conserva seu poder administrativo. Isto não é auditoria criptográfica.
revoke all on table public.vendas_imoveis_referencias, public.vendas_oportunidades,
  public.vendas_oportunidades_eventos, private.vendas_comandos
  from public, anon, authenticated, service_role;
grant select on table public.vendas_imoveis_referencias, public.vendas_oportunidades,
  public.vendas_oportunidades_eventos to authenticated;

commit;
-- END VENDAS V1-B1
