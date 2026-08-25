-- ============================================================
-- SCHEMA: Angario — Supabase
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

create schema if not exists extensions;
create extension if not exists "pgcrypto";
create extension if not exists vector with schema extensions;

-- O plano Hobby da Vercel so aceita Cron diario, mas mensagens podem ser
-- marcadas para qualquer minuto. O relogio fica no Supabase: pg_cron dispara
-- e pg_net chama a rota protegida que ja processa a fila na Vercel.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

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
  estado text,
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

-- UF do endereço ("PR", "SP", ...). Rua e número continuam juntos em
-- `endereco`; esta coluna existe porque o formulário passou a receber os
-- dados estruturados do ViaCEP e a UF não tinha onde persistir.
alter table imoveis add column if not exists estado text;

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

-- O texto do anúncio, como o proprietário (ou a imobiliária concorrente) o
-- escreveu, colado no pré-cadastro durante o garimpo.
--
-- Ele já passava pelo sistema todos os dias e era JOGADO FORA: o
-- ModalPreCadastro o mandava para a IA extrair os campos e o descartava num
-- `useState`. O que se perdia é justamente o que o cadastro não tem — área em
-- m², andar, mobília, o que há no condomínio —, e é disso que um anúncio
-- decente é feito.
--
-- Guardar aqui, e não virar campos de cadastro, é decisão: a FICHA do imóvel
-- captado é montada no Sistema Principal (Sophia), e recriar os campos dela
-- aqui faria digitar tudo duas vezes e criaria duas fontes de verdade sobre o
-- mesmo imóvel — o que a integração inteira existe para evitar.
--
-- É a fonte com PROCEDÊNCIA do gerador de título e descrição: ali a IA só pode
-- afirmar o que saiu do cadastro ou deste texto. Sem ele, ela preencheria o
-- vazio com "amplo" e "recém-reformado" — invenção que, num anúncio de portal,
-- é oferta pública com o nome da imobiliária junto.
alter table imoveis add column if not exists texto_anuncio text;

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

-- ------------------------------------------------------------
-- MENSAGENS AGENDADAS
-- O destinatário é sempre um imóvel da carteira do usuário. Nome e telefone
-- são fotografados no agendamento para que o histórico continue fiel mesmo
-- se o cadastro mudar depois. O worker usa `claim_mensagens_agendadas`: o
-- UPDATE com SKIP LOCKED torna duas execuções simultâneas incapazes de obter
-- a mesma mensagem.
-- ------------------------------------------------------------
create table if not exists mensagens_agendadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid references imoveis(id) on delete set null,
  nome_proprietario text not null,
  telefone text not null,
  mensagem text not null check (char_length(trim(mensagem)) > 0),
  data_envio timestamptz not null,
  status text not null default 'agendada'
    check (status in ('agendada', 'processando', 'enviada', 'erro', 'cancelada')),
  enviado_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mensagens_agendadas enable row level security;

drop policy if exists "select_own_mensagens_agendadas" on mensagens_agendadas;
create policy "select_own_mensagens_agendadas" on mensagens_agendadas
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_mensagens_agendadas" on mensagens_agendadas;
create policy "insert_own_mensagens_agendadas" on mensagens_agendadas
  for insert to authenticated with check (
    (select auth.uid()) = user_id and status = 'agendada' and data_envio > now()
    and (imovel_id is null or exists (select 1 from imoveis i where i.id = imovel_id and i.user_id = (select auth.uid())))
  );
drop policy if exists "update_own_mensagens_agendadas" on mensagens_agendadas;
create policy "update_own_mensagens_agendadas" on mensagens_agendadas
  for update to authenticated
  using ((select auth.uid()) = user_id and status = 'agendada')
  with check (
    (select auth.uid()) = user_id and status in ('agendada', 'cancelada')
    and (status = 'cancelada' or data_envio > now())
    and (imovel_id is null or exists (select 1 from imoveis i where i.id = imovel_id and i.user_id = (select auth.uid())))
  );

create index if not exists mensagens_agendadas_pendentes_idx
  on mensagens_agendadas (data_envio, id) where status = 'agendada';
create index if not exists mensagens_agendadas_usuario_idx
  on mensagens_agendadas (user_id, data_envio desc);
create index if not exists mensagens_agendadas_imovel_idx
  on mensagens_agendadas (imovel_id);

-- O browser escolhe somente `imovel_id`; o destinatário nunca é confiado ao
-- payload do cliente. Mesmo uma chamada manual à Data API tem nome/telefone
-- substituídos pelos valores do imóvel que pertence ao mesmo usuário.
create or replace function preencher_destinatario_mensagem_agendada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dono uuid;
  nome text;
  fone text;
begin
  if new.imovel_id is null then
    new.nome_proprietario := nullif(trim(new.nome_proprietario), '');
    new.telefone := nullif(trim(new.telefone), '');
    if new.nome_proprietario is null then raise exception 'Informe o nome do proprietário.'; end if;
    if new.telefone is null or char_length(regexp_replace(new.telefone, '[^0-9]', '', 'g')) not between 10 and 13 then
      raise exception 'Telefone inválido.';
    end if;
    new.updated_at := now();
    return new;
  end if;
  select i.user_id, nullif(trim(i.proprietario_nome), ''), nullif(trim(i.proprietario_telefone), '')
    into dono, nome, fone from imoveis i where i.id = new.imovel_id;
  if dono is null or dono <> new.user_id then
    raise exception 'Imóvel não pertence ao usuário.';
  end if;
  if fone is null then raise exception 'Proprietário sem telefone.'; end if;
  new.nome_proprietario := coalesce(nome, 'Proprietário');
  new.telefone := fone;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function preencher_destinatario_mensagem_agendada() from public, anon, authenticated;
drop trigger if exists trg_destinatario_mensagem_agendada on mensagens_agendadas;
create trigger trg_destinatario_mensagem_agendada
before insert or update of user_id, imovel_id, nome_proprietario, telefone
on mensagens_agendadas for each row execute function preencher_destinatario_mensagem_agendada();

create or replace function claim_mensagens_agendadas(p_limite integer default 20)
returns setof mensagens_agendadas
language sql
security definer
set search_path = public, pg_temp
as $$
  -- Uma indisponibilidade nunca pode transformar uma mensagem de ontem em
  -- um disparo surpresa hoje. Antes de obter o lote, vence o que perdeu a
  -- janela operacional. Dez minutos cobrem atraso do scheduler/deploy sem
  -- fingir que uma mensagem antiga ainda saiu no horario combinado.
  with expiradas as (
    update mensagens_agendadas
       set status = 'erro', erro = 'janela-expirada', updated_at = now()
     where status = 'agendada'
       and data_envio < now() - interval '10 minutes'
    returning id
  ),
  candidatas as (
    select id
      from mensagens_agendadas
     where status = 'agendada'
       and data_envio >= now() - interval '10 minutes'
       and data_envio <= now()
     order by data_envio, id
     for update skip locked
     limit greatest(1, least(coalesce(p_limite, 20), 100))
  )
  update mensagens_agendadas m
     set status = 'processando', updated_at = now(), erro = null
    from candidatas c
   where m.id = c.id
  returning m.*;
$$;

revoke all on function claim_mensagens_agendadas(integer) from public, anon, authenticated;
grant execute on function claim_mensagens_agendadas(integer) to service_role;

-- O job nasce somente depois que o deploy cadastrar os dois valores no Vault:
--   mensagens_cron_url    = https://<dominio>/api/cron/mensagens
--   mensagens_cron_secret = o mesmo CRON_SECRET da Vercel
-- Assim o schema continua reexecutavel sem colocar segredo no Git. Reexecutar
-- substitui a definicao anterior, em vez de acumular jobs duplicados.
-- Configuracao chamada apenas por service_role. Recebe o segredo pelo backend,
-- grava no Vault e devolve somente o id do job; o valor nunca aparece em log.
create or replace function configurar_cron_mensagens(p_url text, p_segredo text)
returns bigint
language plpgsql
security definer
set search_path = public, vault, cron, net, pg_temp
as $$
declare
  url_id uuid;
  segredo_id uuid;
  job_id bigint;
begin
  if p_url is null or p_url !~ '^https://[A-Za-z0-9.-]+/api/cron/mensagens$' then
    raise exception 'URL do cron invalida.';
  end if;
  if p_segredo is null or char_length(p_segredo) < 16 then
    raise exception 'Segredo do cron invalido.';
  end if;

  select id into url_id from vault.secrets where name = 'mensagens_cron_url';
  if url_id is null then
    select vault.create_secret(p_url, 'mensagens_cron_url', 'Endpoint do worker de mensagens')
      into url_id;
  else
    perform vault.update_secret(url_id, p_url, 'mensagens_cron_url', 'Endpoint do worker de mensagens');
  end if;

  select id into segredo_id from vault.secrets where name = 'mensagens_cron_secret';
  if segredo_id is null then
    select vault.create_secret(p_segredo, 'mensagens_cron_secret', 'CRON_SECRET compartilhado com a Vercel')
      into segredo_id;
  else
    perform vault.update_secret(
      segredo_id,
      p_segredo,
      'mensagens_cron_secret',
      'CRON_SECRET compartilhado com a Vercel'
    );
  end if;

  if exists (select 1 from cron.job where jobname = 'processar-mensagens-agendadas') then
    perform cron.unschedule('processar-mensagens-agendadas');
  end if;

  select cron.schedule(
    'processar-mensagens-agendadas',
    '* * * * *',
    $job$
      select net.http_get(
        url := (
          select decrypted_secret from vault.decrypted_secrets
           where name = 'mensagens_cron_url'
        ),
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
             where name = 'mensagens_cron_secret'
          )
        ),
        timeout_milliseconds := 120000
      );
    $job$
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function configurar_cron_mensagens(text, text) from public, anon, authenticated;
grant execute on function configurar_cron_mensagens(text, text) to service_role;
do $$
begin
  if exists (select 1 from vault.secrets where name = 'mensagens_cron_url')
     and exists (select 1 from vault.secrets where name = 'mensagens_cron_secret') then
    if exists (select 1 from cron.job where jobname = 'processar-mensagens-agendadas') then
      perform cron.unschedule('processar-mensagens-agendadas');
    end if;

    perform cron.schedule(
      'processar-mensagens-agendadas',
      '* * * * *',
      $job$
        select net.http_get(
          url := (
            select decrypted_secret from vault.decrypted_secrets
             where name = 'mensagens_cron_url'
          ),
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (
              select decrypted_secret from vault.decrypted_secrets
               where name = 'mensagens_cron_secret'
            )
          ),
          timeout_milliseconds := 120000
        );
      $job$
    );
  end if;
end;
$$;

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

-- Excluir o imóvel, seus compromissos e a possibilidade de disparos futuros
-- é uma única transação. A função é SECURITY DEFINER somente para poder
-- serializar com uma mensagem que o worker já marcou como `processando`;
-- o dono nunca vem do cliente e todas as escritas repetem o user_id validado.
create or replace function excluir_imovel_com_dependencias(p_imovel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario_atual uuid := (select auth.uid());
  dono_imovel uuid;
  mensagens_excluidas integer := 0;
  compromissos_excluidos integer := 0;
begin
  if usuario_atual is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select i.user_id
    into dono_imovel
    from public.imoveis i
   where i.id = p_imovel_id
   for update;

  if dono_imovel is null or dono_imovel <> usuario_atual then
    raise exception 'Imóvel não encontrado.' using errcode = 'P0002';
  end if;

  -- Serializa a exclusão com o claim do worker. Se ele ganhou a corrida e
  -- já iniciou um envio, falhar a exclusão inteira é a única resposta que
  -- garante que ela nunca conclua enquanto o efeito externo ainda pode sair.
  perform 1
    from public.mensagens_agendadas
   where imovel_id = p_imovel_id
     and user_id = usuario_atual
     and status in ('agendada', 'processando')
   for update;

  if exists (
    select 1
      from public.mensagens_agendadas
     where imovel_id = p_imovel_id
       and user_id = usuario_atual
       and status = 'processando'
  ) then
    raise exception 'Há uma mensagem em processamento. Aguarde o envio terminar e tente novamente.'
      using errcode = '55000';
  end if;

  delete from public.mensagens_agendadas
   where imovel_id = p_imovel_id
     and user_id = usuario_atual
     and status = 'agendada';
  get diagnostics mensagens_excluidas = row_count;

  delete from public.agenda
   where imovel_id = p_imovel_id
     and user_id = usuario_atual;
  get diagnostics compromissos_excluidos = row_count;

  delete from public.imoveis
   where id = p_imovel_id
     and user_id = usuario_atual;

  return jsonb_build_object(
    'mensagens_excluidas', mensagens_excluidas,
    'compromissos_excluidos', compromissos_excluidos
  );
end;
$$;

revoke all on function excluir_imovel_com_dependencias(uuid) from public, anon, authenticated, service_role;
grant execute on function excluir_imovel_com_dependencias(uuid) to authenticated;

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
  whatsapp_modelos jsonb not null default '[]'::jsonb,
  perfil_comunicacao jsonb not null default '{"formalidade":"natural","tamanho":"curto","emojis":"poucos","tratamento":"voce","expressoesPreferidas":[],"expressoesEvitar":[]}'::jsonb
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

-- Preferências pessoais de redação do rascunho assistido. Regras e fatos da
-- imobiliária continuam em protocolos; este JSONB não é um editor de prompt.
alter table user_config add column if not exists perfil_comunicacao jsonb not null
  default '{"formalidade":"natural","tamanho":"curto","emojis":"poucos","tratamento":"voce","expressoesPreferidas":[],"expressoesEvitar":[]}'::jsonb;

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
-- MARCOS PERMANENTES DO FUNIL
--
-- `status` responde onde o imóvel está agora. `status_history` responde por
-- onde ele passou. As entradas em Angariado, Publicado e Locado são, portanto,
-- os marcos históricos canônicos — sem tabela ou colunas duplicadas.
--
-- O trigger abaixo fecha duas brechas do antigo read-modify-write do browser:
-- uma edição comum não pode apagar/reescrever a trilha, e uma escrita direta
-- de `status` não pode deixar o novo estado sem o evento correspondente. O
-- status e o append acontecem na mesma instrução/linha, portanto são atômicos.
-- Para sessões autenticadas, a autoria vem de auth.uid(), nunca do JSON que o
-- cliente enviou. Service role pode preservar a procedência Sophia e o nome
-- informado pelo evento, pois ela não representa um auth.users confiável.
--
-- Não há backfill inventado aqui. Entradas legadas já presentes continuam
-- válidas; imóveis sem uma transição datada permanecem incompletos.
-- ------------------------------------------------------------
create or replace function proteger_status_history_imovel()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ator uuid := auth.uid();
  proposta jsonb;
  evento jsonb;
  data_evento text;
  historico_sanitizado jsonb;
begin
  if tg_op = 'INSERT' then
    if ator is not null and jsonb_array_length(coalesce(new.status_history, '[]'::jsonb)) > 0 then
      select coalesce(
        jsonb_agg(
          case
            when entrada ? 'status' and entrada ? 'date' then
              (entrada - 'userId' - 'authorName' - 'source') ||
              jsonb_build_object('userId', ator::text, 'source', 'usuario')
            else entrada
          end
          order by ordem
        ),
        '[]'::jsonb
      )
      into historico_sanitizado
      from jsonb_array_elements(coalesce(new.status_history, '[]'::jsonb))
        with ordinality as historico(entrada, ordem);
      new.status_history := historico_sanitizado;
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    -- Não existe operação administrativa de correção desta trilha. Uma edição
    -- comum preserva exatamente o que já estava gravado.
    new.status_history := coalesce(old.status_history, '[]'::jsonb);
    return new;
  end if;

  -- Só aceita metadados propostos quando o chamador realmente acrescentou
  -- uma entrada nova no fim. Num UPDATE direto apenas de `status`, NEW traz o
  -- histórico antigo inteiro; reutilizar uma ocorrência antiga daria à nova
  -- transição a data da primeira passagem, em vez de hoje.
  if jsonb_array_length(coalesce(new.status_history, '[]'::jsonb)) >
     jsonb_array_length(coalesce(old.status_history, '[]'::jsonb)) then
    proposta := new.status_history->-1;
    if proposta->>'status' is distinct from new.status then proposta := null; end if;
  end if;

  data_evento := case
    when coalesce(proposta->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then proposta->>'date'
    else current_date::text
  end;
  evento := jsonb_build_object('status', new.status, 'date', data_evento);

  if ator is not null then
    evento := evento || jsonb_build_object('userId', ator::text, 'source', 'usuario');
  elsif proposta is not null then
    -- Eventos externos não ganham um user_id fictício. Conserva apenas os
    -- metadados explicitamente fornecidos pela integração confiável.
    if proposta ? 'userId' then evento := evento || jsonb_build_object('userId', proposta->'userId'); end if;
    if proposta ? 'authorName' then evento := evento || jsonb_build_object('authorName', proposta->'authorName'); end if;
    if proposta ? 'source' then evento := evento || jsonb_build_object('source', proposta->'source'); end if;
  end if;

  new.status_history := coalesce(old.status_history, '[]'::jsonb) || jsonb_build_array(evento);
  return new;
end;
$$;

drop trigger if exists trg_imoveis_status_history on imoveis;
create trigger trg_imoveis_status_history
  before insert or update on imoveis
  for each row execute function proteger_status_history_imovel();

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

-- ------------------------------------------------------------
-- AVALIAÇÕES RÁPIDAS DE IMÓVEIS
--
-- Cada linha é uma fotografia imutável do cálculo no instante em que ele foi
-- feito. Entrada, metodologia e comparáveis ficam juntos para que uma mudança
-- futura nos pesos não reescreva o passado. O valor pretendido pelo
-- proprietário é guardado apenas para comparação posterior; o motor de preço
-- não o recebe como insumo.
-- ------------------------------------------------------------
create table if not exists avaliacoes_imoveis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid references imoveis(id) on delete set null,
  finalidade text not null check (finalidade in ('locacao', 'venda')),
  valor_proprietario numeric check (valor_proprietario is null or valor_proprietario >= 0),
  valor_minimo numeric check (valor_minimo is null or valor_minimo >= 0),
  valor_recomendado numeric check (valor_recomendado is null or valor_recomendado >= 0),
  valor_maximo numeric check (valor_maximo is null or valor_maximo >= 0),
  nivel_confianca text not null check (nivel_confianca in ('Baixa', 'Moderada', 'Boa', 'Alta')),
  score_confianca smallint not null check (score_confianca between 0 and 100),
  quantidade_comparaveis integer not null check (quantidade_comparaveis >= 0),
  dados_entrada jsonb not null,
  metodologia jsonb not null,
  comparaveis_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table avaliacoes_imoveis enable row level security;

drop policy if exists "select_own_avaliacoes_imoveis" on avaliacoes_imoveis;
create policy "select_own_avaliacoes_imoveis" on avaliacoes_imoveis
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_avaliacoes_imoveis" on avaliacoes_imoveis;
create policy "insert_own_avaliacoes_imoveis" on avaliacoes_imoveis
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      imovel_id is null
      or exists (
        select 1 from imoveis imovel
        where imovel.id = imovel_id
          and imovel.user_id = (select auth.uid())
      )
    )
  );

create index if not exists idx_avaliacoes_imoveis_user_data
  on avaliacoes_imoveis (user_id, created_at desc);
create index if not exists idx_avaliacoes_imoveis_imovel_data
  on avaliacoes_imoveis (user_id, imovel_id, created_at desc)
  where imovel_id is not null;
create index if not exists idx_avaliacoes_imoveis_imovel
  on avaliacoes_imoveis (imovel_id)
  where imovel_id is not null;

-- ------------------------------------------------------------
-- BASE HISTÓRICA DE COMPARÁVEIS DO MERCADO
--
-- A Central atualiza anúncios observados nos portais; a Avaliação apenas lê
-- esta base. Assim uma coleta paga pode sustentar muitas avaliações e o
-- histórico não desaparece ao excluir uma busca do Radar.
-- ------------------------------------------------------------
create table if not exists comparaveis_mercado (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real')),
  id_externo text not null,
  url text not null,
  finalidade text not null default 'locacao' check (finalidade in ('locacao', 'venda')),
  titulo text not null,
  tipo text,
  endereco text,
  bairro text,
  cidade text not null,
  estado text check (estado is null or char_length(estado) = 2),
  cidade_chave text not null,
  bairro_chave text,
  area_m2 numeric check (area_m2 is null or area_m2 between 10 and 10000),
  quartos smallint check (quartos is null or quartos between 0 and 30),
  banheiros smallint check (banheiros is null or banheiros between 0 and 30),
  vagas smallint check (vagas is null or vagas between 0 and 30),
  valor_anunciado numeric not null check (valor_anunciado > 0),
  publicado_em timestamptz,
  primeiro_visto_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  dados_originais jsonb not null default '{}'::jsonb,
  unique (user_id, portal, id_externo)
);

-- A tabela nasceu na V2 com o conjunto mínimo usado pela Central. As colunas
-- abaixo preservam essa mesma entidade e acrescentam identidade composta,
-- dados objetivos, estado temporal e a representação vetorial da V3.
alter table comparaveis_mercado add column if not exists url_canonica text;
alter table comparaveis_mercado add column if not exists anuncio_fingerprint text;
alter table comparaveis_mercado add column if not exists fingerprint_forte boolean not null default false;
alter table comparaveis_mercado add column if not exists descricao text;
alter table comparaveis_mercado add column if not exists tipo_familia text;
alter table comparaveis_mercado add column if not exists regiao text;
alter table comparaveis_mercado add column if not exists endereco_chave text;
alter table comparaveis_mercado add column if not exists logradouro text;
alter table comparaveis_mercado add column if not exists numero text;
alter table comparaveis_mercado add column if not exists latitude double precision;
alter table comparaveis_mercado add column if not exists longitude double precision;
alter table comparaveis_mercado add column if not exists area_privativa_m2 numeric
  check (area_privativa_m2 is null or area_privativa_m2 between 10 and 10000);
alter table comparaveis_mercado add column if not exists area_total_m2 numeric
  check (area_total_m2 is null or area_total_m2 between 10 and 100000);
alter table comparaveis_mercado add column if not exists area_terreno_m2 numeric
  check (area_terreno_m2 is null or area_terreno_m2 between 10 and 1000000);
alter table comparaveis_mercado add column if not exists suites smallint
  check (suites is null or suites between 0 and 30);
alter table comparaveis_mercado add column if not exists andar smallint
  check (andar is null or andar between -10 and 300);
alter table comparaveis_mercado add column if not exists pavimentos smallint
  check (pavimentos is null or pavimentos between 1 and 300);
alter table comparaveis_mercado add column if not exists mobiliado boolean;
alter table comparaveis_mercado add column if not exists valor_condominio numeric
  check (valor_condominio is null or valor_condominio >= 0);
alter table comparaveis_mercado add column if not exists valor_iptu numeric
  check (valor_iptu is null or valor_iptu >= 0);
alter table comparaveis_mercado add column if not exists anunciante_tipo text
  check (anunciante_tipo is null or anunciante_tipo in ('proprietario', 'imobiliaria', 'incerto'));
alter table comparaveis_mercado add column if not exists anunciante_nome text;
alter table comparaveis_mercado add column if not exists status_anuncio text not null default 'ativo'
  check (status_anuncio in (
    'ativo', 'nao_encontrado', 'removido', 'historico',
    'possivel_negociado', 'desconhecido'
  ));
alter table comparaveis_mercado add column if not exists status_atualizado_em timestamptz not null default now();
alter table comparaveis_mercado add column if not exists embedding_texto text;
alter table comparaveis_mercado add column if not exists embedding_hash text;
alter table comparaveis_mercado add column if not exists embedding_modelo text;
alter table comparaveis_mercado add column if not exists embedding_dimensoes smallint
  check (embedding_dimensoes is null or embedding_dimensoes = 512);
alter table comparaveis_mercado add column if not exists embedding extensions.vector(512);
alter table comparaveis_mercado add column if not exists embedding_gerado_em timestamptz;

-- Backfill sem inferir o que a V2 não conhecia. A URL original continua sendo
-- uma identidade válida e area_m2 já representava a área privativa disponível.
update comparaveis_mercado set url_canonica = url where url_canonica is null;
update comparaveis_mercado
set area_privativa_m2 = area_m2
where area_privativa_m2 is null and area_m2 is not null;
update comparaveis_mercado
set tipo_familia = case
  when lower(tipo) in ('apartamento', 'kitnet/studio') then 'apartamento'
  when lower(tipo) in ('casa', 'casa de condomínio', 'casa de condominio', 'sobrado') then 'casa'
  when lower(tipo) in ('sala comercial', 'galpão', 'galpao') then 'comercial'
  else lower(trim(tipo))
end
where tipo_familia is null and tipo is not null;

alter table comparaveis_mercado enable row level security;

drop policy if exists "select_own_comparaveis_mercado" on comparaveis_mercado;
create policy "select_own_comparaveis_mercado" on comparaveis_mercado
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert_own_comparaveis_mercado" on comparaveis_mercado;
create policy "insert_own_comparaveis_mercado" on comparaveis_mercado
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update_own_comparaveis_mercado" on comparaveis_mercado;
create policy "update_own_comparaveis_mercado" on comparaveis_mercado
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists idx_comparaveis_mercado_busca
  on comparaveis_mercado (user_id, cidade_chave, finalidade, ultimo_visto_em desc);
create index if not exists idx_comparaveis_mercado_bairro_tipo
  on comparaveis_mercado (user_id, cidade_chave, bairro_chave, tipo);
create index if not exists idx_comparaveis_mercado_identidade_url
  on comparaveis_mercado (user_id, url_canonica)
  where url_canonica is not null;
create index if not exists idx_comparaveis_mercado_identidade_fingerprint
  on comparaveis_mercado (user_id, anuncio_fingerprint)
  where fingerprint_forte and anuncio_fingerprint is not null;
create index if not exists idx_comparaveis_mercado_filtros_vetor
  on comparaveis_mercado (
    user_id, embedding_modelo, finalidade, cidade_chave, tipo_familia, area_privativa_m2
  );
create index if not exists idx_comparaveis_mercado_status_recencia
  on comparaveis_mercado (user_id, status_anuncio, ultimo_visto_em desc);
create index if not exists idx_comparaveis_mercado_embedding_hnsw
  on comparaveis_mercado using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

-- Uma única transação escolhe a identidade existente e a atualiza. A função
-- é invoker: a RLS e os privilégios do chamador continuam valendo, e o user_id
-- autenticado nunca é aceito do corpo da requisição.
create or replace function registrar_comparavel_mercado(p_dados jsonb)
returns table (id uuid, criado boolean, precisa_embedding boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
  v_criado boolean := false;
  v_precisa_embedding boolean := true;
  v_url_canonica text := nullif(trim(p_dados->>'url_canonica'), '');
  v_fingerprint text := nullif(trim(p_dados->>'anuncio_fingerprint'), '');
  v_fingerprint_forte boolean := coalesce((p_dados->>'fingerprint_forte')::boolean, false);
  v_observado_em timestamptz := coalesce((p_dados->>'observado_em')::timestamptz, now());
  v_embedding_hash text := nullif(p_dados->>'embedding_hash', '');
  v_embedding_modelo text := nullif(p_dados->>'embedding_modelo', '');
  v_embedding_dimensoes smallint := (p_dados->>'embedding_dimensoes')::smallint;
begin
  if v_user_id is null and current_user = 'service_role' then
    v_user_id := nullif(p_dados->>'user_id', '')::uuid;
  end if;
  if v_user_id is null then
    raise exception 'Sessão autenticada obrigatória.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_user_id::text || '|' || coalesce(
      v_fingerprint,
      v_url_canonica,
      (p_dados->>'portal') || ':' || (p_dados->>'id_externo')
    ),
    0
  ));

  select
    c.id,
    c.embedding is null
      or c.embedding_hash is distinct from v_embedding_hash
      or c.embedding_modelo is distinct from v_embedding_modelo
      or c.embedding_dimensoes is distinct from v_embedding_dimensoes
  into v_id, v_precisa_embedding
  from public.comparaveis_mercado c
  where c.user_id = v_user_id
    and (
      (c.portal = p_dados->>'portal' and c.id_externo = p_dados->>'id_externo')
      or (v_url_canonica is not null and c.url_canonica = v_url_canonica)
      or (
        v_fingerprint_forte and c.fingerprint_forte and v_fingerprint is not null
        and c.anuncio_fingerprint = v_fingerprint
      )
    )
  order by
    case
      when c.portal = p_dados->>'portal' and c.id_externo = p_dados->>'id_externo' then 0
      when v_url_canonica is not null and c.url_canonica = v_url_canonica then 1
      else 2
    end,
    c.ultimo_visto_em desc
  limit 1
  for update;

  if v_id is null then
    insert into public.comparaveis_mercado as inserido (
      user_id, portal, id_externo, url, url_canonica, anuncio_fingerprint,
      fingerprint_forte, finalidade, titulo, descricao, tipo, tipo_familia,
      endereco, endereco_chave, logradouro, numero, bairro, cidade, estado,
      cidade_chave, bairro_chave, area_m2, area_privativa_m2, area_total_m2,
      area_terreno_m2, quartos, suites, banheiros, vagas, andar, pavimentos,
      mobiliado, valor_anunciado, valor_condominio, valor_iptu, publicado_em,
      primeiro_visto_em, ultimo_visto_em, anunciante_tipo, anunciante_nome,
      status_anuncio, status_atualizado_em, embedding_texto, embedding_hash,
      embedding_modelo, embedding_dimensoes, dados_originais
    ) values (
      v_user_id, p_dados->>'portal', p_dados->>'id_externo', p_dados->>'url',
      v_url_canonica, v_fingerprint, v_fingerprint_forte,
      coalesce(p_dados->>'finalidade', 'locacao'), p_dados->>'titulo',
      nullif(p_dados->>'descricao', ''), nullif(p_dados->>'tipo', ''),
      nullif(p_dados->>'tipo_familia', ''), nullif(p_dados->>'endereco', ''),
      nullif(p_dados->>'endereco_chave', ''), nullif(p_dados->>'logradouro', ''),
      nullif(p_dados->>'numero', ''), nullif(p_dados->>'bairro', ''),
      p_dados->>'cidade', nullif(p_dados->>'estado', ''), p_dados->>'cidade_chave',
      nullif(p_dados->>'bairro_chave', ''), nullif(p_dados->>'area_m2', '')::numeric,
      nullif(p_dados->>'area_privativa_m2', '')::numeric,
      nullif(p_dados->>'area_total_m2', '')::numeric,
      nullif(p_dados->>'area_terreno_m2', '')::numeric,
      nullif(p_dados->>'quartos', '')::smallint, nullif(p_dados->>'suites', '')::smallint,
      nullif(p_dados->>'banheiros', '')::smallint, nullif(p_dados->>'vagas', '')::smallint,
      nullif(p_dados->>'andar', '')::smallint, nullif(p_dados->>'pavimentos', '')::smallint,
      nullif(p_dados->>'mobiliado', '')::boolean, (p_dados->>'valor_anunciado')::numeric,
      nullif(p_dados->>'valor_condominio', '')::numeric,
      nullif(p_dados->>'valor_iptu', '')::numeric,
      nullif(p_dados->>'publicado_em', '')::timestamptz, v_observado_em, v_observado_em,
      nullif(p_dados->>'anunciante_tipo', ''), nullif(p_dados->>'anunciante_nome', ''),
      coalesce(p_dados->>'status_anuncio', 'ativo'), v_observado_em,
      nullif(p_dados->>'embedding_texto', ''), v_embedding_hash, v_embedding_modelo,
      v_embedding_dimensoes, coalesce(p_dados->'dados_originais', '{}'::jsonb)
    )
    returning inserido.id into v_id;
    v_criado := true;
    v_precisa_embedding := true;
  else
    update public.comparaveis_mercado c
    set
      url = p_dados->>'url',
      url_canonica = coalesce(v_url_canonica, c.url_canonica),
      anuncio_fingerprint = coalesce(v_fingerprint, c.anuncio_fingerprint),
      fingerprint_forte = c.fingerprint_forte or v_fingerprint_forte,
      finalidade = coalesce(p_dados->>'finalidade', c.finalidade),
      titulo = p_dados->>'titulo',
      descricao = coalesce(nullif(p_dados->>'descricao', ''), c.descricao),
      tipo = coalesce(nullif(p_dados->>'tipo', ''), c.tipo),
      tipo_familia = coalesce(nullif(p_dados->>'tipo_familia', ''), c.tipo_familia),
      endereco = coalesce(nullif(p_dados->>'endereco', ''), c.endereco),
      endereco_chave = coalesce(nullif(p_dados->>'endereco_chave', ''), c.endereco_chave),
      logradouro = coalesce(nullif(p_dados->>'logradouro', ''), c.logradouro),
      numero = coalesce(nullif(p_dados->>'numero', ''), c.numero),
      bairro = coalesce(nullif(p_dados->>'bairro', ''), c.bairro),
      cidade = p_dados->>'cidade',
      estado = coalesce(nullif(p_dados->>'estado', ''), c.estado),
      cidade_chave = p_dados->>'cidade_chave',
      bairro_chave = coalesce(nullif(p_dados->>'bairro_chave', ''), c.bairro_chave),
      area_m2 = coalesce(nullif(p_dados->>'area_m2', '')::numeric, c.area_m2),
      area_privativa_m2 = coalesce(nullif(p_dados->>'area_privativa_m2', '')::numeric, c.area_privativa_m2),
      area_total_m2 = coalesce(nullif(p_dados->>'area_total_m2', '')::numeric, c.area_total_m2),
      area_terreno_m2 = coalesce(nullif(p_dados->>'area_terreno_m2', '')::numeric, c.area_terreno_m2),
      quartos = coalesce(nullif(p_dados->>'quartos', '')::smallint, c.quartos),
      suites = coalesce(nullif(p_dados->>'suites', '')::smallint, c.suites),
      banheiros = coalesce(nullif(p_dados->>'banheiros', '')::smallint, c.banheiros),
      vagas = coalesce(nullif(p_dados->>'vagas', '')::smallint, c.vagas),
      andar = coalesce(nullif(p_dados->>'andar', '')::smallint, c.andar),
      pavimentos = coalesce(nullif(p_dados->>'pavimentos', '')::smallint, c.pavimentos),
      mobiliado = coalesce(nullif(p_dados->>'mobiliado', '')::boolean, c.mobiliado),
      valor_anunciado = (p_dados->>'valor_anunciado')::numeric,
      valor_condominio = coalesce(nullif(p_dados->>'valor_condominio', '')::numeric, c.valor_condominio),
      valor_iptu = coalesce(nullif(p_dados->>'valor_iptu', '')::numeric, c.valor_iptu),
      publicado_em = coalesce(nullif(p_dados->>'publicado_em', '')::timestamptz, c.publicado_em),
      ultimo_visto_em = v_observado_em,
      anunciante_tipo = coalesce(nullif(p_dados->>'anunciante_tipo', ''), c.anunciante_tipo),
      anunciante_nome = coalesce(nullif(p_dados->>'anunciante_nome', ''), c.anunciante_nome),
      status_anuncio = coalesce(p_dados->>'status_anuncio', 'ativo'),
      status_atualizado_em = case
        when c.status_anuncio is distinct from coalesce(p_dados->>'status_anuncio', 'ativo')
          then v_observado_em
        else c.status_atualizado_em
      end,
      embedding_texto = nullif(p_dados->>'embedding_texto', ''),
      embedding_hash = v_embedding_hash,
      embedding_modelo = v_embedding_modelo,
      embedding_dimensoes = v_embedding_dimensoes,
      embedding = case when v_precisa_embedding then null else c.embedding end,
      embedding_gerado_em = case when v_precisa_embedding then null else c.embedding_gerado_em end,
      dados_originais = coalesce(p_dados->'dados_originais', c.dados_originais)
    where c.id = v_id and c.user_id = v_user_id;
  end if;

  return query select v_id, v_criado, v_precisa_embedding;
end;
$$;

revoke all on function registrar_comparavel_mercado(jsonb) from public;
grant execute on function registrar_comparavel_mercado(jsonb) to authenticated, service_role;

-- Histórico append-only de observações. A linha corrente permite busca
-- eficiente; esta tabela conserva mudanças de preço/status e confirmações
-- diárias sem transformar ausência em negócio concluído.
create table if not exists observacoes_comparaveis_mercado (
  id bigint generated always as identity primary key,
  comparavel_id uuid not null references comparaveis_mercado(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  observado_em timestamptz not null,
  tipo_evento text not null check (tipo_evento in (
    'novo', 'reobservado', 'preco_alterado', 'status_alterado',
    'preco_e_status_alterados', 'reapareceu'
  )),
  valor_anunciado numeric not null check (valor_anunciado > 0),
  valor_condominio numeric check (valor_condominio is null or valor_condominio >= 0),
  valor_iptu numeric check (valor_iptu is null or valor_iptu >= 0),
  status_anuncio text not null,
  dados_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table observacoes_comparaveis_mercado enable row level security;

drop policy if exists "select_own_observacoes_comparaveis_mercado" on observacoes_comparaveis_mercado;
create policy "select_own_observacoes_comparaveis_mercado" on observacoes_comparaveis_mercado
  for select to authenticated using ((select auth.uid()) = user_id);

create index if not exists idx_observacoes_comparavel_data
  on observacoes_comparaveis_mercado (comparavel_id, observado_em desc);
create index if not exists idx_observacoes_user_data
  on observacoes_comparaveis_mercado (user_id, observado_em desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.registrar_observacao_comparavel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento text;
begin
  if tg_op = 'INSERT' then
    v_evento := 'novo';
  elsif old.valor_anunciado is distinct from new.valor_anunciado
    and old.status_anuncio is distinct from new.status_anuncio then
    v_evento := case
      when new.status_anuncio = 'ativo' and old.status_anuncio <> 'ativo' then 'reapareceu'
      else 'preco_e_status_alterados'
    end;
  elsif old.valor_anunciado is distinct from new.valor_anunciado then
    v_evento := 'preco_alterado';
  elsif old.status_anuncio is distinct from new.status_anuncio then
    v_evento := case
      when new.status_anuncio = 'ativo' and old.status_anuncio <> 'ativo' then 'reapareceu'
      else 'status_alterado'
    end;
  elsif old.ultimo_visto_em::date < new.ultimo_visto_em::date then
    v_evento := 'reobservado';
  else
    return new;
  end if;

  insert into public.observacoes_comparaveis_mercado (
    comparavel_id, user_id, observado_em, tipo_evento, valor_anunciado,
    valor_condominio, valor_iptu, status_anuncio, dados_snapshot
  ) values (
    new.id, new.user_id, new.ultimo_visto_em, v_evento, new.valor_anunciado,
    new.valor_condominio, new.valor_iptu, new.status_anuncio,
    jsonb_build_object(
      'url', new.url, 'titulo', new.titulo, 'tipo', new.tipo,
      'endereco', new.endereco, 'bairro', new.bairro, 'cidade', new.cidade,
      'areaPrivativaM2', new.area_privativa_m2, 'quartos', new.quartos,
      'banheiros', new.banheiros, 'vagas', new.vagas,
      'valorAnterior', case when tg_op = 'UPDATE' then old.valor_anunciado else null end,
      'statusAnterior', case when tg_op = 'UPDATE' then old.status_anuncio else null end
    )
  );
  return new;
end;
$$;

revoke all on function private.registrar_observacao_comparavel() from public;
drop trigger if exists trg_observar_comparavel_mercado on comparaveis_mercado;
create trigger trg_observar_comparavel_mercado
after insert or update on comparaveis_mercado
for each row execute function private.registrar_observacao_comparavel();

-- Os filtros objetivos estão dentro da função, antes do ORDER BY vetorial.
-- SECURITY INVOKER + filtro explícito por auth.uid() mantém a RLS ativa.
drop function if exists buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, text, text, numeric, numeric, integer, integer, integer
);
create or replace function buscar_comparaveis_mercado_hibridos(
  p_query_embedding extensions.vector(512),
  p_embedding_modelo text,
  p_embedding_dimensoes integer,
  p_finalidade text,
  p_cidade_chave text,
  p_tipo_familia text,
  p_area_min numeric,
  p_area_max numeric,
  p_quartos_min integer,
  p_quartos_max integer,
  p_limite integer default 80
)
returns table (
  id uuid, portal text, id_externo text, url text, titulo text, tipo text,
  endereco text, bairro text, cidade text, area_m2 numeric, quartos smallint,
  banheiros smallint, vagas smallint, latitude double precision,
  longitude double precision, valor_anunciado numeric, publicado_em timestamptz,
  ultimo_visto_em timestamptz, status_anuncio text,
  similaridade_vetorial double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id, c.portal, c.id_externo, c.url, c.titulo, c.tipo, c.endereco,
    c.bairro, c.cidade, coalesce(c.area_privativa_m2, c.area_m2),
    c.quartos, c.banheiros, c.vagas, c.latitude, c.longitude,
    c.valor_anunciado, c.publicado_em, c.ultimo_visto_em, c.status_anuncio,
    greatest(-1::double precision, least(
      1::double precision,
      1 - (c.embedding OPERATOR(extensions.<=>) p_query_embedding)
    )) as similaridade_vetorial
  from public.comparaveis_mercado c
  where c.user_id = (select auth.uid())
    and c.finalidade = p_finalidade
    and c.embedding_modelo = p_embedding_modelo
    and c.embedding_dimensoes = p_embedding_dimensoes
    and c.cidade_chave = p_cidade_chave
    and c.tipo_familia = p_tipo_familia
    and coalesce(c.area_privativa_m2, c.area_m2) between p_area_min and p_area_max
    and c.quartos between p_quartos_min and p_quartos_max
    and c.embedding is not null
  order by c.embedding OPERATOR(extensions.<=>) p_query_embedding
  limit least(greatest(p_limite, 1), 200);
$$;

revoke all on function buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, numeric, numeric, integer, integer, integer
) from public;
grant execute on function buscar_comparaveis_mercado_hibridos(
  extensions.vector, text, integer, text, text, text, numeric, numeric, integer, integer, integer
) to authenticated, service_role;

-- ------------------------------------------------------------
-- RADAR DE ANGARIAÇÃO
--
-- Uma busca salva pertence a um usuário e guarda somente os filtros da
-- Central. Os anúncios conhecidos formam a referência que permite avisar
-- apenas o que surgiu depois, sem repetir resultados antigos.
-- ------------------------------------------------------------
create table if not exists radar_buscas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  filtros jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  ultimo_check timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists radar_anuncios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  busca_id uuid not null references radar_buscas(id) on delete cascade,
  portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real')),
  id_externo text not null,
  url text not null,
  dados jsonb not null default '{}'::jsonb,
  visto boolean not null default false,
  encontrado_em timestamptz not null default now(),
  unique (busca_id, portal, id_externo)
);

alter table radar_buscas enable row level security;
alter table radar_anuncios enable row level security;

drop policy if exists "select_own_radar_buscas" on radar_buscas;
create policy "select_own_radar_buscas" on radar_buscas
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_radar_buscas" on radar_buscas;
create policy "insert_own_radar_buscas" on radar_buscas
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update_own_radar_buscas" on radar_buscas;
create policy "update_own_radar_buscas" on radar_buscas
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "delete_own_radar_buscas" on radar_buscas;
create policy "delete_own_radar_buscas" on radar_buscas
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "select_own_radar_anuncios" on radar_anuncios;
create policy "select_own_radar_anuncios" on radar_anuncios
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_radar_anuncios" on radar_anuncios;
create policy "insert_own_radar_anuncios" on radar_anuncios
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from radar_buscas busca
      where busca.id = busca_id and busca.user_id = (select auth.uid())
    )
  );
drop policy if exists "update_own_radar_anuncios" on radar_anuncios;
create policy "update_own_radar_anuncios" on radar_anuncios
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "delete_own_radar_anuncios" on radar_anuncios;
create policy "delete_own_radar_anuncios" on radar_anuncios
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on radar_buscas to authenticated;
grant select, insert, update, delete on radar_anuncios to authenticated;

create index if not exists idx_radar_buscas_user_ativo
  on radar_buscas (user_id, ativo, ultimo_check);
create index if not exists idx_radar_anuncios_user_visto
  on radar_anuncios (user_id, visto, encontrado_em desc);
create index if not exists idx_radar_anuncios_busca
  on radar_anuncios (busca_id, encontrado_em desc);

-- ------------------------------------------------------------
-- HISTÓRICO DE ANÚNCIOS VISUALIZADOS NA CENTRAL
--
-- A identidade é portal + id externo por usuário. A URL fica guardada para
-- auditoria e pode mudar sem criar uma segunda visualização do mesmo anúncio.
-- ------------------------------------------------------------
create table if not exists central_anuncios_visualizados (
  user_id uuid not null references auth.users(id) on delete cascade,
  portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real')),
  id_externo text not null,
  url text not null,
  visualizado_em timestamptz not null default now(),
  primary key (user_id, portal, id_externo)
);

alter table central_anuncios_visualizados enable row level security;

drop policy if exists "select_own_central_anuncios_visualizados" on central_anuncios_visualizados;
create policy "select_own_central_anuncios_visualizados" on central_anuncios_visualizados
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert_own_central_anuncios_visualizados" on central_anuncios_visualizados;
create policy "insert_own_central_anuncios_visualizados" on central_anuncios_visualizados
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update_own_central_anuncios_visualizados" on central_anuncios_visualizados;
create policy "update_own_central_anuncios_visualizados" on central_anuncios_visualizados
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on central_anuncios_visualizados to authenticated;

create index if not exists idx_central_anuncios_visualizados_user_data
  on central_anuncios_visualizados (user_id, visualizado_em desc);

-- ------------------------------------------------------------
-- PRIVILÉGIOS EXPLÍCITOS DA DATA API
--
-- Projetos novos não podem depender dos grants implícitos/históricos do
-- Supabase. RLS continua sendo a segunda barreira e restringe cada linha;
-- estes grants dizem somente quais operações cada papel pode tentar.
-- ------------------------------------------------------------
revoke all on table
  imoveis, mensagens_agendadas, metas, agenda, abordagens, user_config,
  ia_permissoes, whatsapp_instancias, google_contas, admins, ia_uso,
  log_eventos, aceites_termos, protocolos, radar_buscas, radar_anuncios,
  central_anuncios_visualizados, avaliacoes_imoveis, comparaveis_mercado,
  observacoes_comparaveis_mercado
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table imoveis to authenticated;
grant select, insert, update on table mensagens_agendadas to authenticated;
grant select, insert, update, delete on table metas to authenticated;
grant select, insert, update, delete on table agenda to authenticated;
grant select, insert, update, delete on table abordagens to authenticated;
grant select, insert, update on table user_config to authenticated;
grant select on table ia_permissoes to authenticated;
grant select, insert on table aceites_termos to authenticated;
grant select, insert, update, delete on table protocolos to authenticated;
grant select, insert, update, delete on table radar_buscas to authenticated;
grant select, insert, update, delete on table radar_anuncios to authenticated;
grant select, insert, update on table central_anuncios_visualizados to authenticated;
grant select, insert on table avaliacoes_imoveis to authenticated;
grant select, insert, update on table comparaveis_mercado to authenticated;
grant select on table observacoes_comparaveis_mercado to authenticated;

-- Somente código server-side possui a service role. Não concedemos
-- TRUNCATE, REFERENCES ou TRIGGER, que o aplicativo não utiliza.
grant select, insert, update, delete on table
  imoveis, mensagens_agendadas, metas, agenda, abordagens, user_config,
  ia_permissoes, whatsapp_instancias, google_contas, admins, ia_uso,
  log_eventos, aceites_termos, protocolos, radar_buscas, radar_anuncios,
  central_anuncios_visualizados
to service_role;
grant select, insert on table avaliacoes_imoveis to service_role;
grant select, insert, update on table comparaveis_mercado to service_role;
grant select, insert on table observacoes_comparaveis_mercado to service_role;
