# Alternativas de arquitetura — somente estudo

| Modelo | Forma futura | Benefício possível | Custo/risco | Estado |
| --- | --- | --- | --- | --- |
| A — atual | Uma chamada verdict + 11 dimensões | Diagnóstico conjunto já observado | 12 vetores; 12/36 envelopes inválidos G1; macro falha GG0-29 | Controle experimental; sem promoção |
| B — verdict only | Uma chamada APPROVE/REJECT/INCONCLUSIVE | Menos superfície contratual e separação do objetivo macro | Perde explicação; verdict já falhou estruturalmente e semanticamente em G1 | HYPOTHESIS_REQUIRES_EXPERIMENT |
| C — two-stage | Macro primeiro; diagnóstico separado só para eval/shadow futuramente autorizado | Diagnóstico não determina liberação; decisões observadas independentemente | Duas chamadas, custo/latência/controle adicionais; diagnóstico posterior não prova causa do primeiro | Hipótese; nenhum shadow implementado/autorizado |
| D — small guard | Verdict + duas ou três perguntas justificadas | Possível sinal focado de grounding/omission/unsupported | Seleção post hoc, novo tratamento e nova superfície; benefício incremental desconhecido | Hipótese; não selecionar perguntas automaticamente |

Não existe obrigação lógica de macro e diagnóstico ocuparem a mesma chamada. Segurança de produto não migra para nenhum dos modelos: tenant, ownership, sessão/RLS, identidade, fonte/tempo, null/ausência, protocolo, taxa/preço/status, publicação, agenda, destinatário, finanças, idempotência e confirmação humana continuam em código.

Conclusão do estudo: **B — REDUCED_CONTRACT_EXPERIMENT_JUSTIFIED**. Trata-se da alternativa de conclusão da tarefa G2-A, não adoção automática do modelo arquitetural B. Justificativa: 11 bloqueios dimensionais localizados e objetivo macro separável justificam medir a ablação. Contrapesos: taxa local de falha igual, um erro no próprio verdict, GG0-29 macro errado e perda diagnóstica. Não há prova de superioridade nem de prontidão operacional. G1 permanece NAO_PROMISSOR_DIAGNOSTICO.

A comparação primária proposta é A versus B; C/D ficam hipóteses separadas. Nenhum modelo foi implementado no Angario, nem há decisão permanente de arquitetura a registrar no PROJECT.md.
