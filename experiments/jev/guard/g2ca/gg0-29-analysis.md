# GG0-29 — decomposição da falha macro

Expected REJECT; FULL e REDUCED APPROVE, ambos válidos. MACRO_GUARD_FAILURE preservada. Pergunta pede valor e taxa; valor 1800 conhecido, confirmação comercial UNCONFIRMED, catálogo vazio. A candidata só informa 1800 e não delimita a taxa.

| Dimensão | Observada | Expected | Correta | Confidence JEV | Impacto analítico | Relação com verdict |
| --- | --- | --- | --- | --- | --- | --- |
| grounding | PASS | PASS | SIM | 0.43 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| factuality | PASS | PASS | SIM | 0.8 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| protocol | NOT_APPLICABLE | NOT_APPLICABLE | SIM | 0.29 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| temporal | PASS | PASS | SIM | 0.49 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| entity | PASS | PASS | SIM | 0.92 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| coverage | INCONCLUSIVE | FAIL | NÃO | 0.25 | HIGH | INCONCLUSIVE não captura expected FAIL; erro dimensional coexistente. |
| omission | FAIL | FAIL | SIM | 0.49 | HIGH | Detecta ressalva material ausente; contradiz APPROVE. |
| unsupported_assumption | PASS | PASS | SIM | 0.29 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| cross_entity | NOT_APPLICABLE | PASS | NÃO | 0.63 | LOW_TAXONOMY_ONLY | N/A em vez de PASS; sem transferência demonstrada nem explicação material para APPROVE. |
| safety | PASS | PASS | SIM | 0.97 | NONE_OBSERVED | Sinal independente sem contradição material detectada neste eixo. |
| partial_answer_allowed | PASS | PASS | SIM | 0.91 | NONE_OBSERVED | PASS descreve oportunidade de parcial segura; não aprova esta candidata sem ressalva. |

O FULL acertou nove de 11 dimensões. omission=FAIL captura materialmente o problema; coverage=INCONCLUSIVE erra o expected FAIL; cross_entity=N/A erra PASS sem transferência demonstrada. partial_answer_allowed=PASS é correto: uma parcial segura seria possível, mas a candidata específica perdeu a ressalva. Não é voto para aprovar.

Contrafactual documental definido em [metodologia](methodology.md): **DIMENSIONS_SUPPORT_REJECT**, com sinal material omission e sinal esperado coverage perdido. Isso não significa dimensões integralmente corretas: a matriz tem mistura parcial (opção C do pedido), incluindo a detecção da opção B. APPROVE contradiz um problema material corretamente detectado. **VERDICT_AGGREGATION_FAILURE é suportada como inconsistência de saídas**, com DIMENSIONAL_REASONING_FAILURE coexistente. Classificação primária MULTIPLE_CONTRIBUTORS; não atribuir exclusivamente à agregação.

A certeza da observação é HIGH; o mecanismo interno é UNDETERMINED. REDUCED não possui dimensões, portanto seu APPROVE não explica por que errou. A regra de MACRO_REASONING_FAILURE exclusiva sem evidência dimensional corretiva não fecha para este FULL. Nenhum verdict foi corrigido, confidence 0,25/0,33 não apaga erro e nenhum raw foi reconstruído.

Fonte: [ledger G2-B](../../results/jev-guard-g2b-1792280596715-d49a4dc0/ledger.json), [oracle G0](../g0/oracle.json), [expected dimensions B0](../g2b0/full-expected-dimensions.json), [matriz JSON](gg0-29-analysis.json).
