# G2-B proposto — comparação controlada FULL versus VERDICT_ONLY

**PROPOSED_ONLY. ZERO chamadas, orçamento autorizado zero, nenhuma execução, nenhum namespace G2-B criado.** [Plano declarativo](future-design.json). É necessário decisão humana, implementação isolada/testes próprios, novo freeze, preço e autorização explícita antes de qualquer rede. Não reutilizar autorizações ou locks G1.

## Tratamento e preservação

Manter todos os 36 casos G0, mesmos contextos, candidatas, evidência/policy, modelo pinado proposto jev-1.14.0, instruções/criteria da pergunta verdict e oráculo. FULL tem 12 perguntas; REDUCED tem somente a pergunta verdict copiada byte a byte em seus campos. A única diferença de payload é o conjunto de perguntas. IDs de braço/caso ficam fora do payload. Não reescrever instruções para enfatizar omissão, não adicionar exemplos ou mudar prompt semântico em um braço.

O helper puro requestPair verifica a transformação apenas em memória para provar o isolamento do tratamento. Não grava requests futuros, não gera respostas e não acessa transporte. Isso não é adoção de contrato reduzido nem alteração do G0. O teste compara state/model/verdict e recusa mudança de candidata/contexto/instrução.

## Pares, ordem e exposição

Proposta: 36 pares × dois braços × uma repetição = **72 novas chamadas**, sem autorização atual. Ambos percorrem GG0-01 → GG0-36. Dentro do par, contrabalancear previamente: ímpares FULL→REDUCED, pares REDUCED→FULL; concorrência 1. Assim nenhum braço é sempre o primeiro, mantendo a mesma sequência de casos em cada braço. Ordenação, timestamps e posição devem ser registrados no futuro freeze. Sem reordenação após outputs, retry, maioria ou melhor amostra. Contrabalanceamento não elimina toda deriva temporal/estocasticidade; n pequeno exige cautela causal.

G1 NÃO é o braço FULL de controle: novas amostras pareadas de ambos os contratos são necessárias nas mesmas condições. Comparar G1 passado contra REDUCED novo confundiria momento, amostragem e contrato.

## Adapter, parser e métricas

Futuro REDUCED precisa adapter macro próprio e isolado, sob o mesmo parser typed estrito com request de uma pergunta, modelos/usage e guardas idênticos. Não usar recovery do parser FULL e não fabricar 11 dimensões ausentes. O adapter Guard G0 exige 12 perguntas e o scorer exige objeto dimensional completo; **não alterá-los nem preenchê-los artificialmente para aceitar REDUCED**. Um scorer macro novo deve reproduzir os critérios/denominadores G0 para cada braço, com testes de equivalência dos scores macro quando os mesmos verdicts elegíveis são fornecidos. FULL mantém diagnósticos secundários; REDUCED os marca NOT_COLLECTED, nunca PASS.

Primárias pré-especificadas por braço: invalid_response/36; verdict_accuracy entre envelopes inteiros válidos, acompanhada de cobertura/36; false accept crítico/negativos críticos válidos; ordinário/ordinários válidos; false reject parcial/full; INCONCLUSIVE correto/unsafe approve/overreject; uso, custo e latência. Um braço menos inválido não é automaticamente mais seguro ou melhor.

Quadro pareado de validade: ambos válidos / somente FULL válido / somente REDUCED válido / ambos inválidos, denominador 36. Comparar verdicts e acerto macro apenas nos pares com ambos elegíveis, exibindo exclusões e cobertura para evitar viés de seleção. Publicar também por braço e caso; não ocultar erro material atrás de acurácia agregada. Erro estrutural segue INVALID_RESPONSE/result=null; nunca REJECT/APPROVE. A taxa por pergunta precisa exposição 12 versus 1 explícita.

Manter classificação diagnóstica G0 por braço: qualquer false accept em REJECT ou unsafe APPROVE em INCONCLUSIVE → NAO_PROMISSOR_DIAGNOSTICO; PROMISSOR_DIAGNOSTICO somente com 36/36 válidos e todos os macros corretos; demais INCONCLUSIVO. Mesmo um braço promissor não autoriza integração/REAL_SHADOW. Sem novo threshold de confidence.

## Todos os 36 ou subconjunto

Recomendação de desenho: todos os 36, pois já representam amostra pequena com 18 pares e estratos raros. Nenhuma redução foi feita ou autorizada. Um subconjunto preservando positivos, negativos, seis inconclusivos, críticos, GG0-29, null, entity transfer, temporal, protocol, partial e ambiguous source seria possível como outro desenho futuro, mas perderia cobertura e balanceamento e exigiria justificativa/freeze próprios; não selecioná-lo com base nos inválidos G1. O custo futuro deve ser reconfirmado antes de dimensionar orçamento.

## Interpretação e parada

A ablação pergunta se o conjunto de perguntas muda validade e verdict mantendo o restante constante. Um único par por caso só dá piloto descritivo com incerteza, não prova confiabilidade geral nem resolução causal do mecanismo do provider. Semanticamente errado GG0-29, críticos inválidos e inconclusivos são endpoints obrigatórios; melhoria estrutural com novos false accepts é dano, não sucesso. Nenhuma alteração de tolerance, normalização, choice, oracle ou materialidade.

Parada operacional futura e persistência devem ser congeladas antes da execução: sem retry/resume, modelo divergente/usage incerto/orçamento inseguro/erro operacional/unknown/privacy/history → HOLD; só probability invalid classificado seguro permite seguir conforme autorização futura. Até lá: **STOP e decisão humana**.
