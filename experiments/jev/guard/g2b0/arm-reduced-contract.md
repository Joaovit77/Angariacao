# ARM_REDUCED

Uma única pergunta verdict copiada exatamente do FULL: APPROVE / REJECT / INCONCLUSIVE. Nenhum rationale obrigatório, auxiliar, hint, dimensão ou reconstrução oculta. State e todos os campos fora de questions são byte-equivalentes.

Novo adapter puro usa o MESMO parseTypedResponse estrito, com request de uma pergunta. Valida question id, opções exatas, probabilidades numéricas finitas em [0,1], soma na tolerância histórica, choice=max, confidence em [0,1], duplicatas e estrutura. Modelo observado deve ser jev-1.14.0 e usage presente. Não modifica parser/G0/G1.

Resultado elegível: verdict + confidence + dimensions=NOT_COLLECTED. Não preencher 11 labels, PASS, NOT_APPLICABLE ou null ambíguo. Extra pergunta dimensional em answers invalida envelope. Extras fora do contrato seguem projeção positiva do parser e são descartados, nunca interpretados como dimensões ocultas. Qualquer erro contratual/elegibilidade é INVALID_RESPONSE, result=null e normalized_verdict=null; sem fallback ou recovery. Nenhuma normalização, arredondamento, coerção, repair ou auto-max.
