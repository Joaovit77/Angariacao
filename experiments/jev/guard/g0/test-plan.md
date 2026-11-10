# Estratégia de testes offline

327 regressões históricas são pré-requisito e foram executadas antes das novas fontes. Nenhuma suíte lê credencial ou inicia transporte real. A suíte completa deve usar o [bloqueio técnico de rede](../../s2g/offline-guard.mjs), sem modificar esse arquivo congelado.

| Área | Tipo de teste | Alvo de cobertura | Exemplo independente |
| --- | --- | --- | --- |
| Corpus/oráculo | Contrato e revisão de casos | 36 únicos, 12/18/6, 18 classes A–R e 14 críticos | GG0-21 é REJECT com null; GG0-09 abstém e é APPROVE. |
| Pares | Diff estrutural e edição declarada | 18 pares, exatamente um caminho relevante | GG0-01/GG0-21 só altera current_facts.0.value. |
| Ausência/tempo/entidade | Regressão semântica de oráculo | Quatro estados distintos; CURRENT/HISTORICAL/SUPERSEDED/UNKNOWN/same-time; A/B/ambíguo | GG0-14 temporal PASS e cross_entity FAIL; GG0-34 factuality PASS, entidade inconclusiva. |
| Payload | Contrato de projeção | Oráculo/tags nunca enviados; candidata somente validation | Injetar metadado expected externo não muda request. |
| Parser | Contrato do adapter congelado | Malformed/enums/confidence/probabilities inválidos não normalizam | Um vetor errado invalida envelope inteiro, sem aproveitar verdict. |
| Score | Comportamento por falhas manuais | FA crítico/ordinário, FR parcial/full, inconclusivos e cobertura | Um APPROVE em GG0-21 deve aparecer como critical false accept 1/1. |
| Mutações | Teste de teste | 11 mutantes mortos; baseline da mesma sonda aceita antes | Default APPROVE, leak, null, A/B, protocolo, FR, critical agregado, invalid approve, candidata ausente/vazada, sem positivos. |
| Preservação/privacidade | Hash/lista e inspeção de fonte | Históricos/produto byte-idênticos; zero rede/credencial/import de produto | Freeze S2-G-A e seus relatórios permanecem nos hashes originais. |

Fixtures são respostas sintéticas para certificar parsing/scoring e não desempenho do JEV. Cada mutante altera comportamento/dado em memória e precisa falhar na mesma verificação que aceita a base. Testes comuns não reescrevem o oráculo para fazer o scorer passar. E2E de produto, benchmark pago e smoke real não pertencem a este checkpoint offline.
