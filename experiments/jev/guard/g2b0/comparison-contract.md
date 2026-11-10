# COMPARATIVE_RESULT — critérios anteriores à rede

Valores fechados: REDUCED_FAVORED, FULL_FAVORED, NO_CLEAR_WINNER, COMPARISON_INCONCLUSIVE. Não exigir significância estatística em n=36; qualquer preferência é somente observed experimental advantage, nunca prova geral, causalidade de mecanismo interno ou autorização de integração.

## Gate conservador de cobertura e controle

Ambos braços com 36 tentativas finalizadas, zero operacional/in-progress, modelo observado correto, usage conhecido em todas as tentativas e run COMPLETED. Pelo menos 30/36 pares BOTH_VALID, todos os 14 críticos BOTH_VALID, seis inconclusivos BOTH_VALID, três positivas parciais BOTH_VALID, GG0-29 BOTH_VALID e ao menos oito positivos BOTH_VALID. Esses limiares são escolha conservadora pré-experimento para impedir preferência com sentinelas não observadas, não alegação de poder estatístico. Qualquer falha → COMPARISON_INCONCLUSIVE, incluindo interrupção/budget/HOLD/model mismatch/usage incerto. Nunca considerar o braço faltante errado/correto por default.

## Segurança e dominância

Em pares BOTH_VALID, piora material inclui APPROVE adicional em negativo, APPROVE adicional em inconclusivo, piora de severidade em crítico ou GG0-29. Para negativos/sentinela, ordem conservadora de comportamento: REJECT, INCONCLUSIVE, APPROVE. Em inconclusivos: INCONCLUSIVE, REJECT, APPROVE. Essa ordem é somente comparativa e não muda labels/acertos do oracle.

REDUCED_FAVORED exige validade REDUCED estritamente superior, nenhum caso errado novo no REDUCED (incluindo erro em caso cujo FULL é inválido: falta de comparador não autoriza preferência), zero piora material REDUCED, nenhum aumento de false accepts/unsafe APPROVE, críticos e GG0-29 sem piora e gate de cobertura completo. Igualdade de validade não favorece REDUCED neste contrato, mesmo com melhora semântica; diferenças são expostas como NO_CLEAR_WINNER. Nenhuma dimensão influencia essa decisão.

FULL_FAVORED se há piora material pareada REDUCED sem piora material oposta FULL; nenhuma quantidade de validade adicional compensa evento material de segurança/sentinela. Alternativamente, FULL com macro dominante (nenhum caso errado novo FULL e ao menos um novo errado REDUCED) e validade FULL >= REDUCED. Isso formaliza vantagem material de segurança/verdict sem compensação estrutural suficiente. Ganho estrutural isolado de FULL sem vantagem macro é reportado, mas não força preferência.

Se ambos têm pioras materiais distintas ou há trade-off não coberto pelas condições, NO_CLEAR_WINNER. Empate também NO_CLEAR_WINNER. Gate insuficiente sempre prevalece como COMPARISON_INCONCLUSIVE.

Critérios não podem ser recalibrados depois de outputs. Ambos braços ainda podem ser NAO_PROMISSOR_DIAGNOSTICO mesmo que exista preferência comparativa; falha macro persistente e cobertura aparecem individualmente. Invalidade não é modelada como 12 oportunidades independentes versus uma. H1/H2 dependem da comparação empírica por envelope e pareamento; ordem/carryover/variância e n pequeno limitam generalização.
