-- Fase 1: feedback das sugestões da IA.
--
-- Script incremental para execução manual e controlada após revisão.
-- Não ativa a feature e não altera dados ou objetos fora desta fase.
--
-- A criação é deliberadamente não idempotente: se qualquer tabela, índice
-- ou policy já existir, a transação inteira falha. Isso impede que uma
-- estrutura preexistente e possivelmente incompatível seja aceita em silêncio.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.ia_sugestoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  imovel_id uuid references public.imoveis(id) on delete set null,
  tipo text not null check (tipo in ('prospeccao', 'resposta', 'outro')),
  texto_sugerido text not null
    check (char_length(trim(texto_sugerido)) between 1 and 4000),
  contexto jsonb not null default '{}'::jsonb
    check (jsonb_typeof(contexto) = 'object'),
  origem text not null check (origem in (
    'central-mensagens', 'caixa-respostas', 'notas', 'assistente',
    'pipeline-anuncio', 'outro'
  )),
  modelo text check (modelo is null or char_length(modelo) <= 100),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.ia_feedbacks (
  id uuid primary key default gen_random_uuid(),
  sugestao_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  resultado text not null check (resultado in ('aprovado', 'editado', 'rejeitado')),
  motivo text check (motivo is null or motivo in (
    'muito-formal', 'muito-longo', 'muito-generico', 'tom-inadequado',
    'informacao-incorreta', 'outro'
  )),
  comentario text check (comentario is null or char_length(comentario) <= 500),
  texto_final text check (
    texto_final is null or char_length(trim(texto_final)) between 1 and 4000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ia_feedbacks_sugestao_unica unique (sugestao_id),
  constraint ia_feedbacks_sugestao_usuario_fkey
    foreign key (sugestao_id, user_id)
    references public.ia_sugestoes(id, user_id) on delete cascade,
  constraint ia_feedbacks_resultado_campos_check check (
    (resultado = 'aprovado' and motivo is null and comentario is null and texto_final is null)
    or (resultado = 'editado' and motivo is null and comentario is null and texto_final is not null)
    or (resultado = 'rejeitado' and texto_final is null)
  )
);

alter table public.ia_sugestoes enable row level security;
alter table public.ia_feedbacks enable row level security;

create policy "select_own_ia_sugestoes" on public.ia_sugestoes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_ia_sugestoes" on public.ia_sugestoes
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      imovel_id is null
      or exists (
        select 1 from public.imoveis imovel
        where imovel.id = imovel_id
          and imovel.user_id = (select auth.uid())
      )
    )
  );

create policy "select_own_ia_feedbacks" on public.ia_feedbacks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert_own_ia_feedbacks" on public.ia_feedbacks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ia_sugestoes sugestao
      where sugestao.id = sugestao_id
        and sugestao.user_id = (select auth.uid())
    )
  );
create policy "update_own_ia_feedbacks" on public.ia_feedbacks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.ia_sugestoes sugestao
      where sugestao.id = sugestao_id
        and sugestao.user_id = (select auth.uid())
    )
  );

create index ia_sugestoes_usuario_data_idx
  on public.ia_sugestoes (user_id, created_at desc);
create index ia_sugestoes_imovel_data_idx
  on public.ia_sugestoes (user_id, imovel_id, created_at desc)
  where imovel_id is not null;
create index ia_feedbacks_usuario_resultado_data_idx
  on public.ia_feedbacks (user_id, resultado, updated_at desc);

-- Os defaults históricos do Supabase podem conceder privilégios amplos a
-- tabelas novas. Removemos todos e devolvemos somente o contrato canônico.
revoke all on table public.ia_sugestoes, public.ia_feedbacks
  from public, anon, authenticated, service_role;

grant select, insert on table public.ia_sugestoes to authenticated;
grant select, insert, update on table public.ia_feedbacks to authenticated;

-- Mantém o mesmo contrato server-side do schema canônico, sem TRUNCATE,
-- REFERENCES ou TRIGGER. A service role continua restrita ao servidor.
grant select, insert, update, delete on table
  public.ia_sugestoes, public.ia_feedbacks
to service_role;

commit;

;
