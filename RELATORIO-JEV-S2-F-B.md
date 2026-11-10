# JEV-S2-F-B — execução real do diagnóstico congelado

PASS JEV-S2-F-B / PASS EXECUTION. A execução do experimento foi válida; qualidade DECISION: NAO_PROMISSOR_DIAGNOSTICO; qualidade VALIDATION: INCONCLUSIVO. Isso não aprova modelo, integração ou lote V2.

Run: jev-s2f-diagnostic-1792258267412-99056db2. Janela UTC: 2026-10-17T17:31:07.614Z a 2026-10-17T17:31:45.505Z. [Manifest](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/manifest.json), [summary](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/summary.json), [ledger](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/ledger.json).

## Autorização, escopo e comportamento anterior

S2-F-A continha somente desenho offline: nove casos, cinco pares mínimos, um controle direcional, doze requests e 24 chamadas propostas. Este checkpoint acrescentou executor isolado, 44 testes e um run real, consumindo exatamente o plano aprovado. Matriz, candidatas, oráculo, expected, rationale, applicability, perguntas, opções, bytes, ordem e repetições permaneceram congelados. Nenhum comportamento de produto foi alterado.

Autorização humana exclusiva do anexo 38e0c0fa-6678-48c3-96ab-0484b1555767, SHA256 a30f5d43dce1ff0078a8e5831fcfdd49186773b6c0e59dff195f4d54f1d5ead8: máximo 24 chamadas, modelo jev-1.14.0, teto TOTAL US$0,08, finalidade JEV-S2-F-B diagnostic only. Autorizações anteriores não foram reutilizadas. [Autorização](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/authorization.json), [plano congelado](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/plan-freeze.json), [oráculo congelado](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/oracle-freeze.json).

## Regressão e validação

Antes de qualquer nova escrita, hashes/listas S0, S1, S2-A/B/C/D/E/F-A conferidos. Primeira execução: 248 PASS / 0 FAIL. Após criar o executor: 292 PASS / 0 FAIL = 248 anteriores + 44 novos, sem rede ou credenciais. Cobertura inclui cap, orçamento, preço, modelo, usage, HTTP, DNS/TLS/timeout, vazio, structural unknown, probabilities classificado, privacidade, persistência pré-HTTP, escrita atômica, crash, ausência de retry/retomada, locks, preservação, aliases, denominadores, controles, falsos aceites/rejeições, pares e R1/R2. [Certificação](experiments/jev/s2fb/certification.json), [executor congelado](experiments/jev/s2fb/freeze.json), [limites e critérios](experiments/jev/s2fb/README.md).

O fluxo real isolado JEV foi exercitado nas 24 chamadas autorizadas. Releitura dos 24 stages, hashes, ordem, identidades e guard financeiro conferida. Métricas de action, dez campos D, completude, verdict, onze dimensões V, false accept/reject, recall histórico e reasons comparadas com o scorer V2 congelado; denominador cartesiano do agregado não foi usado. git diff --check, whitespace dos novos arquivos, links locais e diff do produto conferidos.

## Preço, quantidade, uso e latência

Preço reconfirmado em 2026-10-17T17:25:35Z na [fonte oficial TypeSafe](https://docs.typesafe.ai/models): entrada US$0,042/Mtok; saída gratuita. Limites padrão 64k/request e 32k/pergunta. Long-context é desativado por padrão; o header de opt-in ampliaria ambos a 262k e não foi enviado. [Preço preservado](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/pricing.json).

Reserva conservadora: 65.536 tokens por chamada = US$0,002752512; 24 reservas = US$0,066060288, inferior a US$0,08. Antes de cada HTTP, custo conhecido mais reserva seguinte <= cap, com evidência em budget_before_send de cada stage. Concurrency 1; nenhum SDK, warm-up, health/model probe, redirect, retry, best-of ou auto-resume. [Orçamento](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/budget.json).

| Medição | Resultado |
| --- | --- |
| Planejadas / iniciadas / transportes concluídos | 24 / 24 / 24 |
| DECISION / VALIDATION | 10 / 14 |
| NOT_STARTED / IN_PROGRESS ao final | 0 / 0 |
| Modelo solicitado e observado | jev-1.14.0 nas 24; zero mismatch |
| Usage conhecido | 24/24; nenhum token ausente tratado como zero |
| Entrada / saída | 53.232 / 17.218 tokens |
| total_tokens do provedor | Não fornecido: null em 24/24; soma derivada entrada+saída = 70.450 |
| Custo estimado | US$0,002235744; cobrança efetiva BILLED_UNKNOWN |
| Teto / margem estimada | US$0,08 / US$0,077764256 |
| Latência HTTP min / p50 / max | 245 / 258,5 / 419 ms |

## Estrutura e probabilities

| Grupo | Envelopes válidos | Inválidos | SUM_MISMATCH | CHOICE_MISMATCH |
| --- | --- | --- | --- | --- |
| Overall | 24/24 | 0/24 | 0/24 | 0/24 |
| DECISION | 10/10 | 0/10 | 0/10 | 0/10 |
| VALIDATION | 14/14 | 0/14 | 0/14 | 0/14 |
| 12 perguntas | 14/14 | 0/14 | 0/14 | 0/14 |
| 24 perguntas | 4/4 | 0/4 | 0/4 | 0/4 |
| 25 perguntas | 6/6 | 0/6 | 0/6 | 0/6 |

414 perguntas retornadas, todas aceitas individualmente; por question_id, zero falha/retornos observados, com denominadores próprios em [structural-analysis.json](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/structural-analysis.json). Nenhum outro subcódigo observado. Cada pergunta preserva contagens/sets, tipos, finitude, mínimo/máximo, soma/delta, choice, máximas/tie, confidence e status em [probabilities-summary.json](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/probabilities-summary.json). Ausência de subcódigo é null, não correção. Parser original e wrapper S2-C permaneceram equivalentes, sem coerção, arredondamento ou normalização.

Q4: ASSOCIAÇÃO DESCRITIVA SOMENTE. Este lote não isola contagem de perguntas; zero evento em 24 chamadas não demonstra eliminação do risco nem causalidade. S2-D/E e S2-B não entram nestes denominadores.

## DECISION

| Campo | Acertos / D válidas |
| --- | --- |
| action | 10/10 |
| intent | 10/10 |
| enough_context | 10/10 |
| relevant_current_facts | 8/10 |
| relevant_historical_facts | 10/10 |
| missing_information | 6/10 |
| applicable_protocols | 10/10 |
| prohibited_assumptions | 4/10 |
| entity_resolution | 10/10 |
| temporal_resolution | 4/10 |

Action 10/10; micro 82/100; completude simultânea dos dez campos 2/10. Aliases T1/T2, E1/E2 e P1/P2 contam uma única DECISION por repetição.

T1/T2: selecionou atual e histórico corretos em ambos R, mas omitiu HISTORICAL_AS_CURRENT, SUPERSEDED_FACT e HISTORICAL_SUPPORT_REQUIRED. E1/E2: fonte A selecionada corretamente, mas CROSS_ENTITY contextual omitido nos dois R. P1/P2: COMMERCIAL_RATE identificado com lacuna extra AUTHORIZED_PROPERTY_CONTEXT; INVENT_COMMERCIAL omitido; UNKNOWN_CURRENT_STATE marcado além do esperado. E4: dois resultados integralmente corretos, sem risco ou lacuna fabricados.

H1: repetiu nos dois R a seleção indevida f-t-atual-A cujo valor é null, acrescentou CURRENT_FACT e lacuna AUTHORIZED_PROPERTY_CONTEXT. Recuperou o histórico exigido e UNKNOWN_CURRENT_STATE/HISTORICAL_SUPPORT_REQUIRED. O erro material repetido de fonte atual em FREQ-10 satisfaz o critério congelado de NAO_PROMISSOR_DIAGNOSTICO. Esses registros são decisões tipadas; não há evidência de texto gerado afirmando literalmente o passado como presente.

Histórico: seleção admissível 10/10; required_history_recall 4/4, somente IDs obrigatórios de T1/T2 compartilhada e H1. Seleção irrelevante 0/4. O denominador obrigatório é quatro exposições de ID, sem histórico opcional para inflar recall. [DECISION](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/decision-metrics.json), [histórico](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/history-metrics.json).

## VALIDATION, controles e falsos resultados

Verdict 14/14, cobertura 14/14. Todos os oito negativos foram REJECT, todos os seis positivos APPROVE. False accept 0/8; false reject 0/6; previsão INCONCLUSIVE 0/14. Cobertura negativa 8/8, positiva 6/6. T2, E2 e P2: dois APPROVE corretos cada. Os controles positivos foram efetivamente testados.

| Dimensão | Acertos / V válidas |
| --- | --- |
| grounding | 14/14 |
| factuality | 14/14 |
| protocol | 8/14 |
| temporal | 8/14 |
| entity | 14/14 |
| coverage | 14/14 |
| omission | 14/14 |
| unsupported_assumption | 14/14 |
| cross_entity | 2/14 |
| safety | 14/14 |
| partial_answer_allowed | 14/14 |

E1 B→A e E3 A→B: ambos REJECT, grounding/factuality/entity FAIL corretos, porém cross_entity PASS em vez de FAIL, temporal FAIL em vez de PASS e protocol FAIL em vez de NOT_APPLICABLE nos dois R. T1/T2 e P1/P2 retornaram cross_entity NOT_APPLICABLE onde o oráculo exige PASS. E2 teve todos os campos corretos.

P1 inventada: REJECT; protocolo FAIL, factuality INCONCLUSIVE e partial_answer_allowed PASS corretos. P2 parcial delimitada: APPROVE e partial_answer_allowed PASS corretos, mas protocol PASS em vez de NOT_APPLICABLE. P1 teve temporal FAIL indevido. Permissibilidade parcial P1/P2: 4/4, separada do verdict. Nenhuma candidata foi ajustada após resposta.

Reasons preservam somente dimensões FAIL retornadas: precisão 46/56, recall 46/50. Aplicabilidade por dimensão/caso preservada no [oráculo](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/oracle-freeze.json) e em [validation-metrics.json](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/validation-metrics.json). Verdict correto não compensa erros dimensionais: classificação INCONCLUSIVO conforme freeze.

## Pares e consistência R1/R2

| Par | R1 | R2 |
| --- | --- | --- |
| PAIR-T | PAIR_FAIL | PAIR_FAIL |
| PAIR-E | PAIR_FAIL | PAIR_FAIL |
| PAIR-P | PAIR_FAIL | PAIR_FAIL |
| PAIR-H | PAIR_FAIL | PAIR_FAIL |
| PAIR-E-ISOLATED | PAIR_FAIL | PAIR_FAIL |

Cobertura 10/10 exposições de par; PASS 0/10, zero PAIR_INCONCLUSIVE. Os dois endpoints precisavam de todos os campos corretos, além de válidos. Acertar apenas a oposição de verdict não aprova o par. Controle E1/E3 separado: 0/2 completos corretos; não é par de alteração única. [Pares](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/pair-metrics.json).

R1/R2: 12/12 SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION; EXACT_MATCH 0/12; MATERIAL_DISAGREEMENT 0/12; STRUCTURAL_DISAGREEMENT 0/12; incompletos 0. Choices e resultados sem confidence foram iguais; vetores/confidence variaram. A consistência repete também os erros, sem maioria ou escolha posterior. [Comparação](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/repetition-comparison.json).

## Confidence e eventos críticos

44 divergências por pergunta entre 414 perguntas em envelopes válidos. Confidence sempre da própria pergunta. Quartil 75 empírico por task/question_id: sete erros na faixa superior relativa, dos quais seis materiais. Isso não significa confiança absoluta alta: o q75 de cross_entity é 0,57 em n=14; não há threshold operacional.

| Caso/R | Pergunta | Choice incorreto | Confidence | q75 / n |
| --- | --- | --- | --- | --- |
| H1/R2 | missing_AUTHORIZED_PROPERTY_CONTEXT | YES | 0.9 | 0.9 / 10 |
| E1/R1 | cross_entity | PASS | 0.6 | 0.57 / 14 |
| E1/R2 | cross_entity | PASS | 0.57 | 0.57 / 14 |
| P2/R1 | cross_entity | NOT_APPLICABLE | 0.59 | 0.57 / 14 |
| P2/R2 | cross_entity | NOT_APPLICABLE | 0.72 | 0.57 / 14 |
| E3/R1 | cross_entity | PASS | 0.57 | 0.57 / 14 |
| E3/R2 | cross_entity | PASS | 0.57 | 0.57 / 14 |

Prioridades S2-E reincidiram: prohibited_INVENT_COMMERCIAL NO em P1/P2 compartilhada, confidence 0,94/0,96; temporal FAIL em E1 e E3 com 0,93 em ambos R. São valores nativos numericamente elevados, embora abaixo de seus q75 locais (0,98 e 0,9825). Mantidos visíveis sem mudar o critério congelado. H1 current_0 YES incorreto teve confidence 0,06/0,02; CURRENT_FACT YES indevido, 0,96/0,94. Não usar action 0,98 como confiança desses campos.

20 CRITICAL_SEMANTIC_EVENT em 14 stages distintos, com categorias que podem ocorrer no mesmo stage: CONTEXT_RISK_ERROR 6; TEMPORAL_ERROR 6; WRONG_SOURCE_SELECTION 2; HIGH_CONFIDENCE_MATERIAL_ERROR 6. False accepts/rejects materiais: zero neste run. Eventos descrevem seleção/classificação e não ações externas executadas. Erros semânticos não interromperam o diagnóstico. [Confidence](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/confidence-analysis.json), [eventos](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/critical-events.json).

## Privacidade, preservação e áreas impactadas

Requests 100% sintéticos. Somente a linha Angario_teste do mecanismo local foi interpretada; credencial nunca impressa, salva ou carregada no ambiente. Scan antes de cada HTTP, após cada stage e no final, incluindo a credencial exata durante o run. PASS: zero raw persistido, zero secret, prompt/contexto retornado, reasoning ou header salvo. SHA256 bruto e projeção tipada/números allowlisted preservados; nenhum dado pessoal real. [Privacy check](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/privacy-check.json), [erros](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/errors.json), [hashes](experiments/jev/results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/hashes.json).

S0/S1/S2-A/B/C/D/E/F-A, freezes, requests, scorer, parser, adapter, wrapper, oráculos, ledgers, autorizações, locks, stages e relatórios preservados por hash/lista antes e depois. S2-B mantém HOLD: 4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL, 176 NOT_STARTED; causa histórica NÃO DETERMINADA / NÃO RECUPERÁVEL. Nenhuma falha deste run é atribuída ao quarto S2-B. S2-D/E intactos; métricas comparáveis somente descritivamente.

Área impactada: experimentos locais JEV, relatório novo e append da propagação. Angario INALTERADO; web INALTERADO; OpenAI 0 chamadas; Production NÃO ACESSADA; banco NÃO ACESSADO; Radar NÃO ACESSADO; WhatsApp NÃO ACESSADO. Sem alteração visual, schema, autenticação/RLS, dados ou fluxo operacional. Sem commit, push, merge, PR ou deploy. Ponto de rollback: remover somente os novos fontes/relatório de S2-F-B se desejado, preservando artefatos de execução e locks consumidos para impedir reenvio acidental; nenhuma reversão de produto necessária.

## Limitações, validação manual e próximo gate

Amostra sintética pequena, duas repetições por request, sem inferência estatística ou causal sobre Q4. Total tokens não veio do provedor; a soma derivada não substitui o campo ausente. Custo estimado pelo preço público, sem consulta à cobrança efetiva. fsync de diretório indisponível na plataforma Windows: fsync de arquivo, rename atômico e releitura SHA foram confirmados e o recibo registra a limitação. Zero eventos estruturais aqui não apaga o histórico S2-B/E.

Não foram executados smoke dos fluxos do Angario, testes pagos OpenAI ou validações de Production/banco/Radar/WhatsApp, pois não pertencem a este escopo e não foram alterados. A validação real autorizada do JEV foi realizada; não há integração de produto criada para smoke manual neste checkpoint. Revisão humana necessária: conferir H1, marcação contextual de riscos, erros dimensionais A/B e critérios dos pares usando os artefatos sanitizados. Qualquer experimento seguinte exige plano e autorização próprios.

Recomendação de próximo gate: decisão humana sobre continuar investigação offline das divergências tipadas e sua compatibilidade contratual, preservando o oráculo atual. Não promover DECISION; manter VALIDATION inconclusivo apesar dos verdicts corretos. Não iniciar V2 completo, S3, integração, provider swap, JEV-VISION ou qualquer frente paga. STOP.
