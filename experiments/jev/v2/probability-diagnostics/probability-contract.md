# JEV-S2-C — contrato observado e diagnóstico offline

Fonte da aceitação: [adapter-v2.mjs](../adapter-v2.mjs), congelado no S2-A. Este documento caracteriza sua implementação atual, sem declarar um contrato universal do serviço JEV. O [request-v2.mjs](../request-v2.mjs), o oráculo, as expectativas e o [scorer](../scoring-v2.mjs) permanecem intactos.

## Contrato extraído do código

1. O envelope, `answers`, cada answer e `probabilities` são objetos com protótipo `Object.prototype` ou `null`. Arrays, null e instâncias com outro protótipo são recusados. Campos tipados são propriedades próprias de dados; getters não são executados. O parser original pode invocar traps de Proxy ao inspecionar descritores; o diagnóstico não acrescenta essas invocações.
2. `answers` contém exatamente os IDs das perguntas enumeráveis próprias do request. Perguntas faltantes/extras são `INVALID_QUESTIONS`, antes da inspeção dos vetores. Tipos de pergunta/answer precisam ser `choice`.
3. `choice` é obrigatória, string, exatamente uma chave do `criteria` daquela pergunta. Não há trim, casefold, conversão nem escolha automática. Ausência é `MISSING_REQUIRED`; enum desconhecido é `INVALID_ENUM`. Critérios vazios nunca chegam a formar um answer válido.
4. `confidence` é obrigatória, number finito em `[0,1]`; é verificada antes de probabilities. Não há threshold nem obrigação de igualdade com a probabilidade escolhida.
5. `probabilities` é obrigatória e tem exatamente as opções enumeráveis próprias do `criteria`. Opção ausente, extra, caixa diferente ou espaço adicional invalidam o vetor. Campos extras dentro de probabilities não são removidos para aceitar uma resposta.
6. Cada opção esperada tem valor próprio de dados, `typeof number`, finito, entre zero e um inclusive. Zero, um e `-0` são permitidos quando as demais condições são satisfeitas. String numérica, null, boolean, objeto, undefined, NaN e Infinity não são convertidos.
7. Soma calculada em JavaScript/Binary64, começando em zero, na ordem de `Object.keys(criteria)` do request. A condição exata é `Math.abs(sum - 1) > 0.000001` para rejeitar. A igualdade matemática à tolerância não rejeita, mas a representação binária e a ordem de adição podem deslocar um valor nominal de fronteira. Não há arredondamento, compensação, renormalização ou preenchimento.
8. A probabilidade da choice não pode ser menor que a máxima do vetor. Empates são aceitos, incluindo segunda opção empatada e empate triplo. Nenhuma margem é aplicada à comparação de máximas. Uma única opção é válida se satisfizer soma/intervalo. Todas zero falham por soma.
9. A ordem de perguntas/opções na resposta não altera a projeção: o parser percorre o request. Reordenar o próprio request pode mudar os últimos bits da soma; não se promete invariância numérica absoluta na fronteira.
10. Texto bruto passa por `parseJsonStrict`, antes de qualquer JSON.parse comum do envelope. Duplicatas são recusadas em qualquer objeto, inclusive em campos que seriam descartados. Chaves são comparadas após decodificar escapes: `A` e `\u0041` são duplicatas; não há normalização Unicode NFC. Objetos JS já materializados não permitem recuperar duplicatas anteriormente sobrescritas.
11. JSON textual é limitado a 2.097.152 caracteres/bytes UTF-8 e profundidade 64. NaN/Infinity e números textuais que viram Infinity (`1e999`) são `INVALID_JSON`; objetos JS com esses valores nas probabilidades são `INVALID_PROBABILITIES`.
12. Extras do envelope, usage e answer são descartados na projeção allowlisted, desde que não invalidem o JSON. Isso não autoriza extras de perguntas/opções. Modelo e usage são validados antes das perguntas; uma falha anterior não recebe atribuição de probabilidade.

## Diagnóstico específico sem mudança de categoria

O wrapper retorna `{ parsed, diagnostic }`. `parsed` é o retorno direto da função congelada, sem reconstrução ou alteração. Apenas `diagnostic` é novo. O executor S2-B não foi modificado nem conectado automaticamente ao wrapper. Nada entra no scorer a partir desse novo objeto.

| Subcódigo | Caso reproduzido | Categoria externa preservada |
| --- | --- | --- |
| `PROBABILITIES_NOT_OBJECT` | Null, array, string, undefined presente, protótipo incompatível | INVALID_PROBABILITIES |
| `PROBABILITIES_MISSING` | Propriedade probabilities ausente | MISSING_REQUIRED |
| `PROBABILITY_QUESTION_MISSING` | Pergunta esperada ausente | INVALID_QUESTIONS |
| `PROBABILITY_UNKNOWN_QUESTION` | Pergunta extra | INVALID_QUESTIONS |
| `PROBABILITY_OPTION_MISSING` | Opção esperada ausente, inclusive a choice | INVALID_PROBABILITIES |
| `PROBABILITY_UNKNOWN_OPTION` | Opção extra com todas as esperadas presentes | INVALID_PROBABILITIES |
| `PROBABILITY_NOT_NUMBER` | String numérica, null, boolean, objeto, array, undefined | INVALID_PROBABILITIES |
| `PROBABILITY_NOT_FINITE` | NaN, Infinity ou -Infinity em objeto JS | INVALID_PROBABILITIES |
| `PROBABILITY_BELOW_ZERO` | Valor negativo finito | INVALID_PROBABILITIES |
| `PROBABILITY_ABOVE_ONE` | Valor finito maior que um | INVALID_PROBABILITIES |
| `PROBABILITY_SUM_MISMATCH` | Soma fora da tolerância atual | INVALID_PROBABILITIES |
| `PROBABILITY_CHOICE_MISMATCH` | Choice conhecida abaixo da máxima | INVALID_PROBABILITIES |
| `PROBABILITY_DUPLICATE_KEY` | Duplicata textual de pergunta, opção, choice ou probabilities | DUPLICATE_KEY |
| `PROBABILITY_EMPTY` | Vetor vazio com opções esperadas | INVALID_PROBABILITIES |
| `CHOICE_MISSING` / `CHOICE_UNKNOWN` | Choice ausente / fora do enum | MISSING_REQUIRED / INVALID_ENUM |
| `SAFE_INSPECTION_UNAVAILABLE` | Getter, Proxy hostil/revogado ou inspeção inviável | A categoria original não muda |

Outros erros preservam seu código, como `INVALID_JSON`, `INVALID_USAGE` e `INVALID_CONFIDENCE`. Duplicata fora das quatro posições específicas permanece `DUPLICATE_KEY`. O diagnóstico descreve a primeira condição observável: ausência de pergunta precede pergunta desconhecida; vetor vazio precede ausência de opção; ausência precede extra; tipo precede finitude, intervalo, soma e choice/max. Quando vários defeitos coexistem, o subcódigo não afirma exclusividade da causa.

## Precisão caracterizada

São 68 fixtures: 18 aceitas e 50 recusadas, incluindo oito duplicatas textuais. A [matriz JSON](compatibility-report.json) registra o resultado de cada fixture e os valores observados de soma/delta, sem guardar conteúdo privado.

| Vetor / condição | Comportamento atual |
| --- | --- |
| `[1,0,0]`, `[0.5,0.5,0]`, `[0.1,0.2,0.7]` escolhendo máxima | Aceitos; soma JS igual a 1 |
| `[0.3333333333333333,0.3333333333333333,0.3333333333333334]` | Aceito escolhendo terceira opção |
| `[0.6,0.399999999,0]` / `[0.6,0.400000001,0]` | Aceitos; delta aproximadamente ±1e-9 |
| `[0.6,0.399,0]` / `[0.6,0.401,0]` | Recusados por soma |
| Soma 0.9999990000001 / 1.0000009999999 | Aceitas: imediatamente dentro da tolerância |
| Soma 0.9999989999998999 / 1.0000010000001 | Recusadas: imediatamente fora da tolerância |
| Soma nominal 0.999999 / 1.000001 | A primeira rejeita (delta JS -1.0000000000287557e-6); a segunda aceita (delta JS 9.999999999177334e-7). Fronteira binária, sem mudança de regra |
| Segunda choice empatada em 0.5 / empate triplo em 1/3 | Aceitos |
| Choice com 0.2 quando outra opção tem 0.7 | Recusada; não é corrigida |
| Única opção em 1 ou 0.999999999 | Aceita; sem renormalizar |
| Única opção zero / todas zero | Recusadas por soma |
| Negativo / maior que 1 / não finito / não numérico | Recusados por subcódigos distintos |

## Amostras históricas preservadas

| Característica | 20 responses S0 | Três registros S2-B válidos |
| --- | --- | --- |
| Perguntas por resposta | 5×3; 6×4; 7×2; 9×10; 89×1 | 12×1; 24×2 |
| Total de vetores | 232 | 60 |
| Opções por vetor | 2×102; 3×110; 5×20 | 2×42; 3×5; 4×13 |
| Valores numéricos / não numéricos | 634 / 0 | 151 / 0 |
| Casas decimais JS: quantidade | 0:374; 1:11; 2:246; 16:2; 17:1 | 0:19; 1:8; 2:124 |
| Soma mínima / máxima | 0.9999999999999999 / 1.0000000000000002 | 1 / 1 |
| Maior delta absoluto | 2.220446049250313e-16 | 0 |
| Choice máxima / empates | 232 / 0 | 60 / 0 |

As casas decimais são da representação JavaScript mais curta depois de parsing. Não recuperam o número de casas do token original. As três projeções S2-B foram lidas de `question_observations`; não são reconstruções do raw original. A amostra não comprova outros modelos, distribuições ou respostas futuras. Diferenças de contagem de opções decorrem dos requests diferentes, sem mudança de aceitação.

## Preservação de raw e privacidade

O fluxo disponível é texto bruto em memória → parser estrito original → diagnóstico específico ainda com referência transitória ao texto → retorno de projeção allowlisted e diagnóstico → descarte do texto pelo chamador. A segunda leitura lexical de duplicatas só localiza a falha que o parser já recusou; não aceita nem corrige JSON. Os relatórios contêm somente projeções estruturais e estatísticas. Nenhum raw novo é gravado.

Todos os diagnósticos têm `error_code`, `question_id`, `expected_option_count`, `observed_option_count`, `missing_option_ids`, `unknown_option_ids`, `sum`, `sum_delta_from_1`, `min_probability`, `max_probability`, `chosen_option`, `max_option_ids`, `is_finite`, `value_type_summary`, `raw_sha256`, modelos, `stage_id`, `attempt_id` e categoria original. Campos não observáveis recebem null/lista vazia, sem inventar zeros para opções ausentes. Soma/min/max/tipos referem-se somente às opções esperadas presentes; contagens e listas de ausência identificam vetores parciais. Extras não são percorridos. NaN/Infinity nunca são serializados como números de diagnóstico.

O request e o plano são a fronteira confiável local: seus IDs são allowlisted. IDs/choices desconhecidos do corpo são substituídos por SHA-256 opaco; textos privados disfarçados de enum/chave não reaparecem. `raw_sha256` é calculado sobre texto bruto exato; é null para objetos JS, evitando stringify/toJSON/getters. Modelo só passa no formato já validado; stage e attempt usam valores/padrões locais fechados. Nunca se copia `error.message` externo. Hash não é armazenamento reversível de raw nem criptografia.

`node:util/types.isProxy` permite ao diagnóstico evitar traps adicionais. Getters de campos tipados dão `SAFE_INSPECTION_UNAVAILABLE`; getters, proxies e toJSON em extras não são percorridos. A função congelada mantém seu comportamento original. As fixtures de privacidade contêm cinco sentinelas falsas; os artefatos persistíveis contêm zero ocorrências. O código de teste contém intencionalmente essas sentinelas, sem credenciais reais.

| Estratégia de raw | Benefício | Limitação / gate |
| --- | --- | --- |
| A: hash apenas | Identidade dos bytes sem conteúdo | Não explica a falha; limite observado no S2-B |
| B: diagnóstico estrutural | Subcódigo e estatísticas sem texto privado | Não recupera campos deliberadamente descartados |
| C: projeção allowlisted | Preserva respostas tipadas válidas e estrutura selecionada | Extras desconhecidos continuam descartados; inválidos não viram normalizados |
| D: raw criptografado e efêmero | Poderia permitir investigação restrita | Somente proposta: exige gate próprio de chaves, acesso, retenção e descarte; nada implementado |

Recomendação de preservação: **B + C**, com hash. Persistência futura/executor requer checkpoint próprio; este helper não cria logs, arquivos, transporte nem acesso a ambiente.

## Causa histórica e próxima decisão

Chamada 4, `V2-02/validation/1`: **NÃO DETERMINADA; NÃO RECUPERÁVEL**. O hash não revela o conteúdo. Causas compatíveis com a categoria histórica incluem probabilities não objeto, contagem/opções diferentes, valor fora do tipo/finitude/intervalo, soma inválida ou choice conhecida abaixo da máxima. JSON duplicado, choice desconhecida, confidence inválida ou pergunta extra teriam outras categorias se fossem a primeira falha; não são causas confirmadas da chamada 4. Defeitos coexistentes tampouco podem ser reconstruídos.

S2-B permanece HOLD: quatro iniciadas, três normalizadas, uma falha estrutural, 176 não iniciadas. **S2-B authorization closed by HOLD.** O lock não foi removido. As 176 não são autorização ativa. Nenhuma chamada, retry, resume ou S3 integra este checkpoint.

Para executar os testes offline, na raiz:

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs experiments/jev/s2b/runtime.test.mjs experiments/jev/v2/probability-diagnostics/probability-diagnostics.test.mjs
```

Para reproduzir apenas os relatórios novos a partir de fixtures/históricos sanitizados:

```powershell
node experiments/jev/v2/probability-diagnostics/characterize.mjs
```

O gerador verifica os hashes antes de escrever exclusivamente neste namespace. Não lê chave/ambiente nem chama rede. O [relatório principal](../../../../RELATORIO-JEV-S2-C.md) apresenta as opções futuras e seus custos estimados históricos, para nova decisão humana.
