# Custo de complexidade do contrato

| Aspecto | FULL observado em G1 | VERDICT_ONLY hipotético |
| --- | --- | --- |
| Perguntas por chamada | 12 | 1 |
| Vetores por chamada | 12 | 1 |
| Entradas de probabilities por chamada | 47 (3 + 11×4) | 3 |
| Exposições em 36 casos | 432 perguntas / 1.692 probabilidades | 36 perguntas / 108 probabilidades, se executado |
| Validade de envelope | 24/36 | NÃO TESTADA |
| Falha local por pergunta | 12/432 | NÃO TESTADA |
| Diagnóstico | Macro + 11 labels, incluindo omission=FAIL em GG0-29 | Só o macro, sem atribuição dimensional |
| Output usage | 22.119 tokens / 36 transportes | NÃO MEDIDO |
| Input usage | 90.649 tokens | NÃO MEDIDO |
| Latência HTTP min/p50/p95/max | 225 / 245 / 259,25 / 465 ms | NÃO MEDIDA |
| Custo estimado histórico | US$ 0,003807258; BILLED_UNKNOWN | NÃO MEDIDO |

O custo/preço é somente o snapshot G1, sem reconfirmação externa neste estudo: US$ 0,042/M input e output gratuito naquele registro. Menos perguntas altera a superfície contratual e a carga de resposta por definição; economia de usage/custo/latência e maior validade não foram medidas. Output usage não demonstra quantos tokens pertencem a cada dimensão ou ao funcionamento interno.

Com aceitação conjuntiva do envelope, uma única falha dimensional bloqueia o resultado inteiro. Isso ocorreu em 11 envelopes com verdict local aceitável; em outro, o próprio verdict falhou. A proporção local de falha é igual entre macro (1/36) e dimensões agrupadas (11/396). Não modelar independência entre perguntas, não multiplicar probabilidades para prever validade e não projetar 35/36 para contrato reduzido.

Benefício do FULL: capacidade de localizar tipo de falha, revisar taxonomia e perceber conflito macro/dimensão. Custo observado: maior número de vetores sujeitos ao contrato e bloqueio inteiro quando algum falha. Benefício operacional incremental não foi isolado. **HYPOTHESIS_REQUIRES_EXPERIMENT** para qualquer afirmação de que reduzir perguntas resolve invalidade ou melhora macro.
