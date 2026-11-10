# Dimensões FULL válidas — denominador32

| Dimensão | Corretas/32 | Erros/32 | Expected N/A | Erro+macro correto | Erro+macro errado | P(macro errado/dim errada) | P(dim errada/macro errado) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| grounding | 32 | 0 | 0 | 0 | 0 | 0/0 NOT_TESTED | 0/4 |
| factuality | 26 | 6 | 0 | 6 | 0 | 0/6 | 0/4 |
| protocol | 22 | 10 | 26 | 8 | 2 | 2/10 | 2/4 |
| temporal | 20 | 12 | 5 | 10 | 2 | 2/12 | 2/4 |
| entity | 32 | 0 | 0 | 0 | 0 | 0/0 NOT_TESTED | 0/4 |
| coverage | 26 | 6 | 0 | 2 | 4 | 4/6 | 4/4 |
| omission | 23 | 9 | 7 | 6 | 3 | 3/9 | 3/4 |
| unsupported_assumption | 29 | 3 | 0 | 1 | 2 | 2/3 | 2/4 |
| cross_entity | 8 | 24 | 0 | 20 | 4 | 4/24 | 4/4 |
| safety | 32 | 0 | 0 | 0 | 0 | 0/0 NOT_TESTED | 0/4 |
| partial_answer_allowed | 24 | 8 | 24 | 5 | 3 | 3/8 | 3/4 |

352 observações elegíveis, 274 corretas e78 incorretas; todos os quatro FULL inválidos excluídos. A precisão dimensional integral ocorre em GG0-02/07/08:3/32; macro correto com alguma dimensão errada25/32; macro errado com dimensões suportando expected1/32 (GG0-29); suportando erro0/32; mistas3/32 (GG0-31/32/35). Dentro dos quatro erros macro, denominadores são1/4,0/4,3/4, respectivamente.

coverage erra em todos os quatro macros errados, mas também em dois corretos: P(macro errado/dim errada)=4/6, não causalidade. cross_entity erra em24, incluindo todos os quatro macros errados:4/24; não explica materialmente a omissão. omission erra em3/4 macros errados, mas acerta GG0-29: nenhum ranking único substitui a decomposição. grounding/entity corretas32/32 não garantem macro correto. safety32/32 tem só expected PASS e não mede detecção de safety FAIL.

Confusion, casos materiais, expected FAIL perdidos e confidence min/p50/p95/max/média com denominadores próprios estão no [mapa completo](dimension-error-map.json). “material_cases” significa materialidade do caso histórico, não que todo erro de taxonomia naquela dimensão seja material. Os três erros coverage/omission dos inconclusivos não tornam material o que o oracle deixou UNDETERMINED.

Conclusão arquitetural **E (B+C+D)**: utilidade para diagnóstico offline e telemetria descritiva sujeita a erro; superfície estrutural adicional observada sem mudança macro nos32 comparáveis. A necessidade das11 dimensões para controle da decisão não foi demonstrada. Não retirar exigências de qualquer contrato nem integrar outro formato.
