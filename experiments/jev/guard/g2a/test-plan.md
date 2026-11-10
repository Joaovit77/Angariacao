# Plano de testes G2-A

| Área | Tipo | Cobertura esperada |
| --- | --- | --- |
| Preservação | Integração local de arquivos, sem transporte | 300 arquivos históricos diretos/listas e hashes transitivos; 769 arquivos de produto |
| Fatos e métricas | Contrato/regressão | 36/24/12, 10 SUM/2 CHOICE, 21/24, 0/8 distinto de 0/14, GG0-29 errado |
| Diagnósticos | Teste de dados observados | 12 casos, uma pergunta cada, vectors exatos e distribuição de deltas/margens |
| Semântica | Teste de regra | Nenhuma recuperação, nenhuma dimensão reclassifica macro, INCONCLUSIVE preservado |
| Parser | Regressão de contrato | Soma ou choice incompatível permanece INVALID_RESPONSE e result=null |
| Desenho futuro | Teste de isolamento | Só conjunto de perguntas muda; state/verdict/oracle constantes; 72 chamadas propostas e zero autorizadas |
| Atalhos | Mutação comportamental | Onze mutantes, baseline PASS e todos mortos; cópias em memória |
| Isolamento | Barreira técnica e inspeção de fonte | Zero tentativa de rede, zero credencial, zero produto |

Primeiro foram executados 458 testes existentes, 0 FAIL. Depois executar a suíte conjunta com g2a.test.mjs sob --import experiments/jev/s2g/offline-guard.mjs. Testes de dados usam expectativas de produto/oráculo e números G1 já congelados, não observações de provider fabricadas. Fixtures de parser não são nova evidência de qualidade JEV.

Lacunas deliberadas: nenhuma chamada reduzida, causalidade, billing direto, smoke de produto ou poder estatístico de operação real. Todos exigem outro escopo; não são preenchidos por mocks.
