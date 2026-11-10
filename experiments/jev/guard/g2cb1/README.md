# JEV-GUARD-G2-C-B1 — Semantic Observability Audit Design

**OBSERVABILITY_INCONCLUSIVE / HOLD.** Somente desenho e auditoria documental offline. Nenhuma revisão humana, validação cega, criação de dataset, chamada de modelo, guard, extrator, prompt operacional ou implementação.

- [Relatório principal](../../../../RELATORIO-JEV-GUARD-G2-C-B1.md).
- [Mapa das seis famílias e 120 respostas](semantic-families.md) e [matriz de observabilidade](observability-matrix.md).
- [Comparação H1–H5](architecture-comparison.md).
- [Contrato de revisão humana futura e critérios cegos](human-review-contract.md).
- [Representação controlada conceitual](controlled-representation-contract.md).
- [Análise dos 36 casos, parciais, inconclusivos e críticos](case-analysis.md).
- [Threat model e failure modes](leakage-and-failure-modes.md).
- [Mutantes executados](mutants.md), [resultados](mutation-report.json) e [testes](tests.json).
- [Leitura prévia das fontes](source-reading-receipt.json), [admissibilidade](source-admissibility.json), [referências sem novo dataset](case-references.json).
- [Preservação anterior](preservation-before.json), [verificação final](preservation.json), [propagação append-only](propagation-preservation.json), [checagens documentais](document-checks.json) e [freeze](freeze.json).

Os arquivos JSON deste diretório são artefatos de auditoria, não schemas do produto. `document-audit.mjs` valida declarações documentais; não recebe linguagem natural para decidir um caso. Não há parser/extrator semântico. Os testes de mutação apenas verificam que uma alteração proibida dos artefatos faz a auditoria falhar.

Reprodução documental, a partir da raiz do repositório:

```powershell
node --import ./experiments/jev/s2g/offline-guard.mjs --test --test-reporter=tap experiments/jev/guard/g2cb1/document-audit.test.mjs
```

O preload bloqueia tecnicamente rede e falha se houver tentativa. Não carregar arquivos de ambiente. Não executar runners reais nem ensaios OpenAI. As cinco suítes históricas direcionadas estão registradas em tests.json; não se alega execução de toda a árvore.

Somente uma revisão independente da elegibilidade e do protocolo poderia ser considerada como próximo gate, mediante solicitação própria, sem ID novo neste gate. Ela não foi iniciada. Provider e implementação continuam fechados. **STOP.**
