alter table abordagens add column if not exists origens jsonb not null default '[]'::jsonb;;
