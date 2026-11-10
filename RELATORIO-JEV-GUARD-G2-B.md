# JEV-GUARD-G2-B — experimento real pareado FULL × REDUCED

Data dos registros: UTC. Run: **jev-guard-g2b-1792280596715-d49a4dc0**. Primeiro stage: 2026-10-17T23:43:18.414Z; último transporte finalizado: 2026-10-17T23:46:39.600Z.

**PASS EXECUTION / COMPLETED. ARM_FULL: NAO_PROMISSOR_DIAGNOSTICO. ARM_REDUCED: NAO_PROMISSOR_DIAGNOSTICO. COMPARATIVE_RESULT: COMPARISON_INCONCLUSIVE.**

A execução respeitou o protocolo; isso não aprova a qualidade do guard. REDUCED produziu 36/36 envelopes válidos contra 32/36 FULL, mas os 32 pares semanticamente elegíveis deram exatamente o mesmo verdict. GG0-29 continuou sendo aprovado indevidamente em ambos. Os gates obrigatórios de críticos e inconclusivos pareados falharam. Não há vencedor certificado nem autorização de integração.

## 1. Autorização, escopo e consumo

Autorização humana específica no anexo G2-B, SHA256 **ee4152e01660d315783b0b7613b20b92531436c60634f1548c2435ea0b220292**: até 72 chamadas, modelo exato jev-1.14.0, teto total US$ 0,25, exclusivamente este experimento congelado B0.

| Contagem | Total | FULL | REDUCED |
| --- | --- | --- | --- |
| Planejadas | 72 | 36 | 36 |
| Autorizadas | 72 | 36 | 36 |
| Tentativas / chamadas iniciadas | 72 | 36 | 36 |
| Transportes concluídos HTTP 200 | 72 | 36 | 36 |
| Estados finais | 72 | 36 | 36 |
| Não iniciadas | 0 | 0 | 0 |
| IN_PROGRESS | 0 | 0 | 0 |
| Erros operacionais | 0 | 0 | 0 |
| Retry / replacement / repetição extra | 0 | 0 | 0 |

Modelo observado e solicitado jev-1.14.0 nas 72 respostas; uma tentativa por payload, uma repetição, concorrência 1. Zero warm-up, model probe, health call ou 73ª chamada. Os 36 FULL e 36 REDUCED são novos deste mesmo run. G1 não foi usado como controle.

Lock exclusivo global [guard-g2b-authorization.lock](experiments/jev/results/guard-g2b-authorization.lock) e [authorization.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/authorization.json) estão CLOSED. CONSUMPTION_STARTED foi persistido antes do primeiro despacho. Autorização restante: **0 chamadas**, sem reutilização e sem auto-resume; a margem financeira não autoriza outro lote.

O primeiro pedido de elevação foi rejeitado pela revisão automática antes de CreateProcess: a revisão não tinha a autorização literal do anexo como evidência confiável. Foram apresentados o texto humano integral pertinente e seu hash; a mesma rota de aprovação autorizou a execução. O pedido rejeitado não criou processo, lock ou chamada. Não houve tentativa de contornar a aprovação, retry de API nem consumo adicional.

## 2. Comportamento anterior e alteração isolada

G0/G1 exigiam o envelope com verdict e 11 dimensões; uma dimensão inválida torna o FULL inteiro inválido. G1 permanece PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO. G2-A justificava experimentar, sob HYPOTHESIS_REQUIRES_EXPERIMENT, sem demonstrar superioridade. B0 congelou casos, dois braços, equivalência, ordem, adapters e scorers; não executou rede.

Foi adicionado somente um executor local G2-B e seus testes/evidências em [experiments/jev/guard/g2b/](experiments/jev/guard/g2b/). O envio usa o body textual congelado, sem reconstrução. O FULL usa parseFull histórico e exige as 12 perguntas; REDUCED usa parseReduced congelado, somente verdict, e dimensions=NOT_COLLECTED. Não há coerção, arredondamento, reparo de soma, max automático ou recuperação semântica de envelopes inválidos. Parser, adapters, oracle e scorers anteriores foram preservados.

Áreas impactadas: exclusivamente harness experimental, novo namespace de resultados, este relatório e append da propagação. Nenhuma interface do produto foi alterada.

## 3. Regressão e certificação antes da rede

| Etapa offline | PASS | FAIL | Rede / credenciais |
| --- | --- | --- | --- |
| 655 históricos certificados B0, antes de adicionar o executor | 655 | 0 | 0 tentativas / 0 leituras |
| Testes próprios do executor | 58 | 0 | 0 tentativas / 0 leituras |
| Suíte conjunta antes do freeze | 713 | 0 | 0 tentativas / 0 leituras |
| Suíte aplicável após freeze: 151 B0 + 58 executor | 209 | 0 | 0 tentativas / 0 leituras |
| Mutantes congelados B0 | 20/20 mortos | 0 | expectativas preservadas |

Barreira técnica offline bloqueou HTTP/HTTPS/fetch/socket/TLS/DNS/dgram. A suíte completa de 713 foi executada antes do freeze; depois dele foram repetidos os 209 aplicáveis, sem afirmar uma segunda execução dos 713.

Os testes próprios cobrem autorização, cap/modelo, ordem/request/run/arm, HTTP/timeout, usage e mismatch, preço/budget, estado durável pré-HTTP, crash sem reenvio, retry/resume proibidos, privacidade/raw, gravação atômica, duplicidades e fechamento. Evidências: [certificação pré-freeze](experiments/jev/guard/g2b/certification-before-freeze.json), [certificação posterior](experiments/jev/guard/g2b/postfreeze-certification.json), [testes](experiments/jev/guard/g2b/runtime.test.mjs).

## 4. Freeze e prova de equivalência

| Artefato | SHA256 |
| --- | --- |
| Executor freeze | 28003de6902db67f30d63bee15176e5680d51e9f92e29ab3fe74d5188737dca0 |
| Certificação pós-freeze | 1db3c620ddbc1d3779d33c9ad58ff14371e371d3185b17492c98402e16daeaa1 |
| B0 freeze | 74487846def3086234ebfd2e2df138ab19452e57839a0bf94a8fbc137998adb0 |
| FULL requests | f808a9d923de7382fb1662bc4c89c798aa6e78b67a9851168fd2ab36698eab33 |
| REDUCED requests | 454dc01fb627b43d37970ee8f5c753ac53b888a3d0c79d1bcdef997608238c49 |
| Payload equivalence | 96e38b27ee5a59c00a6753eb17c97a3ee219f73063f46b79db9424d48197a286 |

Dez fontes/insumos do executor e 38 entradas do freeze B0 conferidos antes da rede e novamente após o run. Os 72 request_sha256 individuais coincidem com os bodies e com a sequência global. Entre braços de cada caso, apenas questions difere; state, candidate, fatos, entidades, temporalidade, protocolos, constraints, evidence_scope, policy, framing comum e pergunta verdict preservam a equivalência congelada. Oracle, expected dimensions/verdict, rationale, criticidade, materialidade, sentinelas e classificação permanecem locais. Nada foi ajustado depois da call 1.

Evidências: [executor-freeze.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/executor-freeze.json), [request-freeze-verification.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/request-freeze-verification.json), [postflight-verification.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/postflight-verification.json).

## 5. Preço oficial, reserva e budget

Preço reconfirmado antes da call 1 em **2026-10-17T23:28:39.919Z**, na [documentação oficial TypeSafe](https://docs.typesafe.ai/models): jev-1.14.0, **US$ 0,042 por milhão de input tokens; output gratuito**. Contexto documentado: 64.000 tokens por request e 32.000 por pergunta. Long context permaneceu desligado, sem header de opt-in.

Reserva conservadora: 65.536 tokens de input por request × 72 × US$ 0,042 / 1.000.000 = **US$ 0,198180864**, menor que o cap US$ 0,25. Output foi incluído com tarifa explicitamente zero. Margem inicial após reserva: US$ 0,051819136. Nenhum payload, caso, braço ou limite foi reduzido para caber.

Antes de cada HTTP, custo conhecido mais reserva de TODAS as chamadas restantes e de eventual usage desconhecido precisou caber no cap; os 72 registros mostram condição segura. Usage faltante não seria zero e acionaria HOLD. No final: custo estimado US$ 0,005957364; margem estimada US$ 0,244042636; reserva remanescente zero. Não existe evidência direta de cobrança: **BILLED_UNKNOWN**, billed_cost=null.

## 6. Estrutura por braço e erros

| Braço | Válidos / transportes | Inválidos / transportes | Operacionais |
| --- | --- | --- | --- |
| FULL | 32/36 (88,89%) | 4/36 (11,11%) | 0 |
| REDUCED | 36/36 (100%) | 0/36 (0%) | 0 |

Ganho estrutural observado REDUCED: quatro envelopes, 11,11 pontos percentuais. FULL inválido sempre normalized_verdict=null e result=null, sem inclusão em métricas semânticas. Erros classificados são dados do experimento; não provocaram reenvio. Não houve falha estrutural desconhecida.

| Sequence | Caso | Braço | Código | Subcódigo |
| --- | --- | --- | --- | --- |
| 28 | GG0-14 | ARM_FULL | INVALID_PROBABILITIES | PROBABILITY_SUM_MISMATCH |
| 44 | GG0-22 | ARM_FULL | INVALID_PROBABILITIES | PROBABILITY_SUM_MISMATCH |
| 48 | GG0-24 | ARM_FULL | INVALID_PROBABILITIES | PROBABILITY_SUM_MISMATCH |
| 72 | GG0-36 | ARM_FULL | INVALID_PROBABILITIES | PROBABILITY_SUM_MISMATCH |

Os quatro casos FULL acima tiveram PROBABILITY_SUM_MISMATCH no diagnóstico congelado. Não se inferiu o mecanismo interno do provider e não se reinterpretou o HOLD histórico S2-B. Evidência: [errors.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/errors.json).

## 7. Macro por braço — denominadores elegíveis

| Métrica | FULL | REDUCED |
| --- | --- | --- |
| Validade estrutural | 32/36 (88,89%) | 36/36 (100%) |
| Acurácia macro nos envelopes válidos | 28/32 (87,5%) | 31/36 (86,11%) |
| False accept em REJECT esperado | 1/15 (6,67%) | 1/18 (5,56%) |
| False accept crítico | 0/11 (0%) | 0/14 (0%) |
| False accept ordinário | 1/4 (25%) | 1/4 (25%) |
| False reject em APPROVE esperado | 0/12 (0%) | 0/12 (0%) |
| False reject parcial positiva | 0/3 (0%) | 0/3 (0%) |
| False reject positiva não parcial | 0/9 (0%) | 0/9 (0%) |
| INCONCLUSIVE correto | 2/5 (40%) | 2/6 (33,33%) |
| Unsafe APPROVE em INCONCLUSIVE | 0/5 (0%) | 0/6 (0%) |
| REJECT em INCONCLUSIVE | 3/5 (60%) | 4/6 (66,67%) |
| INCONCLUSIVE em positiva | 0/12 (0%) | 0/12 (0%) |
| INCONCLUSIVE em negativa | 0/15 (0%) | 0/18 (0%) |

| Cobertura válida / planejada | FULL | REDUCED |
| --- | --- | --- |
| positive | 12/12 (100%) | 12/12 (100%) |
| negative | 15/18 (83,33%) | 18/18 (100%) |
| inconclusive | 5/6 (83,33%) | 6/6 (100%) |
| critical | 11/14 (78,57%) | 14/14 (100%) |
| overall | 32/36 (88,89%) | 36/36 (100%) |

As acurácias 28/32 e 31/36 têm denominadores diferentes e não demonstram vantagem macro de um braço. Nos pares BOTH_VALID, ambos acertam 28/32 e falham nos mesmos quatro. O único false accept de cada braço é GG0-29, ordinário; zero false accepts críticos observados significa 0/11 FULL e 0/14 REDUCED, sem esconder os três críticos FULL inválidos. Nenhum false reject parcial ou não parcial, nem unsafe APPROVE em inconclusivos válidos.

Classificações congeladas G0: **FULL=NAO_PROMISSOR_DIAGNOSTICO; REDUCED=NAO_PROMISSOR_DIAGNOSTICO**, pelo APPROVE em REJECT esperado. A maior cobertura REDUCED não apaga essa falha.

## 8. GG0-29 individual

Expected **REJECT**. FULL: **STRUCTURALLY_VALID / APPROVE**, confidence 0,25. REDUCED: **STRUCTURALLY_VALID / APPROVE**, confidence 0,33. Resultado congelado: **D_MACRO_FAILURE_PERSISTS**. A resposta parcial omite a ressalva essencial do encargo ainda não confirmado; o oracle não foi alterado. Não há sinal favorável a nenhum braço neste caso. Confidence baixa não corrige verdict nem retira o false accept. Evidência: [gg0-29-result.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/gg0-29-result.json).

## 9. Quatorze negativos críticos

| Caso | Expected | FULL status / verdict | REDUCED status / verdict | FULL correto | REDUCED correto | Regressão material REDUCED |
| --- | --- | --- | --- | --- | --- | --- |
| GG0-13 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-14 | REJECT | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | NÃO ELEGÍVEL | SIM | SEM COBERTURA PAREADA |
| GG0-15 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-16 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-17 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-18 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-19 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-20 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-21 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-22 | REJECT | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | NÃO ELEGÍVEL | SIM | SEM COBERTURA PAREADA |
| GG0-23 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-24 | REJECT | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | NÃO ELEGÍVEL | SIM | SEM COBERTURA PAREADA |
| GG0-27 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |
| GG0-30 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | SIM | SIM | NÃO |

Críticos BOTH_VALID: 11/14; sem cobertura FULL em GG0-14, GG0-22 e GG0-24. Nos 11 comparáveis ambos rejeitaram corretamente, sem regressão material pareada observada. Nos três restantes REDUCED rejeitou corretamente, mas materialidade comparativa é indisponível, não PASS. Evidência: [critical-sentinels-results.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/critical-sentinels-results.json).

## 10. Seis inconclusivos

| Caso | Expected | FULL status / verdict | REDUCED status / verdict | FULL correto | REDUCED correto | Regressão material REDUCED |
| --- | --- | --- | --- | --- | --- | --- |
| GG0-31 | INCONCLUSIVE | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | NÃO | NÃO | NÃO |
| GG0-32 | INCONCLUSIVE | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | NÃO | NÃO | NÃO |
| GG0-33 | INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | SIM | SIM | NÃO |
| GG0-34 | INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | SIM | SIM | NÃO |
| GG0-35 | INCONCLUSIVE | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | NÃO | NÃO | NÃO |
| GG0-36 | INCONCLUSIVE | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | NÃO ELEGÍVEL | NÃO | SEM COBERTURA PAREADA |

BOTH_VALID: 5/6. GG0-33/34 corretos nos dois; GG0-31/32/35 overreject nos dois; GG0-36 é inválido FULL e REJECT REDUCED. O último é erro observado novo REDUCED sem contraparte FULL elegível, e não prova de regressão material pareada. Unsafe APPROVE=0/5 FULL e 0/6 REDUCED. Cobertura insuficiente prevalece. Evidência: [inconclusive-sentinels-results.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/inconclusive-sentinels-results.json).

## 11. Três parciais positivas

| Caso | Expected | FULL status / verdict | REDUCED status / verdict | FULL correto | REDUCED correto | Regressão material REDUCED |
| --- | --- | --- | --- | --- | --- | --- |
| GG0-04 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | SIM | SIM | NÃO |
| GG0-11 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | SIM | SIM | NÃO |
| GG0-12 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | SIM | SIM | NÃO |

Três pares BOTH_VALID, todos APPROVE corretos, false reject parcial 0/3 nos dois. REDUCED não ganhou validade por rejeitar todas as respostas. Demais nove positivas válidas em ambos também corretas. Evidência: [partial-positive-results.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/partial-positive-results.json).

## 12. Trinta e seis pares causais FULL × REDUCED

| Estado estrutural | Ocorrências / 36 |
| --- | --- |
| BOTH_VALID | 32/36 (88,89%) |
| FULL_ONLY_VALID | 0/36 (0%) |
| REDUCED_ONLY_VALID | 4/36 (11,11%) |
| NEITHER_VALID | 0/36 (0%) |

| Estado semântico entre BOTH_VALID | Ocorrências / 32 |
| --- | --- |
| BOTH_CORRECT | 28/32 (87,5%) |
| FULL_CORRECT_REDUCED_WRONG | 0/32 (0%) |
| REDUCED_CORRECT_FULL_WRONG | 0/32 (0%) |
| BOTH_WRONG_SAME | 4/32 (12,5%) |
| BOTH_WRONG_DIFFERENT | 0/32 (0%) |

Concordância de verdict: **32/32 (100%)**, restrita aos envelopes íntegros nos dois braços; cobertura semântica **32/36**.

| Caso | Expected | FULL status / verdict | REDUCED status / verdict | Estrutura | Semântica |
| --- | --- | --- | --- | --- | --- |
| GG0-01 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-02 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-03 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-04 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-05 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-06 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-07 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-08 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-09 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-10 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-11 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-12 | APPROVE | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_CORRECT |
| GG0-13 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-14 | REJECT | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | REDUCED_ONLY_VALID | NÃO ELEGÍVEL |
| GG0-15 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-16 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-17 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-18 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-19 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-20 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-21 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-22 | REJECT | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | REDUCED_ONLY_VALID | NÃO ELEGÍVEL |
| GG0-23 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-24 | REJECT | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | REDUCED_ONLY_VALID | NÃO ELEGÍVEL |
| GG0-25 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-26 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-27 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-28 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-29 | REJECT | STRUCTURALLY_VALID / APPROVE | STRUCTURALLY_VALID / APPROVE | BOTH_VALID | BOTH_WRONG_SAME |
| GG0-30 | REJECT | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_CORRECT |
| GG0-31 | INCONCLUSIVE | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_WRONG_SAME |
| GG0-32 | INCONCLUSIVE | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_WRONG_SAME |
| GG0-33 | INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | BOTH_VALID | BOTH_CORRECT |
| GG0-34 | INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | STRUCTURALLY_VALID / INCONCLUSIVE | BOTH_VALID | BOTH_CORRECT |
| GG0-35 | INCONCLUSIVE | STRUCTURALLY_VALID / REJECT | STRUCTURALLY_VALID / REJECT | BOTH_VALID | BOTH_WRONG_SAME |
| GG0-36 | INCONCLUSIVE | INVALID_RESPONSE / null | STRUCTURALLY_VALID / REJECT | REDUCED_ONLY_VALID | NÃO ELEGÍVEL |

Evidência: [paired-metrics.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/paired-metrics.json). Não foi recuperado verdict local dos FULL inválidos, ainda que uma pergunta isolada pareça utilizável.

## 13. Dezoito pares mínimos — análise separada

Estes são pares de contraste do corpus, distintos dos 36 pares causais entre braços; denominador próprio 18 por braço. PAIR_PASS exige os dois endpoints elegíveis e macro corretos; envelope inválido produz PAIR_INCONCLUSIVE.

| Par mínimo | Casos | FULL | REDUCED |
| --- | --- | --- | --- |
| GMP-01 | GG0-01 × GG0-13 | PAIR_PASS | PAIR_PASS |
| GMP-02 | GG0-02 × GG0-14 | PAIR_INCONCLUSIVE | PAIR_PASS |
| GMP-03 | GG0-03 × GG0-15 | PAIR_PASS | PAIR_PASS |
| GMP-04 | GG0-04 × GG0-16 | PAIR_PASS | PAIR_PASS |
| GMP-05 | GG0-05 × GG0-17 | PAIR_PASS | PAIR_PASS |
| GMP-06 | GG0-06 × GG0-18 | PAIR_PASS | PAIR_PASS |
| GMP-07 | GG0-07 × GG0-19 | PAIR_PASS | PAIR_PASS |
| GMP-08 | GG0-08 × GG0-20 | PAIR_PASS | PAIR_PASS |
| GMP-09 | GG0-01 × GG0-21 | PAIR_PASS | PAIR_PASS |
| GMP-10 | GG0-08 × GG0-22 | PAIR_INCONCLUSIVE | PAIR_PASS |
| GMP-11 | GG0-11 × GG0-23 | PAIR_PASS | PAIR_PASS |
| GMP-12 | GG0-12 × GG0-24 | PAIR_INCONCLUSIVE | PAIR_PASS |
| GMP-13 | GG0-01 × GG0-25 | PAIR_PASS | PAIR_PASS |
| GMP-14 | GG0-01 × GG0-26 | PAIR_PASS | PAIR_PASS |
| GMP-15 | GG0-04 × GG0-27 | PAIR_PASS | PAIR_PASS |
| GMP-16 | GG0-11 × GG0-28 | PAIR_PASS | PAIR_PASS |
| GMP-17 | GG0-04 × GG0-29 | PAIR_FAIL | PAIR_FAIL |
| GMP-18 | GG0-01 × GG0-30 | PAIR_PASS | PAIR_PASS |

FULL: **14 PASS, 1 FAIL, 3 INCONCLUSIVE / 18**. REDUCED: **17 PASS, 1 FAIL, 0 INCONCLUSIVE / 18**. GMP-17 (GG0-04 × GG0-29) falha em ambos; os três inconclusivos FULL decorrem dos negativos inválidos GG0-14/22/24. Evidência: [minimal-pair-metrics.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/minimal-pair-metrics.json).

## 14. Comparação congelada e seus gates

| Gate obrigatório | Observado | Resultado |
| --- | --- | --- |
| 72 finalizadas, COMPLETED, 0 operacional/IN_PROGRESS/NOT_STARTED | 72/72; COMPLETED; 0/0/0 | PASS |
| Modelo exato e usage conhecido | 72/72; 72/72 | PASS |
| BOTH_VALID ≥30 | 32/36 | PASS |
| Todos os 14 críticos BOTH_VALID | 11/14; faltam GG0-14/22/24 | FALHA |
| Todos os seis inconclusivos BOTH_VALID | 5/6; falta GG0-36 | FALHA |
| Três parciais positivas BOTH_VALID | 3/3 | PASS |
| GG0-29 BOTH_VALID | SIM | PASS |
| ≥8 positivos BOTH_VALID | 12/12 | PASS |

**COMPARATIVE_RESULT=COMPARISON_INCONCLUSIVE**, reason=COVERAGE_OR_OPERATIONAL_CONTROL, coverage_sufficient=false. A razão geral é o código congelado; neste run a causa concreta é cobertura, sem falha operacional. Nenhum threshold foi flexibilizado.

material_worse_reduced=[]; material_worse_full=[] nos pares comparáveis. new_wrong_reduced=[GG0-36], new_wrong_full=[]; isto não converte caso FULL inválido em acerto FULL. Não declarar REDUCED_FAVORED, FULL_FAVORED ou NO_CLEAR_WINNER. Maior validade isolada não resolve a pergunta causal completa. general_superiority_proven=false. Evidência: [comparison-result.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/comparison-result.json).

## 15. Usage, custo e latência

| Telemetria | FULL | REDUCED | Total |
| --- | --- | --- | --- |
| Usage conhecido / chamadas | 36/36 | 36/36 | 72/72 |
| Usage desconhecido | 0 | 0 | 0 |
| Input tokens | 90649 | 51193 | 141842 |
| Output tokens | 22106 | 1730 | 23836 |
| total_tokens fornecido | null | null | null |
| Custo estimado US$ | 0,003807258 | 0,002150106 | 0,005957364 |
| Billing | BILLED_UNKNOWN | BILLED_UNKNOWN | BILLED_UNKNOWN |

Não se soma input/output no campo total_tokens: o provider não o forneceu. Custo calculado com input observado × 42 nanodólares; output gratuito. Pequenos resíduos binários nos JSONs por braço não alteram o total inteiro em nanodólares. O custo dos 36 pares conhecidos soma US$ 0,005957364; custos individuais preservados em cost.json/pair_details. REDUCED usou menos tokens e teve menor estimativa de custo neste run; isso foi medido, não inferido pela quantidade de perguntas.

| Latência de transporte (ms) | n | min | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- |
| FULL | 36 | 244 | 261 | 290 | 483 |
| REDUCED | 36 | 234 | 252.5 | 280 | 333 |
| Δ pareado REDUCED − FULL | 36 | -209 | -7 | 10.25 | 25 |

Quantis LINEAR_N_MINUS_1. Δp50 pareado é −7 ms; não confundir com a subtração dos p50 marginais. Latência medida no transporte; o tempo de persistência, verificações locais e espaçamento não integra esses quantis. Todos os 36 deltas e custos pareados estão preservados em [latency.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/latency.json) e [cost.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/cost.json).

## 16. Ordem, carryover e confidence

Ordem exata B0: GG0-01→GG0-36, adjacentes; ímpares FULL→REDUCED, pares REDUCED→FULL, concorrência 1, sem reagendamento.

| Estrato | Braço | Válidos / 18 | Inválidos | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| ODD_FULL_REDUCED | ARM_FULL | 18/18 | 0 | 260 | 301,1 |
| ODD_FULL_REDUCED | ARM_REDUCED | 18/18 | 0 | 252,5 | 274,6 |
| EVEN_REDUCED_FULL | ARM_FULL | 14/18 | 4 | 262,5 | 284 |
| EVEN_REDUCED_FULL | ARM_REDUCED | 18/18 | 0 | 253 | 293,05 |

Todos os quatro inválidos FULL ocorreram nos casos pares, quando FULL veio em segundo. A paridade também define o conjunto de casos; uma repetição sem randomização adicional não separa dificuldade do caso, posição, variação temporal ou carryover. Não atribuir causalidade forte de latência/estrutura à posição ou superioridade geral ao REDUCED.

Confidence é exclusivamente descritiva, sem threshold novo nem alteração de scorer. GG0-29: 0,25 FULL / 0,33 REDUCED, ambos incorretos. GG0-36 REDUCED: 0,62, overreject; o FULL inteiro é inelegível. Evidências completas: [confidence-analysis.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/confidence-analysis.json) e [order-analysis.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/order-analysis.json).

## 17. Persistência, privacidade e limites

Antes de cada HTTP, stage e ledger IN_PROGRESS foram gravados com run/sequence/case/arm/request SHA, referência humana, preço, budget e attempt_count=1; os 72 recibos indicam file_synced=true, atomic_rename=true e readback_verified=true. **fsync de diretório UNSUPPORTED_ON_PLATFORM no Windows** está explicitado: não se promete durabilidade de diretório que a plataforma não forneceu. Crash com outcome desconhecido proíbe reenvio; nenhum crash ocorreu neste run.

Raw foi transitório e descartado após hash/parser/projeção allowlisted; somente raw_sha256 e projeções tipadas persistem. Sem raw body, reasoning, prompt echo, headers sensíveis ou chave nos artefatos. Somente a linha autorizada Angario_teste do mecanismo local foi interpretada em memória, sem carregar as demais variáveis do produto. Privacy scan antes da primeira chamada, após cada stage e ao final: **PASS**, zero matches; conferência final por valor da credencial sem exposição. Casos somente sintéticos congelados, sem dados pessoais reais.

Operacionais, unknown structural, model mismatch, usage ausente, budget stop, privacy fail e retry: **zero**. Evidências: [privacy-check.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/privacy-check.json), [ledger.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/ledger.json), [lock.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/lock.json), [postflight-verification.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/postflight-verification.json) e índice [hashes.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/hashes.json).

## 18. Preservação, produto e validações finais

Conferidos **369 arquivos históricos diretos, 13 listas de namespaces, verificações transitivas e 769 arquivos do produto**, sem divergência. G0/G1/G2-A/B0, S0–S2, parser/wrapper/adapters/scorers/oracles, locks, reports e runs anteriores preservados. O HOLD S2-B e sua causa NÃO DETERMINADA/NÃO RECUPERÁVEL continuam inalterados. O índice original dos 98 artefatos do run foi validado e preservado em [execution-hashes.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/execution-hashes.json) antes de acrescentar esta auditoria documental.

[Propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md) atualizada somente por APPEND. Prefixo histórico: 43600 bytes; SHA256 741f8625180f730634ad834bddd52b4e9462330f05be640063310d6943ab51e2. Prova do prefixo e hashes dos documentos: [propagation-preservation.json](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/propagation-preservation.json). Nenhuma segunda Tabela Mestre criada.

**Angario/web/schema/RLS/prompts Production inalterados. OpenAI=0, Production=0 acesso, banco=0 acesso, Radar=0 acesso, WhatsApp=0 acesso.** Nenhum endpoint, UI, flag, worker, cron, queue, shadow, integração ou deploy. PROJECT.md não exigiu atualização, pois não houve decisão arquitetural permanente do produto. Sem commit, push, merge ou PR.

Validação real exercitada: as 72 chamadas autorizadas ao JEV, com dados sintéticos e contrato congelado. Validação automatizada: certificações acima, recalculo exato dos scorers congelados e auditoria dos 72 stages, hashes/identidades/modelo/usage/preço/budget/durabilidade. Conferência documental final: links locais e whitespace. Build, lint, TypeScript e smoke da interface do Angario não foram executados: o produto não foi alterado nem faz parte desta execução. Nenhum fluxo crítico do produto é declarado validado por este experimento. Não há smoke de produção necessário para fechar este protocolo isolado; eventual integração depende de outra tarefa/autorização e sua própria regressão/smoke seguro.

## 19. Próximo gate e STOP

**Revisão humana offline dos resultados**, sobretudo a persistência de GG0-29, overreject dos inconclusivos e cobertura comparativa faltante. O ganho estrutural observado não demonstra guard melhor; os dois braços continuam negativos. Limitações: n=36, R1, cobertura semântica 32/36, casos sintéticos, ausência de billing direto e impossibilidade de separar carryover/paridade com este desenho.

Não abrir outro lote, repetição, retry ou reconstrução. Qualquer proposta futura deve ser desenhada offline e receber nova autorização humana específica antes de execução. A presente autorização está encerrada. **STOP: 72/72 chamadas, zero chamadas adicionais, zero integração.**
