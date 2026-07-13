-- ============================================================
-- SCHEMA: Painel de Angariações — Supabase
-- ============================================================
-- Como usar:
-- 1. Crie um projeto gratuito em https://supabase.com
-- 2. No painel do projeto, vá em "SQL Editor"
-- 3. Cole todo este arquivo e clique em "Run"
-- 4. Pronto — as tabelas, segurança e políticas de acesso
--    já ficam configuradas automaticamente.
--
-- Segurança: Row Level Security (RLS) garante que cada usuário
-- só enxerga e só consegue alterar as próprias linhas. Isso é
-- obrigatório aqui, já que o app expõe a "anon key" publicamente
-- no código — sem RLS, qualquer pessoa poderia ler os dados de
-- todo mundo. Com RLS ativado, o banco recusa qualquer leitura
-- ou escrita que não seja do dono da linha (auth.uid()).
--
-- Este script pode ser rodado quantas vezes precisar sem erro
-- (é "idempotente"): tabelas só são criadas se não existirem, e
-- políticas são removidas e recriadas a cada execução.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- IMÓVEIS
-- ------------------------------------------------------------
create table if not exists imoveis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  codigo text,
  referencia_crm text,
  cep text,
  endereco text not null,
  bairro text,
  cidade text,
  tipo text,
  quartos int,
  banheiros int,
  vagas int,
  valor_aluguel numeric default 0,
  valor_condominio numeric default 0,
  proprietario_nome text,
  proprietario_telefone text,
  forma_abordagem text,
  origem_imovel text,
  imobiliaria_concorrente text,
  latitude double precision,
  longitude double precision,
  data_angariacao date,
  responsavel text,
  status text not null default 'Novo contato',
  observacoes text,
  status_history jsonb not null default '[]'::jsonb,
  notas jsonb not null default '[]'::jsonb,
  pausado_ate date,
  motivo_perda text,
  motivo_perda_outro text,
  comissao_recebida boolean default false,
  comissao_recebida_valor numeric,
  comissao_recebida_data date,
  pre_cadastro boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Cobre quem já tinha a tabela "imoveis" criada antes dessa coluna existir
-- (referência gerada pelo CRM da imobiliária). "add column if not exists" é
-- seguro de rodar várias vezes.
alter table imoveis add column if not exists referencia_crm text;

-- Histórico de interações (notas) com o proprietário — mesmo padrão do
-- status_history: jsonb na própria linha, herdando as políticas de RLS.
alter table imoveis add column if not exists notas jsonb not null default '[]'::jsonb;

-- Pré-cadastro pendente de confirmação (disparo rápido de WhatsApp): o imóvel
-- nasce marcado e é "confirmado" quando editado/salvo pelo modal completo.
alter table imoveis add column if not exists pre_cadastro boolean not null default false;

alter table imoveis enable row level security;

drop policy if exists "select_own_imoveis" on imoveis;
create policy "select_own_imoveis" on imoveis
  for select using (auth.uid() = user_id);
drop policy if exists "insert_own_imoveis" on imoveis;
create policy "insert_own_imoveis" on imoveis
  for insert with check (auth.uid() = user_id);
drop policy if exists "update_own_imoveis" on imoveis;
create policy "update_own_imoveis" on imoveis
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete_own_imoveis" on imoveis;
create policy "delete_own_imoveis" on imoveis
  for delete using (auth.uid() = user_id);

create index if not exists imoveis_user_id_idx on imoveis(user_id);

-- ------------------------------------------------------------
-- METAS (uma linha por usuário + mês)
-- ------------------------------------------------------------
create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  angariacoes int default 0,
  locados int default 0,
  comissao numeric default 0,
  faturamento numeric default 0,
  unique (user_id, month_key)
);

-- Meta de faturamento estimado em contratos (soma dos aluguéis dos imóveis
-- locados no mês) — cobre quem já tinha a tabela criada antes da coluna.
alter table metas add column if not exists faturamento numeric default 0;

alter table metas enable row level security;

drop policy if exists "select_own_metas" on metas;
create policy "select_own_metas" on metas
  for select using (auth.uid() = user_id);
drop policy if exists "insert_own_metas" on metas;
create policy "insert_own_metas" on metas
  for insert with check (auth.uid() = user_id);
drop policy if exists "update_own_metas" on metas;
create policy "update_own_metas" on metas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete_own_metas" on metas;
create policy "delete_own_metas" on metas
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- AGENDA
-- ------------------------------------------------------------
create table if not exists agenda (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null,
  date date not null,
  hora text,
  imovel_id uuid references imoveis(id) on delete set null,
  notes text,
  done boolean default false,
  is_verificacao_disponibilidade boolean not null default false,
  created_at timestamptz default now()
);

-- Cobre o caso de quem já tinha a tabela "agenda" criada antes dessas
-- colunas existirem — "add column if not exists" não falha se já rodou.
alter table agenda add column if not exists is_verificacao_disponibilidade boolean not null default false;
-- Hora "HH:MM" (24h) do compromisso; nula = "dia inteiro" (compat. retroativa).
alter table agenda add column if not exists hora text;

alter table agenda enable row level security;

drop policy if exists "select_own_agenda" on agenda;
create policy "select_own_agenda" on agenda
  for select using (auth.uid() = user_id);
drop policy if exists "insert_own_agenda" on agenda;
create policy "insert_own_agenda" on agenda
  for insert with check (auth.uid() = user_id);
drop policy if exists "update_own_agenda" on agenda;
create policy "update_own_agenda" on agenda
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete_own_agenda" on agenda;
create policy "delete_own_agenda" on agenda
  for delete using (auth.uid() = user_id);

create index if not exists agenda_user_id_idx on agenda(user_id);

-- ------------------------------------------------------------
-- CONFIGURAÇÕES (uma linha por usuário)
-- ------------------------------------------------------------
create table if not exists user_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  comissao_percent numeric default 100,
  agenda_tipos jsonb not null default '[]'::jsonb,
  whatsapp_modelos jsonb not null default '[]'::jsonb
);

-- Tipos de compromisso personalizados do usuário (além dos fixos do app).
alter table user_config add column if not exists agenda_tipos jsonb not null default '[]'::jsonb;

-- Modelos de mensagem de WhatsApp criados pelo usuário (ex.: "Falar mais tarde").
alter table user_config add column if not exists whatsapp_modelos jsonb not null default '[]'::jsonb;

alter table user_config enable row level security;

drop policy if exists "select_own_config" on user_config;
create policy "select_own_config" on user_config
  for select using (auth.uid() = user_id);
drop policy if exists "insert_own_config" on user_config;
create policy "insert_own_config" on user_config
  for insert with check (auth.uid() = user_id);
drop policy if exists "update_own_config" on user_config;
create policy "update_own_config" on user_config
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Atualiza updated_at automaticamente nos imóveis
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_imoveis_updated_at on imoveis;
create trigger trg_imoveis_updated_at
  before update on imoveis
  for each row execute function set_updated_at();
