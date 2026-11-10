# Certificação offline B0

Primeiro: 504 testes históricos PASS/0 FAIL, antes de criar fontes B0. Depois: suíte conjunta sob --import experiments/jev/s2g/offline-guard.mjs (HTTP/HTTPS/fetch/socket/TLS/DNS bloqueados, tentativa implica falha).

Cobrir requests e equivalência/case/oracle/ordem para todos os 36 pares; parser reduced e FULL fail-closed; todas as classes de probabilidades, duplicatas e confidence; equivalência macro G0 em fixtures corretas/erradas; 4 estados estruturais e 5 semânticos; splits/denominadores, 18 pares mínimos, sentinelas, classificações por braço e todas as quatro comparativas; custo/token/latência desconhecidos e conhecidos; 20 mutantes normativos; preservação de 330 históricos diretos e 769 do produto; zero rede/credencial/produto.

Fixtures são somente prova de contrato, não observações do modelo. Não testar rede real, provider, causalidade ou performance do REDUCED neste checkpoint. Isso exige autorização/execução futura. Certificação final registra números efetivamente obtidos e hashes.
