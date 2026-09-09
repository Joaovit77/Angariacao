-- Portais de prospecção que o corretor cadastrou além dos fixos (ORIGENS_IMOVEL).
-- Alimentam o seletor de origem do imóvel e o "Foco do dia" do Dashboard. Gêmeo
-- do agenda_tipos: lista de extras, sem política RLS própria (as policies da
-- tabela já escopam a linha inteira ao dono).
alter table user_config add column if not exists origens_extras jsonb not null default '[]'::jsonb;;
