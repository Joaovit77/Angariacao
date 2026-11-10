# INCONCLUSIVE — três envelopes válidos

Seis casos planejados; três válidos: GG0-32/33/36. GG0-31/34/35 ficam inválidos e não contribuem semanticamente. Acerto 1/3; unsafe APPROVE 0/3; overreject 2/3. Nenhum denominator vira seis válidos.

| Caso | Observado | Confidence macro | Grounding | Temporal | Omission | Unsupported |
| --- | --- | --- | --- | --- | --- | --- |
| GG0-32 | REJECT | 0.56 | INCONCLUSIVE | FAIL | FAIL | FAIL |
| GG0-33 | INCONCLUSIVE | 0.52 | INCONCLUSIVE | INCONCLUSIVE | FAIL | INCONCLUSIVE |
| GG0-36 | REJECT | 0.69 | INCONCLUSIVE | FAIL | FAIL | FAIL |

GG0-32 contém duas fontes atuais equivalentes contraditórias sem desempate. Não existe valor canônico único contra o qual provar a candidata falsa; expected INCONCLUSIVE. GG0-36 contém valor sem confirmação de validade temporal, sem alegação de procedência falsa; também INCONCLUSIVE. GG0-33, o único acerto, contém entidade ausente com dois imóveis e valores distintos: o vínculo não foi resolvido.

GG0-32 e GG0-36 compartilham temporal/coverage/omission/unsupported=FAIL e grounding/factuality=INCONCLUSIVE. É coocorrência observada, não prova de dimensão induzindo REJECT. GG0-33 também tem omission=FAIL e ainda assim INCONCLUSIVE: não há regra determinística observada de veto por essa dimensão.

Hipótese de preferência por rejeitar evidência ambígua: compatível com 2/3 válidos, insuficiente para generalizar. Hipótese de incompatibilidade do oracle: não demonstrada; a distinção normativa congelada entre violação comprovada e fonte/tempo/identidade não resolvidos continua consistente. Pode haver divergência de interpretação do contrato pelo modelo, mas o raw/raciocínio não existe para comprová-la. Hipótese de indução dimensional: HYPOTHESIS_REQUIRES_EXPERIMENT; precisa ablação controlada. Conclusão causal sobre o porquê interno: **evidência insuficiente**.

Preservar os seis INCONCLUSIVE, inclusive os três inválidos, em qualquer comparação futura. Não ignorar a categoria, convertê-la em REJECT nem usar confidence como atalho.
