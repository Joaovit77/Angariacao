# JEV-S2-G-A — mapa offline de capacidades

Análise de evidências preservadas S0–S2-F-B. Nenhum acesso externo, credencial, inferência paga ou mudança de produto. Classes/níveis são propostas condicionadas a gate humano; não são autorização de integração.

Comece pela [matriz de capacidades](capability-map.md), depois consulte [módulos](angario-module-map.md), [evidências](evidence-ledger.json), [revisão de divergências](taxonomy-review.md), [arquiteturas](hybrid-architectures.md), [guardas](deterministic-guards.md) e [prioridades](experiment-priority.json). [Vision](vision-status.md) permanece não avaliada. [Decisões](decision-register.md) e [riscos](risk-register.json) deixam os limites explícitos.

O gerador local `build.mjs` lê somente arquivos de evidência e verifica hashes antes de escrever neste namespace. Não importar nem executar runners reais para regenerar documentos. Após o freeze final, preservar os bytes: mudanças futuras pertencem a outro gate.

Para conferir somente os testes deste mapa, a partir da raiz:

```text
node --import ./experiments/jev/s2g/offline-guard.mjs --test experiments/jev/s2g/s2g-a.test.mjs
```

A certificação registra o comando completo dos 292 testes anteriores mais os novos. O bloqueio técnico intercepta HTTP/HTTPS, fetch, sockets, TLS, UDP e DNS; qualquer tentativa faz a suíte falhar, mesmo se capturada. Nenhum bloqueio de rede deve ser removido para fazer um teste passar. Testes históricos usam fixtures e transporte injetado; dados de clientes, coleta Radar, WhatsApp e banco permanecem fora.

Não há instalação, configuração de chave ou endpoint deste mapa. Próximo passo: decisão humana sobre qual capacidade desenhar como experimento. Nada começa automaticamente.
