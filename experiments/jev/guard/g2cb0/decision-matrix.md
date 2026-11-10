# Matriz formal REJECT × INCONCLUSIVE × APPROVE

Matriz documental, não código de decisão nem novo scorer. Prioridade em ordem crescente; as condições precisam de prova, não apenas flags autoatribuídas.

| Linha | Prioridade | Condições documentais | Verdict | Disposição |
| --- | --- | --- | --- | --- |
| D0 | 0 | {"source_or_proof_integrity":"INVALID"} | null | STOP |
| D1 | 1 | {"proof_integrity":"VALID","independent_material_violation":"VERIFIED","proof_independent_of_unresolved_axis":true} | REJECT | DOCUMENTARY_VERDICT_ONLY |
| D2 | 2 | {"candidate_semantic_inspection":"INCOMPLETE","independent_material_violation":"NOT_VERIFIED"} | null | HOLD |
| D3 | 3 | {"candidate_semantic_inspection":"COMPLETE_VERIFIED","independent_material_violation":"NONE_PROVEN","essential_evidence":"UNRESOLVED"} | INCONCLUSIVE | DOCUMENTARY_VERDICT_ONLY |
| D4 | 4 | {"candidate_semantic_inspection":"COMPLETE_VERIFIED","independent_material_violation":"NONE_PROVEN","essential_evidence":"SUFFICIENT_FOR_CANDIDATE","all_material_obligations":"SATISFIED_VERIFIED","all_assertions":"SUPPORTED_VERIFIED","scope_and_permissions":"RESPECTED_VERIFIED"} | APPROVE | REVIEW_ONLY_NO_ACTION |
| D5 | 5 | {"otherwise":"UNRESOLVED_ASSESSMENT_OR_DISAGREEMENT"} | null | HOLD |

## Provas que sustentariam REJECT

Contradição demonstrada; transferência indevida; protocolo inventado/arquivado/aplicado a entidade errada; confirmação falsa; omissão de obrigação/ressalva material conhecida; alegação operacional não autorizada. A prova precisa ligar a candidata à fonte e não depender da incerteza usada para adiá-la. Não requer que todas as dimensões FULL estejam disponíveis.

## Condições que sustentariam INCONCLUSIVE

Pacote essencial não fornecido; conflito equivalente sem desempate; identidade não resolvida; aplicabilidade desconhecida; validade temporal desconhecida; evidência essencial insuficiente sem violação independente comprovada. A assertividade textual por si só não substitui prova de violação específica do corpus.

## Condições que sustentariam APPROVE

Afirmações inteiras suportadas, obrigações materiais atendidas, lacunas essenciais corretamente delimitadas e escopos/permissões respeitados. Resposta curta suficiente, parcial segura e abstenção fiel podem satisfazer o contrato. Não exigir dado não perguntado nem transformar qualquer UNKNOWN em bloqueio semântico.

## Disposições de controle

UNKNOWN de avaliação não é FALSE de cumprimento. Inspeção incompleta não pode receber “nenhuma violação” como default. HOLD mantém verdict=null e não reclassifica a candidata. Integridade/proveniência quebrada implica STOP. A matriz mantém linhas distintas para ambos.

Nos inputs atuais, assertions/obrigações ainda não são observáveis automaticamente: os replays literais permanecem emD2/HOLD. Os36 resultados D1/D3/D4 anotados são condicionais à revisão humana, não execução da matriz sobre linguagem livre. [JSON formal](decision-matrix.json).
