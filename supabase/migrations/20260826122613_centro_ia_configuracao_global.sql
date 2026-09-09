create table if not exists public.ia_configuracoes (
  id bigserial primary key,
  modelo_operacoes text not null,
  esforco_operacoes text not null check (esforco_operacoes in ('none', 'low', 'medium', 'high', 'xhigh')),
  modelo_classificacao text not null,
  esforco_classificacao text not null check (esforco_classificacao in ('none', 'low', 'medium', 'high', 'xhigh')),
  modelo_atendimento text not null,
  esforco_atendimento text not null check (esforco_atendimento in ('none', 'low', 'medium', 'high', 'xhigh')),
  modelo_assistente text not null,
  esforco_assistente text not null check (esforco_assistente in ('none', 'low', 'medium', 'high', 'xhigh')),
  instrucao_atendimento text not null default '' check (char_length(instrucao_atendimento) <= 1200),
  alterado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table public.ia_configuracoes enable row level security;
revoke all on table public.ia_configuracoes from anon, authenticated;
revoke all on sequence public.ia_configuracoes_id_seq from anon, authenticated;
grant select, insert on table public.ia_configuracoes to service_role;
grant usage, select on sequence public.ia_configuracoes_id_seq to service_role;

alter table public.ia_uso
  add column if not exists tokens_entrada_cache_gravacao integer not null default 0;;
