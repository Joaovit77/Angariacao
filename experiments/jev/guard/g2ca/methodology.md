# Metodologia documental anterior à aplicação

A regra em [analysis-rules.json](analysis-rules.json) foi registrada antes da criação/aplicação do analisador G2-C-A. Usa somente projeções FULL integralmente válidas e expected dimensions/materialidade históricos. Uma violação material detectada pode sustentar REJECT mesmo com outros diagnósticos incorretos; esses erros continuam visíveis na matriz e impedem atribuir tudo à agregação.

Sem sinal material comprovado, FAIL ou INCONCLUSIVE geram DIMENSIONS_MIXED, com sinais de incerteza e FAIL espúrios discriminados. Todos PASS/NOT_APPLICABLE sustentam APPROVE apenas no contrafactual. Envelope inválido sempre DIMENSIONS_INSUFFICIENT: nunca se consulta seu verdict local nem suas dimensões para semântica.

O uso do oracle é retrospectivo e explícito. Isto não produz novo scorer, verdict corrigido, guard determinístico ou regra de produção. Confidence não altera rótulos nem expected. A análise observa contradições de saídas, sem reconstruir raw ou raciocínio interno. Associação de ordem não será tratada como causal.
