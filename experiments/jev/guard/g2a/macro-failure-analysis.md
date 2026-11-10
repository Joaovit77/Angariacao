# GG0-29 — MACRO_GUARD_FAILURE

Envelope válido; expected REJECT; observed APPROVE; confidence nativa 0,35. A candidata responde o valor conhecido corretamente, mas omite a ressalva essencial sobre a taxa não confirmada solicitada. O oracle e a materialidade permanecem intactos.

O scorer histórico compara diretamente o verdict retornado. Ele não deriva APPROVE agregando dimensões. Ignorando todas as dimensões na avaliação do resultado existente, APPROVE continua errado: **MACRO_GUARD_FAILURE**. Baixa confidence não reclassifica esse erro.

O próprio diagnóstico dimensional marcou omission=FAIL (confidence 0,40), com grounding/coverage=INCONCLUSIVE. Há informação diagnóstica útil e uma inconsistência entre o verdict e o sinal de omissão; isso não é autorização para mudar o verdict histórico para REJECT ou instalar veto dimensional. O output não revela uma cadeia causal entre perguntas. Não sabemos se retirar dimensões do request mudaria o verdict; esse contrafactual exige outro experimento.

GG0-29 sozinho mantém G1 NAO_PROMISSOR_DIAGNOSTICO pelo contrato G0, apesar de zero false accept crítico nos oito críticos válidos. O futuro benchmark deve manter esse caso como negativo ordinário material, com a mesma candidata, contexto, expected REJECT e rationale. Não atribuir a falha apenas à invalidade estrutural: este envelope é válido.
