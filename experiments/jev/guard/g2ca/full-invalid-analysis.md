# Quatro FULL inválidos — somente estrutura

| Caso | Sequence | Pergunta | Posição / 12 | Opções | Soma JS observada | Delta de 1 | Choice diagnóstico | Confidence | Ordem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GG0-14 | 28 | partial_answer_allowed | 12 | 4 | 0.9900000000000001 | -0.009999999999999898 | NOT_APPLICABLE | 0.91 | REDUCED → FULL (2º) |
| GG0-22 | 44 | omission | 8 | 4 | 0.9900000000000002 | -0.009999999999999787 | FAIL | 0.57 | REDUCED → FULL (2º) |
| GG0-24 | 48 | factuality | 3 | 4 | 0.99 | -0.010000000000000009 | INCONCLUSIVE | 0.73 | REDUCED → FULL (2º) |
| GG0-36 | 72 | unsupported_assumption | 9 | 4 | 0.9900000000000001 | -0.009999999999999898 | FAIL | 0.57 | REDUCED → FULL (2º) |

Cada envelope tem uma pergunta dimensional inválida: 4/396 observações dimensionais; verdict estruturalmente inválido 0/36 como pergunta, sem recuperar semântica do envelope. Cada REDUCED tem uma pergunta e 0/36 inválidas. Os diagnósticos registram somas próximas de 0,99, além da tolerância histórica 1e-6. Não se completa soma, arredonda ou escolhe alternativa.

**STRUCTURAL_SURFACE_PROBLEM: SUPPORTED** no mecanismo observável: cada falha veio de pergunta extra que não existe no REDUCED, e uma pergunta invalida o envelope inteiro. Isso sustenta superfície adicional neste desenho, não taxa causal geral crescente por quantidade de perguntas.

Quatro inválidos entre 18 FULL em segunda posição, zero entre 18 em primeira. **DESCRIPTIVE ASSOCIATION ONLY**: paridade e conteúdo estão confundidos com posição; sem R2, randomização adicional ou isolamento de servidor, não concluir carryover, fadiga ou drift. Causa interna do provider UNDETERMINED. GG0-14/22/24 perdem cobertura crítica; GG0-36 perde cobertura inconclusiva.

Os choices/confidences da tabela são observações da pergunta estruturalmente inválida, sem correctness dimensional ou macro. normalized_verdict/result continuam null nos quatro. [Vetores e detalhes exatos](full-invalid-analysis.json).
