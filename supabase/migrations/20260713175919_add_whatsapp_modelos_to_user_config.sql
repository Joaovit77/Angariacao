alter table user_config add column if not exists whatsapp_modelos jsonb not null default '[]'::jsonb;;
