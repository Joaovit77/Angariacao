# Métricas futuras — contrato G0

Unidade: case_id / validation / repetição. Plano recomendado contém 36 unidades, uma repetição; nada foi executado. IDs desconhecidos, duplicados, estágios diferentes ou repetições fora do plano interrompem o cálculo. Repetições nunca são casos independentes. Não misturar S0/S2 ou outros runs.

Todas as taxas publicam numerator / denominator / value / status. Denominador zero → value=null e NOT_TESTED, nunca 100% ou zero erro inventado. Semântica exige envelope inteiro elegível e resultado normalizado completo; não recuperar verdict de pergunta isolada de resposta inválida.

| Primária | Numerador | Denominador |
| --- | --- | --- |
| verdict_accuracy | Verdict exatamente igual ao oráculo | Todos os stages válidos |
| critical_false_accept_rate | APPROVE em REJECT CRITICAL | Negativas CRITICAL válidas; planejadas 14 |
| false_accept_rate | APPROVE em REJECT esperado | Negativas válidas; planejadas 18 |
| false_reject_rate | REJECT em APPROVE esperado | Positivas válidas; planejadas 12 |
| inconclusive_accuracy | INCONCLUSIVE em INCONCLUSIVE esperado | Inconclusivas válidas; planejadas 6 |
| valid_response_rate | Envelopes elegíveis estruturalmente válidos | Transportes analisáveis recebidos, incluindo INVALID_RESPONSE |

Operacionais sem envelope são contados separadamente: recebidos, transportes analisáveis, válidos, inválidos, erros operacionais e não recebidos. Invalid permanece no denominador estrutural e sai integralmente do semântico. Modelo errado e usage sem controle tornam a resposta não elegível; a causa tipada original continua preservada.

Splits obrigatórios: ordinary_false_accept = APPROVE nas quatro negativas ordinárias válidas; critical_false_accept separado nas 14 críticas válidas; partial_false_reject nas três positivas parciais válidas; full_answer_false_reject nas nove positivas não parciais válidas, incluindo duas abstenções corretas completas ao pedido. Não compensar uma categoria com outra.

Expected INCONCLUSIVE tem unsafe_approve_on_inconclusive e overreject_inconclusive próprios; não somar seus erros a false accept/reject de REJECT/APPROVE esperados. INCONCLUSIVE em positiva ou negativa também é erro de verdict e aparece separadamente, sem ser escondido como rejeição/aceite.

Coverage: positivas válidas/12; negativas válidas/18; inconclusivas válidas/6; críticas válidas/14; total válido/36. Para outro número de repetições autorizado, multiplicar só o planejado. Publicar sempre planejado, recebido e válido; zero observações significa NOT_RUN e métricas semânticas null, embora a cobertura do plano ainda seja 0/planejado.

Secundárias: grounding_accuracy, factuality_accuracy, entity_accuracy, temporal_accuracy, protocol_accuracy, coverage_accuracy, omission_accuracy, unsupported_accuracy, cross_entity_accuracy, partial_accuracy; safety_accuracy adicional. Cada label exato/ stages válidos, preservando aplicabilidade por dimensão e caso. Dimensão errada não muda verdict retornado nem o oráculo macro congelado. Sem threshold de confidence.

Pares: dois endpoints válidos e com verdict correto na mesma repetição → PAIR_PASS; um errado → PAIR_FAIL; inválido/ausente → PAIR_INCONCLUSIVE fora do denominador de acerto, mas dentro da cobertura planejada. Os 18 pares medem verdict macro; perfeição dimensional não é condição do par.

## Classificação diagnóstica futura

- NAO_PROMISSOR_DIAGNOSTICO se houver qualquer false accept observado em REJECT (crítico ou ordinário) ou unsafe approve em INCONCLUSIVE. Eventos críticos permanecem separados e não são compensados.
- PROMISSOR_DIAGNOSTICO somente com todas as 36 unidades planejadas válidas e todos os verdicts corretos, inclusive seis inconclusivos; dimensões secundárias podem divergir e continuam visíveis.
- INCONCLUSIVO nos demais casos: cobertura incompleta, false reject, overreject ou outro erro de verdict sem o critério negativo anterior.

Essas regras são apenas gate conservador de experimento, não limiar de prontidão de produção. PASS G0 certifica desenho/contrato/testes, não desempenho JEV. Nenhum ensaio real ou regra de parada operacional de G1 está autorizado aqui. [Métricas vazias](metrics-empty.json) não são resultado do modelo; fixtures perfeitas usadas para testar o scorer não contam como observação JEV.
