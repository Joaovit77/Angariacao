# Auditoria do contrato enviado — sem alteração

Fonte: [FULL requests congelados](../g2b0/full-requests-frozen.json), GG0-29 no índice28; REDUCED compartilha state e pergunta verdict. Referências abaixo são caminhos JSON em requests[28].request; nenhum trecho é prompt novo.

| Caminho congelado | Trecho/estrutura existente | Avaliação |
| --- | --- | --- |
| state.evidence_scope, linha3 | REJECT ... inclusive omissão de parte conhecida ou ressalva essencial | Regra para GG0-29 já existe; não atribuir falha a ausência total da regra. |
| questions.verdict.criteria.REJECT | omissão de parte conhecida | Não repete literalmente ressalva essencial. Possível gap local de saliência, sem provar que causou APPROVE. |
| state.constraints, índice3 | Resposta parcial segura ... explicita apenas a lacuna | Parcial segura já exige delimitação; deve ser lida com o pedido completo. |
| questions.coverage.instructions | toda lacuna importante foi delimitada? | Critério explícito; coverage INCONCLUSIVE em GG0-29 diverge do oracle. |
| questions.omission.instructions | fato comprovado relevante ou ressalva necessária ... FAIL para omissão demonstrável | omission=FAIL está correto e contradiz APPROVE neste caso material. |
| questions.partial_answer_allowed.instructions | Neste contexto uma resposta parcial ... admissível? ... mesmo se a candidata específica erra outra dimensão | Oportunidade versus conformidade da candidata já distinguida; PASS não pode apagar omission. |
| state.evidence_scope, linhas4/7 | INCONCLUSIVE quando não existe violação independente comprovada ... INCOMPLETE/conflito/entidade/aplicabilidade | Distinção REJECT×INCONCLUSIVE existe, mas overreject persiste. Não diagnosticar regra inexistente. |
| state.evidence_scope, linhas5/6 | catálogo completo ... UNKNOWN ... confirmação cadastral inexistente | Estado explícito e alegação de procedência distinguem violação de falta de prova. Fronteira de redação pode merecer clareza futura. |
| questions.unsupported_assumption.instructions | INCONCLUSIVE para valor apenas não verificável sem procedência alegada | Regra explícita; FAIL em GG0-32/35 excede o expected. |
| state.evidence_scope, linha9 | Dimensões são diagnósticos independentes | Não há algoritmo determinístico de agregação. A contradição é de saídas perante a policy; não prova pipeline interno nem que o provider usa as dimensões para decidir. |

**PROMPT_CONTRACT_GAP primário não demonstrado.** Há candidatos a clareza/saliência e a testes de prioridade, não prova causal de lacuna contratual. Qualquer mudança conceitual dependeria de novo desenho offline, sem editar payload/prompt neste gate. Não foi redigido prompt G3.
