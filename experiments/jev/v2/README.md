# JEV-S1 — contrato V2 offline

Oráculo e desenho do próximo experimento. Nenhum transporte ou acesso a credenciais.
Consulte [oracle-v2.md](oracle-v2.md), [metrics-v2.md](metrics-v2.md) e
[planned-run-v2.json](planned-run-v2.json). A matriz está em [matrix-v2.mjs](matrix-v2.mjs).

Verificação local, sem rede:

```powershell
node --test experiments/jev/v2/v2.test.mjs
```

O arquivo `freeze-v2.json` registra os hashes da matriz materializada, requests planejados,
contratos e arquivos históricos preservados. O plano não é um runner e não autoriza chamadas.
