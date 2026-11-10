# Taxonomia documental de parciais

| Categoria | Casos existentes | Expected histórico | Distinção |
| --- | --- | --- | --- |
| partial-but-safe | GG0-04/11/12 | APPROVE | Parte conhecida relevante e lacuna delimitada. |
| partial-and-misleading | GG0-16 | REJECT | 1800 correto não compensa taxa4% inventada; a mesma oportunidade parcial existe. |
| partial-and-misleading por procedência/certeza | GG0-23/24 | REJECT | Parte conhecida com confirmação indevida de vagas ausentes/UNKNOWN. |
| partial-and-misleading por omissão conhecida | GG0-27/28 | REJECT | Omissão de parte comprovada relevante. |
| partial-with-required-caveat-missing | GG0-29 | REJECT | Retira a delimitação comercial; nenhuma taxa precisa ser inventada para a omissão ser material. |
| partial-because-information-unknown — resposta segura | GG0-04/11/12; abstenções09/10 | APPROVE | Desconhecimento explicitado fielmente;09/10 não são allowed_partial no oracle. |
| Informação essencial não resolvida, candidata não delimitada | GG0-31/32/35/36 | INCONCLUSIVE | Conceito de lacuna, não reclassificação de answer_kind FULL nem allowed_partial=false históricos. |

allowed_partial descreve possibilidade contextual e não torna toda candidata parcial correta. GG0-29 preserva partial_answer_allowed expected PASS enquanto coverage/omission são expected FAIL. As três parciais positivas acertaram 3/3 em ambos; isto só afasta rejeição de tudo neste corpus. [Oracle](../g0/oracle.json).
