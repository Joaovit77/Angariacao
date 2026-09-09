alter table agenda add column if not exists hora text;
alter table user_config add column if not exists agenda_tipos jsonb not null default '[]'::jsonb;;
