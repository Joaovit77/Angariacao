# Utilidade dimensional — diagnóstico, sem promoção

Scores históricos intactos. Cada denominador é 24 envelopes válidos; [confusões e labels esperados](dimension-review.json) evitam confundir taxonomia com falha material.

| Dimensão | Acerto | Sinal e limites observáveis |
| --- | --- | --- |
| grounding | 23/24 | Sinal descritivo forte; útil em eval de fonte, sem substituir guarda canônica. |
| factuality | 22/24 | Sinal descritivo forte, mas maior contagem estrutural (3); manter em eval. |
| protocol | 17/24 | 17/24; todos os sete erros estão nos 20 expected NOT_APPLICABLE, não nos quatro PASS/FAIL válidos. |
| temporal | 16/24 | 16/24; separar erro material de label/aplicabilidade. Verdade temporal permanece em código. |
| entity | 24/24 | 24/24, com um FAIL e um INCONCLUSIVE válidos; transferências críticas GG0-14/15 ficaram inválidas. |
| coverage | 21/24 | 21/24; candidato a diagnóstico de completude, sem demonstrar benefício incremental operacional. |
| omission | 19/24 | 19/24; detectou FAIL em GG0-29, benefício diagnóstico concreto que não corrigiu o macro. |
| unsupported_assumption | 22/24 | 22/24; diagnóstico útil; inferir efeito de mantê-lo no request exige ablação. |
| cross_entity | 8/24 | 8/24; 16 erros entre os 22 expected PASS. Um FAIL e um INCONCLUSIVE válidos corretos. Não chamar 16 erros de transferências materiais. |
| safety | 24/24 | 24/24 com expected PASS em todos os 24; zero negativo safety elegível, pois GG0-30 ficou inválido. Não demonstra sensibilidade. |
| partial_answer_allowed | 19/24 | 19/24; cinco erros nos 18 expected NOT_APPLICABLE, seis expected PASS corretos. Só 1/3 positivas parciais foi válido. |

Grounding/factuality/entity/unsupported têm bom acordo descritivo nesta amostra, com cobertura e labels limitados; não são capabilities promovidas. Cross_entity, temporal e protocol têm acordo menor e requerem análise de taxonomia/aplicabilidade. Safety ilustra por que porcentagem isolada não mede poder de bloqueio: não há FAIL esperado válido.

Para a hipótese de Guard operacional macro, todas as 11 dimensões são potencialmente separáveis do caminho de liberação. Isso não significa dispensáveis em eval: omissão em GG0-29 já mostra valor de diagnóstico. Recomenda-se estudar manter todas em eval separado e comparar verdict-only em gate futuro, sem selecionar contrato de produto agora. Fonte/entidade/tempo/taxa/permissão continuam guardas determinísticas soberanas.

Small Guard poderia estudar grounding + omission (e, se justificado, unsupported_assumption). Não há evidência de benefício incremental para fixar essas duas/três como essenciais ou desenhar esse braço agora. Não combinar tal alteração com o primeiro FULL versus VERDICT_ONLY: seriam tratamentos distintos. Nenhuma dimensão é descartada, promovida ou transformada em veto neste G2-A.
