# Plano de validação do desenho

Históricos direcionados: G0, G2-A, B0 e G2-C-A,314 PASS/0 FAIL/0 skipped, barreira offline. Não foi repetida a totalidade de756 testes; não se acionam executores reais nem suites pagas.

Testes novos auditam somente documentos/fixtures: hashes, fontes, enum/proveniência, separaçãoannotation/evaluation, cobertura36,14 críticos, controles parciais/inconclusivos, prioridadeD1 antes deD3, ausência de inferência automática, custos/chamadas/autorizações zero e preservação. Não interpretam texto livre, não geram verdict e não implementam guard.

Mutantes atuam em cópias dos artefatos: certeza falsa de observabilidade, regra por frase/UNCONFIRMED, ausência→FALSE, falta de prova→APPROVE/REJECT, oracle vazando, mudança de fonte/entidade, prioridade invertida, falso ganho operacional, confidence, backfill deFULL e autorização reaberta. Baseline documental precisa passar antes de cada mutação.

GO/HOLD/STOP em [gate-criteria.json](gate-criteria.json) são critérios de revisão, não abertura automática. Métricas do replay anotado são coerência documental, não teste de extrator ou qualidade JEV.
