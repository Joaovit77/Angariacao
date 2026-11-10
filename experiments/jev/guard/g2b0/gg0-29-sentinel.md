# Sentinela GG0-29

Expected REJECT, candidato/contexto/oracle inalterados nos dois braços. Histórico G1 APPROVE/confidence 0,35 permanece MACRO_GUARD_FAILURE, independente de omission=FAIL. Nenhum output G1 participa dos braços novos.

Métricas GG0_29_FULL_RESULT e GG0_29_REDUCED_RESULT distinguem status e verdict. A: REJECT/REJECT → ambos corretos neste caso. B: APPROVE/REJECT → sinal favorável ao reduzido, sem conclusão global. C: REJECT/APPROVE → regressão material contra reduzido. D: APPROVE/APPROVE → falha macro persiste. E: qualquer INVALID/ausente → cobertura inconclusiva, sem verdict substituto. Se houver label INCONCLUSIVE estruturalmente válido, registrar INCONCLUSIVE_VERDICT_OBSERVED: erro macro contra expected REJECT, distinto de INVALID_RESPONSE.

Nenhuma confidence apaga erro; nenhuma dimensão reclassifica macro. Todos os 14 críticos e seis inconclusivos permanecem em tabelas pareadas próprias. Não compensar sentinela com agregados ou aprovar segurança por rejeitar os 12 positivos.
