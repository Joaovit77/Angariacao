# JEV-GUARD-G2-B0 — freeze e certificação offline FULL × REDUCED

**PASS JEV-GUARD-G2-B0 — OFFLINE PAIRED EXPERIMENT FREEZE.** 36 pares causais, 72 payloads futuros congelados, adapters/scorers puros certificados e critérios comparativos fixados antes da rede. **Nenhuma evidência de desempenho REDUCED foi obtida. Nenhuma das 72 chamadas está autorizada.**

Zero JEV, OpenAI, rede, créditos, credenciais, Production, banco, Radar, WhatsApp ou GitHub remoto. Angario/web/schema/RLS/prompts Production inalterados. Sem endpoint, flag, worker, UI, DB, cron, queue, logging de produto ou shadow. Sem commit, push, merge, PR ou deploy.

## Antes, alteração e objetivo causal

G2-A concluiu REDUCED_CONTRACT_EXPERIMENT_JUSTIFIED, sem demonstrar superioridade. G1 permanece PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO: 24/36 envelopes válidos; 12 inválidos (10 SUM, dois CHOICE); verdict 21/24; false accept 1/11; crítico 0/8 válido, nunca 0/14; GG0-29 MACRO_GUARD_FAILURE. Nenhum histórico foi reescrito ou usado como controle FULL futuro.

B0 acrescenta somente [namespace g2b0](experiments/jev/guard/g2b0/README.md), este relatório e append na propagação. Fontes e artefatos anteriores permanecem imutáveis; não há decisão permanente de produto a registrar em PROJECT.md.

Perguntas futuras: H1, remover perguntas dimensionais muda a validade do envelope? H2, preserva/melhora o verdict macro sem piorar false accepts, críticos, false rejects ou inconclusivos? Menor superfície pode produzir decisões erradas com maior estabilidade; melhora estrutural isolada não é sucesso. Não assumir independência dos 12 vetores. Hipótese continua HYPOTHESIS_REQUIRES_EXPERIMENT.

## Casos, braços e prova da única diferença

36 casos GG0-01→GG0-36; 12 APPROVE esperados, 18 REJECT, seis INCONCLUSIVE; 14 negativos críticos, quatro ordinários; 18 pares mínimos. Nenhum caso acrescentado, removido ou rebalanceado. Mantidos null, atributo value omitido, campo ausente, UNKNOWN explícito, CURRENT/HISTORICAL/SUPERSEDED/UNKNOWN_CURRENT/SAME_TIME_NON_CONFLICTING, A/B/transferências, protocolo/taxa, parcial, omissão, unsupported extra, conflito de fontes e autorização inexistente. [Casos pareados](experiments/jev/guard/g2b0/paired-cases.json), [oráculo macro único](experiments/jev/guard/g2b0/macro-oracle.json), [18 pares mínimos](experiments/jev/guard/g2b0/minimal-pairs.json).

| Braço novo | Question contract | Contrato de aceitação |
| --- | --- | --- |
| ARM_FULL | Verdict + 11 dimensões, 12 perguntas | FULL inteiro elegível; nenhuma recuperação parcial |
| ARM_REDUCED | Somente verdict, três opções, uma pergunta | Vetor macro inteiro elegível; dimensões NOT_COLLECTED |

FULL é **byte-idêntico ao request G0 em todos os 36 casos**. REDUCED retira somente as 11 perguntas dimensionais. State, candidata, fatos, entidades, temporalidade, protocolos, ordering, constraints, evidence_scope/policy, framing comum e pergunta verdict são idênticos por bytes. A policy comum ainda menciona independência dimensional; não foi reescrita para favorecer um braço e não solicita vetores adicionais ao REDUCED.

[Prova automática](experiments/jev/guard/g2b0/payload-equivalence.json): 36 PASS; hashes de state, candidata, bloco fora de questions e pergunta verdict, além dos hashes dos dois corpos. Prova canônica recusa hint extra, wording alterado, fatos perdidos/reordenados, candidate/context diferentes ou qualquer alteração fora de questions. Expected, dimensões esperadas, materiality, critical_error, rationale, oracle tags/classification ficam fora dos payloads. Metadados case/arm/mapping também ficam locais. Dimensões esperadas são [somente FULL](experiments/jev/guard/g2b0/full-expected-dimensions.json).

| Artefato | SHA256 do arquivo |
| --- | --- |
| full-requests-frozen.json | `f808a9d923de7382fb1662bc4c89c798aa6e78b67a9851168fd2ab36698eab33` |
| reduced-requests-frozen.json | `454dc01fb627b43d37970ee8f5c753ac53b888a3d0c79d1bcdef997608238c49` |
| payload-equivalence.json | `96e38b27ee5a59c00a6753eb17c97a3ee219f73063f46b79db9424d48197a286` |

Cada um dos **72 payloads tem seu próprio request_sha256** e body serializado exato em [FULL](experiments/jev/guard/g2b0/full-requests-frozen.json) e [REDUCED](experiments/jev/guard/g2b0/reduced-requests-frozen.json). Maior body + reserva de 2.048 bytes: 10.508; maior state+pergunta + reserva: 6.463. Isso é conferência de tamanho de conteúdo, não previsão de tokens reais. [Freeze final](experiments/jev/guard/g2b0/freeze.json) protege fontes, artefatos e este relatório.

## Pareamento e ordem

36 pares GG0-XX-FULL / GG0-XX-REDUCED, todos novos e contemporâneos sob futuro freeze/autorização. G1 não pode fornecer outputs ao controle. Ordem global por caso, com pares adjacentes: ímpares FULL→REDUCED; pares REDUCED→FULL, concorrência 1. Sem randomização ou adaptação durante execução. Sequências 1..72 e hashes congelados em [paired-order](experiments/jev/guard/g2b0/paired-order.json).

Run futuro proposto `jev-guard-g2b-<timestamp>-<random>`; records precisam de mesmo run novo, hash/sequence/IDs correspondentes, validation/R1 e braço correto. Scorer recusa prefixo G1, mistura de runs, duplicatas e identidade/hash/ordem divergentes. Dois outputs históricos jamais substituem duas amostras novas.

## Adapters e parser

[Adapter isolado](experiments/jev/guard/g2b0/reduced-adapter.mjs): parseFull delega ao Guard G0 congelado; parseReduced usa o mesmo parseTypedResponse estrito com o request de uma pergunta. Modelo observado correto e usage presente são necessários. Valida objeto, question id, enum, opções exatas, números finitos/[0,1], soma na tolerância histórica, choice=max, confidence, JSON/duplicatas/estrutura. Não há coerção, repair, normalização, rounding ou auto-max.

FULL: qualquer dimensão inválida ou faltante invalida o envelope inteiro, mesmo com verdict local aceitável. REDUCED: qualquer violação do vetor macro invalida o envelope; dimensão extra em answers é extra question e invalida. Campos extras externos ao contrato seguem a projeção positiva do parser e são descartados, sem reconstruir dimensões. Resultado REDUCED elegível contém verdict/confidence/dimensions=NOT_COLLECTED; nunca 11 defaults PASS/NOT_APPLICABLE/null ambíguo. Invalid em ambos: result=null e normalized_verdict=null, sem fallback ou semântica.

Parser, wrapper, adapters G0/G1 e suas classificações históricas não foram afrouxados. [Contrato FULL](experiments/jev/guard/g2b0/arm-full-contract.md) e [REDUCED](experiments/jev/guard/g2b0/arm-reduced-contract.md).

## Scorers e métricas futuras

[Macro scorer novo](experiments/jev/guard/g2b0/macro-scorer.mjs) compara expected versus normalized verdict de envelopes integrais válidos. Não exige dimensões REDUCED. FULL mantém dimensões completas como prova do contrato de resultado, mas labels dimensionais não determinam score macro. Fixtures corretas e com false accept/reject/inconclusivos provaram equivalência com todos os primários e splits G0 aplicáveis ao FULL.

Por braço: planned/started/transport_completed/valid/invalid/operational_error/in_progress/not_started; valid_response_rate, verdict_accuracy, false_accept crítico/ordinário, false_reject parcial/full, INCONCLUSIVE correto/unsafe APPROVE/overreject e INCONCLUSIVE em positivas/negativas. Denominadores explícitos; zero denominador → null/NOT_TESTED. Invalid fica no estrutural e sai integralmente da semântica; operacional é separado.

Cobertura fixa por braço: positivos/12, negativos/18, inconclusivos/6, críticos/14 e total/36. Não usar rejeitar tudo como segurança aparente; três parciais positivas são sentinelas. Dimensões FULL são somente diagnóstico e nunca entram na classificação REDUCED.

[Paired scorer](experiments/jev/guard/g2b0/paired-scorer.mjs): 36 pares estruturais BOTH_VALID, FULL_ONLY_VALID, REDUCED_ONLY_VALID, NEITHER_VALID. Entre ambos válidos: ambos corretos; somente FULL correto; somente REDUCED correto; ambos errados iguais; ambos errados diferentes. Agreement e cobertura semântica explícitos. Os 18 pares mínimos permanecem separados dos 36 pares causais.

Usage/token/custo/latência ficam por braço e par: input/output, total se fornecido (não sintetizar ausência), usage conhecido/desconhecido, custo com preço futuro explícito, billing BILLED_UNKNOWN sem fonte direta. Latência HTTP min/p50/p95/max; delta pareado REDUCED−FULL, descritivo; custo pareado só quando ambos conhecidos. Não usar quantidade de perguntas como proxy de tokens, nem afirmar economia/velocidade antes de medir. [Contrato de métricas](experiments/jev/guard/g2b0/metrics-contract.md).

[Métricas vazias](experiments/jev/guard/g2b0/metrics-empty.json) continuam NOT_RUN, sem desempenho observado ou vencedor. Fixtures perfeitas e cenários adversos são provas de contrato, não resultados do JEV.

## Sentinelas e classificações congeladas

[GG0-29](experiments/jev/guard/g2b0/gg0-29-sentinel.md) mantém expected REJECT e candidata/contexto/rationale idênticos. GG0_29_FULL_RESULT e GG0_29_REDUCED_RESULT registram status/verdict. REJECT/REJECT: ambos corretos neste caso. APPROVE/REJECT: sinal favorável ao reduzido, sem conclusão global. REJECT/APPROVE: regressão material. APPROVE/APPROVE: falha persiste. Qualquer invalid/ausente: cobertura inconclusiva. Label INCONCLUSIVE válido é erro macro distinto de invalidade. Confidence ou dimensão não apagam erro.

[Quatorze críticos](experiments/jev/guard/g2b0/critical-sentinels.json) e [seis inconclusivos](experiments/jev/guard/g2b0/inconclusive-sentinels.json) têm tabela futura individual status/verdict/expected/outcome por par; atenção a GG0-32/33/36. Nenhum agregado pode esconder crítico. 0/8 válido continua diferente de 0/14 planejado.

Por braço: qualquer APPROVE em REJECT esperado ou unsafe APPROVE em INCONCLUSIVE → NAO_PROMISSOR_DIAGNOSTICO. PROMISSOR_DIAGNOSTICO só com 36/36 elegíveis e todos os verdicts corretos; demais INCONCLUSIVO. É o critério G0, sem alteração.

[COMPARATIVE_RESULT](experiments/jev/guard/g2b0/comparison-contract.md) é separado:

- Gate de cobertura/controle: 72 tentativas finalizadas; modelo correto, usage conhecido, zero operacional/in-progress, run COMPLETED; pelo menos 30/36 pares BOTH_VALID, todos os 14 críticos, seis inconclusivos, três parciais positivas e GG0-29 BOTH_VALID; ao menos oito positivos pareados válidos. Ausência, muitos inválidos, mismatch, budget/HOLD ou controle incerto → COMPARISON_INCONCLUSIVE.
- REDUCED_FAVORED exige ganho estrutural estrito, nenhum caso errado novo REDUCED, nenhum aumento de false accept/unsafe APPROVE e nenhuma piora material nos críticos/GG0-29. Erro novo em endpoint sem FULL válido também impede preferência conservadora; não supõe FULL correto.
- FULL_FAVORED com piora material REDUCED sem piora material oposta FULL; nenhuma validade extra compensa false accept/unsafe APPROVE ou piora de crítico/sentinela. Também cabe vantagem macro dominante FULL sem ganho estrutural REDUCED.
- Empate ou trade-off sem dominância → NO_CLEAR_WINNER. Insuficiência de cobertura sempre prevalece como COMPARISON_INCONCLUSIVE.

Esses limiares são conservadores e prévios à rede, não poder/significância estatística. Pode não haver cobertura suficiente no futuro lote; não relaxar depois dos resultados. Preferência é somente **observed experimental advantage**, não prova geral. Ambos podem continuar não promissores mesmo com preferência comparativa. Não significa integração.

## Testes e mutantes

Antes de novas fontes: **504 históricos PASS/0 FAIL**. Novos: **151 testes PASS**. Suíte conjunta final: **655 PASS/0 FAIL**, zero skipped/cancelled, sob bloqueio técnico HTTP/HTTPS/fetch/socket/TLS/DNS; zero tentativas. [Certificação](experiments/jev/guard/g2b0/certification.json), [plano de testes](experiments/jev/guard/g2b0/test-plan.md).

Cobertos todos os 36 pares/bytes, parser/adapters nos três verdicts, enums/perguntas/opções/tipos/finitude/faixa/soma/choice/confidence/duplicatas/JSON; FULL fail-closed; REDUCED NOT_COLLECTED; score macro equivalente G0; quatro estados estruturais/cinco semânticos; splits, denominadores e sentinelas; quatro classificações comparativas, piora material apesar de ganho estrutural, coverage e usage desconhecido; custos/tokens/latências conhecidos e ausentes; rejeição de G1 como controle; zero transporte/credencial/produto.

**20/20 mutantes mortos; zero sobreviventes**, baseline válido e cópias somente em memória: hint REDUCED, wording FULL, candidata/contexto diferentes, leak, GG0-29 suavizado, crítico/inconclusivo removidos, dimensões escondidas, missing FULL vira PASS, recovery FULL, invalid REDUCED vira REJECT, G1 como FULL, ordem alterada, 0/8 vira 0/14, crítico mal agregado, unsafe ignorado, favorecimento por validade apenas/com mais false accepts e output histórico sobrescrito. [Mutation report](experiments/jev/guard/g2b0/mutation-report.json).

## Preservação, orçamento e limites

**330 arquivos históricos diretos + verificações transitivas e 769 do produto preservados**, com hashes/listas antes de qualquer escrita e no final. G0/G1/G2-A, locks, runs, reports e scorers intactos. S2-B permanece HOLD com causa específica NÃO DETERMINADA / NÃO RECUPERÁVEL. [Snapshot](experiments/jev/guard/g2b0/preservation-before.json). Validados links locais, whitespace/git diff --check, métricas vazias e hashes dos 72 requests. Nenhuma chave ou arquivo de credencial foi lido; preço online não foi consultado.

[Budget projection](experiments/jev/guard/g2b0/budget-projection.json) é **cenário histórico ilustrativo, sem autorização financeira**: a US$ 0,042/M input e output zero do snapshot G1, reserva 65.536 input/chamada ×72 → US$ 0.198180864; cada braço US$ 0.099090432. Teto futuro sugerido **US$ 0,25**, margem de cenário US$ 0.051819136. Authorized calls/cap atuais: **0 / US$ 0**. Não é preço atual confirmado nem economia observada; qualquer preço novo exige cálculo e cap humano próprios antes da primeira chamada.

[Registro de riscos](experiments/jev/guard/g2b0/risk-register.json): simplificação post hoc, melhora apenas estrutural, GG0-29 persistente, novos false accepts/unsafe APPROVE, perda diagnóstica, n pequeno, ordem/carryover, variância do provider, duas chamadas por caso/custo total, G1 como controle, divergência de parser e oracle leak; gate conservador pode não ser atingido e preço futuro é desconhecido.

Não executados por escopo: providers, preço online, benchmark reduzido real, causalidade/performance, billing, build/suítes web ou smoke do produto. Nenhum fluxo de produto foi alterado; não há smoke manual necessário para este freeze offline. Isso não valida uma futura integração.

## Próximo gate e STOP

Recomendação somente: **JEV-GUARD-G2-B REAL PAIRED EXPERIMENT**, por nova decisão humana. [Plano futuro](experiments/jev/guard/g2b0/future-run-plan.json): 72 chamadas máximas propostas, modelo proposto jev-1.14.0, zero autorização atual. Antes da execução: autorização explícita com teto total, preço oficial reconfirmado, executor real isolado, locks novos, budget guard, persistência durável pré-HTTP, privacy, zero retry, synthetic only e zero integration. [Interface futura](experiments/jev/guard/g2b0/future-executor-interface.md) é documentação; **não existe código de transporte ou executor real**.

[Propagação](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md) recebeu somente append B0, com prefixo histórico byte-idêntico. Guardas determinísticas do Angario permanecem soberanas e inalteradas. **STOP: 0 chamadas executadas; as 72 chamadas NÃO foram autorizadas nem iniciadas.**
