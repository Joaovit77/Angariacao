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
  -- Idade do ANÚNCIO (em dias) no momento em que o imóvel foi garimpado.
  -- Congelada de propósito: a pergunta é se anúncio velho converte, e para
  -- isso vale a idade na descoberta, não a de hoje.
  anuncio_idade_dias integer,
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

-- Veio de planilha importada, não de trabalho feito dentro do app. Existe por
-- causa do selo "parado": uma carteira histórica entra com datas de meses ou
-- anos atrás, e sem esta marca o painel abre acusando estagnação em tudo — o
-- que transforma o card de imóveis parados em ruído no primeiro acesso.
-- Ver `isStale` em web/lib/calculo/motor.ts.
alter table imoveis add column if not exists importado boolean not null default false;

-- O proprietário retirou o imóvel da carteira (locou por conta própria,
-- desistiu, tirou da imobiliária). Não é "Perdido": ali a captação falhou,
-- aqui ela foi GANHA e depois encerrada. Vem da coluna RECEBIMENTO do CRM na
-- importação e sai do Pipeline ativo — ver PipelineViewMode "retirados".
alter table imoveis add column if not exists retirado boolean not null default false;

-- Valor cobrado quando o aluguel ATRASA: o anunciado mais o acréscimo da
-- campanha. Não substitui `valor_aluguel`, que é o que o proprietário quer
-- receber e o que vai ao anúncio — o CRM exporta o valor cheio e foi assim
-- que 147 imóveis entraram com o valor errado na coluna errada.
-- É guardado, e não derivado por ×1,2, porque o percentual varia (medido:
-- 20% em 278 de 279, e 21,6% em um). Só a solicitação de recebimento de
-- angariação usa este valor.
alter table imoveis add column if not exists valor_aluguel_atraso numeric;

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

-- Desdobramento: um espaço captado que virou várias unidades (o galpão que o
-- proprietário aceita dividir em salas comerciais). Cada unidade é uma linha,
-- porque cada uma tem aluguel, contrato e comissão próprios — mas todas
-- vieram de UMA conversa ganha, e quem aponta para um principal fica fora das
-- métricas de esforço de captação (ver imoveisDeCaptacao em calculo/motor.ts).
--
-- `on delete set null`, não cascade: excluir o galpão não pode levar junto as
-- salas, que a essa altura podem ter contrato ativo. Sem o principal, cada
-- unidade volta a ser uma captação própria — que é a leitura menos errada
-- possível quando o vínculo se perdeu.
alter table imoveis add column if not exists imovel_principal_id uuid
  references imoveis(id) on delete set null;

create index if not exists imoveis_principal_idx
  on imoveis(user_id, imovel_principal_id)
  where imovel_principal_id is not null;

-- ------------------------------------------------------------
-- OS FATOS QUE VÊM DO SISTEMA PRINCIPAL (Sophia)
--
-- Assinatura da Autorização de Locação, locação efetivada e pagamento
-- da comissão acontecem LÁ. Aqui eles só chegam, pela rota
-- /api/sophia/eventos, e o painel nunca os inventa — ver
-- web/lib/calculo/sistemaPrincipal.ts.
--
-- São colunas, e não texto dentro de `observacoes`, porque o dashboard
-- soma comissão pendente e valor recebido a partir delas. É a mesma
-- decisão de `retirado`: dado que a tela consulta não pode viver numa
-- string que a próxima edição apaga.
--
-- Todas anuláveis: o evento do Sistema Principal declara o número do
-- contrato e a forma de pagamento como opcionais, e inventar valor para
-- não deixar nulo é como se grava um contrato que não existe.
-- ------------------------------------------------------------
alter table imoveis add column if not exists autorizacao_assinada_em date;
alter table imoveis add column if not exists autorizacao_responsavel text;
alter table imoveis add column if not exists locado_em date;
alter table imoveis add column if not exists contrato_numero text;
alter table imoveis add column if not exists comissao_forma_pagamento text;
alter table imoveis add column if not exists comissao_observacao text;

-- A chave de casamento dos eventos. `referencia_crm` já existia como campo
-- digitado à mão; com a integração ela vira o ID COMPARTILHADO entre os dois
-- sistemas, e é o evento de assinatura que a carimba (medido: a referência
-- nasce no Sistema Principal na hora da assinatura — 101 de 101 "Locado" da
-- carteira real têm uma, contra 3 de 497 "Angariado").
--
-- O índice é por user_id + referência, e não único: a unicidade real é do
-- Sistema Principal, e uma constraint aqui recusaria a linha inteira num
-- cadastro manual repetido, transformando um aviso de duplicidade em erro de
-- gravação. Quem trata ambiguidade é `localizarAngariacao`, que prefere não
-- agir a agir no imóvel errado.
create index if not exists imoveis_referencia_crm_idx
  on imoveis(user_id, referencia_crm)
  where referencia_crm is not null and referencia_crm <> '';

-- Busca da referência SEM user_id: é por ela que a rota descobre de quem é o
-- imóvel, já que o evento do Sistema Principal não diz (e não deve dizer) a
-- qual corretor pertence — o `user_id` nunca vem da requisição.
create index if not exists imoveis_referencia_crm_global_idx
  on imoveis(referencia_crm)
  where referencia_crm is not null and referencia_crm <> '';

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

-- Realtime: o banco AVISA o painel quando esta tabela muda, em vez de o painel
-- ficar perguntando. É o que faz a resposta do proprietário aparecer na hora.
--
-- Sem isto, quem escreve é o webhook (no servidor) e quem lê é o painel, que
-- carregava o estado uma vez por sessão: numa aba aberta desde cedo, a caixa
-- de respostas marcava zero enquanto as mensagens se acumulavam no banco.
--
-- A RLS continua valendo — o Realtime respeita as políticas de select acima, e
-- cada corretor só recebe as próprias linhas. Publicar a tabela NÃO abre nada:
-- sem uma sessão válida não chega evento nenhum.
--
-- Só `imoveis` porque só ela recebe escrita de fora do painel (o webhook do
-- WhatsApp). As outras quatro só mudam pelas mãos do próprio usuário, na
-- própria aba — publicá-las seria tráfego para reenviar ao painel o que ele
-- acabou de mandar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'imoveis'
  ) then
    alter publication supabase_realtime add table public.imoveis;
  end if;
end $$;

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

-- Origens de imóvel que este roteiro atende (rótulos de ORIGENS_IMOVEL ou os
-- que o corretor criou em user_config.origens_extras).
--
-- Existe porque o follow-up em lote manda uma mensagem só para dez
-- proprietários, e a abertura da conversa depende de COMO o imóvel foi
-- encontrado: anúncio em site de outra imobiliária está declaradamente para
-- locação, enquanto do Copel só se sabe que o imóvel está desocupado. Sem
-- isto, o lote de 03/08/2026 mandou "vi que o imóvel está disponível para
-- locação" a quatro proprietários de imóvel apenas desocupado.
--
-- É a DECLARAÇÃO do corretor, e não uma tabela de premissas no código, porque
-- as origens que mais importam são as que ele mesmo criou (Copel desocupado,
-- Chaves na mão, Wimoveis) e nenhuma constante nossa as conhece. Ver
-- web/lib/calculo/lotePorOrigem.ts.
alter table abordagens add column if not exists origens jsonb not null default '[]'::jsonb;

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

-- Conta bancária ou chave PIX do corretor, para onde o financeiro da
-- imobiliária transfere a comissão da angariação. Entra na "Solicitação de
-- recebimento de angariação de locação" (web/lib/calculo/solicitacaoAngariacao.ts).
--
-- Fica na config, e não no imóvel, porque é dado do CORRETOR: é o mesmo em toda
-- solicitação, e um dígito errado manda o dinheiro para a conta de outra pessoa
-- — o tipo de campo que não se deve redigitar a cada contrato. Texto livre: o
-- documento aceita conta, agência/conta ou chave PIX em qualquer formato.
alter table user_config add column if not exists dados_pagamento text;

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
-- Para liberar/revogar: a tela `/admin` (ou o Table Editor do Supabase,
-- que usa a service role e passa por cima da RLS). Sem deploy, sem
-- mexer em código.
--
-- `teto_usd` é o alerta de gasto, e mora AQUI e não numa tabela nova
-- pela mesma razão que o `liberado`: é decisão do dono do sistema sobre
-- aquela conta, e esta já é a tabela dessa decisão. Ele **não bloqueia**
-- — avisa. Cortar a IA no meio do mês transformaria um estouro de conta
-- num incidente para o corretor, que não escolheu o teto e não pode
-- mudá-lo; o painel acende a linha e quem decide é quem opera. Nulo =
-- sem teto, que é o padrão.
-- ------------------------------------------------------------
create table if not exists ia_permissoes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  liberado boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table ia_permissoes add column if not exists teto_usd numeric;

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
-- GOOGLE AGENDA (conexão OAuth por corretor)
-- ------------------------------------------------------------
-- Guarda o refresh token que permite ao servidor criar eventos na
-- Agenda do Google DO CORRETOR. Uma linha por conta, então `user_id`
-- é a chave primária — mesma decisão de `whatsapp_instancias`.
--
-- RLS ligada e NENHUMA política, pela mesma razão daquela tabela e com
-- um agravante: o refresh token não expira sozinho e vale para SEMPRE
-- até ser revogado. Com uma política de select, o dono leria o próprio
-- token pelo DevTools com a anon key; vazado, ele dá acesso contínuo à
-- agenda pessoal da pessoa — bem além do que este app precisa. Segredo
-- não chega ao browser.
--
-- Diferente da tabela do WhatsApp num ponto: esta é preenchida pelo
-- PRÓPRIO APP (a rota /api/google/callback, com service role), e não à
-- mão no Table Editor. O user_id vem sempre de uma sessão já verificada,
-- nunca da requisição.
create table if not exists google_contas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- O que realmente importa: troca-se por access tokens indefinidamente.
  refresh_token text not null,
  -- Qual conta do Google foi conectada. Só para a UI dizer "conectado como
  -- fulano@gmail.com" — sem isto, quem tem duas contas não sabe em qual
  -- os compromissos estão caindo.
  email text,
  -- Agenda de destino. "primary" é a principal da conta; fica configurável
  -- para quem quiser uma agenda separada só de trabalho.
  calendar_id text not null default 'primary',
  criado_em timestamptz not null default now()
);

alter table google_contas enable row level security;

-- Liga o compromisso do painel ao evento criado no Google. Sem isto, cada
-- salvamento criaria um evento NOVO em vez de atualizar o que já existe, e
-- uma visita remarcada três vezes viraria três eventos no celular.
--
-- Vive na própria linha da agenda (e não em tabela à parte) porque some
-- junto com ela: excluído o compromisso, não sobra ponteiro órfão. Herda o
-- RLS de `agenda` — e pode, porque id de evento não é segredo.
alter table agenda add column if not exists google_event_id text;

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
-- O nome genérico é o CANÔNICO: a mesma primitiva passou a ter um segundo
-- chamador — a rota que recebe os eventos do Sistema Principal, cuja nota
-- (`sophia:<id do evento>`) precisa exatamente da mesma idempotência, porque
-- um webhook que reentrega é a regra e não a exceção.
create or replace function registrar_nota_imovel(
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

-- O nome antigo, mantido como CASCA que delega — nunca como segunda cópia do
-- corpo. Duas funções com a mesma regra é o par que diverge em silêncio (o
-- aviso vale aqui tanto quanto para `telefone_canonico`/`telefoneCanonico`), e
-- apagá-la de vez quebraria a rota do WhatsApp na janela entre rodar este
-- schema e o deploy do código novo — o schema é aplicado à mão, o código sai
-- na Vercel, e a ordem não é garantida.
create or replace function registrar_nota_whatsapp(
  p_imovel_id uuid,
  p_user_id uuid,
  p_nota jsonb
)
returns boolean
language sql
as $$
  select registrar_nota_imovel(p_imovel_id, p_user_id, p_nota);
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

-- ============================================================
-- SUPER ADMIN — quem opera o sistema, e não a carteira
--
-- As tabelas acima são todas do CORRETOR: cada linha pertence a um
-- `user_id` e a RLS a escopa. As três seguintes são de quem OPERA o
-- sistema — quem libera uma conta nova, vê quanto cada corretor está
-- custando em IA e descobre que o webhook de alguém parou.
--
-- Elas existem porque, até aqui, isso era feito abrindo o Table Editor
-- do Supabase à mão: liberar IA é inserir linha em `ia_permissoes`,
-- cadastrar o número é inserir em `whatsapp_instancias`. Com um usuário
-- isso funciona. Com dez, o cliente novo entra e lê "fale com o
-- responsável pelo sistema" enquanto espera alguém abrir o banco.
-- ============================================================

-- ------------------------------------------------------------
-- ADMINS (quem tem o cargo)
--
-- REPARE NO QUE ESTÁ FALTANDO, de novo: RLS ligada e NENHUMA política
-- — nem de select. É a diferença desta tabela para `ia_permissoes`,
-- que deixa o dono ler o próprio flag.
--
-- Lá isso é inofensivo: saber que você tem IA não dá IA a ninguém, e a
-- rota confere de novo antes de gastar token. Aqui, uma política de
-- select devolveria ao browser a LISTA de quem manda no sistema — que
-- é reconhecimento gratuito para quem quiser atacar a conta certa. E
-- uma política de escrita, ainda que "só na própria linha", seria a
-- autopromoção a administrador com a anon key, que é pública por
-- design.
--
-- Então como a UI sabe se mostra o menu Admin? Perguntando ao servidor
-- (`GET /api/admin/eu`), que confere com a service role. O browser
-- nunca decide — ele só recebe um sim/não que a rota já decidiu, e
-- toda rota de admin reconfere por conta própria. Esconder o menu é
-- conveniência; a trava está no servidor.
--
-- O PRIMEIRO ADMIN entra à mão, pelo Table Editor (é o único jeito:
-- não há admin para promovê-lo). Ver DEPLOY.md. Do segundo em diante,
-- quem promove é a própria tela (`POST /api/admin/cargo`).
--
-- `opera_carteira` SEPARA DUAS COISAS que o app tratava como uma só:
-- ter o cargo e trabalhar angariação. São eixos independentes, e
-- confundi-los erra dos dois lados. Um operador puro via as dez telas
-- do corretor abrirem numa parede de zeros — pior que inútil, porque
-- uma caixa de respostas vazia diz "nada chegou" quando significa "esta
-- conta não tem número de WhatsApp e nunca vai receber nada". E a regra
-- oposta ("admin não vê o painel") tiraria o Pipeline de quem
-- administra o sistema E trabalha a própria carteira, que é o caso
-- normal numa imobiliária pequena.
--
-- Default `true` de propósito: quem já era admin quando a coluna nasceu
-- estava usando o painel inteiro, e um default `false` os trancaria
-- fora do próprio trabalho no primeiro deploy. Quem só opera é marcado
-- à mão (ou pela tela) — a exceção se declara, a regra não.
-- ------------------------------------------------------------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  observacao text,
  criado_em timestamptz not null default now()
);

alter table admins add column if not exists opera_carteira boolean not null default true;

alter table admins enable row level security;

-- ------------------------------------------------------------
-- USO DE IA (o gasto, chamada a chamada)
--
-- Cada chamada à OpenAI é cobrada por token na NOSSA conta, e até aqui
-- ninguém sabia de quem era o gasto. `ia_permissoes` é um booleano:
-- liga e desliga, sem cota e sem conta. Um corretor entusiasmado
-- transcrevendo 40 áudios por dia aparecia só na fatura, no fim do mês,
-- misturado com todos os outros.
--
-- O que se GRAVA aqui é o fato observado — o modelo e os tokens que a
-- própria API devolveu. O preço não fica no banco de propósito: ele
-- muda por decisão da OpenAI, e um preço gravado em linha antiga
-- congelaria a tabela inteira em valores de meses atrás. O custo é
-- calculado na LEITURA, por `lib/calculo/custoIa.ts` — mesma disciplina
-- de `resultadoObservado.ts`: derivar em vez de gravar deixa a correção
-- de um preço errado ser a edição de uma constante, sem migração.
--
-- `on delete set null` (não cascade): conta encerrada não pode apagar a
-- contabilidade do mês em que ela existiu. O painel mostra os órfãos
-- como "(conta removida)".
-- ------------------------------------------------------------
create table if not exists ia_uso (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  -- O `tipo` da chamada ("resumo-dia", "transcricao", "classificar-resposta"
  -- …). É o que responde "o gasto foi em quê", e não só "quanto".
  tipo text not null,
  modelo text not null,
  tokens_entrada integer not null default 0,
  -- Quantos dos `tokens_entrada` vieram do CACHE da OpenAI. Ela cobra
  -- dez vezes menos por eles, e cacheia sozinha prompts longos que se
  -- repetem. Coluna separada (e não um `tokens_entrada` já líquido)
  -- porque `prompt_tokens` da API JÁ INCLUI os cacheados: guardar o
  -- total e a parte cacheada preserva o que a API disse, e deixa a
  -- subtração para a leitura — se o preço do cache mudar, corrige-se a
  -- constante e todo o histórico se corrige junto.
  tokens_entrada_cache integer not null default 0,
  tokens_saida integer not null default 0,
  criado_em timestamptz not null default now()
);

alter table ia_uso enable row level security;

-- O painel sempre pergunta por período, e quase sempre por corretor.
create index if not exists idx_ia_uso_user_data on ia_uso (user_id, criado_em desc);
create index if not exists idx_ia_uso_data on ia_uso (criado_em desc);

-- ------------------------------------------------------------
-- LOG DE EVENTOS (o que quebrou, e na conta de quem)
--
-- O buraco que esta tabela tapa: hoje, quando a instância de WhatsApp
-- de um corretor cai, quando o refresh token do Google dele expira ou
-- quando a transcrição falha, isso vai para o `console.error` do
-- servidor — que na Vercel é um fluxo único, sem dono, que ninguém lê.
-- O corretor descobre pelo toast de falha no meio de um lote, e quem
-- opera o sistema descobre pelo corretor reclamando.
--
-- NÃO é log de auditoria nem trilha de tudo que acontece: só o que
-- alguém precisaria AGIR para consertar, mais os envios (que são o
-- volume que justifica a fatura). Registrar cada leitura encheria a
-- tabela de ruído, e log que ninguém consegue ler é o mesmo que não ter
-- log — o erro que matou a faixa de "imóvel parado" no termômetro.
--
-- `detalhe` é texto, não jsonb: é para uma pessoa LER na tela. E é onde
-- mora a regra que não dá para relaxar depois — **nunca gravar aqui o
-- conteúdo da conversa nem o telefone do proprietário**. O log é lido
-- por quem opera o sistema, que não é o dono daquela carteira; motivo
-- classificado ("sem-whatsapp", "instancia-desconectada") basta para
-- agir e não expõe dado pessoal de terceiro que nunca aceitou nada.
-- ------------------------------------------------------------
create table if not exists log_eventos (
  id bigserial primary key,
  -- Nulo quando o evento não é de ninguém em particular (ou a conta
  -- foi removida depois).
  user_id uuid references auth.users(id) on delete set null,
  -- "whatsapp" | "ia" | "webhook" | "google" | "admin"
  categoria text not null,
  -- "erro" | "aviso" | "info"
  nivel text not null default 'info',
  -- O que aconteceu, em vocabulário fechado ("envio-ok", "sem-whatsapp").
  evento text not null,
  detalhe text,
  criado_em timestamptz not null default now()
);

alter table log_eventos enable row level security;

create index if not exists idx_log_user_data on log_eventos (user_id, criado_em desc);
create index if not exists idx_log_nivel_data on log_eventos (nivel, criado_em desc);
create index if not exists idx_log_data on log_eventos (criado_em desc);

-- ------------------------------------------------------------
-- Limpeza. Log e uso crescem para sempre se ninguém apagar — e o
-- volume vem do envio, que é justamente o que mais se registra.
--
-- Não roda sozinho de propósito: agendamento exige pg_cron ligado no
-- projeto, e uma instalação que não o tenha ficaria com uma função
-- silenciosamente morta. O painel de admin mostra o tamanho das duas
-- tabelas e oferece o botão; para automatizar, ver DEPLOY.md.
--
-- 180 dias mantém o ano fiscal pela metade e duas temporadas de
-- captação — o suficiente para comparar "este mês contra o mesmo mês".
-- ------------------------------------------------------------
create or replace function limpar_registros_antigos(p_dias int default 180)
returns table (logs_apagados bigint, usos_apagados bigint)
language plpgsql
as $$
declare
  corte timestamptz := now() - make_interval(days => p_dias);
  n_logs bigint;
  n_usos bigint;
begin
  delete from log_eventos where criado_em < corte;
  get diagnostics n_logs = row_count;
  delete from ia_uso where criado_em < corte;
  get diagnostics n_usos = row_count;
  return query select n_logs, n_usos;
end;
$$;

-- ------------------------------------------------------------
-- ACEITE DOS TERMOS
--
-- O que esta tabela guarda não é "fulano aceitou", e sim "fulano
-- aceitou ESTA VERSÃO, nesta data". Sem a versão, a afirmação não
-- significa nada: o texto pode ter mudado três vezes desde então, e
-- não haveria como saber ao que a pessoa disse sim — que é justamente
-- a pergunta que se faz quando o aceite importa.
--
-- Uma linha POR VERSÃO (e não uma por usuário, atualizada no lugar):
-- o histórico é o registro. Sobrescrever apagaria a prova de que a
-- pessoa aceitou a versão anterior enquanto ela valia.
--
-- RLS no padrão das tabelas do corretor — `auth.uid() = user_id` —,
-- mas repare: há select e insert, e NÃO há update nem delete. Aceite
-- não se edita nem se apaga; se os termos mudam, nasce outra linha.
--
-- Sem IP e sem user agent de propósito. Eles são o reflexo de guardar
-- "prova" e viram mais dado pessoal para proteger, num sistema cujo
-- problema é justamente ter dado pessoal demais. A data e a versão
-- respondem o que precisa ser respondido.
-- ------------------------------------------------------------
create table if not exists aceites_termos (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A `VERSAO_TERMOS` de web/lib/legal/identidade.ts no momento do aceite.
  versao text not null,
  aceito_em timestamptz not null default now(),
  unique (user_id, versao)
);

alter table aceites_termos enable row level security;

drop policy if exists "select_own_aceite" on aceites_termos;
create policy "select_own_aceite" on aceites_termos
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_aceite" on aceites_termos;
create policy "insert_own_aceite" on aceites_termos
  for insert with check (auth.uid() = user_id);

create index if not exists idx_aceites_user on aceites_termos (user_id, aceito_em desc);

-- ------------------------------------------------------------
-- PROTOCOLOS DA IMOBILIÁRIA
--
-- As regras da EMPRESA, escritas pelo corretor: taxa de administração,
-- prazo de contrato, multa de rescisão, quem paga condomínio e IPTU,
-- exclusividade, horário de atendimento. Estáveis, iguais para todo
-- proprietário, e repetidas na conversa toda vez.
--
-- Existem porque o rascunho de resposta por IA é PROIBIDO de afirmar
-- qualquer coisa (ver promptRascunharResposta em web/lib/calculo/ia.ts):
-- sem uma fonte de verdade ele só sabe empurrar para uma ligação. Medido
-- na carteira real em 04/08/2026: das 49 respostas de proprietário com
-- pergunta, ~18 eram sobre a empresa e não sobre o imóvel, e 12 delas
-- estavam no LD-156 — o único imóvel que chegou a assinar contrato. Não
-- é pergunta rara: é pergunta da fase que fecha o negócio.
--
-- O que NÃO entra aqui é fato do IMÓVEL (tem garagem, aceita pet, qual o
-- condomínio daquele apartamento). Isso varia por imóvel, o painel não
-- tem o dado, e a trava do prompt contra inventar fato continua inteira.
--
-- Por usuário, como `abordagens` e `user_config`. Protocolo é da
-- imobiliária, não do corretor, mas não existe conceito de organização no
-- schema; quando existir, esta é a tabela que vira compartilhada.
-- ------------------------------------------------------------
create table if not exists protocolos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- O assunto, como o proprietário perguntaria ("Taxa de administração").
  titulo text not null,
  -- A resposta, em linguagem que pode ir para o WhatsApp.
  conteudo text not null,
  -- Arquivar em vez de excluir, pelo motivo de `abordagens.arquivada`: a
  -- taxa que mudou este ano ainda descreve o contrato assinado no ano
  -- passado. Arquivado sai do prompt e da tela, sem perder o texto.
  arquivado boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table protocolos enable row level security;

drop policy if exists "select_own_protocolos" on protocolos;
create policy "select_own_protocolos" on protocolos
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own_protocolos" on protocolos;
create policy "insert_own_protocolos" on protocolos
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own_protocolos" on protocolos;
create policy "update_own_protocolos" on protocolos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own_protocolos" on protocolos;
create policy "delete_own_protocolos" on protocolos
  for delete using (auth.uid() = user_id);

create index if not exists idx_protocolos_user on protocolos (user_id, created_at);
