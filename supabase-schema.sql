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

-- Tentativas de abordagem: cada contato feito com o proprietário, com o roteiro
-- usado (abordagem_id -> tabela `abordagens`), o canal e o resultado. Mesmo
-- padrão de `notas`: jsonb na própria linha, herdando o RLS do imóvel.
-- Um imóvel tem VÁRIAS tentativas de propósito — é o que permite separar o
-- roteiro que abre a conversa do que fecha o contrato.
alter table imoveis add column if not exists tentativas jsonb not null default '[]'::jsonb;

-- Endereçamento dentro do prédio/condomínio. Não é só descritivo: `unidade` e
-- `bloco` entram na identidade do imóvel (calculo/duplicidade.ts), porque no
-- mesmo endereço o ap 101 e o ap 202 são imóveis diferentes.
alter table imoveis add column if not exists unidade text;
alter table imoveis add column if not exists bloco text;
alter table imoveis add column if not exists edificio text;

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
-- ABORDAGENS (catálogo de roteiros de captação do usuário)
-- ------------------------------------------------------------
-- Uma abordagem é o ROTEIRO — o que você diz ao proprietário
-- ("ofereço avaliação gratuita do aluguel"). Não confundir com
-- `imoveis.forma_abordagem`, que é o CANAL (WhatsApp, ligação,
-- visita). São eixos independentes: o mesmo roteiro roda em
-- canais diferentes, e o mesmo canal carrega roteiros diferentes.
--
-- As TENTATIVAS ficam em `imoveis.tentativas` (jsonb), no mesmo
-- padrão de `notas`/`status_history` — histórico por imóvel viaja
-- junto com a linha do imóvel e herda o RLS dela.
create table if not exists abordagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  roteiro text,
  canal_sugerido text,
  -- Arquivar em vez de excluir: uma abordagem usada em 40 tentativas
  -- ainda é a chave de leitura desse histórico. Arquivada some dos
  -- seletores, mas continua nomeando as tentativas antigas.
  arquivada boolean not null default false,
  created_at timestamptz default now()
);

alter table abordagens enable row level security;

drop policy if exists "select_own_abordagens" on abordagens;
create policy "select_own_abordagens" on abordagens
  for select using (auth.uid() = user_id);
drop policy if exists "insert_own_abordagens" on abordagens;
create policy "insert_own_abordagens" on abordagens
  for insert with check (auth.uid() = user_id);
drop policy if exists "update_own_abordagens" on abordagens;
create policy "update_own_abordagens" on abordagens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete_own_abordagens" on abordagens;
create policy "delete_own_abordagens" on abordagens
  for delete using (auth.uid() = user_id);

create index if not exists abordagens_user_id_idx on abordagens(user_id);

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

-- Nome da empresa/imobiliária do usuário. Usado nas sugestões de abordagem
-- por IA ("meu nome é X e falo da Y") — cada conta tem a sua, pensando em
-- múltiplas imobiliárias usando o sistema.
alter table user_config add column if not exists empresa text;

-- Portais de prospecção que o corretor cadastrou além dos fixos (ORIGENS_IMOVEL).
-- Alimentam o seletor de origem do imóvel e o "Foco do dia" do Dashboard. É o
-- gêmeo do agenda_tipos: lista de extras, sem política RLS própria (as policies
-- da tabela já escopam a linha inteira ao dono).
alter table user_config add column if not exists origens_extras jsonb not null default '[]'::jsonb;

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
-- PERMISSÃO DE USO DA IA (uma linha por usuário liberado)
--
-- Diferente de todas as outras tabelas daqui: esta NÃO é dado do
-- usuário, é uma decisão do dono do sistema sobre ele. Por isso a
-- assimetria proposital nas políticas abaixo — o usuário LÊ a própria
-- linha (o app precisa saber se mostra os botões) e não escreve nada.
--
-- Repare no que está FALTANDO: não há política de insert, update nem
-- delete. Com RLS ligada, a ausência de política é o próprio bloqueio —
-- ninguém escreve aqui pelo browser, nem na própria linha. É isso que
-- impede alguém de se autoliberar com a anon key, que é pública por
-- design. Se um dia alguém acrescentar "update_own_ia" por simetria com
-- as outras tabelas, o controle inteiro cai.
--
-- Para liberar/revogar: Table Editor do Supabase (usa a service role,
-- que passa por cima da RLS). Sem deploy, sem mexer em código.
-- ------------------------------------------------------------
create table if not exists ia_permissoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  liberado boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table ia_permissoes enable row level security;

drop policy if exists "select_own_ia" on ia_permissoes;
create policy "select_own_ia" on ia_permissoes
  for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- INSTÂNCIAS DE WHATSAPP (uma linha por corretor)
--
-- De quem é esta conversa? Quando o proprietário responde, a Evolution
-- avisa o app (app/api/whatsapp/webhook) e manda o NOME DA INSTÂNCIA no
-- evento. Esta tabela é o que traduz esse nome para um usuário.
--
-- Sem ela o casamento teria de ser só pelo telefone — e dois corretores
-- podem ter o MESMO proprietário na carteira (mesmo prédio, mesmo
-- investidor: é comum). Aí a resposta de um atualizaria a tentativa do
-- outro, que é escrever na carteira alheia. A instância desempata porque
-- a mensagem chegou num número, e o número é de uma pessoa só.
--
-- Um número por corretor, então `user_id` é a própria chave primária. Se
-- um dia alguém tiver dois números, isto vira `id` + unique em `user_id`
-- — e é só aqui que muda.
--
-- REPARE NO QUE ESTÁ FALTANDO: RLS ligada e NENHUMA política. Como em
-- `ia_permissoes`, a ausência é o bloqueio — e aqui ela vale para leitura
-- também, por dois motivos:
--
--   1. `token` é segredo. Com uma política de select, qualquer usuário
--      leria o próprio token pelo DevTools com a anon key (que é pública
--      por design) e passaria a mandar mensagem pela instância por fora
--      do app. Segredo não chega ao browser — a mesma regra das env vars
--      da Evolution.
--   2. Se houvesse política de escrita, um usuário poderia apontar a
--      própria linha para a instância de OUTRO e passar a receber as
--      respostas dos proprietários dele.
--
-- Quem lê são as rotas de servidor, com a service role, sempre a partir
-- de um user_id já verificado por auth.getUser() — nunca de um id vindo
-- do browser. Preenche-se/edita-se pelo Table Editor do Supabase, como a
-- liberação de IA: sem deploy.
-- ------------------------------------------------------------
create table if not exists whatsapp_instancias (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Nome da instância na Evolution, exatamente como vem no campo "instance"
  -- do evento. Unique porque é a chave da tradução: duas linhas com o mesmo
  -- nome tornariam o dono ambíguo, que é justamente o que a tabela evita.
  instancia text not null unique,
  -- Token DA INSTÂNCIA (não a global api key). Fica aqui para o envio deixar
  -- de depender da env var única EVOLUTION_INSTANCE/EVOLUTION_TOKEN, que hoje
  -- faria todo corretor mandar mensagem pelo mesmo número.
  token text,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table whatsapp_instancias enable row level security;

-- ------------------------------------------------------------
-- TELEFONE EM FORMA CANÔNICA (para casar a resposta com o imóvel)
--
-- O evento traz o jid ("554398024316@s.whatsapp.net"); o banco guarda o
-- telefone como a pessoa digitou ("(43) 99802-4316"). Comparar os dois
-- exige normalizar, e normalizar aqui — em coluna indexada — em vez de no
-- código: o webhook roda com service role, então varrer imóveis em memória
-- significaria carregar a carteira de TODO MUNDO a cada mensagem recebida.
--
-- A regra que importa é o nono dígito. O WhatsApp guarda muitos celulares
-- brasileiros SEM ele: em Londrina, 5543998024316 e 554398024316 são a
-- MESMA conta (é o mesmo fato que a rota de envio resolve consultando o jid
-- canônico — ver lib/calculo/whatsapp.ts). A forma canônica aqui é DDD +
-- assinante SEM o 9, para as duas grafias caírem no mesmo valor:
--
--   (43) 99802-4316  ->  4398024316
--   5543998024316    ->  4398024316
--   554398024316     ->  4398024316
--   (43) 3324-5678   ->  4333245678   (fixo, intocado)
--
-- Devolve null para o que não é telefone brasileiro plausível — inclusive o
-- estrangeiro que ganhou um "55" na frente (+1 415 555 2671 vira
-- 5514155552671, que PARECE nacional). Null nunca casa com nada, que é o
-- comportamento certo: melhor não achar do que achar o imóvel errado.
-- ------------------------------------------------------------
create or replace function telefone_canonico(telefone text)
returns text
language sql
immutable
as $$
  select case
           -- 11 dígitos = DDD + celular com o nono; tira o 9 para bater com
           -- a forma de 10 que o WhatsApp costuma devolver.
           when length(n.nac) = 11 and substr(n.nac, 3, 1) = '9'
             then left(n.nac, 2) || substr(n.nac, 4)
           when length(n.nac) = 10 then n.nac
           else null
         end
  from (
    select case
             -- DDI 55 na frente (12 ou 13 dígitos): fora.
             when length(g.d) in (12, 13) and left(g.d, 2) = '55' then substr(g.d, 3)
             else g.d
           end as nac
    from (
      -- Só dígitos, e sem o zero de "0 43 9..." — nenhum número válido
      -- começa com zero, então isso não estraga nada.
      select regexp_replace(
               regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'),
               '^0+', ''
             ) as d
    ) g
  ) n
$$;

-- Coluna GERADA: o banco mantém em dia sozinho a cada insert/update, então
-- não há como o app salvar um telefone e esquecer de atualizar a chave de
-- busca. Ela não pode ser escrita — e não é: o toDbImovel lista as colunas
-- uma a uma e não a inclui.
--
-- Atenção ao mexer na regra: mudar `telefone_canonico` NÃO recalcula o que
-- já está gravado (coluna stored). Se a função mudar, é preciso dropar e
-- recriar a coluna para reprocessar a base.
alter table imoveis
  add column if not exists proprietario_telefone_canonico text
  generated always as (telefone_canonico(proprietario_telefone)) stored;

-- Índice do casamento do webhook: chega (instância -> user_id) + telefone.
-- Parcial porque imóvel sem telefone nunca é resposta de ninguém — e são
-- muitos, então deixá-los fora encolhe o índice de graça.
create index if not exists imoveis_telefone_canonico_idx
  on imoveis(user_id, proprietario_telefone_canonico)
  where proprietario_telefone_canonico is not null;

-- ------------------------------------------------------------
-- GRAVAÇÃO DA RESPOSTA RECEBIDA (webhook do WhatsApp)
--
-- Duas coisas que o app NÃO consegue fazer com um read-modify-write no
-- cliente, e que são exatamente o que quebra aqui:
--
-- 1. IDEMPOTÊNCIA. A Evolution reentrega evento (retentativa, endpoint
--    lento). Ler as notas, ver que não tem, e gravar deixa uma janela
--    entre a leitura e a escrita — duas entregas simultâneas passam as
--    duas pela verificação e criam nota duplicada. Aqui a checagem e a
--    escrita são UMA instrução: o `not exists` é avaliado com a linha
--    travada, então a segunda entrega não afeta linha nenhuma.
--
-- 2. MENSAGENS EM RAJADA. No WhatsApp as pessoas mandam três mensagens
--    curtas seguidas, e não uma longa. Isso vira três requisições quase
--    simultâneas. Com read-modify-write, a última a gravar sobrescreve
--    o array que as outras acabaram de montar, e as notas somem sem
--    erro nenhum. O `notas || nova` acontece dentro do UPDATE, sobre o
--    valor corrente da linha, então as três se acumulam.
--
-- Devolve true quando gravou, false quando era reentrega. A rota só
-- fecha a tentativa quando isto devolve true — para não reprocessar.
--
-- `p_user_id` não é redundante com o id do imóvel: é a mesma disciplina
-- da rota, onde toda consulta é filtrada pelo dono descoberto a partir
-- da instância. Um id de imóvel trocado não atravessa para outra conta.
-- ------------------------------------------------------------
create or replace function registrar_nota_whatsapp(
  p_imovel_id uuid,
  p_user_id uuid,
  p_nota jsonb
)
returns boolean
language plpgsql
as $$
declare
  afetadas int;
begin
  update imoveis
     set notas = coalesce(notas, '[]'::jsonb) || p_nota
   where id = p_imovel_id
     and user_id = p_user_id
     and not exists (
       select 1
       from jsonb_array_elements(coalesce(notas, '[]'::jsonb)) as n
       where n->>'id' = p_nota->>'id'
     );
  get diagnostics afetadas = row_count;
  return afetadas > 0;
end;
$$;

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
