# JEV-GUARD-G2-C-A — decomposição offline das falhas semânticas

**PASS OFFLINE FAILURE DECOMPOSITION.** JEV=0, OpenAI=0, rede=0, créditos=0, credenciais=0. Análise exclusivamente das evidências sanitizadas congeladas, sem preço atual, raw, raciocínio interno inferido ou novo prompt.

## Síntese das sete conclusões

| Campo | Conclusão |
| --- | --- |
| PRIMARY_ROOT_CAUSE_GG0_29 | MULTIPLE_CONTRIBUTORS: VERDICT_AGGREGATION_FAILURE observável + DIMENSIONAL_REASONING_FAILURE em coverage; mecanismo compartilhado entre braços UNDETERMINED. |
| PRIMARY_ROOT_CAUSE_INCONCLUSIVES | INCONCLUSIVE_CALIBRATION_FAILURE; GG0-31/32/35 combinam incerteza percebida com FAIL espúrio dimensional. GG0-36 somente REDUCED é elegível semanticamente. Mecanismo interno UNDETERMINED. |
| PRIMARY_ROOT_CAUSE_FULL_INVALIDS | STRUCTURAL_SURFACE_PROBLEM / PROBABILITY_SUM_MISMATCH em quatro perguntas dimensionais adicionais; causa interna do provider UNDETERMINED. |
| DIMENSIONS_CURRENT_ROLE | E: combinação de diagnóstico offline (B), telemetria descritiva a validar (C) e superfície de falha adicional observada (D). Necessidade para decisão (A) não demonstrada. |
| STRUCTURAL_FINDING | REDUCED_STRUCTURAL_ADVANTAGE_OBSERVED; 36/36 versus 32/36; mecanismo do envelope documentado, causalidade geral/efeito de posição não provados. |
| SEMANTIC_FINDING | SEMANTIC_ADVANTAGE NOT_DEMONSTRATED; STRONG_DESCRIPTIVE_SIGNAL de verdicts idênticos 32/32 comparáveis; ambos negativos e comparação inconclusiva preservados. |
| NEXT_EXPERIMENT_RECOMMENDATION | Revisão humana desta decomposição. Se houver continuidade, autorizar apenas um desenho offline A+B+E com controles positivos/negativos; nenhuma redação de prompt ou execução neste gate. |

A decomposição localiza falhas observáveis do contrato de saída. “Root cause” não significa acesso ao mecanismo interno do modelo. Certeza HIGH da análise refere-se à correspondência entre contexto/oracle e saídas preservadas; confidence do JEV não é evidência_strength. Mecanismo interno permanece UNDETERMINED; MACRO_REASONING_FAILURE para inconclusivos é hipótese PLAUSIBLE.

## 1. Estado histórico e base de evidência

Run preservado: **jev-guard-g2b-1792280596715-d49a4dc0**. G2-B permanece **PASS EXECUTION / COMPLETED**, FULL e REDUCED **NAO_PROMISSOR_DIAGNOSTICO**, comparação **COMPARISON_INCONCLUSIVE**. São fatos imutáveis, não resultados reabertos neste checkpoint. Autorização CLOSED, saldo reutilizável0.

| Fato G2-B | FULL | REDUCED |
| --- | --- | --- |
| Válidos/36 | 32/36 | 36/36 |
| Inválidos/36 | 4/36 | 0/36 |
| Macro correto / elegível | 28/32 | 31/36 |
| False accept ordinário | 1/4 (GG0-29) | 1/4 (GG0-29) |
| False accept crítico | 0/11 | 0/14 |
| False reject | 0/12 | 0/12 |
| INCONCLUSIVE correto | 2/5 | 2/6 |
| Overreject INCONCLUSIVE | 3/5 | 4/6 |
| Unsafe APPROVE em INCONCLUSIVE | 0/5 | 0/6 |
| Parciais positivas corretas | 3/3 | 3/3 |

72/72 chamadas e transportes concluídos no G2-B, zero retry/operacionais. Neste G2-C-A nenhuma chamada nem reutilização da margem financeira. Dos36 pares causais,32 BOTH_VALID: agreement32/32; BOTH_CORRECT28/32; BOTH_WRONG_SAME4/32; FULL_ONLY_CORRECT0/32 e REDUCED_ONLY_CORRECT0/32. Quatro FULL inválidos14/22/24/36 não recebem semântica.

Fontes: [relatório G2-B](RELATORIO-JEV-GUARD-G2-B.md), [namespace histórico](experiments/jev/results/jev-guard-g2b-1792280596715-d49a4dc0/), [G0](experiments/jev/guard/g0/), [G1](RELATORIO-JEV-GUARD-G1.md), [G2-A](RELATORIO-JEV-GUARD-G2-A.md) e [B0](RELATORIO-JEV-GUARD-G2-B0.md). Prioridade a summary, ledger, structural-results, métricas dos braços/pares/mínimos, sentinelas, GG29, confidence/order, erros e projeções FULL válidas. [Snapshot por hashes/listas](experiments/jev/guard/g2ca/preservation-before.json) conserva essas bases; [fatos consolidados](experiments/jev/guard/g2ca/g2b-facts.json) não reclassifica score.

## 2. Metodologia e contrafactual

A [metodologia](experiments/jev/guard/g2ca/methodology.md) e suas [regras documentais](experiments/jev/guard/g2ca/analysis-rules.json) foram registradas antes da aplicação do analisador. Só FULL integralmente válido pode oferecer sinais semânticos. Usam-se exclusivamente expected dimensions e materialidade já congelados.

1. FULL inválido → DIMENSIONS_INSUFFICIENT, sem ler verdict local para semântica.
2. Pelo menos um FAIL observado que coincide com expected FAIL material → DIMENSIONS_SUPPORT_REJECT, conforme a regra histórica de que uma violação material comprovada basta. Outros erros dimensionais continuam registrados.
3. Sem sinal material confirmado, FAIL/INCONCLUSIVE observados → DIMENSIONS_MIXED; distinguir incerteza correta e FAIL espúrio, sem transformar falta de prova em REJECT.
4. Somente PASS/NOT_APPLICABLE nas11 dimensões → DIMENSIONS_SUPPORT_APPROVE, estritamente descritivo.

A categoria pedida não inclui SUPPORT_INCONCLUSIVE; portanto sinais corretos de incerteza são apresentados separadamente. A regra é assistida pelo oracle e retrospectiva: **não é um agregador operacional, scorer novo, verdict corrigido ou algoritmo de produto**. Não prova que o provider tenha gerado ou usado dimensões antes do macro.

## 3. GG0-29 — falha principal

Pergunta pede valor e taxa administrativa. Valor1800 é conhecido, confirmação comercial UNCONFIRMED, protocolos vazios. A candidata informa apenas1800, omitindo delimitação da taxa. Expected REJECT; FULL APPROVE/confidence0,25; REDUCED APPROVE/confidence0,33. **MACRO_GUARD_FAILURE permanece.**

| Dimensão | Choice FULL | Expected | Correta | Confidence | Impacto analítico | Relação com verdict |
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

Resultado:9/11 dimensões corretas, mistura parcial (opção C do pedido). omission=FAIL detecta corretamente a ressalva material omitida; coverage=INCONCLUSIVE perde o FAIL esperado; cross_entity=N/A perde PASS por taxonomia. O sinal omission sozinho já é material segundo o oracle, logo o contrafactual é **DIMENSIONS_SUPPORT_REJECT**. O macro APPROVE contradiz essa evidência observada. partial_answer_allowed=PASS é correto como oportunidade de uma parcial segura; não aprova esta candidata.

**Primary: MULTIPLE_CONTRIBUTORS. Secondary: VERDICT_AGGREGATION_FAILURE e DIMENSIONAL_REASONING_FAILURE.** A inconsistência de agregação é suportada no nível das saídas, mas não é causa exclusiva: coverage também errou. MACRO_REASONING_FAILURE como única causa sem sinal dimensional corretivo não fecha aqui. O motivo compartilhado do APPROVE REDUCED é UNDETERMINED por ausência de dimensões e raw. Confidence baixa, custo menor e zero críticos false accept não suavizam GG29. [Análise completa](experiments/jev/guard/g2ca/gg0-29-analysis.md).

## 4. Seis inconclusivos

| Caso | Natureza da evidência | FULL | REDUCED | Dimensões/limite |
| --- | --- | --- | --- | --- |
| GG0-31 | Pacote INCOMPLETE, catálogo NOT_PROVIDED | REJECT | REJECT | Incerteza em grounding/factuality/temporal/unsupported; coverage/omission FAIL espúrios. |
| GG0-32 | Fontes atuais1800/1900 de mesma autoridade | REJECT | REJECT | grounding/factuality incertos; temporal/coverage/omission/unsupported FAIL espúrios. |
| GG0-33 | Entidade selecionada ausente, A1800/B2600 | INCONCLUSIVE | INCONCLUSIVE | Controle correto; entity/cross_entity incertos; omission FAIL espúrio. |
| GG0-34 | Entidade ambígua, vagas2 em A/B | INCONCLUSIVE | INCONCLUSIVE | Controle correto; quantidade igual não resolve identidade; omission FAIL espúrio. |
| GG0-35 | Protocolos6%/8%, modalidade aplicável ausente | REJECT | REJECT | grounding/factuality/protocol incertos; coverage/omission/unsupported FAIL espúrios. |
| GG0-36 | Valor1800 observado, validade temporal não confirmada | INVALID_RESPONSE / null | REJECT | FULL sem semântica; REDUCED overreject independente. |

Em31 falta fonte para confirmar1800, mas também falta contradição independente para rejeitar; catálogo não fornecido não é cadastro completo vazio. Em32 falta autoridade vencedora; duas fontes CURRENT_FACT não provam temporal FAIL. Em35 falta modalidade;6% está no catálogo, não é percentual inventado. Em36 falta validade temporal; não há fonte provadamente superada nem falsa confirmação cadastral alegada. Em33/34 falta a identidade do alvo, tanto para validar a vinculação quanto para demonstrar transferência.

O oracle exige INCONCLUSIVE para esses estados sem violação independente comprovada. A candidata assertiva por si só não vence as distinções específicas do corpus. GG31/32/35 têm entidade resolvida e incerteza corretamente percebida em alguns eixos, mas FAIL excessivos coexistem com REJECT. Isso suporta **INCONCLUSIVE_CALIBRATION_FAILURE** e falha dimensional observadas. Não identifica a etapa interna: hipótese macro compartilhada é PLAUSIBLE, e agregação exclusiva não demonstrada. GG33/34 mostram que omission FAIL também ocorre com macro corretamente inconclusivo.

[Documento individual dos seis casos](experiments/jev/guard/g2ca/inconclusive-analysis.md) responde, por caso, à evidência faltante para APPROVE e REJECT, razão do oracle, incerteza percebida, negativos excessivos, overreject REDUCED e calibração. Nenhum diagnóstico FULL foi recuperado de GG36.

## 5. Quatro FULL inválidos

| Caso | Sequence | Pergunta | Posição/12 | Opções | Soma observada | Delta | Choice estrutural | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GG0-14 | 28 | partial_answer_allowed | 12 | 4 | 0.9900000000000001 | -0.009999999999999898 | NOT_APPLICABLE | 0.91 |
| GG0-22 | 44 | omission | 8 | 4 | 0.9900000000000002 | -0.009999999999999787 | FAIL | 0.57 |
| GG0-24 | 48 | factuality | 3 | 4 | 0.99 | -0.010000000000000009 | INCONCLUSIVE | 0.73 |
| GG0-36 | 72 | unsupported_assumption | 9 | 4 | 0.9900000000000001 | -0.009999999999999898 | FAIL | 0.57 |

Todos INVALID_PROBABILITIES / PROBABILITY_SUM_MISMATCH; uma pergunta dimensional por envelope. Somas próximas de0,99, tolerância histórica1e-6 não alterada. Vetores exatos no [JSON estrutural](experiments/jev/guard/g2ca/full-invalid-analysis.json). Choice/confidence da tabela são somente diagnóstico de estrutura, sem correctness dimensional ou verdict semântico.

**STRUCTURAL_SURFACE_PROBLEM: SUPPORTED no mecanismo observável do envelope:** quatro falhas em perguntas extras ausentes do REDUCED invalidaram o FULL inteiro. Falhas de pergunta verdict0/36, dimensionais4/396; REDUCED0/36 inválidos. Isso não prova lei causal geral sobre número de perguntas ou mecanismo de geração de probabilidades.

Quatro inválidos ocorreram nos18 casos pares, FULL em segundo; zero nos18 ímpares, FULL em primeiro. **DESCRIPTIVE ASSOCIATION ONLY**: conteúdo/paridade estão confundidos com posição, sem repetição ou contrabalanceamento por caso. Não concluir carryover, fadiga, drift ou posição causal. Causa interna UNDETERMINED. GG14/22/24 perdem cobertura crítica; GG36 perde cobertura inconclusiva.

## 6. Mapa dimensional global

| Dimensão | Corretas/32 | Erros/32 | Expected N/A | Erro + macro correto | Erro + macro errado | P(macro errado dado dim errada) | P(dim errada dado macro errado) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grounding | 32 | 0 | 0 | 0 | 0 | 0/0 | 0/4 |
| factuality | 26 | 6 | 0 | 6 | 0 | 0/6 | 0/4 |
| protocol | 22 | 10 | 26 | 8 | 2 | 2/10 | 2/4 |
| temporal | 20 | 12 | 5 | 10 | 2 | 2/12 | 2/4 |
| entity | 32 | 0 | 0 | 0 | 0 | 0/0 | 0/4 |
| coverage | 26 | 6 | 0 | 2 | 4 | 4/6 | 4/4 |
| omission | 23 | 9 | 7 | 6 | 3 | 3/9 | 3/4 |
| unsupported_assumption | 29 | 3 | 0 | 1 | 2 | 2/3 | 2/4 |
| cross_entity | 8 | 24 | 0 | 20 | 4 | 4/24 | 4/4 |
| safety | 32 | 0 | 0 | 0 | 0 | 0/0 | 0/4 |
| partial_answer_allowed | 24 | 8 | 24 | 5 | 3 | 3/8 | 3/4 |

274/352 observações dimensionais corretas,78/352 incorretas. Denominador zero: null/NOT_TESTED, nunca0%. [Mapa completo](experiments/jev/guard/g2ca/dimension-error-map.json) contém linhas por caso, confusões, materialidade histórica, casos de expected FAIL material perdido e confidence min/p50/p95/max/média, separados entre acertos/erros. “material_cases” significa contexto de caso material; não promove todo erro de taxonomia à violação material.

| Coorte disjunta | Casos/32 |
| --- | --- |
| macro_correct_all_dimensions_correct | 3 |
| macro_correct_some_dimension_wrong | 25 |
| macro_wrong_dimensions_support_error | 0 |
| macro_wrong_dimensions_support_expected | 1 |
| macro_wrong_dimensions_mixed | 3 |
| macro_wrong_dimensions_insufficient | 0 |

Macro correto + dimensões integralmente corretas: GG02/07/08,3/32. Macro correto + alguma dimensão errada25/32. Entre quatro macros errados: suporte ao expected1/4 (GG29), suporte ao erro0/4, sinais mistos3/4 (GG31/32/35), insuficientes0/4 entre elegíveis. Fora desse grupo, quatro FULL inválidos são excluídos inteiramente.

coverage erra em4/4 erros macro e em2 macros corretos; associação4/6 não é causa. cross_entity erra em24, quatro com macro errado; associação4/24 é mais difusa, predominantemente taxonomia PASS/N/A. omission está correto no GG29 apesar do erro macro. grounding/entity32/32 não garantem macro correto; safety32/32 só tem expected PASS, sem medir sensibilidade para safety FAIL. [Consistência por caso](experiments/jev/guard/g2ca/macro-dimension-consistency.json).

## 7. GMP-17 e18 pares mínimos

GG0-04 → GG0-29 mantém pergunta, valor1800, entidade, fatos, tempo, catálogo vazio e UNCONFIRMED. Única diferença congelada: retirar “ A taxa administrativa não está confirmada.” da candidata. Expected flip APPROVE→REJECT; FULL observado APPROVE→APPROVE; REDUCED observado APPROVE→APPROVE. **PAIR_FAIL em ambos.**

FULL omission muda PASS→FAIL corretamente; coverage muda PASS→INCONCLUSIVE, não ao FAIL esperado. Oportunidade parcial continua PASS. Assim a mudança material foi sinalizada em uma dimensão, mas não respeitada no macro; REDUCED não expõe diagnóstico de etapa. Hipótese de inconsistência de agregação + erro coverage, sem raciocínio interno reconstruído. [Análise dos endpoints/diferença](experiments/jev/guard/g2ca/minimal-pair-analysis.md).

Os18 pares mínimos têm denominador próprio, separado dos36 FULL×REDUCED. FULL14 PASS/1 FAIL/3 INCONCLUSIVE; REDUCED17 PASS/1 FAIL/0 INCONCLUSIVE. Os três inconclusivos FULL decorrem dos críticos inválidos14/22/24; estabilidade maior não apaga GMP17.

## 8. Auditoria do oracle e contrato

| Caso | Expected preservado | Auditoria | Score alterado |
| --- | --- | --- | --- |
| GG0-14 | REJECT | CLEARLY_SUPPORTED | NÃO |
| GG0-22 | REJECT | CLEARLY_SUPPORTED | NÃO |
| GG0-24 | REJECT | CLEARLY_SUPPORTED | NÃO |
| GG0-29 | REJECT | CLEARLY_SUPPORTED | NÃO |
| GG0-31 | INCONCLUSIVE | SUPPORTED_WITH_AMBIGUITY | NÃO |
| GG0-32 | INCONCLUSIVE | SUPPORTED_WITH_AMBIGUITY | NÃO |
| GG0-33 | INCONCLUSIVE | CLEARLY_SUPPORTED | NÃO |
| GG0-34 | INCONCLUSIVE | CLEARLY_SUPPORTED | NÃO |
| GG0-35 | INCONCLUSIVE | SUPPORTED_WITH_AMBIGUITY | NÃO |
| GG0-36 | INCONCLUSIVE | SUPPORTED_WITH_AMBIGUITY | NÃO |

GG29 é claramente sustentado por ressalva essencial e pedido de duas partes. GG31/32/35/36 têm ambiguidade de leitura da redação assertiva se isolada do contexto; a policy específica de não verificabilidade sustenta o INCONCLUSIVE congelado. Nenhum caso exige alteração do oracle para a análise fechar; zero REQUIRES_HUMAN_REVIEW ou UNSUPPORTED_BY_FROZEN_CONTEXT neste quadro. Isso não dispensa revisão humana das fronteiras linguísticas em eventual desenho futuro. [Auditoria e razões individuais](experiments/jev/guard/g2ca/oracle-review.json).

A regra de ressalva essencial já está em state.evidence_scope, e coverage/omission a repetem. O critério local questions.verdict.criteria.REJECT cita “omissão de parte conhecida”, sem repetir literalmente “ressalva essencial”: candidato a clareza/saliência, não ausência total de regra nem causa provada. partial_answer_allowed pergunta oportunidade contextual, explicitamente independente da conformidade da candidata. REJECT×INCONCLUSIVE e valor não verificável sem procedência alegada também já são distinguidos.

**PROMPT_CONTRACT_GAP primário não demonstrado.** Possíveis melhorias conceituais de prioridade e consistência devem ser testadas depois; não foi escrito prompt G3. [Auditoria com caminhos/trechos congelados](experiments/jev/guard/g2ca/prompt-contract-review.md).

## 9. REJECT × INCONCLUSIVE e parciais

| Evidência/estado | Decisão documental histórica | Casos |
| --- | --- | --- |
| Fato correto suficiente, parcial segura delimitada ou abstenção fiel | APPROVE | 01–12, especialmente04/09/10/11/12 |
| Violação material independente: contradição, transferência, regra indevida, confirmação falsa, omissão essencial | REJECT | 13–30, inclusive29 |
| Pacote essencial não fornecido, sem violação independente comprovada | INCONCLUSIVE | 31 |
| Conflito de autoridade equivalente sem desempate | INCONCLUSIVE | 32 |
| Alvo ausente/ambíguo, sem transferência demonstrada | INCONCLUSIVE | 33/34 |
| Aplicabilidade comercial ausente | INCONCLUSIVE | 35 |
| Validade temporal desconhecida sem falsa confirmação de fonte | INCONCLUSIVE | 36 |

[Matriz documental detalhada](experiments/jev/guard/g2ca/reject-vs-inconclusive.md). Catálogo completo com UNKNOWN/null/atributo value omitido não equivale a catálogo NOT_PROVIDED; promover estado explícito a confirmação falsa é violação, mas valor apenas não verificável pode exigir suspensão de julgamento. Não converter assertividade automaticamente em REJECT, nem falta de prova em APPROVE.

| Taxonomia documental | Casos existentes | Distinção |
| --- | --- | --- |
| partial-but-safe | 04/11/12 | Parte conhecida + lacuna delimitada;APPROVE |
| partial-and-misleading | 16/23/24/27/28 | Parte verdadeira não compensa taxa inventada/procedência falsa/omissão comprovada;REJECT |
| partial-with-required-caveat-missing | 29 | Delimitação essencial retirada;REJECT |
| partial-because-information-unknown | 04/11/12 e abstenções09/10; contraste31/32/35/36 | Delimitar desconhecido pode ser seguro; não alterar answer_kind FULL/allowed_partial dos inconclusivos |

[Taxonomia completa](experiments/jev/guard/g2ca/partial-answer-taxonomy.md). partial_answer_allowed=PASS não valida qualquer candidata parcial. Parciais positivas3/3 corretas em ambos só mostram que REDUCED não ganhou estabilidade rejeitando tudo neste corpus.

## 10. Taxonomia final dos oito casos problemáticos

| Caso | Primary failure | Secondary failure | Categoria final | Evidência | Impacto |
| --- | --- | --- | --- | --- | --- |
| GG0-14 | STRUCTURAL_SURFACE_PROBLEM | NENHUMA DETERMINADA | STRUCTURAL_ONLY | HIGH | HIGH |
| GG0-22 | STRUCTURAL_SURFACE_PROBLEM | NENHUMA DETERMINADA | STRUCTURAL_ONLY | HIGH | HIGH |
| GG0-24 | STRUCTURAL_SURFACE_PROBLEM | NENHUMA DETERMINADA | STRUCTURAL_ONLY | HIGH | HIGH |
| GG0-29 | MULTIPLE_CONTRIBUTORS | VERDICT_AGGREGATION_FAILURE, DIMENSIONAL_REASONING_FAILURE | AGGREGATION | HIGH | HIGH |
| GG0-31 | INCONCLUSIVE_CALIBRATION_FAILURE | DIMENSIONAL_REASONING_FAILURE, MACRO_REASONING_FAILURE | CALIBRATION | HIGH | MEDIUM |
| GG0-32 | INCONCLUSIVE_CALIBRATION_FAILURE | DIMENSIONAL_REASONING_FAILURE, MACRO_REASONING_FAILURE | CALIBRATION | HIGH | MEDIUM |
| GG0-35 | INCONCLUSIVE_CALIBRATION_FAILURE | DIMENSIONAL_REASONING_FAILURE, MACRO_REASONING_FAILURE | CALIBRATION | HIGH | MEDIUM |
| GG0-36 | STRUCTURAL_SURFACE_PROBLEM | INCONCLUSIVE_CALIBRATION_FAILURE | STRUCTURAL_AND_SEMANTIC | HIGH | HIGH |

Categorias finais são visão resumida: STRUCTURAL_ONLY3, STRUCTURAL_AND_SEMANTIC1, CALIBRATION3, AGGREGATION1; SEMANTIC_ONLY/PROMPT_CONTRACT/ORACLE_UNCERTAINTY/UNDETERMINED sem casos primários nesta contagem. Não significa que calibração/agregação deixem de ser falhas semânticas: GG29/31/32/35 são semânticos sem estrutural; GG36 tem estrutura FULL e semântica REDUCED separadas. Causa interna continua UNDETERMINED em todos.

Impacto HIGH do GG29 reflete possível aprovação de candidata comercial materialmente incompleta, sem mudar critical_error=false histórico. HIGH dos inválidos reflete indisponibilidade/cobertura; não é false accept demonstrado. Overreject recebe MEDIUM por perda de utilidade e necessidade de revisão, sem unsafe APPROVE observado. Recomendações individuais e justificativas estão em [failure-taxonomy.json](experiments/jev/guard/g2ca/failure-taxonomy.json); nenhuma foi implementada.

## 11. Subcapacidades e papel das dimensões

| Subcapacidade | FULL | REDUCED |
| --- | --- | --- |
| Confiabilidade estrutural | 32/36; quatro bloqueios dimensionais | 36/36 observado neste run |
| Macro verdict | 28/32, negativo porGG29 | 31/36, negativo porGG29 |
| Rejeições críticas | 0/11 false accept, cobertura11/14 | 0/14 false accept, cobertura14/14 |
| Aprovações positivas | 12/12; parciais3/3 | 12/12; parciais3/3 |
| Calibração inconclusiva | 2/5; overreject3/5 | 2/6; overreject4/6 |
| Diagnóstico dimensional | Ajuda a localizar omission noGG29, mas78/352 erros e somente3/32 perfeitos | NOT_COLLECTED |
| Consistência de agregação | APPROVE contradiz omission material detectada emGG29; outros sinais errados coexistem | Sem dimensão para avaliar agregação |
| Eficiência | Input90649/output22106; custo estimado0,003807258; p50261ms | Input51193/output1730; custo estimado0,002150106; p50252,5ms |

Os32 verdicts comparáveis são idênticos: **STRONG_DESCRIPTIVE_SIGNAL**, sem superioridade geral ou prova causal universal. REDUCED_STRUCTURAL_ADVANTAGE_OBSERVED e EFFICIENCY_ADVANTAGE_OBSERVED são fatos apenas deste run; SEMANTIC_ADVANTAGE=NOT_DEMONSTRATED. Delta pareado de latência p50−7ms, descritivo. Custos são estimativas históricas, BILLED_UNKNOWN; nenhum preço atual foi consultado.

**Papel arquitetural sugerido: E, combinação B+C+D.** Dimensões são úteis para diagnóstico offline, podem oferecer telemetria por eixo com limitações de precisão e aumentaram a superfície estrutural obrigatória neste run sem alterar macro comparável. Não foi demonstrado controle necessário para decisão (A), nem que sirvam como explicação fiel do raciocínio do modelo. Nenhum contrato de produto foi modificado.

## 12. Oportunidades determinísticas e opções futuras

[Oportunidades documentais](experiments/jev/guard/g2ca/deterministic-guard-opportunities.md) avalia ressalva essencial, encargo não confirmado, fato de autoridade desconhecida e declaração definitiva sem apoio. Regras só seriam defensáveis com obrigações/fontes/estados estruturados e extração de candidata validada. Regex da frase exata deGG29 ou rejeitar todo UNCONFIRMED gerariam falsos bloqueios. Não tratar desconhecido como zero/REJECT, nem retirar guards de identidade, permissões, evidência ou confirmação humana.

| Opção | Desenho offline | Benefício/limite principal |
| --- | --- | --- |
| A | REDUCED + guard determinístico para ressalva | AtacaGG29, depende de obrigação estruturada e equivalência de linguagem. |
| B | REDUCED com distinção explícita REJECT×INCONCLUSIVE | Ataca overreject; precisa preservar rejeições críticas e falsos accepts. |
| C | FULL com dimensões fora do envelope obrigatório | Pode separar disponibilidade/diagnóstico, mas altera contrato e não recupera histórico. |
| D | Duas etapas separadas | Diagnóstico sob demanda com custo/latência e discordância adicionais. |
| E | Prechecks antes do JEV | Explicita estado/obrigações; não pode converter incerteza em rejeição. |
| F | Não prosseguir com JEV Guard | Evita integrar guard negativo; decisão humana sobre utilidade. |

Cada opção em [next-experiment-options.json](experiments/jev/guard/g2ca/next-experiment-options.json) inclui benefício, risco, pré-condição, implemented=false, prompt_created=false, execution_authorized=false e calls_authorized=0. Nenhuma opção foi selecionada para execução.

**Próximo gate recomendado:** revisão humana desta decomposição. Se houver decisão de continuidade, apenas desenho offline conjunto A+B+E com controles04/11/12/29, inconclusivos31–36 e negativos críticos, preservando a distinção entre prova material e falta de prova. Não abrir G2-C-B automaticamente, não redigir prompt nem executar experimento. F permanece alternativa legítima.

## 13. Testes, mutantes e preservação

Antes de novas fontes G2-C-A:15 suítes históricas elegíveis, **713 PASS/0 FAIL/0 skipped**,388994,3375ms, sob barreira técnica S2-G-A. Nenhum runner real, rede ou credencial. Após adicionar análise/testes: **43 PASS/0 FAIL/0 skipped**,2452,4075ms na última execução. São756 testes distintos cobertos em execuções separadas; não se afirma rerun conjunto dos756.

A primeira passagem nova teve42 PASS/1 FAIL porque eu havia anotado grounding como pergunta inválida deGG24. Conferi o ledger imutável, que mostra factuality, e corrigi somente a expectativa nova, mantendo comparação estrita. Após isso43 PASS; nova execução43 PASS após explicitar grauPLAUSIBLE da hipótese de mecanismo macro. Nenhuma expectativa histórica foi enfraquecida. [Certificação de testes](experiments/jev/guard/g2ca/tests.json) e [plano](experiments/jev/guard/g2ca/test-plan.md).

**12/12 mutantes mortos**, baseline válida em cada cópia e zero sobreviventes: remoçãoGG29; inválido com verdict; estrutura como vitória semântica; oracle acomodado; I→R; confidence corretiva; críticoFULL0/14; agreement36/36; backfillGG36; ordem causal; reasoning inventado; comparison reclassificada. Mutantes somente em memória, sem tocar arquivos históricos. [Relatório de mutação](experiments/jev/guard/g2ca/mutation-report.json).

**486 arquivos históricos diretos,769 do produto e15 listas de namespaces preservados**, incluindo G2-B inteiro, fontes/freezes, outputs, índices, locks e autorização. S0–S2 e verificações transitivas, G1 negativo, conclusão G2-A e HOLD S2-B mantidos. [Verificação final](experiments/jev/guard/g2ca/preservation.json) e [freeze da análise](experiments/jev/guard/g2ca/freeze.json). A propagação foi somente APPEND, preservando prefixo46919 bytes/SHA256b7ffb21d3b052021535246907f643931aaa22cdc80978b8181c8ee5a65e4571e; prova em [preservação do append](experiments/jev/guard/g2ca/propagation-preservation.json).

## 14. Escopo, limites e encerramento

Antes, existiam evidências G2-B sem esta decomposição. Agora há apenas análise/documentação/testes offline isolados, este relatório e append da propagação. Áreas impactadas: namespace g2ca e documentação; **Angario/web/schema/RLS/prompts Production INALTERADOS**. Nenhum endpoint, flag, worker, UI, guard, shadow ou integração. PROJECT.md permanece sem mudança arquitetural permanente.

JEV/OpenAI/rede/créditos/credenciais/Production/DB/Radar/WhatsApp: **0 neste gate**. Nenhum raw ou raciocínio foi reconstruído. Privacidade verificada por inspeção de fontes, campos e padrões sem ler secrets. Não houve commit, push, merge, PR ou deploy.

Validações: suítes offline acima, invariantes/mutantes, hashes/listas, links locais/referências e whitespace. Build/lint/TypeScript/smoke de UI/produto não foram executados por não haver mudança de produto. Fluxos reais não foram exercitados nem são declarados validados por esta decomposição. Não há smoke real autorizado ou necessário para fechar este gate estritamente offline. Próxima implementação/integracão exigiria outro escopo e regressão/smoke próprios.

Riscos e limites: n36/R1 sintético; seleção retrospectiva dos casos; oracle assistido no contrafactual não generalizável a operação; erros dimensionais não provam causas macro; falta de raw e ordem interna desconhecida; paridade confundida com posição; cobertura crítica FULL incompleta; ambiguidades de redação e taxonomiaPASS/N/A; ausência de billing direto. Esses limites são mantidos, sem preencher lacunas com inferências internas.

**STOP. Próxima decisão humana; zero novas chamadas, prompts, implementação, integração ou reutilização da autorização.**
