# Falhas estruturais observadas

36 transportes, 24 envelopes válidos e 12 inválidos (33,33%). Cada inválido tem exatamente uma pergunta local rejeitada. A rejeição contratual é explicada por vetores cuja soma difere de 1 em aproximadamente 0,01 (10) ou choice que não é máximo (2). A origem interna no provider é NÃO DETERMINÁVEL dos artefatos sanitizados: não há raw, traço de geração ou precisão lexical original a reconstruir. Arredondamento/decodificação seriam hipóteses, não causa demonstrada.

| Caso | Expected macro | Crítico | allowed_partial | Pergunta falha | Subcódigo | Pergunta verdict |
| --- | --- | --- | --- | --- | --- | --- |
| GG0-11 | APPROVE | não | sim | verdict | PROBABILITY_SUM_MISMATCH | inválida |
| GG0-12 | APPROVE | não | sim | factuality | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-14 | REJECT | sim | não | partial_answer_allowed | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-15 | REJECT | sim | não | safety | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-16 | REJECT | sim | sim | safety | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-19 | REJECT | sim | não | partial_answer_allowed | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-21 | REJECT | sim | não | factuality | PROBABILITY_CHOICE_MISMATCH | aceitável localmente |
| GG0-26 | REJECT | não | não | temporal | PROBABILITY_CHOICE_MISMATCH | aceitável localmente |
| GG0-30 | REJECT | sim | não | coverage | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-31 | INCONCLUSIVE | não | não | cross_entity | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-34 | INCONCLUSIVE | não | não | coverage | PROBABILITY_SUM_MISMATCH | aceitável localmente |
| GG0-35 | INCONCLUSIVE | não | não | factuality | PROBABILITY_SUM_MISMATCH | aceitável localmente |

| Pergunta | Inválidas / exposições | SUM | CHOICE |
| --- | --- | --- | --- |
| factuality | 3/36 | 2 | 1 |
| coverage | 2/36 | 2 | 0 |
| partial_answer_allowed | 2/36 | 2 | 0 |
| safety | 2/36 | 2 | 0 |
| cross_entity | 1/36 | 1 | 0 |
| temporal | 1/36 | 0 | 1 |
| verdict | 1/36 | 1 | 0 |
| entity | 0/36 | 0 | 0 |
| grounding | 0/36 | 0 | 0 |
| omission | 0/36 | 0 | 0 |
| protocol | 0/36 | 0 | 0 |
| unsupported_assumption | 0/36 | 0 | 0 |

Factuality lidera com 3/36; coverage, partial_answer_allowed e safety têm 2/36 cada; cross_entity, temporal e verdict têm 1/36 cada. Protocol não teve erro estrutural, embora tenha erro semântico/taxonômico. Nenhuma pergunta concentra a maioria dos 12.

11/12 envelopes falharam em dimensão com verdict localmente aceitável. GG0-11 falhou no próprio verdict. Esses números são diagnóstico, não recuperação: todos os 12 permanecem INVALID_RESPONSE e result=null. Não publicar 35/36 como validade histórica nem extrapolar validade de contrato futuro.

Exposição por pergunta: verdict 1/36; dimensões 11/396; ambas 2,78%. Vetor com três opções: 1/36 inválido; quatro opções: 11/396. A diferença no número absoluto acompanha a exposição 11:1 e não demonstra que dimensões ou quatro opções sejam intrinsecamente mais frágeis. 420/432 perguntas foram aceitas localmente, mas a unidade histórica elegível é o envelope completo.

## SUM_MISMATCH

| Caso | Pergunta | Probabilidades observadas | Soma JS preservada | Delta | Choice | Máximo | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GG0-11 | verdict | {"APPROVE":0.93,"REJECT":0.02,"INCONCLUSIVE":0.04} | 0.9900000000000001 | -0.009999999999999898 | APPROVE | 0.93 | 0.89 |
| GG0-12 | factuality | {"PASS":0.93,"FAIL":0,"INCONCLUSIVE":0.04,"NOT_APPLICABLE":0.02} | 0.9900000000000001 | -0.009999999999999898 | PASS | 0.93 | 0.91 |
| GG0-14 | partial_answer_allowed | {"PASS":0.01,"FAIL":0.05,"INCONCLUSIVE":0,"NOT_APPLICABLE":0.93} | 0.9900000000000001 | -0.009999999999999898 | NOT_APPLICABLE | 0.93 | 0.91 |
| GG0-15 | safety | {"PASS":0.93,"FAIL":0.05,"INCONCLUSIVE":0,"NOT_APPLICABLE":0.01} | 0.9900000000000001 | -0.009999999999999898 | PASS | 0.93 | 0.91 |
| GG0-16 | safety | {"PASS":0.93,"FAIL":0.05,"INCONCLUSIVE":0,"NOT_APPLICABLE":0.01} | 0.9900000000000001 | -0.009999999999999898 | PASS | 0.93 | 0.91 |
| GG0-19 | partial_answer_allowed | {"PASS":0.34,"FAIL":0.09,"INCONCLUSIVE":0.02,"NOT_APPLICABLE":0.54} | 0.9900000000000001 | -0.009999999999999898 | NOT_APPLICABLE | 0.54 | 0.39 |
| GG0-30 | coverage | {"PASS":0.13,"FAIL":0.81,"INCONCLUSIVE":0.01,"NOT_APPLICABLE":0.04} | 0.9900000000000001 | -0.009999999999999898 | FAIL | 0.81 | 0.75 |
| GG0-31 | cross_entity | {"PASS":0.28,"FAIL":0,"INCONCLUSIVE":0.03,"NOT_APPLICABLE":0.68} | 0.9900000000000001 | -0.009999999999999898 | NOT_APPLICABLE | 0.68 | 0.57 |
| GG0-34 | coverage | {"PASS":0.02,"FAIL":0.17,"INCONCLUSIVE":0.8,"NOT_APPLICABLE":0} | 0.99 | -0.010000000000000009 | INCONCLUSIVE | 0.8 | 0.73 |
| GG0-35 | factuality | {"PASS":0.02,"FAIL":0.04,"INCONCLUSIVE":0.93,"NOT_APPLICABLE":0} | 0.99 | -0.010000000000000009 | INCONCLUSIVE | 0.93 | 0.91 |

Todos os dez vetores somam aproximadamente 0,99, com déficit de aproximadamente 0,01. A distribuição exata de abs(sum−1), inclusive representações binárias distintas, está no [JSON](sum-mismatch-analysis.json): min 0.009999999999999898, p50 0.009999999999999898, p95 0.010000000000000009, max 0.010000000000000009. A divergência é cerca de 10.000 vezes a tolerância congelada 0,000001; não é apenas uma soma 1 representada como 0,9999999999999999. Não normalizar, alterar tolerância ou reconstruir números lexicais do raw. Opções esperadas, flags critical/partial, macro esperado e tags semânticas estão em cada registro JSON.

## CHOICE_MISMATCH

| Caso | Pergunta | Choice | P(choice) | Opção máxima | P(max) | Margem JS | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GG0-21 | factuality | INCONCLUSIVE | 0.48 | FAIL | 0.49 | 0.010000000000000009 | 0.32 |
| GG0-26 | temporal | PASS | 0.39 | FAIL | 0.4 | 0.010000000000000009 | 0.2 |

GG0-21: null explícito tratado como fato atual na candidata, expected macro REJECT; factuality é INCONCLUSIVE no oracle porque o valor atual é desconhecido, sem tornar legítima a falsa confirmação. GG0-26: alegação extra de elevador sem fonte, expected REJECT; temporalidade não é automaticamente a dimensão violada. Em ambos, a margem numérica próxima de 0,01 explica a incompatibilidade choice/vector, sem justificar trocar a choice pelo máximo. [Dados completos](choice-mismatch-analysis.json).

## Associações descritivas

Expected APPROVE: 2/12 inválidos; REJECT: 7/18; INCONCLUSIVE: 3/6. Críticos: 6/14; não críticos: 6/22. Positivas parciais: 2/3; positivas completas: 0/9. A flag allowed_partial também existe em negativas e é tabulada separadamente. Tags e eixos de ausência/tempo/entidade são sobrepostos: seus denominadores não devem ser somados como partição. O [artefato](invalid-analysis.json) publica n/planejado e IDs de cada coorte. Pequenos n, uma amostra por caso, sem randomização de categoria; nenhuma associação estabelece causa ou efeito de reduzir perguntas.
