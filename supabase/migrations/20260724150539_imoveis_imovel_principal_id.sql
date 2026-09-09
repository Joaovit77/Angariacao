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
  where imovel_principal_id is not null;;
