# GMP-17 — ressalva removida

Os 18 pares mínimos são contrastes do corpus, separados dos 36 pares causais FULL×REDUCED. FULL: 14 PASS/1 FAIL/3 INCONCLUSIVE; REDUCED: 17 PASS/1 FAIL/0 INCONCLUSIVE.

Endpoint A GG0-04 e endpoint B GG0-29 têm a mesma pergunta sobre valor e taxa, a mesma fonte atual 1800 de A, comercial UNCONFIRMED, protocolos vazios, catálogo/evidência COMPLETE e entidade RESOLVED.

- A candidata: “O valor do IMOVEL_A é 1800. A taxa administrativa não está confirmada.”
- B candidata: “O valor do IMOVEL_A é 1800.”
- Única mudança congelada, path=candidate_answer, kind=REMOVE_TEXT: remover “ A taxa administrativa não está confirmada.”. Nenhum fato, fonte, entidade, tempo ou protocolo muda.
- Expected flip: APPROVE → REJECT. FULL observado: APPROVE → APPROVE. REDUCED observado: APPROVE → APPROVE. PAIR_FAIL nos dois.
- FULL omission: PASS → FAIL, corretamente detecta a mudança material. coverage: PASS → INCONCLUSIVE, expected PASS → FAIL. partial_answer_allowed permanece PASS nos dois, porque oportunidade de parcial legítima não valida a candidata específica.

Hipótese suportada por saída: um sinal material corretamente detectado não foi respeitado pelo verdict FULL, junto de erro coverage. REDUCED também não respeitou o contraste macro, mas não possui dimensões para localizar a etapa. Mecanismo interno UNDETERMINED; sem reconstruir reasoning. Os outros 17 pares e endpoints estão preservados no [artefato histórico](../../results/jev-guard-g2b-1792280596715-d49a4dc0/minimal-pair-metrics.json). [Diferença congelada](../g2b0/minimal-pairs.json).
