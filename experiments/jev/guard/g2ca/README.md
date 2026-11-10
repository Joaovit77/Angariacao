# JEV-GUARD-G2-C-A — decomposição offline

Análise de saídas tipadas preservadas do G2-B, sem rede, credencial, preço atual ou raw. [Metodologia](methodology.md) registrada antes do analisador; [fatos](g2b-facts.json), [GG0-29](gg0-29-analysis.md), [inconclusivos](inconclusive-analysis.md), [inválidos](full-invalid-analysis.md), [dimensões](dimension-analysis.md), [GMP-17](minimal-pair-analysis.md) e [opções](next-experiment-options.json).

O gerador somente escreve novos artefatos neste namespace, recusa regeneração após freeze e usa a barreira offline S2-G-A. analysis.mjs é puro; io.mjs só lê paths de evidência explícitos e hashes do snapshot. Nenhum executor real é importado. O contrafactual assistido pelo oracle não é um scorer de produto.

G2-B permanece PASS EXECUTION, ambos NAO_PROMISSOR_DIAGNOSTICO, COMPARISON_INCONCLUSIVE e autorização CLOSED sem saldo. Nenhum prompt, guard, integração ou produto é implementado. [Relatório](../../../../RELATORIO-JEV-GUARD-G2-C-A.md).
