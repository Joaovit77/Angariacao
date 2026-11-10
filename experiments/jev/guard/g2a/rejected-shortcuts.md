# REJECTED_SHORTCUTS

Estas opções não são solução padrão nem mudança proposta no parser.

| Atalho rejeitado | Risco |
| --- | --- |
| INCREASE_TOLERANCE | Aceitaria vetores incompatíveis e mudaria contrato histórico; déficit observado próximo de 1% não foi tratado como simples ruído de soma. |
| NORMALIZE_SUM | Altera as probabilidades observadas e mascara falha; não corrige defeito semântico GG0-29. |
| AUTO_MAX_CHOICE | Troca decisão retornada por inferência local, especialmente em factuality/temporal com margens pequenas. |
| PARTIAL_ENVELOPE_RECOVERY | Muda unidade de aceitação e infla cobertura; verdict local aceitável não torna o envelope inteiro elegível. |
| RETRY | Seleciona nova amostra, oculta primeira falha e consome autorização inexistente. |
| MAJORITY_VOTE | Muda desenho e unidade de análise, com custo e correlação desconhecidos. |
| REMOVE_HARD_CASES | Introduz seleção por resultado e remove justamente null, transferência, lacunas e inconclusivos relevantes. |
| CHANGE_ORACLE | Reescreve materialidade e critério após observações; GG0-29 continua REJECT esperado. |
| IGNORE_INCONCLUSIVE | Converte ausência de evidência em decisão indevida e esconde dois overreject. |
| INVALID_AS_REJECT | Confunde falha estrutural com julgamento semântico; pode produzir falso bloqueio e precisão inventada. |
| COERCE_TYPES | Aceita dados fora do contrato, podendo mudar números/opções; o parser estrito permanece autoridade. |

INVALID_AS_APPROVE também é proibido: uma falha nunca recebe permissão ou crédito semântico. Dimensão não reclassifica verdict histórico. Confidence baixa não apaga erro. Raw descartado não é reconstruído a partir de hash. Menos perguntas resolve é causalidade não demonstrada e não constitui conclusão deste estudo. Todos os onze mutantes de integridade/contrato morrem sobre cópias em memória; nenhum arquivo G1 é escrito.
