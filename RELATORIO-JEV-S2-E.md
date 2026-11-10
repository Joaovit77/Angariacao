# JEV-S2-E — lote diagnóstico semântico controlado

Data: 17/10/2026. **PASS da execução. DECISION: INCONCLUSIVO. VALIDATION: INCONCLUSIVO. PRODUCTION: NÃO INTEGRADO.**

Run independente: `jev-s2e-semantic-1792255143175-41551ba6`.

[Artefatos do run](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/). [Resumo sanitizado](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/summary.json).

Foram iniciadas e completadas **12 chamadas reais**, todas com modelo `jev-1.14.0` e usage conhecido. Dez respostas foram estruturalmente válidas; duas tiveram INVALID_PROBABILITIES classificado e continuaram inválidas, sem correção ou retry. Não houve erro operacional, estrutural desconhecido ou violação de privacidade. O PASS significa execução dentro do contrato autorizado; não significa aprovação semântica do modelo.

## Autorização, preço e limites

Autorização explícita no anexo humano S2-E: máximo absoluto 12 chamadas JEV, modelo obrigatório jev-1.14.0, US$0,05 total, somente diagnóstico semântico. SHA-256 do pedido: `bd47ffd8482ae3b5d08a932b9d2ca47ec4d3db51063948864a7b5a34b887f4c5`.

Uma única execução efetiva do runner. Concorrência um, nenhum warm-up, health/model probe inferencial, retry, regeneration, best-of ou majority vote. Autorizações de S2-B/S2-D não foram reutilizadas. Os 12 stages consumiram integralmente a quantidade autorizada, mesmo com saldo financeiro.

Preço oficial reconfirmado em **17/10/2026, 16:32:41Z**: entrada US$0,042/Mtok; saída gratuita; contexto padrão 64k/request e 32k/pergunta, sem long-context. Fontes: [TypeSafe Models](https://docs.typesafe.ai/models) e [contrato API](https://docs.typesafe.ai/api). Snapshot no [pricing.json](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/pricing.json).

Reserva conservadora: 65.536 tokens × US$0,042/Mtok = US$0,002752512 por chamada. Doze reservas = **US$0,033030144**, abaixo de US$0,05. Antes de cada HTTP, guard exigiu custo conhecido + pior caso da próxima chamada <= teto. Usage ausente não seria zero: conservaria reserva e causaria HOLD.

Resultado financeiro: **27.366 tokens de entrada; 8.886 de saída; US$0,001149372 estimados**. Usage conhecido 12/12; total_tokens ausente em todas, preservado null. Cobrança efetiva **BILLED_UNKNOWN**, sem acesso a billing. Execução: 17/10/2026, 13:39:03–13:39:20 America/Sao_Paulo (16:39:03.314Z–16:39:20.603Z).

## Cenários, mini-oráculo e requests congelados

Três cenários novos e inteiramente sintéticos, sem nomes/telefones/endereços/códigos LD ou dados de clientes. A decisão recebe somente fontes e pergunta. A candidata fixa entra exclusivamente na validação. IDs de cenário, expected, rationale, golden ou oracle não entram nos payloads. Nenhuma resposta de R1 alimenta R2.

| Cenário | Dados e candidata fixa de VALIDATION | Esperado independente |
| --- | --- | --- |
| E1_TEMPORAL | Imóvel A tinha uma vaga; fonte atual explícita informa duas. Pergunta pede atual. Candidata: uma vaga | DECISION RESPOND com fonte atual; histórico antigo opcional, sem promoção a atual; estados CURRENT_FACT/SUPERSEDED_FACT/HISTORICAL_SUPPORT_OPTIONAL. VALIDATION REJECT por violação temporal/material |
| E2_ENTITY | A tem valor sintético 1800; B tem 2600. Candidata atribui 2600 a A | DECISION seleciona apenas A; B proibido como fonte de A. VALIDATION REJECT; grounding/factuality/entity/cross_entity FAIL; temporal PASS e protocol NOT_APPLICABLE |
| E3_PARTIAL_INVENTION | Valor de A 1800; taxa precisa ser confirmada; nenhum protocolo. Candidata: valor do cadastro e taxa 7% conforme PROTO-X99 | DECISION responde parte conhecida, registra COMMERCIAL_RATE e risco INVENT_COMMERCIAL. VALIDATION REJECT; protocolo inventado e lacuna mascarada; factuality INCONCLUSIVE quanto ao percentual desconhecido; partial_answer_allowed PASS |

O [mini-oráculo completo](experiments/jev/s2e/oracle-mini.json) contém dez campos decisórios e onze dimensões de validação com justificativas próprias. Usa enums, preparador e scorer V2 congelados, sem alterar a matriz histórica. E1 segue a seleção opcional de histórico de V2-08. Em E2, ambos os valores são atuais; erro numérico/entidade não cria falha temporal automática. Em E3, valor verdadeiro da taxa é desconhecido, mas alegação de fonte inexistente prova violação; parcial continua permitida apesar da candidata inadequada.

Mini-oráculo SHA-256: `6683bd2617a6ad32ed4c45600a3625bac7f6f7d8011cd1dcab2f7d8e89e83357`.

| Cenário / tarefa | Perguntas | SHA-256 do request |
| --- | --- | --- |
| E1 / DECISION | 25 | `d124d3c21883fd86f5812b979051e458a48db444f4b0c49a2b037edb32daf007` |
| E1 / VALIDATION | 12 | `718b0e0a5904eff7603e961ebd89d0fd468f1e7fc41ecac9360ef5d3281e7406` |
| E2 / DECISION | 25 | `8cb6e32f1970f2e753cea7826b176805a8f5d46dc5227295307b7b368a2edbd6` |
| E2 / VALIDATION | 12 | `34a118a58e99cac8b486c84c15de55dc3e9b94952a3392686ab2a586d3c94db0` |
| E3 / DECISION | 24 | `954b939f11a5de82f8298e799ba78de32244f9b3fc556a3f35a793c389298c57` |
| E3 / VALIDATION | 12 | `62b2dc8718de62bd4bc30a323b1a232923279d8219201a736f2faec2e0bd3c2b` |

Duas repetições de bytes idênticos para cada linha. Ordem congelada: E1 D1/D2/V1/V2, E2 D1/D2/V1/V2, E3 D1/D2/V1/V2. [Requests completos sintéticos](experiments/jev/s2e/requests-frozen.json), [freeze de requests do run](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/requests-freeze.json) e [freeze próprio dos fontes](experiments/jev/s2e/freeze.json). Expectativas e critérios conservadores de classificação foram congelados antes da rede; não foram adaptados aos resultados.

## Doze stages e observabilidade estrutural

Todos solicitaram e observaram jev-1.14.0, HTTP 200 e usage conhecido.

| Stage | Entrada / saída | Latência | Resultado estrutural |
| --- | --- | --- | --- |
| E1 / DECISION / R1 | 2.603 / 878 | 427 ms | STRUCTURALLY_VALID |
| E1 / DECISION / R2 | 2.603 / 878 | 268 ms | STRUCTURALLY_VALID |
| E1 / VALIDATION / R1 | 2.087 / 616 | 280 ms | STRUCTURALLY_VALID |
| E1 / VALIDATION / R2 | 2.087 / 616 | 256 ms | INVALID_PROBABILITIES: SUM_MISMATCH |
| E2 / DECISION / R1 | 2.555 / 878 | 267 ms | STRUCTURALLY_VALID |
| E2 / DECISION / R2 | 2.555 / 878 | 263 ms | STRUCTURALLY_VALID |
| E2 / VALIDATION / R1 | 2.021 / 612 | 251 ms | INVALID_PROBABILITIES: CHOICE_MISMATCH |
| E2 / VALIDATION / R2 | 2.021 / 612 | 262 ms | STRUCTURALLY_VALID |
| E3 / DECISION / R1 | 2.415 / 848 | 284 ms | STRUCTURALLY_VALID |
| E3 / DECISION / R2 | 2.415 / 848 | 273 ms | STRUCTURALLY_VALID |
| E3 / VALIDATION / R1 | 2.002 / 611 | 449 ms | STRUCTURALLY_VALID |
| E3 / VALIDATION / R2 | 2.002 / 611 | 316 ms | STRUCTURALLY_VALID |

Latência HTTP/leitura: **mínima 251 ms; p50 270,5 ms; máxima 449 ms**. Não constitui benchmark de desempenho.

- Autorizadas/iniciadas/transportes completos: **12 / 12 / 12**.
- Structurally valid: **10**; INVALID_PROBABILITIES: **2**; classified diagnostics: **2**.
- Structural unknown: **0**; operational errors: **0**; retry/regen/resume: **0**.

### Falhas novas classificadas, sem correção

**E1_TEMPORAL/VALIDATION/R2**, pergunta `partial_answer_allowed`: `PROBABILITY_SUM_MISMATCH`. Vetor preservado `{PASS:0.01, FAIL:0.05, INCONCLUSIVE:0, NOT_APPLICABLE:0.93}`. Soma Binary64 **0.9900000000000001**, delta **-0.009999999999999898**; opções exatas, tipos finitos e choice NOT_APPLICABLE na máxima. O vetor não foi renormalizado. Raw SHA-256: `381aa169475e350a2628de10df45771052d87b48415d4427b3c6d8010fc2fb9b`.

**E2_ENTITY/VALIDATION/R1**, pergunta `protocol`: `PROBABILITY_CHOICE_MISMATCH`. Vetor `{PASS:0.03, FAIL:0.48, INCONCLUSIVE:0.02, NOT_APPLICABLE:0.47}`. Soma **1**, mas choice **NOT_APPLICABLE (0.47)** fica abaixo da máxima **FAIL (0.48)**. Não houve seleção automática da máxima. Raw SHA-256: `123a3af86e82a7546561b03c7428923b03afaa2fdce811be4969ef66c0d8f825`.

Ambas continuaram `INVALID_RESPONSE`, com result null e exclusão integral dos denominadores semânticos daqueles stages. Continuar o lote foi permitido pelo pedido: modelo correto, usage conhecido, diagnóstico seguro, orçamento/privacidade preservados, sem falha operacional. Não se aproveitaram as outras perguntas desses dois envelopes para elevar a cobertura semântica.

São falhas atuais observadas, **não uma reprodução ou explicação da chamada histórica 4 do S2-B**.

No total foram caracterizados **220 vetores e 602 valores**; option sets exatos em 220/220, nenhum empate. Em inspeção isolada por pergunta, 218 vetores passaram e dois falharam; isso não transforma envelopes inválidos em respostas válidas. Todos os vetores isoladamente aceitos somaram 1; confidence por pergunta variou entre 0,12 e 1. [Probabilities detalhadas](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/probabilities-summary.json).

## DECISION — INCONCLUSIVO

Seis stages decisórios válidos. Action correto não compensou incompletude dos demais campos.

| Métrica / campo | Numerador / denominador |
| --- | --- |
| action_accuracy | 6/6 |
| intent | 6/6 |
| enough_context | 6/6 |
| relevant_current_facts | 6/6 |
| relevant_historical_facts | 6/6 |
| missing_information_accuracy | 4/6 |
| protocol_selection_accuracy | 6/6 |
| prohibited_assumption_accuracy | 0/6 |
| entity_accuracy / entity_resolution | 6/6 |
| temporal_accuracy / temporal_resolution | 2/6 |
| Micro dos dez campos | 48/60 |
| **decision_completeness** | **0/6** |

**E1:** selecionou e1-atual-A nas duas repetições, não selecionou histórico antigo como atual. Histórico vazio é seleção válida porque era opcional. Entretanto omitiu o risco HISTORICAL_AS_CURRENT e os estados SUPERSEDED_FACT/HISTORICAL_SUPPORT_OPTIONAL, retornando somente CURRENT_FACT.

**E2:** escolheu e2-valor-A nas duas repetições e não selecionou e2-valor-B; entity_resolution ENTITY_CORRECT. Não sinalizou o risco CROSS_ENTITY, apesar da presença da fonte concorrente B.

**E3:** RESPOND, enough_context true, fonte e3-valor-A selecionada e lacuna COMMERCIAL_RATE registrada. Também marcou indevidamente AUTHORIZED_PROPERTY_CONTEXT e UNKNOWN_CURRENT_STATE, embora o contexto fosse acessível e o valor atual conhecido. Não sinalizou INVENT_COMMERCIAL. O formato decisório não gera resposta em texto: não se afirma que ele redigiu uma parcial correta.

History selection agregado 6/6 inclui quatro decisões sem histórico e duas com histórico opcional. History required recall **0/0, não aplicável**; nenhuma recuperação de histórico obrigatório foi demonstrada. Nenhum histórico foi selecionado, portanto taxa de seleção irrelevante também é 0/0.

Pelos critérios conservadores congelados, action/entidade/fontes atuais foram corretos, mas nenhum resultado completou os dez campos: **INCONCLUSIVO**. [decision-metrics.json](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/decision-metrics.json).

## VALIDATION — INCONCLUSIVO

Quatro dos seis envelopes válidos para avaliação semântica. **validation_verdict_accuracy 4/4**: todos REJECT, sem atribuir veredicto normalizado aos dois envelopes inválidos.

| Dimensão | Classificação correta / stages válidos |
| --- | --- |
| grounding | 4/4 |
| factuality | 4/4 |
| protocol | 4/4 |
| temporal | 1/4 |
| entity | 4/4 |
| coverage | 4/4 |
| omission | 4/4 |
| unsupported_assumption | 4/4 |
| cross_entity | 0/4 |
| safety | 4/4 |
| partial_answer_allowed | 4/4 |

**E1:** R1 rejeitou o fato superado e marcou grounding/factuality/temporal FAIL, conforme esperado. Retornou cross_entity NOT_APPLICABLE, divergindo do PASS congelado para uma candidata factual com entidade resolvida. R2 inválido por soma, fora das métricas semânticas.

**E2:** R2 rejeitou e marcou entity/grounding/factuality FAIL. Retornou cross_entity PASS apesar da transferência demonstrável de B para A e temporal FAIL embora ambos os valores fossem atuais: duas divergências dimensionais. R1 inválido por choice/max, fora das métricas.

**E3:** ambas rejeitaram a candidata com taxa/protocolo inventados. Protocol, grounding, unsupported_assumption, coverage e omission foram FAIL; factuality INCONCLUSIVE e partial_answer_allowed PASS, como esperado. Também retornaram temporal FAIL e cross_entity NOT_APPLICABLE, divergindo de PASS/PASS congelados. Esses rótulos não foram corrigidos para concordar com o veredicto.

False accept **0/4**; eventos `CRITICAL_SEMANTIC_EVENT`: **0**. Isso não é 0/6: duas respostas indisponíveis estruturalmente não provam rejeição segura. Todas as candidatas eram negativas; **false reject 0/0, não aplicável**. Não há controle de candidata parcial correta para testar falsa rejeição real neste desenho.

Reasons vieram apenas das dimensões FAIL efetivamente retornadas: precisão 22/25, recall 22/23, consistência com as próprias dimensões 4/4. Não se transformou REJECT em tudo FAIL. A cobertura incompleta e as divergências de temporal/cross_entity mantêm **INCONCLUSIVO**. [validation-metrics.json](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/validation-metrics.json), [eventos críticos](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/critical-events.json).

## Consistência e confidence

| Cenário / tarefa | R1 versus R2 |
| --- | --- |
| E1 DECISION | SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION |
| E1 VALIDATION | MATERIAL_DISAGREEMENT por um envelope válido e um inválido |
| E2 DECISION | SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION |
| E2 VALIDATION | MATERIAL_DISAGREEMENT por um envelope inválido e um válido |
| E3 DECISION | SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION |
| E3 VALIDATION | SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION |

Zero EXACT_MATCH; quatro pares preservaram campos/escolhas semânticos, com variações de probabilities/confidence por pergunta. Em E1/E2 VALIDATION, a discordância é estrutural material; não há dois veredictos válidos opostos. Nenhuma repetição foi priorizada e não houve votação. [Comparação detalhada](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/repetition-comparison.json).

Confidence principal de action variou 0,98–1; de verdict nos quatro válidos foi 1. O scorer S1 mede erro primário de action/verdict na faixa do quartil 75 empírico: nenhum erro primário nessa faixa. Isso não certifica confiança na completude nem nas onze dimensões.

**Erros de campo com confidence nativa alta foram observados:** E3 prohibited_INVENT_COMMERCIAL = NO com confidence 0,94 em ambas as repetições, contra YES esperado; E2 VALIDATION/R2 temporal = FAIL com confidence 0,93, contra PASS esperado. Não se criou threshold operacional nem se reclassificou resposta com base em confidence. Divergências do mini-oráculo permanecem visíveis mesmo quando action/verdict acertam.

## Regressão, preservação, privacidade e artefatos

Antes de qualquer escrita S2-E, foram conferidos hashes/listas de S0 até S2-D. Inicialmente **188 testes anteriores PASS**; depois foram adicionados 26 testes S2-E e executado o conjunto completo: **214 PASS, zero falhas, antes da rede**.

Novos testes cobrem cenários/mini-oráculo e enum fechado, IDs, ausência de PII, candidata exclusiva de validation, ausência de oracle no payload, requests iguais entre repetições, limite 12, budget, fonte A/B, temporalidade, parcial, false reject não aplicável, false accept crítico sem interrupção semântica automática, erro de probabilities classificado sem inclusão semântica, hard stops, crash, no auto-resume, privacidade, hash, persistência, comparação R1/R2 e preservação histórica. Testes usaram somente mocks/fixtures; nenhuma credencial ou rede foi acionada por testes.

Comando offline, na raiz:

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs experiments/jev/s2b/runtime.test.mjs experiments/jev/v2/probability-diagnostics/probability-diagnostics.test.mjs experiments/jev/s2d/runtime.test.mjs experiments/jev/s2e/runtime.test.mjs
```

O runner usa somente Angario_teste do mecanismo local conhecido, sem carregar ambiente, imprimir valor, persistir Bearer ou editar .env.local. Antes de cada HTTP: IN_PROGRESS gravado atomicamente com run/stage/scenario/task/repetition/attempt, modelo e request hash. Raw somente transitório para hash, parser estrito e wrapper S2-C; adapter V2 normaliza sem correção. Equality com o parser original foi verificada. Os novos IDs são anexados pelo plano local fora de parsed, mantendo o wrapper congelado intacto.

Privacy scan foi feito antes/depois de cada stage e na finalização, inclusive busca pelo valor exato da credencial sem exibi-lo. Zero ocorrências, zero campo privado detectado, **nenhum raw persistido**. Os 12 hashes de raw estão nos stage-results; conteúdo descartado não é recuperável a partir desses hashes. [privacy-check.json](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/privacy-check.json) certifica os arquivos existentes antes de adicionar a si próprio e hashes; a varredura final conferiu **29 arquivos**. [hashes.json](experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6/hashes.json) contém 28 hashes, excluindo a si mesmo, todos relidos e conferidos.

Run contém manifest, authorization, pricing, budget, oracle-mini-freeze, requests-freeze, ledger, 12 stage-results, probabilities-summary, decision-metrics, validation-metrics, repetition-comparison, critical-events, privacy-check, errors, summary, hashes e execution.lock. O lock exclusivo S2-E permanece; não há retomada automática ou autorização para chamada 13.

Fontes novos: [experiments/jev/s2e/](experiments/jev/s2e/), com cenários, análise, executor, entrada real explícita, testes, README, preservação, preço, requests, mini-oráculo, certificação e freeze próprios. O [snapshot de preservação](experiments/jev/s2e/preservation-before.json) protege 59 arquivos históricos e listas S2-D, além das verificações S0/S1/S2-A delegadas ao verificador congelado. Nenhum fonte histórico foi editado.

S2-B continua **4 iniciadas, 3 normalizadas, 1 FAILED_STRUCTURAL, 176 NOT_STARTED**, ledger/authorization/lock intactos. Causa histórica **NÃO DETERMINADA / NÃO RECUPERÁVEL**. As duas falhas novas não recebem atribuição retroativa ao S2-B. S2-D permanece seis chamadas e seus locks/artefatos/fontes preservados. Denominadores, métricas e autorizações não foram misturados entre runs.

**Produto Angario/web intocado; JEV não integrado; provider e OpenAI inalterados, zero chamadas OpenAI. Banco, Production, Radar e WhatsApp não acessados.** Sem migration, Q1 ou M1c-F. Sem commit/push/merge/PR/deploy. Não se alterou PROJECT.md, pois nenhuma arquitetura permanente de produto mudou. Também conferidos links locais, whitespace, fontes congelados, hashes finais e `git diff --check`.

Não executados: UI/build/testes de produto, novo lote 180, S2-F, S3, billing externo ou comparação com outro provider. O executor isolado teve seu fluxo real exercitado nas 12 chamadas autorizadas; os demais fluxos não estão certificados por este checkpoint.

## Limites e próximo gate

Três cenários, duas repetições, seis decisões respondíveis e seis validações negativas não demonstram robustez completa nem generalização. Há dois envelopes estruturalmente inválidos e quatro validações semânticas aproveitáveis. False reject não foi testado com candidata permitida; histórico obrigatório não foi exigido. Não houve geração de resposta final, ferramentas ou ações de produto. Privacy scan complementa a allowlist, sem prometer garantia universal sobre qualquer futuro payload.

O diagnóstico localizou dois defeitos reais distintos de probabilities e lacunas materiais de metadados/rótulos. O resultado não autoriza relaxar parser, aumentar tolerância, normalizar vetor, corrigir choice, alterar o mini-oráculo após observar respostas ou iniciar integração.

Opções humanas, nenhuma iniciada:

- **A — encerrar o experimento**, preservando as evidências e o HOLD S2-B.
- **B — novo V2 completo do zero**, com nova autorização, orçamento, run e critérios, sem completar as 176 antigas.
- **C — diagnóstico direcionado** às duas falhas estruturais e às divergências temporal/cross_entity/prohibited_assumptions, caso haja interesse em investigar a causa antes de um lote amplo.

**Recomendação: C**, com gate humano separado de desenho, quantidade, custo e perguntas de investigação, antes de considerar um lote completo. Não é autorização para novas chamadas. As 12 desta autorização foram consumidas. Nenhum S2-F, 180, S3, integração ou provider swap inicia automaticamente.

**STOP JEV-S2-E. PASS da execução; DECISION INCONCLUSIVO; VALIDATION INCONCLUSIVO; US$0,001149372 estimados; zero retry; zero raw persistido.**
