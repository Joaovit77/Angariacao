-- ------------------------------------------------------------
-- IA-M1c-A: metadados das chamadas de IA registradas em ia_uso.
--
-- Uma linha em ia_uso continua significando SÓ "o provedor respondeu com
-- usage e houve consumo registrado". Ela não afirma que a funcionalidade
-- conseguiu usar a resposta: esse desfecho será distinguido à parte, e
-- falhas nunca viram linha aqui (a trava diária do Garimpo, a timeline e o
-- painel de custo contam estas linhas como consumo).
--
-- Tudo aditivo e anulável, sem backfill: as linhas antigas ficam com null e
-- nenhum leitor atual muda (todos selecionam colunas explícitas).
--
-- Só há check nos valores que o próprio código produz (rota, origem da
-- configuração, esforço, duração). Valores vindos do provedor (motivo de
-- fim, modelo servido, id da requisição, tokens de raciocínio) são
-- saneados no código: um check neles faria um valor inesperado do provedor
-- recusar o insert inteiro, e o consumo se perderia.
-- ------------------------------------------------------------
alter table public.ia_uso
  add column if not exists execucao_id uuid,
  add column if not exists rota text,
  add column if not exists esforco text,
  add column if not exists config_origem text,
  add column if not exists config_versao bigint,
  add column if not exists modelo_servido text,
  add column if not exists requisicao_provedor_id text,
  add column if not exists duracao_ms integer,
  add column if not exists motivo_fim text,
  add column if not exists recusa boolean,
  add column if not exists tokens_raciocinio integer;

alter table public.ia_uso
  drop constraint if exists ia_uso_rota_check,
  drop constraint if exists ia_uso_esforco_check,
  drop constraint if exists ia_uso_config_origem_check,
  drop constraint if exists ia_uso_duracao_ms_check;

alter table public.ia_uso
  add constraint ia_uso_rota_check
    check (rota in ('operacoes', 'classificacao', 'atendimento', 'assistente')),
  add constraint ia_uso_esforco_check
    check (esforco in ('none', 'low', 'medium', 'high', 'xhigh')),
  add constraint ia_uso_config_origem_check
    check (config_origem in ('banco', 'padrao')),
  add constraint ia_uso_duracao_ms_check
    check (duracao_ms >= 0);

-- Agrupa as chamadas de uma mesma execução (as etapas do atendimento, as
-- duas tentativas da análise aprofundada). Parcial: o histórico é null.
create index if not exists idx_ia_uso_execucao
  on public.ia_uso (execucao_id)
  where execucao_id is not null;

notify pgrst, 'reload schema';
