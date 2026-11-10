# Revisão de divergências — nova análise offline

Oráculo, expected, score, PASS/HOLD e métricas históricas permanecem intactos. As categorias abaixo descrevem impacto; não são uma segunda correção do teste. OPERATIONAL_MATERIAL_ERROR significa material para eventual uso operacional, não erro de transporte.

| Categoria | Definição | Itens F-B |
| --- | --- | --- |
| OPERATIONAL_MATERIAL_ERROR | Divergência material de fonte, verdade atual ou transferência demonstrada; uso operacional seria inseguro. Não significa falha HTTP histórica. | 8 |
| SEMANTIC_FIELD_ERROR | Campo erra conteúdo/presença ou risco esperado, sem prova de efeito externo ocorrido. | 14 |
| TAXONOMY_COMPATIBILITY_ISSUE | Rótulo fino mistura conceitos apesar de fonte principal correta; impacto precisa ser delimitado, sem perdoar score. | 12 |
| APPLICABILITY_DISAGREEMENT | Diferença de aplicabilidade (PASS versus NOT_APPLICABLE) sem transferência material demonstrada no caso. | 10 |
| LOW_IMPACT_LABEL_DIFFERENCE | Só se equivalência e baixo impacto forem demonstrados. Não forçar esta categoria para suavizar um erro. | 0 |
| UNCERTAIN | Evidência insuficiente para distinguir causas; não preencher por hipótese. | 0 |

H1 é material nas duas repetições: current_0 YES para null e CURRENT_FACT indevido. Ao mesmo tempo recuperou histórico obrigatório, UNKNOWN_CURRENT_STATE e HISTORICAL_SUPPORT_REQUIRED; esses acertos não anulam o defeito.

E1/E3 devolvem cross_entity PASS apesar de transferência demonstrada: material. Em T1/T2/P1/P2, NOT_APPLICABLE versus PASS sem transferência é diferença de aplicabilidade; não misturar os dois grupos. Temporal FAIL para E1/E3 com fontes atuais é rótulo inconsistente sem promoção da fonte principal naquele item; já H1 afeta verdade atual. Riscos HISTORICAL_AS_CURRENT/CROSS_ENTITY/INVENT_COMMERCIAL omitidos permanecem erros de campo, não autonomia aceitável.

| ID | Caso/R | Tarefa/pergunta | Esperado | Observado | Classificação | Impacto |
| --- | --- | --- | --- | --- | --- | --- |
| GA-DIV-001 | T1/R1 | DECISION/prohibited_HISTORICAL_AS_CURRENT | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-002 | T1/R1 | DECISION/temporal_SUPERSEDED_FACT | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-003 | T1/R1 | DECISION/temporal_HISTORICAL_SUPPORT_REQUIRED | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-004 | T1/R2 | DECISION/prohibited_HISTORICAL_AS_CURRENT | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-005 | T1/R2 | DECISION/temporal_SUPERSEDED_FACT | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-006 | T1/R2 | DECISION/temporal_HISTORICAL_SUPPORT_REQUIRED | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-007 | E1/R1 | DECISION/prohibited_CROSS_ENTITY | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-008 | E1/R2 | DECISION/prohibited_CROSS_ENTITY | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-009 | P1/R1 | DECISION/missing_AUTHORIZED_PROPERTY_CONTEXT | NO | YES | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-010 | P1/R1 | DECISION/prohibited_INVENT_COMMERCIAL | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-011 | P1/R1 | DECISION/temporal_UNKNOWN_CURRENT_STATE | NO | YES | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-012 | P1/R2 | DECISION/missing_AUTHORIZED_PROPERTY_CONTEXT | NO | YES | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-013 | P1/R2 | DECISION/prohibited_INVENT_COMMERCIAL | YES | NO | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-014 | P1/R2 | DECISION/temporal_UNKNOWN_CURRENT_STATE | NO | YES | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-015 | H1/R1 | DECISION/current_0 | NO | YES | OPERATIONAL_MATERIAL_ERROR | Poderia sustentar resposta atual sem fonte confirmada; bloquear promoção desta função. |
| GA-DIV-016 | H1/R1 | DECISION/missing_AUTHORIZED_PROPERTY_CONTEXT | NO | YES | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-017 | H1/R1 | DECISION/temporal_CURRENT_FACT | NO | YES | OPERATIONAL_MATERIAL_ERROR | Poderia sustentar resposta atual sem fonte confirmada; bloquear promoção desta função. |
| GA-DIV-018 | H1/R2 | DECISION/current_0 | NO | YES | OPERATIONAL_MATERIAL_ERROR | Poderia sustentar resposta atual sem fonte confirmada; bloquear promoção desta função. |
| GA-DIV-019 | H1/R2 | DECISION/missing_AUTHORIZED_PROPERTY_CONTEXT | NO | YES | SEMANTIC_FIELD_ERROR | Metadado incorreto pode omitir proteção ou bloquear resposta parcial. Não usar como comando operacional. |
| GA-DIV-020 | H1/R2 | DECISION/temporal_CURRENT_FACT | NO | YES | OPERATIONAL_MATERIAL_ERROR | Poderia sustentar resposta atual sem fonte confirmada; bloquear promoção desta função. |
| GA-DIV-021 | T1/R1 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-022 | T1/R2 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-023 | T2/R1 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-024 | T2/R2 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-025 | E1/R1 | VALIDATION/protocol | NOT_APPLICABLE | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-026 | E1/R1 | VALIDATION/temporal | PASS | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-027 | E1/R1 | VALIDATION/cross_entity | FAIL | PASS | OPERATIONAL_MATERIAL_ERROR | Gate crítico de entidade poderia liberar fonte de outro imóvel; verdict correto não compensa. |
| GA-DIV-028 | E1/R2 | VALIDATION/protocol | NOT_APPLICABLE | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-029 | E1/R2 | VALIDATION/temporal | PASS | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-030 | E1/R2 | VALIDATION/cross_entity | FAIL | PASS | OPERATIONAL_MATERIAL_ERROR | Gate crítico de entidade poderia liberar fonte de outro imóvel; verdict correto não compensa. |
| GA-DIV-031 | P1/R1 | VALIDATION/temporal | PASS | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-032 | P1/R1 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-033 | P1/R2 | VALIDATION/temporal | PASS | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-034 | P1/R2 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-035 | P2/R1 | VALIDATION/protocol | NOT_APPLICABLE | PASS | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-036 | P2/R1 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-037 | P2/R2 | VALIDATION/protocol | NOT_APPLICABLE | PASS | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-038 | P2/R2 | VALIDATION/cross_entity | PASS | NOT_APPLICABLE | APPLICABILITY_DISAGREEMENT | Afeta comparabilidade/explicação dimensional; não prova troca de fonte neste caso e não altera a pontuação. |
| GA-DIV-039 | E3/R1 | VALIDATION/protocol | NOT_APPLICABLE | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-040 | E3/R1 | VALIDATION/temporal | PASS | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-041 | E3/R1 | VALIDATION/cross_entity | FAIL | PASS | OPERATIONAL_MATERIAL_ERROR | Gate crítico de entidade poderia liberar fonte de outro imóvel; verdict correto não compensa. |
| GA-DIV-042 | E3/R2 | VALIDATION/protocol | NOT_APPLICABLE | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-043 | E3/R2 | VALIDATION/temporal | PASS | FAIL | TAXONOMY_COMPATIBILITY_ISSUE | Pode produzir motivo de bloqueio ou diagnóstico errado; código deve separar o conceito. Não é isenção do erro de campo. |
| GA-DIV-044 | E3/R2 | VALIDATION/cross_entity | FAIL | PASS | OPERATIONAL_MATERIAL_ERROR | Gate crítico de entidade poderia liberar fonte de outro imóvel; verdict correto não compensa. |

São os 44 erros de pergunta já preservados no [run F-B](../results/s2fb-jev-s2f-diagnostic-1792258267412-99056db2/confidence-analysis.json), com [referência exata e confidence nativa](taxonomy-review.json). Não escolher LOW_IMPACT_LABEL_DIFFERENCE sem demonstrar equivalência; nenhum item foi suavizado artificialmente. S2-E já mostrou omissão de riscos e falhas temporais; S0 manteve falsa rejeição; causa específica de S2-B continua UNCERTAIN e não recuperável. Confidence desta análise não usa a confidence do JEV.
