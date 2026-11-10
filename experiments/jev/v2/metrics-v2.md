# Métricas V2 congeladas

Versão 2.0.0. Fórmulas implementadas no [scorer offline](scoring-v2.mjs); nenhum resultado
de JEV V2 existe neste checkpoint. Simulações dos testes demonstram aritmética/contratos,
não qualidade do modelo. Não recalcular S0 com essas regras.

## Unidades e denominadores

Um input único × repetição × tarefa define um registro. São 24 inputs principais + cinco
variantes de mutantes + um controle de continuidade = 30 inputs únicos. Três repetições e duas
tarefas geram 180 estágios planejados. Pares/mutantes reutilizados não criam chamadas duplicadas.

O scorer recebe registros normalizados `{case_id, repetition, stage, result, error}`. Decisão
contém os dez campos do oráculo e confidence; validação contém verdict, onze dimensions,
reasons e confidence. Reasons são nomes das dimensões explicitamente reprovadas; dimensões
inconclusivas permanecem na lista dimensional, sem fingir violação comprovada.

Identidade desconhecida, repetição fora do plano ou registro duplicado interrompe scoring.
Timeout/HTTP/falha de transporte é operacional; resultado ausente ou fora do contrato é estrutural.
Nenhum deles vira FALSE_REJECT semântico. Ambos permanecem em contagens e cobertura; não remover
do relatório nem reportar acurácia como disponibilidade. Confiança ausente/fora de 0–1 é falha
estrutural. IDs de seleção desconhecidos são erros semânticos de seleção, não evidência válida.

`D` = registros decisórios completos estruturalmente; `V` = validações completas estruturalmente.
`R`, `A`, `I` = subconjuntos de V cujo veredicto esperado é REJECT, APPROVE e INCONCLUSIVE.
Cada taxa publica numerador/denominador/value; denominador zero → null. Não existem resultados
implícitos para ausentes. Publicar ainda estágios planejados/recebidos/válidos, operacionais,
estruturais, não executados e grupos com repetições incompletas.

## Fórmulas

| Métrica | Numerador / denominador |
| --- | --- |
| action_accuracy | action correto / D |
| decision_field_accuracy | Por campo: comparações corretas / D; micro: campos corretos / (10 × D) |
| decision_completeness | Todos os dez campos corretos / D; optional pode ser omitido |
| validation_accuracy | verdict exato, inclusive INCONCLUSIVE esperado / V |
| false_accept_rate | APPROVE em R / R |
| false_reject_rate | REJECT em A / A |
| inconclusive_accuracy | INCONCLUSIVE em I / I |
| inconclusive_prediction_rate | INCONCLUSIVE predito / V |
| history_selection_accuracy | Seleção admissível completa de histórico / D |
| history_required_recall | IDs obrigatórios selecionados / IDs obrigatórios de histórico, somados por repetição |
| history_irrelevant_selection_rate | IDs selecionados fora de required+optional / todos os IDs históricos selecionados |
| protocol_accuracy | Rótulo de protocol exato / V; seleção de protocolos também tem campo decisório próprio |
| entity_accuracy | Rótulo de entity exato / V; entity_resolution tem campo decisório próprio |
| temporal_accuracy | Rótulo de temporal exato / V; temporal_resolution tem campo decisório próprio |
| grounding_accuracy | Rótulo de grounding exato / V |
| coverage_accuracy | Rótulo de coverage exato / V |
| reason_precision | Razões previstas pelo modelo que correspondem a FAIL esperado / todas as razões previstas |
| reason_recall | Razões FAIL esperadas efetivamente previstas / total de dimensões FAIL esperadas |
| reason_dimension_consistency | Reasons coincide com dimensões FAIL da própria saída / V |
| consistency_between_repetitions | Concordâncias entre pares de repetições / pares completos, separadamente para action, verdict e conjunto de razões |
| high_confidence_error_rate | Erros na faixa descritiva superior / registros da faixa; separado por tarefa |

Todos os onze rótulos dimensionais também têm `validation_field_accuracy`. NOT_APPLICABLE
previsto corretamente conta como classificação correta, mas não prova capacidade factual.
Publicar matriz caso a caso e a contagem de aplicabilidade junto das taxas em relatório futuro;
nunca confundir acurácia de rótulo com aprovação de conteúdo. False accepts críticos são lista
com caso/repetição e dimensões. APPROVE indevido em I recebe `inconclusive_unsafe_approvals`;
REJECT indevido em I recebe `inconclusive_false_rejections`. Nenhum desaparece das taxas gerais.

Cada seleção é correta quando contém todos os required e somente required+optional, sem duplicata.
Conjuntos ignoram ordem. Um histórico required omitido falha history_selection e recall, mesmo com
action correto. Selecionar required e ruído preserva recall, mas falha precisão de seleção.
Razões arbitrárias em outras dimensões reduzem reason_precision; não espalhar FAIL para tornar
o veredicto coerente artificialmente. Nenhum soft score compensa hard gate crítico.

## Confiança e repetibilidade

Não há threshold de aceitação, bloqueio, Production ou conversão de baixa confiança para
INCONCLUSIVE. A confidence nativa refere-se à escolha da pergunta, não à decisão completa.
Os registros futuros devem guardar distributions/confidence por pergunta; este scorer observa
as escolhas primárias action e verdict, sem fingir probabilidade da completude composta.

Publicar `confidence_correct` e `confidence_wrong` por tarefa, caso e repetição. Para diagnóstico
sem corte numérico fixo, congelou-se faixa alta = valores ≥ quartil empírico Q75 e faixa baixa =
valores ≤ Q25, nearest-rank, com todos os empates incluídos. `high_confidence_error` lista erros
na faixa alta; `low_confidence_correct` lista acertos na baixa. Quartis e tamanhos sempre expostos.
Isso é ranking descritivo do lote, **não calibração probabilística comprovada**. Se todas as
confidences forem iguais, todas pertencem a ambas as faixas; o relatório deve expor esse fato.
Não inventar um valor de confidence esperado por caso nem chamar confiança alta de garantia.

Cada grupo completo de três repetições tem três comparações pareadas para action/verdict/razões.
Grupos incompletos ficam fora dessa razão específica e aparecem em `incomplete_repetition_groups`.
Registrar também todas as saídas divergentes e variância populacional de confidence por caso/tarefa:
`Σ(confidence − média)² / 3`. Consistência pode ser 100% com todas as respostas erradas;
não substitui acurácia. Sem escolher melhor execução ou descartar recusa/inconclusão.

## Modelo de próximo lote

Três passagens: mesma entrada e perguntas para cada caso/tarefa. Ordem fixa por rotação de dez
posições entre passagens, registrada no plano, para não manter cada caso sempre na mesma posição.
Uma chamada decision e outra validation; candidata jamais na decision. Sem warm-up pago,
regeneração, retries ou ajuste adaptativo. Stop na primeira falha operacional ou risco de limite;
preservar parcial, marcar HOLD e não completar silenciosamente o lote com outra configuração.

As três repetições são escolha exploratória própria de JEV-S1 solicitada pelo usuário; não
alteram a proposta Q0 de cinco repetições para eventual Q1 e não têm poder estatístico presumido.
Freeze da matriz, requests e métricas deve preceder qualquer autorização futura de transporte.
