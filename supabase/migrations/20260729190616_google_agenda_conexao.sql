create table if not exists google_contas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  email text,
  calendar_id text not null default 'primary',
  criado_em timestamptz not null default now()
);

alter table google_contas enable row level security;

alter table agenda add column if not exists google_event_id text;;
