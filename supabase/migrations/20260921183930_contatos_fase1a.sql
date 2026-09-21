-- ============================================================
-- Fase 1a-A (auditoria de modelagem): fundação relacional de CONTATOS.
--
-- O que este arquivo cria (aditivo; nada do legado é removido):
--   1. `contatos`            — a PESSOA. `contatos.id` é a identidade; nome
--                              e telefone nunca identificam ninguém.
--   2. `contatos_telefones`  — o CANAL. Uma pessoa tem 0..N números, com
--                              histórico; só o número ATIVO é único por conta.
--   3. `imoveis_contatos`    — vínculo N:N imóvel ↔ pessoa, com papel
--                              (`proprietario` | `contato`), relação livre e
--                              `principal` = "com quem falar sobre este imóvel".
--                              Vínculo nunca é apagado: é encerrado.
--   4. `contatos_revisoes`   — fila persistente dos casos que o sistema NÃO
--                              decide sozinho (mesma pessoa? outra pessoa?).
--                              "Precisa de revisão" é derivado desta fila.
--   5. Views `imoveis_contato_principal` e `imoveis_proprietario`, que
--      separam "com quem falo" de "quem é o dono".
--   6. Backfill classificado do legado `proprietario_*` (A–G), idempotente,
--      auditável em `log_eventos`, sem tocar nas colunas legadas.
--   7. Compatibilidade: `proprietario_nome`/`proprietario_telefone` continuam
--      existindo e passam a ser PROJEÇÃO do contato principal (trigger, só
--      quando o valor muda; sem candidato inequívoco projeta NULL); INSERT
--      legado cria/resolve a pessoa; UPDATE legado de nome/telefone é
--      ACEITO e vira revisão humana — o modelo novo não é alterado por ele
--      e o legado NUNCA preenche/renomeia `contatos.nome` (decisões de
--      21/09/2026: o modal atual continua funcionando até o bloco Contatos
--      da 1b; telefone não autoriza nome).
--
-- O que NÃO entra aqui: RPCs de gestão de contatos, fusão, tela de revisão,
-- atribuição de mensagens, webhook, Sophia, `mensagens_agendadas.contato_id`,
-- migração dos consumidores de `proprietario_*` (classes A–D do plano).
--
-- Invariantes de disparo (evitam recursão sem GUC mágico):
--   * as três funções de trigger só agem em `pg_trigger_depth() = 1`, isto é,
--     quando disparadas por uma escrita direta (app, RPC, SQL) e não por
--     outra trigger; a projeção escreve em `imoveis` e por isso NÃO reacende
--     a trigger de UPDATE legado, e o INSERT legado NÃO reacende a projeção;
--   * o backfill desliga a projeção pela variável de transação
--     `angario.contatos_backfill`, porque ele DERIVA do legado e jamais
--     poderia escrever de volta nele.
-- ============================================================

create schema if not exists private;

-- ------------------------------------------------------------
-- 0. Normalização de nome só para COMPARAR (acento, caixa, espaços).
--    Nunca é gravada; nunca agrupa pessoas sozinha.
-- ------------------------------------------------------------
create or replace function private.normalizar_nome(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    lower(
      translate(
        regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      )
    ),
    ''
  );
$$;
revoke all on function private.normalizar_nome(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 1. contatos — a pessoa
-- ------------------------------------------------------------
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text
    constraint contatos_nome_check check (
      nome is null or char_length(trim(nome)) between 1 and 200
    ),
  observacoes text
    constraint contatos_observacoes_check check (
      observacoes is null or char_length(observacoes) <= 2000
    ),
  origem text not null
    constraint contatos_origem_check check (
      origem in (
        'cadastro', 'pre-cadastro', 'importacao', 'garimpo', 'indicado',
        'backfill-telefone', 'backfill-imovel'
      )
    ),
  -- Nomes alternativos do backfill, telefone implausível preservado,
  -- sinal de recadastro… nunca decisão.
  metadados jsonb not null default '{}'::jsonb
    constraint contatos_metadados_check check (jsonb_typeof(metadados) = 'object'),
  -- Lápide após fusão humana (padrão do Garimpo): aponta o sobrevivente.
  fundido_em_contato_id uuid,
  arquivado_em timestamptz,
  anonimizado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contatos_id_user_id_key unique (id, user_id),
  constraint contatos_fusao_nao_reflexiva_check check (
    fundido_em_contato_id is null or fundido_em_contato_id <> id
  ),
  constraint contatos_lapide_check check (
    fundido_em_contato_id is null or arquivado_em is not null
  )
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'contatos_fundido_em_usuario_fkey'
       and conrelid = 'public.contatos'::regclass
  ) then
    alter table public.contatos
      add constraint contatos_fundido_em_usuario_fkey
      foreign key (fundido_em_contato_id, user_id)
      references public.contatos (id, user_id)
      on delete set null (fundido_em_contato_id);
  end if;
end $$;

create index if not exists contatos_user_id_idx on public.contatos (user_id);
create index if not exists contatos_user_nome_idx
  on public.contatos (user_id, nome)
  where arquivado_em is null;

drop trigger if exists trg_contatos_updated_at on public.contatos;
create trigger trg_contatos_updated_at
  before update on public.contatos
  for each row execute function public.set_updated_at();

alter table public.contatos enable row level security;
drop policy if exists "select_own_contatos" on public.contatos;
create policy "select_own_contatos" on public.contatos
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 2. contatos_telefones — o canal (nunca a identidade)
-- ------------------------------------------------------------
create table if not exists public.contatos_telefones (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Como foi digitado; a forma canônica é derivada pela MESMA função que
  -- `imoveis.proprietario_telefone_canonico` usa. Não existe segunda regra.
  telefone text not null
    constraint contatos_telefones_telefone_check check (
      char_length(trim(telefone)) between 1 and 40
    ),
  telefone_canonico text
    generated always as (public.telefone_canonico(telefone)) stored,
  principal boolean not null default true,
  -- null = ativo. Desativar preserva o histórico (notas `wa:` antigas,
  -- âncora JID/LID) e libera o número para outra pessoa.
  desativado_em timestamptz,
  motivo text
    constraint contatos_telefones_motivo_check check (
      motivo is null or motivo in (
        'cadastro', 'corrigido', 'indicado-por-terceiro', 'numero-errado',
        'backfill', 'desativado-manual'
      )
    ),
  created_at timestamptz not null default now(),
  -- Número que não canoniza não serve para nada (regra da importação).
  constraint contatos_telefones_canonico_check check (
    public.telefone_canonico(telefone) is not null
  ),
  constraint contatos_telefones_contato_usuario_fkey
    foreign key (contato_id, user_id)
    references public.contatos (id, user_id)
    on delete cascade
);

-- Decisão 1: um canal ATIVO resolve para no máximo uma pessoa por conta.
create unique index if not exists contatos_telefones_ativo_unico_idx
  on public.contatos_telefones (user_id, telefone_canonico)
  where desativado_em is null;
-- ≤ 1 número principal ativo por pessoa.
create unique index if not exists contatos_telefones_principal_unico_idx
  on public.contatos_telefones (contato_id)
  where principal and desativado_em is null;
-- Histórico: "este número já foi de quem?"
create index if not exists contatos_telefones_historico_idx
  on public.contatos_telefones (user_id, telefone_canonico);
create index if not exists contatos_telefones_contato_idx
  on public.contatos_telefones (contato_id);

alter table public.contatos_telefones enable row level security;
drop policy if exists "select_own_contatos_telefones" on public.contatos_telefones;
create policy "select_own_contatos_telefones" on public.contatos_telefones
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 3. imoveis_contatos — vínculo N:N (nunca `imoveis.contato_id`)
-- ------------------------------------------------------------
create table if not exists public.imoveis_contatos (
  id uuid primary key default gen_random_uuid(),
  imovel_id uuid not null,
  contato_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Enum mínimo. Coproprietário = segundo vínculo `proprietario`.
  papel text not null
    constraint imoveis_contatos_papel_check check (papel in ('proprietario', 'contato')),
  -- Rótulo livre: "filha", "esposo", "administradora"… sem catálogo.
  relacao text
    constraint imoveis_contatos_relacao_check check (
      relacao is null or char_length(trim(relacao)) between 1 and 60
    ),
  -- "Com quem falar sobre ESTE imóvel". Não exige telefone (Decisão 2) e
  -- não significa proprietário (Decisão 3).
  principal boolean not null default false,
  origem text not null
    constraint imoveis_contatos_origem_check check (
      origem in ('cadastro', 'backfill', 'indicado', 'importacao')
    ),
  vinculado_em timestamptz not null default now(),
  -- null = vigente. Nunca delete: encerra com motivo.
  encerrado_em timestamptz,
  encerramento_motivo text
    constraint imoveis_contatos_encerramento_motivo_check check (
      encerramento_motivo is null or char_length(trim(encerramento_motivo)) between 1 and 200
    ),
  constraint imoveis_contatos_encerramento_check check (
    (encerrado_em is null) = (encerramento_motivo is null)
  ),
  -- FKs compostas por tenant: a Fase 0 criou `imoveis_id_user_id_key` para isto.
  constraint imoveis_contatos_imovel_usuario_fkey
    foreign key (imovel_id, user_id)
    references public.imoveis (id, user_id)
    on delete cascade,
  constraint imoveis_contatos_contato_usuario_fkey
    foreign key (contato_id, user_id)
    references public.contatos (id, user_id)
    on delete cascade
);

create unique index if not exists imoveis_contatos_vigente_unico_idx
  on public.imoveis_contatos (imovel_id, contato_id)
  where encerrado_em is null;
create unique index if not exists imoveis_contatos_principal_unico_idx
  on public.imoveis_contatos (imovel_id)
  where principal and encerrado_em is null;
create index if not exists imoveis_contatos_contato_vigente_idx
  on public.imoveis_contatos (contato_id)
  where encerrado_em is null;
create index if not exists imoveis_contatos_user_id_idx
  on public.imoveis_contatos (user_id);

alter table public.imoveis_contatos enable row level security;
drop policy if exists "select_own_imoveis_contatos" on public.imoveis_contatos;
create policy "select_own_imoveis_contatos" on public.imoveis_contatos
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 4. contatos_revisoes — fila do que só um humano decide
--
-- Escopo é explícito pelo TIPO, nunca inferido de um NULL:
--   escopo de IMÓVEL (sempre com `imovel_id`; morre com o imóvel):
--     nome-divergente-importacao, telefone-alterado-legado, nome-alterado-legado
--   escopo de PESSOA (podem nascer sem `imovel_id`):
--     nome-divergente-backfill (grupo do backfill; dimensão nome),
--     fusao (as duas dimensões), telefone-conflito (dimensão telefone)
--   Os dois últimos são vocabulário reservado para a 1b; nenhum caminho
--   desta migration os cria.
-- ------------------------------------------------------------
create table if not exists public.contatos_revisoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null
    constraint contatos_revisoes_tipo_check check (
      tipo in (
        'nome-divergente-backfill', 'nome-divergente-importacao',
        'telefone-alterado-legado', 'nome-alterado-legado',
        'telefone-conflito', 'fusao'
      )
    ),
  -- O contato vinculado provisoriamente (o que está em dúvida).
  contato_id uuid not null,
  -- No conflito/fusão: a outra pessoa (tipos de par).
  contato_relacionado_id uuid,
  -- O imóvel que originou o caso; obrigatório nos tipos de escopo de imóvel.
  imovel_id uuid,
  -- Só fatos observados: nomes, telefones, ids de origem. Sem IA.
  evidencia jsonb not null default '{}'::jsonb
    constraint contatos_revisoes_evidencia_check check (jsonb_typeof(evidencia) = 'object'),
  estado text not null default 'pendente'
    constraint contatos_revisoes_estado_check check (estado in ('pendente', 'resolvida')),
  decisao text
    constraint contatos_revisoes_decisao_check check (
      decisao is null or decisao in (
        'mesma-pessoa', 'pessoas-diferentes', 'dado-incorreto', 'fusao-confirmada'
      )
    ),
  resolvido_por uuid,
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint contatos_revisoes_resolucao_check check (
    (estado = 'pendente' and decisao is null and resolvido_em is null)
    or (estado = 'resolvida' and decisao is not null and resolvido_em is not null)
  ),
  constraint contatos_revisoes_escopo_imovel_check check (
    tipo not in ('nome-divergente-importacao', 'telefone-alterado-legado', 'nome-alterado-legado')
    or imovel_id is not null
  ),
  constraint contatos_revisoes_contato_usuario_fkey
    foreign key (contato_id, user_id)
    references public.contatos (id, user_id)
    on delete cascade,
  -- Par: se a outra pessoa some (só em limpeza administrativa; o modelo nunca
  -- apaga contato), a revisão fica como histórico com o par nulo.
  constraint contatos_revisoes_relacionado_usuario_fkey
    foreign key (contato_relacionado_id, user_id)
    references public.contatos (id, user_id)
    on delete set null (contato_relacionado_id),
  -- Uma revisão cujo contexto é o imóvel desaparece com ele: nunca pode
  -- impedir a exclusão do imóvel nem sobreviver a ela como dúvida sem objeto.
  constraint contatos_revisoes_imovel_usuario_fkey
    foreign key (imovel_id, user_id)
    references public.imoveis (id, user_id)
    on delete cascade
);

-- Uma pendência por caso, sem que um SET NULL do par transforme duas revisões
-- distintas em "iguais": os tipos de par são únicos enquanto o par existe; os
-- tipos sem par são únicos por (pessoa, imóvel-ou-grupo). Uma linha de par
-- que perdeu o par não entra em nenhum dos dois índices (fica só como histórico).
create unique index if not exists contatos_revisoes_pendente_par_idx
  on public.contatos_revisoes (
    user_id, tipo, contato_id, contato_relacionado_id,
    coalesce(imovel_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where estado = 'pendente' and contato_relacionado_id is not null;
create unique index if not exists contatos_revisoes_pendente_unica_idx
  on public.contatos_revisoes (
    user_id, tipo, contato_id,
    coalesce(imovel_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where estado = 'pendente'
    and tipo in ('nome-divergente-backfill', 'nome-divergente-importacao',
                 'telefone-alterado-legado', 'nome-alterado-legado');
create index if not exists contatos_revisoes_pendentes_idx
  on public.contatos_revisoes (user_id, created_at)
  where estado = 'pendente';
create index if not exists contatos_revisoes_imovel_idx
  on public.contatos_revisoes (imovel_id)
  where estado = 'pendente';

alter table public.contatos_revisoes enable row level security;
drop policy if exists "select_own_contatos_revisoes" on public.contatos_revisoes;
create policy "select_own_contatos_revisoes" on public.contatos_revisoes
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- ------------------------------------------------------------
-- 5. Views: "com quem falo" ≠ "quem é o dono"
-- ------------------------------------------------------------
create or replace view public.imoveis_contato_principal
with (security_invoker = true) as
select
  v.imovel_id,
  v.user_id,
  v.contato_id,
  v.id as vinculo_id,
  c.nome,
  v.papel,
  v.relacao,
  t.id as telefone_id,
  t.telefone,
  t.telefone_canonico
from public.imoveis_contatos v
join public.contatos c on c.id = v.contato_id and c.user_id = v.user_id
left join public.contatos_telefones t
  on t.contato_id = c.id and t.user_id = c.user_id
 and t.principal and t.desativado_em is null
where v.principal and v.encerrado_em is null;

create or replace view public.imoveis_proprietario
with (security_invoker = true) as
select
  v.imovel_id,
  v.user_id,
  v.contato_id,
  v.id as vinculo_id,
  c.nome,
  v.relacao,
  v.principal,
  t.id as telefone_id,
  t.telefone,
  t.telefone_canonico
from public.imoveis_contatos v
join public.contatos c on c.id = v.contato_id and c.user_id = v.user_id
left join public.contatos_telefones t
  on t.contato_id = c.id and t.user_id = c.user_id
 and t.principal and t.desativado_em is null
where v.papel = 'proprietario' and v.encerrado_em is null;

-- ------------------------------------------------------------
-- 6. Privilégios da Data API: o browser só LÊ; toda escrita é por RPC
--    (1b) ou pelas triggers (security definer) deste arquivo.
-- ------------------------------------------------------------
revoke all on table
  public.contatos, public.contatos_telefones, public.imoveis_contatos, public.contatos_revisoes
from public, anon, authenticated, service_role;
grant select on table
  public.contatos, public.contatos_telefones, public.imoveis_contatos, public.contatos_revisoes
to authenticated;
grant select, insert, update, delete on table
  public.contatos, public.contatos_telefones, public.imoveis_contatos, public.contatos_revisoes
to service_role;
revoke all on table public.imoveis_contato_principal, public.imoveis_proprietario
  from public, anon, authenticated, service_role;
grant select on table public.imoveis_contato_principal, public.imoveis_proprietario
  to authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Pendência derivada da fila: "o NOME (ou o TELEFONE) deste imóvel está
--    em dúvida?" Cada dimensão congela só a si mesma, e cada tipo tem
--    escopo explícito:
--      escopo de imóvel — congela só aquele imóvel, seja qual for a pessoa:
--        nome-alterado-legado, nome-divergente-importacao (nome),
--        telefone-alterado-legado (telefone);
--      escopo de pessoa — congela todos os imóveis da pessoa:
--        nome-divergente-backfill (nome), telefone-conflito (telefone),
--        fusao (as duas).
--    Um NULL em `imovel_id` nunca amplia o escopo de um tipo de imóvel.
-- ------------------------------------------------------------
create or replace function private.contato_em_revisao(
  p_user_id uuid, p_contato_id uuid, p_imovel_id uuid, p_dimensao text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.contatos_revisoes r
     where r.user_id = p_user_id
       and r.estado = 'pendente'
       and (
         (r.imovel_id = p_imovel_id
          and r.tipo = any (case p_dimensao
                when 'nome' then array['nome-alterado-legado', 'nome-divergente-importacao', 'fusao']
                when 'telefone' then array['telefone-alterado-legado', 'fusao']
                else array[]::text[] end))
         or
         (p_contato_id is not null
          and (r.contato_id = p_contato_id or r.contato_relacionado_id = p_contato_id)
          and r.tipo = any (case p_dimensao
                when 'nome' then array['nome-divergente-backfill', 'fusao']
                when 'telefone' then array['telefone-conflito', 'fusao']
                else array[]::text[] end))
       )
  );
$$;
revoke all on function private.contato_em_revisao(uuid, uuid, uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. Projeção legada (§R2.9 itens 1–3 do plano; decisão de 21/09/2026 para
--    os casos sem candidato)
--    1. principal vigente                → projeta o principal
--    2. sem principal + 1 proprietário   → projeta o proprietário
--    3. sem principal + 0 proprietários  → NULL
--    4. sem principal + ≥2 proprietários → NULL (nunca escolher por
--                                          updated_at, ordem, nome, id…)
--    proprietario_telefone = número ativo principal da pessoa (pode ser NULO
--    com principal definido — Decisão 2). Dimensão em revisão pendente
--    aplicável não é tocada (nem anulada). Só escreve quando muda.
-- ------------------------------------------------------------
create or replace function private.projetar_contato_legado(p_imovel_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contato_id uuid;
  v_n int;
  v_nome text;
  v_telefone text;
  v_projeta_nome boolean;
  v_projeta_telefone boolean;
begin
  if p_imovel_id is null or p_user_id is null then return; end if;

  select v.contato_id into v_contato_id
    from public.imoveis_contatos v
   where v.imovel_id = p_imovel_id and v.user_id = p_user_id
     and v.principal and v.encerrado_em is null
   limit 1;

  if v_contato_id is null then
    select count(distinct v.contato_id), min(v.contato_id::text)::uuid
      into v_n, v_contato_id
      from public.imoveis_contatos v
     where v.imovel_id = p_imovel_id and v.user_id = p_user_id
       and v.papel = 'proprietario' and v.encerrado_em is null;
    if v_n <> 1 then v_contato_id := null; end if;
  end if;

  v_projeta_nome := not private.contato_em_revisao(p_user_id, v_contato_id, p_imovel_id, 'nome');
  v_projeta_telefone := not private.contato_em_revisao(p_user_id, v_contato_id, p_imovel_id, 'telefone');
  if not v_projeta_nome and not v_projeta_telefone then return; end if;

  if v_contato_id is not null then
    select c.nome into v_nome
      from public.contatos c
     where c.id = v_contato_id and c.user_id = p_user_id;
    select t.telefone into v_telefone
      from public.contatos_telefones t
     where t.contato_id = v_contato_id and t.user_id = p_user_id
       and t.principal and t.desativado_em is null
     limit 1;
  end if;

  update public.imoveis i
     set proprietario_nome = case when v_projeta_nome then v_nome else i.proprietario_nome end,
         proprietario_telefone = case when v_projeta_telefone then v_telefone else i.proprietario_telefone end
   where i.id = p_imovel_id and i.user_id = p_user_id
     and ((v_projeta_nome and i.proprietario_nome is distinct from v_nome)
          or (v_projeta_telefone and i.proprietario_telefone is distinct from v_telefone));
end;
$$;
revoke all on function private.projetar_contato_legado(uuid, uuid) from public, anon, authenticated;

-- Dispara em vínculos (o imóvel do vínculo), telefones e nome do contato
-- (todos os imóveis com vínculo vigente da pessoa).
create or replace function private.projetar_contato_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_imovel record;
  v_contato_novo uuid;
  v_contato_antigo uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if current_setting('angario.contatos_backfill', true) = '1' then return null; end if;

  if tg_table_name = 'imoveis_contatos' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform private.projetar_contato_legado(new.imovel_id, new.user_id);
    end if;
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.imovel_id <> new.imovel_id) then
      perform private.projetar_contato_legado(old.imovel_id, old.user_id);
    end if;
    return null;
  end if;

  if tg_table_name = 'contatos' then
    v_contato_novo := new.id;
  else
    if tg_op in ('INSERT', 'UPDATE') then v_contato_novo := new.contato_id; end if;
    if tg_op in ('UPDATE', 'DELETE') then v_contato_antigo := old.contato_id; end if;
  end if;

  for v_imovel in
    select distinct v.imovel_id, v.user_id
      from public.imoveis_contatos v
     where v.encerrado_em is null
       and v.contato_id in (v_contato_novo, v_contato_antigo)
  loop
    perform private.projetar_contato_legado(v_imovel.imovel_id, v_imovel.user_id);
  end loop;
  return null;
end;
$$;
revoke all on function private.projetar_contato_principal() from public, anon, authenticated;

drop trigger if exists trg_imoveis_contatos_projecao on public.imoveis_contatos;
create trigger trg_imoveis_contatos_projecao
  after insert or update or delete on public.imoveis_contatos
  for each row execute function private.projetar_contato_principal();

drop trigger if exists trg_contatos_telefones_projecao on public.contatos_telefones;
create trigger trg_contatos_telefones_projecao
  after insert or update or delete on public.contatos_telefones
  for each row execute function private.projetar_contato_principal();

drop trigger if exists trg_contatos_projecao on public.contatos;
create trigger trg_contatos_projecao
  after update of nome on public.contatos
  for each row execute function private.projetar_contato_principal();

-- ------------------------------------------------------------
-- 9. Resolução por canal: número ATIVO → pessoa. Lápide de fusão é seguida
--    até o sobrevivente (a RPC de fusão da 1b deve reparentear/desativar os
--    números do absorvido; isto é só a rede de segurança). Contato arquivado
--    continua resolvendo: arquivar é esconder da lista, não negar a pessoa —
--    a 1b decide o que fazer ao vinculá-lo de novo.
-- ------------------------------------------------------------
create or replace function private.resolver_contato_por_canal(p_user_id uuid, p_canonico text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_contato_id uuid;
  v_sobrevivente uuid;
  v_saltos int := 0;
begin
  if p_canonico is null then return null; end if;
  select t.contato_id into v_contato_id
    from public.contatos_telefones t
   where t.user_id = p_user_id and t.telefone_canonico = p_canonico
     and t.desativado_em is null
   limit 1;
  loop
    exit when v_contato_id is null or v_saltos >= 8;
    select c.fundido_em_contato_id into v_sobrevivente
      from public.contatos c where c.id = v_contato_id and c.user_id = p_user_id;
    exit when v_sobrevivente is null;
    v_contato_id := v_sobrevivente;
    v_saltos := v_saltos + 1;
  end loop;
  return v_contato_id;
end;
$$;
revoke all on function private.resolver_contato_por_canal(uuid, text) from public, anon, authenticated;

-- Abre (ou acumula) uma revisão pendente. Nos tipos de escopo de imóvel a
-- unicidade é por (pessoa, imóvel); a reincidência guarda o histórico.
create or replace function private.abrir_revisao_contato(
  p_user_id uuid, p_tipo text, p_contato_id uuid, p_imovel_id uuid, p_evidencia jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select r.id into v_id
    from public.contatos_revisoes r
   where r.user_id = p_user_id and r.tipo = p_tipo and r.contato_id = p_contato_id
     and r.contato_relacionado_id is null and r.estado = 'pendente'
     and r.imovel_id is not distinct from p_imovel_id;
  if v_id is null then
    insert into public.contatos_revisoes (user_id, tipo, contato_id, imovel_id, evidencia)
    values (p_user_id, p_tipo, p_contato_id, p_imovel_id, p_evidencia)
    returning id into v_id;
  else
    update public.contatos_revisoes
       set evidencia = p_evidencia || jsonb_build_object(
             'historico', coalesce(evidencia->'historico', '[]'::jsonb)
                          || jsonb_build_array(evidencia - 'historico'))
     where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function private.abrir_revisao_contato(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 10. Legado → modelo novo: o "primeiro contato" de um imóvel
--     (INSERT pelo modal/pré-cadastro/importação/promoção do Garimpo, e
--     UPDATE legado num imóvel que ainda não tinha nenhum vínculo).
--     Decisões 7 e 8: número ativo já conhecido → vincula à pessoa (resolução
--     de canal, não prova de identidade) e, se o nome informado não é
--     exatamente o nome confirmado da pessoa — inclusive quando ela ainda não
--     tem nome — abre revisão; NUNCA renomeia nem preenche `contatos.nome`
--     a partir do legado. Sem telefone confiável → pessoa própria; nunca
--     agrupa por nome.
-- ------------------------------------------------------------
create or replace function private.sincronizar_contato_legado(
  p_imovel_id uuid,
  p_user_id uuid,
  p_nome text,
  p_telefone text,
  p_origem_contato text,
  p_origem_vinculo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_telefone text := nullif(trim(coalesce(p_telefone, '')), '');
  v_canonico text := public.telefone_canonico(p_telefone);
  v_contato_id uuid;
  v_nome_existente text;
  v_reutilizado boolean := false;
begin
  -- Já tem vínculo (vigente ou histórico)? Então o modelo já conhece o imóvel.
  if exists (
    select 1 from public.imoveis_contatos v
     where v.imovel_id = p_imovel_id and v.user_id = p_user_id
  ) then
    return null;
  end if;

  -- Classe E: sem nome e sem telefone — nenhuma pessoa a representar.
  if v_nome is null and v_telefone is null then return null; end if;

  if v_canonico is not null then
    v_contato_id := private.resolver_contato_por_canal(p_user_id, v_canonico);
    if v_contato_id is not null then
      v_reutilizado := true;
      select c.nome into v_nome_existente
        from public.contatos c where c.id = v_contato_id and c.user_id = p_user_id;
    else
      insert into public.contatos (user_id, nome, origem)
      values (p_user_id, v_nome, p_origem_contato)
      returning id into v_contato_id;
      insert into public.contatos_telefones (contato_id, user_id, telefone, principal, motivo)
      values (v_contato_id, p_user_id, v_telefone, true, 'cadastro');
    end if;
  else
    -- Sem telefone confiável: identidade própria (Decisão 8). Número
    -- implausível fica preservado como fato, não como canal.
    insert into public.contatos (user_id, nome, origem, metadados)
    values (
      p_user_id, v_nome, p_origem_contato,
      case when v_telefone is null then '{}'::jsonb
           else jsonb_build_object('telefone_implausivel', v_telefone) end
    )
    returning id into v_contato_id;
  end if;

  insert into public.imoveis_contatos (imovel_id, contato_id, user_id, papel, principal, origem)
  values (p_imovel_id, v_contato_id, p_user_id, 'proprietario', true, p_origem_vinculo);

  -- Decisão 7: mesmo número, nome informado ≠ nome confirmado (ou pessoa
  -- ainda sem nome) → vincula E pergunta ao humano. Nada é preenchido.
  if v_reutilizado and v_nome is not null
     and private.normalizar_nome(v_nome) is distinct from private.normalizar_nome(v_nome_existente) then
    perform private.abrir_revisao_contato(
      p_user_id, 'nome-divergente-importacao', v_contato_id, p_imovel_id,
      jsonb_build_object(
        'nome_informado', v_nome,
        'nome_contato', v_nome_existente,
        'telefone_canonico', v_canonico,
        'origem', 'primeiro-contato',
        'em', now()
      )
    );
  end if;

  return v_contato_id;
end;
$$;
revoke all on function private.sincronizar_contato_legado(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function private.sincronizar_contato_no_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform private.sincronizar_contato_legado(
    new.id, new.user_id, new.proprietario_nome, new.proprietario_telefone,
    case when new.pre_cadastro then 'pre-cadastro' else 'cadastro' end,
    'cadastro'
  );
  return null;
end;
$$;
revoke all on function private.sincronizar_contato_no_insert() from public, anon, authenticated;

drop trigger if exists trg_imoveis_sincronizar_contato on public.imoveis;
create trigger trg_imoveis_sincronizar_contato
  after insert on public.imoveis
  for each row execute function private.sincronizar_contato_no_insert();

-- ------------------------------------------------------------
-- 11. UPDATE legado de nome/telefone: aceito, registrado, nunca decidido.
--     Uma troca de telefone pode ser "corrigi o número da mesma pessoa" ou
--     "agora falo com outra pessoa"; uma troca (ou introdução) de nome pode
--     ser correção ou outra pessoa. O sistema não sabe e não adivinha: a
--     coluna legada muda como sempre mudou (o modal atual continua
--     funcionando), `contatos`/`contatos_telefones` ficam como estão, e a
--     dúvida vai para a fila — enquanto pendente, a projeção não toca aquela
--     dimensão daquele imóvel. Imóvel sem nenhum vínculo recebe o "primeiro
--     contato" pela mesma regra do INSERT (não há pessoa anterior para
--     confundir e nada de nome é inferido).
-- ------------------------------------------------------------
create or replace function private.registrar_alteracao_legada_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome_mudou boolean := new.proprietario_nome is distinct from old.proprietario_nome;
  v_tel_mudou boolean := new.proprietario_telefone is distinct from old.proprietario_telefone;
  v_contato_id uuid;
  v_nome_contato text;
  v_outro_contato uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if not v_nome_mudou and not v_tel_mudou then return null; end if;

  -- Contato de referência: o principal vigente; sem principal, o vínculo
  -- vigente mais antigo (proprietário antes de contato); sem vínculo vigente
  -- nem histórico, é o primeiro contato do imóvel.
  select v.contato_id into v_contato_id
    from public.imoveis_contatos v
   where v.imovel_id = new.id and v.user_id = new.user_id and v.encerrado_em is null
   order by v.principal desc, (v.papel = 'proprietario') desc, v.vinculado_em asc, v.id
   limit 1;

  if v_contato_id is null then
    if not exists (
      select 1 from public.imoveis_contatos v
       where v.imovel_id = new.id and v.user_id = new.user_id
    ) then
      perform private.sincronizar_contato_legado(
        new.id, new.user_id, new.proprietario_nome, new.proprietario_telefone,
        case when new.pre_cadastro then 'pre-cadastro' else 'cadastro' end,
        'cadastro'
      );
    end if;
    -- Só vínculos encerrados: o modelo conhece o imóvel e um humano o
    -- desvinculou; o legado guarda o que foi digitado, sem pessoa a revisar.
    return null;
  end if;

  select c.nome into v_nome_contato
    from public.contatos c where c.id = v_contato_id and c.user_id = new.user_id;

  if v_tel_mudou then
    v_outro_contato := private.resolver_contato_por_canal(new.user_id, new.proprietario_telefone_canonico);
    if v_outro_contato = v_contato_id then v_outro_contato := null; end if;
    perform private.abrir_revisao_contato(
      new.user_id, 'telefone-alterado-legado', v_contato_id, new.id,
      jsonb_build_object(
        'telefone_anterior', old.proprietario_telefone,
        'telefone_novo', new.proprietario_telefone,
        'canonico_anterior', old.proprietario_telefone_canonico,
        'canonico_novo', new.proprietario_telefone_canonico,
        'contato_com_numero_novo', v_outro_contato,
        'origem', 'update-legado',
        'em', now()
      )
    );
  end if;

  if v_nome_mudou then
    perform private.abrir_revisao_contato(
      new.user_id, 'nome-alterado-legado', v_contato_id, new.id,
      jsonb_build_object(
        'nome_anterior', old.proprietario_nome,
        'nome_novo', new.proprietario_nome,
        'nome_contato', v_nome_contato,
        'origem', 'update-legado',
        'em', now()
      )
    );
  end if;

  return null;
end;
$$;
revoke all on function private.registrar_alteracao_legada_contato() from public, anon, authenticated;

drop trigger if exists trg_imoveis_alteracao_legada_contato on public.imoveis;
create trigger trg_imoveis_alteracao_legada_contato
  after update of proprietario_nome, proprietario_telefone on public.imoveis
  for each row execute function private.registrar_alteracao_legada_contato();

-- ------------------------------------------------------------
-- 12. Backfill classificado (§R.11 / §R2.8 do plano), por conta.
--     Idempotente e nunca desfaz decisão humana: imóvel com QUALQUER vínculo
--     (vigente ou encerrado) é pulado — o modelo já conhece o imóvel. Número
--     já ativo em `contatos_telefones` reaproveita a pessoa só como canal:
--     se o nome legado não é o nome confirmado dela, abre revisão por imóvel
--     e nada é sobrescrito. Nunca lê nome para agrupar; nunca escreve em
--     `proprietario_*` (projeção desligada).
--
--     Grupo = (user_id, proprietario_telefone_canonico) entre os imóveis
--     ainda sem vínculo:
--       A  1 imóvel com telefone            → pessoa + número + vínculo
--       B  N imóveis, um só nome            → 1 pessoa, N vínculos
--       C  N imóveis, nomes divergentes     → 1 pessoa (nome mais recente),
--                                             N vínculos, 1 revisão de pessoa
--       G  grupo com 2 linhas no mesmo endereço → como A/B/C + sinal
--       D  nome sem telefone plausível      → 1 pessoa SEM telefone por imóvel
--       F  telefone implausível (canônico nulo) → como D, número em metadados
--       E  sem nome e sem telefone          → nada
-- ------------------------------------------------------------
create or replace function private.backfill_contatos(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
  r record;
  v_contato_id uuid;
  v_nomes text[];
  v_nomes_norm text[];
  v_nome_recente text;
  v_telefone_recente text;
  v_ids uuid[];
  v_recadastro boolean;
  v_metadados jsonb;
  v_ja_existia boolean;
  v_nome_existente text;
  n_a int := 0; n_b int := 0; n_c int := 0; n_d int := 0; n_e int := 0; n_f int := 0; n_g int := 0;
  n_contatos int := 0; n_telefones int := 0; n_vinculos int := 0; n_revisoes int := 0; n_pulados int := 0;
begin
  perform set_config('angario.contatos_backfill', '1', true);

  select count(*) into n_pulados
    from public.imoveis i
   where i.user_id = p_user_id
     and exists (select 1 from public.imoveis_contatos v
                  where v.imovel_id = i.id and v.user_id = i.user_id);

  -- Grupos com telefone plausível (A, B, C, G).
  for g in
    select i.proprietario_telefone_canonico as canonico,
           count(*) as n,
           array_agg(i.id order by i.updated_at desc, i.id) as ids,
           array_agg(nullif(trim(coalesce(i.proprietario_nome, '')), '') order by i.updated_at desc, i.id) as nomes,
           array_agg(i.proprietario_telefone order by i.updated_at desc, i.id) as telefones,
           count(distinct lower(trim(coalesce(i.endereco, '')))) < count(*) as endereco_repetido
      from public.imoveis i
     where i.user_id = p_user_id
       and i.proprietario_telefone_canonico is not null
       and not exists (select 1 from public.imoveis_contatos v
                        where v.imovel_id = i.id and v.user_id = i.user_id)
     group by i.proprietario_telefone_canonico
  loop
    v_ids := g.ids;
    v_telefone_recente := g.telefones[1];
    select array_agg(distinct x) into v_nomes from unnest(g.nomes) x where x is not null;
    select array_agg(distinct private.normalizar_nome(x)) into v_nomes_norm from unnest(g.nomes) x where x is not null;
    v_nome_recente := (select x from unnest(g.nomes) x where x is not null limit 1);
    v_recadastro := g.endereco_repetido;

    v_contato_id := private.resolver_contato_por_canal(p_user_id, g.canonico);
    v_ja_existia := v_contato_id is not null;

    v_metadados := '{}'::jsonb;
    if v_recadastro then
      v_metadados := v_metadados || jsonb_build_object('possivel_recadastro', true);
      n_g := n_g + 1;
    end if;
    if coalesce(array_length(v_nomes_norm, 1), 0) > 1 then
      v_metadados := v_metadados || jsonb_build_object('nomes_alternativos', to_jsonb(v_nomes));
    end if;

    if not v_ja_existia then
      insert into public.contatos (user_id, nome, origem, metadados)
      values (p_user_id, v_nome_recente, 'backfill-telefone', v_metadados)
      returning id into v_contato_id;
      n_contatos := n_contatos + 1;
      insert into public.contatos_telefones (contato_id, user_id, telefone, principal, motivo)
      values (v_contato_id, p_user_id, v_telefone_recente, true, 'backfill');
      n_telefones := n_telefones + 1;
    else
      select c.nome into v_nome_existente
        from public.contatos c where c.id = v_contato_id and c.user_id = p_user_id;
    end if;

    for r in select unnest(v_ids) as id loop
      insert into public.imoveis_contatos (imovel_id, contato_id, user_id, papel, principal, origem)
      values (r.id, v_contato_id, p_user_id, 'proprietario', true, 'backfill');
      n_vinculos := n_vinculos + 1;
    end loop;

    if v_ja_existia then
      -- Pessoa reaproveitada só como canal: cada imóvel cujo nome legado não
      -- é o nome confirmado dela vira revisão daquele imóvel (Decisão 7).
      for r in
        select i.id, nullif(trim(coalesce(i.proprietario_nome, '')), '') as nome
          from public.imoveis i where i.id = any (v_ids)
      loop
        if r.nome is not null
           and private.normalizar_nome(r.nome) is distinct from private.normalizar_nome(v_nome_existente) then
          perform private.abrir_revisao_contato(
            p_user_id, 'nome-divergente-importacao', v_contato_id, r.id,
            jsonb_build_object(
              'nome_informado', r.nome,
              'nome_contato', v_nome_existente,
              'telefone_canonico', g.canonico,
              'origem', 'backfill-reexecucao',
              'em', now()
            )
          );
          n_revisoes := n_revisoes + 1;
        end if;
      end loop;
    end if;

    if g.n = 1 then
      n_a := n_a + 1;
    elsif coalesce(array_length(v_nomes_norm, 1), 0) <= 1 then
      n_b := n_b + 1;
    else
      n_c := n_c + 1;
      if not v_ja_existia then
        insert into public.contatos_revisoes (user_id, tipo, contato_id, evidencia)
        values (
          p_user_id, 'nome-divergente-backfill', v_contato_id,
          jsonb_build_object(
            'nomes', to_jsonb(v_nomes),
            'telefone_canonico', g.canonico,
            'imoveis', to_jsonb(v_ids)
          )
        )
        on conflict do nothing;
        n_revisoes := n_revisoes + 1;
      end if;
    end if;
  end loop;

  -- Sem telefone plausível: uma pessoa por imóvel (D, F) ou nada (E).
  for r in
    select i.id, i.proprietario_nome, i.proprietario_telefone
      from public.imoveis i
     where i.user_id = p_user_id
       and i.proprietario_telefone_canonico is null
       and not exists (select 1 from public.imoveis_contatos v
                        where v.imovel_id = i.id and v.user_id = i.user_id)
  loop
    if nullif(trim(coalesce(r.proprietario_nome, '')), '') is null
       and nullif(trim(coalesce(r.proprietario_telefone, '')), '') is null then
      n_e := n_e + 1;
      continue;
    end if;
    if nullif(trim(coalesce(r.proprietario_telefone, '')), '') is not null then
      n_f := n_f + 1;
      v_metadados := jsonb_build_object('telefone_implausivel', trim(r.proprietario_telefone));
    else
      n_d := n_d + 1;
      v_metadados := '{}'::jsonb;
    end if;
    insert into public.contatos (user_id, nome, origem, metadados)
    values (p_user_id, nullif(trim(coalesce(r.proprietario_nome, '')), ''), 'backfill-imovel', v_metadados)
    returning id into v_contato_id;
    n_contatos := n_contatos + 1;
    insert into public.imoveis_contatos (imovel_id, contato_id, user_id, papel, principal, origem)
    values (r.id, v_contato_id, p_user_id, 'proprietario', true, 'backfill');
    n_vinculos := n_vinculos + 1;
  end loop;

  perform set_config('angario.contatos_backfill', '', true);

  return jsonb_build_object(
    'user_id', p_user_id,
    'classes', jsonb_build_object('a', n_a, 'b', n_b, 'c', n_c, 'd', n_d, 'e', n_e, 'f', n_f, 'g', n_g),
    'contatos_criados', n_contatos,
    'telefones_criados', n_telefones,
    'vinculos_criados', n_vinculos,
    'revisoes_criadas', n_revisoes,
    'imoveis_ja_vinculados', n_pulados
  );
end;
$$;
revoke all on function private.backfill_contatos(uuid) from public, anon, authenticated;

-- Executa uma vez por conta com imóveis e deixa o relatório em `log_eventos`
-- (categoria `admin`, evento `contatos-backfill`). Reexecutar é seguro: só
-- os imóveis ainda sem vínculo entram.
do $$
declare
  u record;
  relatorio jsonb;
begin
  for u in select distinct i.user_id from public.imoveis i loop
    relatorio := private.backfill_contatos(u.user_id);
    if (relatorio->>'contatos_criados')::int > 0 or (relatorio->>'vinculos_criados')::int > 0 then
      insert into public.log_eventos (user_id, categoria, nivel, evento, detalhe)
      values (u.user_id, 'admin', 'info', 'contatos-backfill', relatorio::text);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
