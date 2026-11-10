# JEV-GUARD G0 — contrato e benchmark offline

G0 certifica desenho e testes, não o modelo. [Contrato](guard-contract.md), [catálogo de casos](benchmark-catalog.md), [oráculo](oracle.json), [pares](minimal-pairs.json), [críticos](critical-cases.json), [métricas](metrics-contract.md), [guardas](deterministic-guards.md), [shadow](shadow-design.md), [plano futuro não autorizado](future-run-plan.json), [mutantes](mutation-report.json) e [estratégia de testes](test-plan.md).

Só arquivos experimentais locais, sem produto, dados reais, credenciais, rede ou executor pago. Inputs são sintéticos e saídas do teste são fixtures. Requests preparados não contêm oracle; o resultado vazio permanece NOT_RUN. Não confundir a pontuação das fixtures com observação de JEV.

Após freeze, preservar fontes e artefatos. A geração foi feita antes do freeze; alterações futuras exigem novo gate. Para conferir o G0 desde a raiz:

```text
node --import ./experiments/jev/s2g/offline-guard.mjs --test experiments/jev/guard/g0/g0.test.mjs
```

A certificação final registra o comando da suíte completa e a preservação. G1 só pode existir após nova autorização de quantidade, modelo versionado, orçamento, preço atual, executor/persistência e privacidade; nenhuma flag ou integração é ativada. STOP.
