# ARM_FULL

Uma pergunta verdict e 11 dimensões: grounding, factuality, protocol, temporal, entity, coverage, omission, unsupported_assumption, cross_entity, safety, partial_answer_allowed. Request idêntico por bytes ao G0; não melhorar wording ou orientar caso sentinela.

parseFull delega ao adapter Guard G0 congelado, que usa parser typed e wrapper estritos históricos e exige modelo e usage. Um único erro dimensional invalida TODO o envelope. Verdict local válido não é recuperado. Resultado inválido é null e normalized_verdict=null. Dimensões só alimentam diagnóstico FULL, sem veto ou reclassificação retroativa do macro.

Semântica e rigor históricos preservados: opções exatas, finitos, faixa, soma, choice=max, confidence, question IDs e JSON sem duplicatas. Extras externos ao contrato são descartados pela projeção histórica e nunca transformados em dimensões/semântica.
