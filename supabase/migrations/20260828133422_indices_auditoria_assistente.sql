create index if not exists assistente_acoes_confirmado_por_idx
  on public.assistente_acoes (confirmed_by)
  where confirmed_by is not null;

create index if not exists agenda_acao_origem_idx
  on public.agenda (source_action_id)
  where source_action_id is not null;;
