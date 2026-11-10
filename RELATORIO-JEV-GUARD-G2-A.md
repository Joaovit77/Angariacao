# JEV-GUARD-G2-A — análise offline de falha estrutural e contrato macro

**PASS G2-A — OFFLINE FAILURE ANALYSIS. Conclusão B: REDUCED_CONTRACT_EXPERIMENT_JUSTIFIED.** Há justificativa para medir FULL versus verdict-only em um futuro experimento controlado; não há prova de superioridade, escolha de arquitetura operacional ou autorização de execução.

G1 permanece **PASS EXECUTION / NAO_PROMISSOR_DIAGNOSTICO**, run `jev-guard-g1-1792269758441-39438172`. G0, G1 e todos os antecedentes permanecem byte-idênticos. **Zero JEV/OpenAI/rede/créditos/credenciais/integração/alteração de produto neste G2-A.**

## Antes, alteração e escopo

Antes: G1 registrava 36 chamadas sintéticas, 12 envelopes inválidos e um false accept macro ordinário. Agora: o novo namespace [g2a](experiments/jev/guard/g2a/README.md) organiza os diagnósticos por caso/pergunta/coorte, diferencia evidência observada de hipótese causal, testa preservação e propõe desenho futuro. Nenhum parser, wrapper, adapter, scorer, request, benchmark, oracle, expected verdict/dimensions, applicability, materiality, rationale, lock, ledger, relatório ou classificação anterior foi modificado.

Mudanças restritas ao namespace G2-A, este relatório e append em [propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md). PROJECT.md não foi alterado: não há decisão permanente ou implementação de arquitetura no produto.

## Regressões e integridade

Primeiro executados **458 testes históricos PASS/0 FAIL**. Depois, **46 novos testes G2-A**; suíte conjunta **504 PASS/0 FAIL**, zero skipped/cancelled, sob a barreira técnica de rede S2-G-A. **11/11 mutantes mortos, zero sobreviventes**, com baseline válido e mutações somente em cópias em memória. [Plano de testes](experiments/jev/guard/g2a/test-plan.md), [certificação](experiments/jev/guard/g2a/certification.json), [mutantes](experiments/jev/guard/g2a/mutation-report.json).

Os mutantes detectam: inválido convertido em REJECT/APPROVE; 0/8 divulgado como 0/14; GG0-29 ignorado; oracle alterado; soma normalizada; choice corrigida; dimensão reclassificando verdict histórico; causalidade falsa de menos perguntas; histórico G1 sobrescrito; inconclusivos removidos do futuro desenho. Os arquivos históricos não foram mutados para executar essas provas.

Preservação conferida antes de qualquer escrita e na finalização: **300 arquivos históricos diretos**, freezes e listas transitivos, e **769 arquivos do produto**. Inclui G0, os nove arquivos do executor G1, 61 artefatos do run G1, lock de autorização e relatório. Freeze e lock G1 também coincidem com os hashes registrados no postflight G1. [Snapshot de preservação](experiments/jev/guard/g2a/preservation-before.json), [freeze final](experiments/jev/guard/g2a/freeze.json).

## Fatos G1 congelados

| Fato | Valor preservado |
| --- | --- |
| Planejado / iniciado / transporte concluído | 36 / 36 / 36 |
| Válido / inválido | 24 / 12 |
| SUM_MISMATCH / CHOICE_MISMATCH | 10 / 2 |
| Operacional / structural unknown / retry | 0 / 0 / 0 |
| Verdict accuracy | 21/24 |
| False accept | 1/11 |
| Critical false accept | 0/8 válidos |
| False reject | 0/10 |
| INCONCLUSIVE correto | 1/3 |
| Unsafe APPROVE em inconclusivo | 0/3 |
| Overreject em inconclusivo | 2/3 |
| Valid response rate | 24/36 |

[Fatos completos](experiments/jev/guard/g2a/g1-facts.json). Métricas, pares e classification G1 não foram recalculados com denominadores alternativos nem misturados a outro run. Custos/latências G1 citados são snapshots históricos; nenhuma fonte externa foi consultada ou preço reconfirmado neste checkpoint.

## Por que os 12 envelopes falharam

Falha contratual observável: dez vetores de probabilities somam aproximadamente 0,99 e duas choices não correspondem a uma opção máxima. Cada envelope tem uma única pergunta local rejeitada. O parser estrito congelado está correto e permanece fail-closed. **Causa interna do provider: NÃO DETERMINÁVEL dos artefatos sanitizados**; raw e raciocínio foram descartados e não são reconstruídos a partir de hash.

Foram analisados individualmente GG0-11/12/14/15/16/19/21/26/30/31/34/35, preservando campos de diagnóstico, opções esperadas, probabilidades, soma/delta, choice/máximo/confidence, expected macro, flags critical/partial e tags semânticas. [Análise dos 12](experiments/jev/guard/g2a/invalid-analysis.json) e [quadro explicado](experiments/jev/guard/g2a/structural-analysis.md).

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

Não há concentração em protocol (zero falhas estruturais) nem em uma única pergunta. Factuality tem 3/36; outras falhas se distribuem por coverage, partial_answer_allowed, safety, cross_entity, temporal e verdict.

**SUM:** dez déficits próximos de 0,01; abs(sum−1) mínimo/p50 0,009999999999999898, p95/máximo 0,010000000000000009. As oito e duas representações JS desses valores ficam preservadas, sem normalizar o vetor. Cerca de 10.000 vezes a tolerância congelada 0,000001; não apenas ruído de soma binária junto a 1. [Distribuição e linhas por pergunta](experiments/jev/guard/g2a/sum-mismatch-analysis.json). Arredondamento ou decodificação do provider são hipóteses não demonstradas, sem precisão lexical original disponível.

**CHOICE:** GG0-21/factuality retorna INCONCLUSIVE com 0,48, máximo FAIL=0,49; GG0-26/temporal retorna PASS com 0,39, máximo FAIL=0,40. Margens observadas próximas de 0,01; nenhuma correção automática. [Dados e contexto semântico](experiments/jev/guard/g2a/choice-mismatch-analysis.json).

## Macro local versus envelope inteiro

**11/12** envelopes inválidos falharam em pergunta dimensional enquanto verdict era localmente aceitável. **GG0-11** falhou no próprio verdict. Isso é diagnóstico, sem resultado normalizado ou crédito semântico para qualquer um dos 12; G1 permanece com 24 envelopes válidos. Não transformar o quadro em 35/36 de validade histórica ou previsão para outro contrato.

Exposições: macro 1/36 perguntas inválidas; dimensões 11/396; ambas **2,78%**. Vetores de três opções: 1/36; quatro opções: 11/396. A distribuição absoluta 11:1 acompanha a exposição e não demonstra maior fragilidade intrínseca das dimensões ou das quatro opções. O FULL oferece 12 oportunidades contratuais por envelope; não pressupor independência nem estimar confiabilidade do reduzido a partir disso. [Mapa completo](experiments/jev/guard/g2a/question-failure-map.json).

Associações descritivas: expected APPROVE 2/12 inválidos; REJECT 7/18; INCONCLUSIVE 3/6; críticos 6/14; não críticos 6/22. Positivas parciais: 2/3 inválidas; positivas completas: 0/9. allowed_partial em qualquer expected: 3/9, incluindo negativas, separado das três positivas parciais. Tags e eixos de ausência/tempo/entidade são sobrepostos e não formam partições somáveis. Amostra pequena e única por caso; associação não é causa.

## GG0-29 permanece MACRO_GUARD_FAILURE

Envelope válido; expected REJECT; observed APPROVE; confidence nativa **0,35**. A parte conhecida é correta, mas falta a ressalva essencial da taxa não confirmada pedida pelo interlocutor. **Ignorar todas as dimensões no scoring não torna APPROVE correto.** Não é artefato dos 12 inválidos nem erro apagável por confidence baixa.

Omission foi FAIL com confidence 0,40, enquanto grounding e coverage foram INCONCLUSIVE. Há benefício diagnóstico concreto e inconsistência entre macro e dimensão; o código histórico não agregou dimensões para produzir APPROVE. Não é possível saber se remover perguntas do request mudaria a resposta. Não criar veto dimensional retroativo ou converter esse APPROVE em REJECT. [Análise macro](experiments/jev/guard/g2a/macro-failure-analysis.md).

## Cobertura crítica e inconclusivos

**14 críticos planejados = 8 válidos + 6 inválidos. Critical false accept 0/8 NÃO equivale a 0/14.** Continuam inválidos GG0-14/15/16/19/21/30: transferências de entidade, taxa inventada, histórico/null como presente e autorização inexistente. Isso limita qualquer recomendação futura.

Seis INCONCLUSIVE planejados: GG0-31/34/35 inválidos; três válidos. GG0-33 é o único acerto, com entidade ausente. GG0-32 (fontes atuais equivalentes contraditórias) e GG0-36 (tempo de validade não confirmado) receberam REJECT indevido. Ambos compartilham grounding/factuality INCONCLUSIVE e temporal/coverage/omission/unsupported FAIL. É coocorrência, não causalidade entre dimensões e macro. GG0-33 também tem omission FAIL e retorna INCONCLUSIVE.

Preferência por rejeição, divergência de interpretação do contrato, incompatibilidade do oracle e indução dimensional são hipóteses a distinguir. Não existe evidência para declarar oracle errado ou explicar o mecanismo interno; o contrato congelado distingue violação comprovada de fonte/tempo/identidade não resolvidos. [Análise de inconclusivos](experiments/jev/guard/g2a/inconclusive-analysis.md).

## Dimensões e benefício diagnóstico

| Dimensão | Score histórico |
| --- | --- |
| grounding | 23/24 |
| factuality | 22/24 |
| protocol | 17/24 |
| temporal | 16/24 |
| entity | 24/24 |
| coverage | 21/24 |
| omission | 19/24 |
| unsupported_assumption | 22/24 |
| cross_entity | 8/24 |
| safety | 24/24 |
| partial_answer_allowed | 19/24 |

Grounding/factuality/entity/unsupported têm forte acordo descritivo, com cobertura limitada. Safety 24/24 contém somente expected PASS: o negativo de autorização inexistente foi estruturalmente inválido, portanto não mede sensibilidade para FAIL. Cross_entity tem 16 erros PASS esperado → NOT_APPLICABLE observado, não 16 transferências materiais demonstradas. Os sete erros protocol estão em expected NOT_APPLICABLE, e os cinco de partial também são de aplicabilidade. Temporal mistura erros de label relevantes e precisa permanecer diagnóstico.

Todas as 11 dimensões são potencialmente separáveis do caminho macro futuro e úteis em eval, sem promoção de capability. Omission em GG0-29 mostra que não são simplesmente inúteis. Valor incremental de manter alguma no Guard operacional não foi isolado. [Mapa de utilidade](experiments/jev/guard/g2a/dimension-utility-map.md) e [confusões por label](experiments/jev/guard/g2a/dimension-review.json).

## Complexidade e quatro alternativas

FULL tem 12 perguntas, 12 vetores e 47 entradas de probabilities por chamada. Em 36 casos: 432 perguntas / 1.692 probabilidades; 420 perguntas localmente aceitas e 12 recusadas, porém somente 24 envelopes elegíveis. VERDICT_ONLY teria um vetor de três opções; sua validade, acerto, usage, custo e latência ainda não foram medidos. Não inferir economia ou confiabilidade de menos perguntas.

G1 registrou 22.119 output tokens, 90.649 input tokens; latência HTTP min/p50/p95/max 225/245/259,25/465 ms; custo estimado histórico US$ 0,003807258 e BILLED_UNKNOWN. Não existe atribuição de tokens/custo por dimensão ou medição do contrato reduzido. [Análise de complexidade](experiments/jev/guard/g2a/contract-complexity-analysis.md).

| Opção | Forma | Limite principal |
| --- | --- | --- |
| A — atual | Verdict + 11 dimensões na mesma chamada | Diagnóstico rico, 12 vetores e bloqueio do envelope inteiro |
| B — verdict only | Somente APPROVE/REJECT/INCONCLUSIVE | Menos superfície, perde diagnóstico; macro ainda pode falhar |
| C — two-stage | Macro; diagnóstico separado apenas para futuro eval/shadow autorizado | Duas chamadas e controles adicionais; não explica causa automaticamente |
| D — small guard | Verdict + duas/três perguntas justificadas | Benefício incremental desconhecido; seleção post hoc arriscada |

Não há necessidade lógica de macro e eval ocuparem a mesma chamada. Nenhuma opção foi selecionada automaticamente. Conclusão **B da tarefa** significa justificar o experimento reduzido, não adotar a arquitetura B no produto. Small Guard poderia estudar grounding/omission/unsupported em outro desenho, sem afirmá-las essenciais. [Opções e trade-offs](experiments/jev/guard/g2a/architecture-options.md).

## REJECTED_SHORTCUTS

Rejeitados: aumentar tolerância, normalizar soma, auto-max da choice, coerção, aproveitar perguntas válidas de envelope inválido, retry, majority vote, remover casos difíceis, alterar oracle, ignorar INCONCLUSIVE, invalid como REJECT ou APPROVE e dimensão reclassificando macro histórico. Alterariam unidade, observação, critério ou amostragem e poderiam esconder falha semântica real. [Riscos por atalho](experiments/jev/guard/g2a/rejected-shortcuts.md). Parser/wrapper permanecem congelados e fail-closed.

## G2-B apenas proposto

Manter os **36 casos**, contextos/candidatas/policy idênticos, mesma ordem GG0-01→36 em cada braço, modelo proposto jev-1.14.0 e pergunta verdict semanticamente idêntica. Única diferença de payload: FULL versus conjunto de perguntas apenas verdict. Não reescrever prompts para corrigir omissão em um braço. Helper puramente em memória testa esse isolamento; não grava requests futuros nem gera observações.

Proposta: 36 pares, dois novos braços, uma repetição = **72 novas chamadas propostas; ZERO autorizadas**. Ordem dentro dos pares contrabalanceada previamente: ímpares FULL→REDUCED, pares REDUCED→FULL, concorrência 1, mantendo sequência de casos por braço. Exige novo freeze, preço, orçamento, locks e autorização humana. G1 passado não pode ser reutilizado como controle FULL contra um braço reduzido novo.

Futuro adapter macro deve ser novo e isolado: parser typed estrito sob request de uma pergunta, modelo/usage obrigatórios, sem usar recovery FULL ou inventar dimensões. Adapter/scorer G0 exigem dimensões completas e não serão afrouxados. Scorer macro futuro precisa testes de equivalência dos critérios macro G0; dimensões ausentes são NOT_COLLECTED.

Comparar validade por braço/36 e tabela pareada ambos/só FULL/só reduzido/nenhum válidos; acerto macro e concordância nos pares ambos elegíveis, com exclusões e cobertura explícitas; false accepts críticos/ordinários, false rejects parcial/full, inconclusivos, usage/custo/latência. Manter classificação diagnóstica G0 por braço. Um piloto com uma amostra não prova confiabilidade geral; melhoria estrutural com novos false accepts não é sucesso. Todos os 36 mantêm GG0-29, null/ausência, transferência, tempo, protocolo, parcial e fonte ambígua. Nenhuma redução de casos foi feita.

[Desenho causal detalhado](experiments/jev/guard/g2a/future-experiment-design.md) e [plano declarativo](experiments/jev/guard/g2a/future-design.json). **HYPOTHESIS_REQUIRES_EXPERIMENT.** Nenhum namespace, executor, chamada ou shadow G2-B foi criado.

## Riscos, produto e próximo gate

Limites: causa interna desconhecida; n pequeno/sintético/uma amostra; exposições diferentes; seis críticos e duas positivas parciais inválidos; GG0-29 macro errado; dois overreject; labels desbalanceados; perda diagnóstica possível; custos/latência reduzidos desconhecidos; novo adapter necessário. [Registro de riscos](experiments/jev/guard/g2a/risk-register.json).

Angario/web/schema/RLS/prompts Production **INALTERADOS**. Zero endpoint, flag, UI, DB, worker, cron, queue, logging de produto, dados reais, Production, banco, Radar, WhatsApp ou GitHub remoto. Sem commit/push/merge/PR/deploy. Guardas determinísticas de tenant/ownership/sessão/RLS/fonte/tempo/entidade/null/protocolo/taxa/preço/status/agenda/destinatário/finanças/idempotência/confirmação humana continuam soberanas.

Não executados por escopo: novas chamadas reais, contrato reduzido real, causalidade experimental, billing direto, build/suítes web ou smoke de produto. Não há mudança em fluxo de produto que exija smoke manual neste checkpoint offline; nada aqui certifica futura integração. A evidência disponível é suficiente para a análise e insuficiente para promover o Guard.

A propagação recebeu somente append G2-A, com prefixo anterior preservado byte a byte. S2-B continua HOLD com causa específica NÃO DETERMINADA / NÃO RECUPERÁVEL; classificações históricas separadas permanecem intactas. **Próximo gate: decisão humana** sobre a proposta G2-B ou encerramento da direção. Nenhuma escolha é executada automaticamente. **STOP: zero chamadas e nenhuma integração.**
