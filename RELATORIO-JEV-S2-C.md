# JEV-S2-C — compatibilidade de probabilities e diagnóstico sanitizado

Data: 17/10/2026. **PASS exclusivamente offline. S2-B: HOLD PRESERVADO. PRODUCTION: NÃO INTEGRADO.**

O parser S2-A aceitava ou recusava respostas com regras estritas, mas agrupava vários defeitos de probabilities em `INVALID_PROBABILITIES`. O S2-B preservou somente hash para o raw inválido. Este checkpoint acrescenta um wrapper isolado capaz de classificar falhas futuras sem mudar nenhuma decisão estrutural, sem modificar o adapter congelado e sem recuperar conteúdo histórico descartado.

## Histórico imutável e causa específica

Run `jev-s2b-1792195299496-15869859`; chamada 4, `V2-02/validation/1`: `FAILED_STRUCTURAL`, `PARSE_ERROR / INVALID_PROBABILITIES`.

Raw SHA-256: `87035cb089b69154c4d8234e44a91b010741155851d1f66c8615e124dd41ac33`.

Permanecem quatro chamadas iniciadas, três normalizadas, uma falha estrutural e 176 não iniciadas. Nenhuma reclassificação como decisão, falha operacional ou semântica foi feita.

**Causa específica histórica: NÃO DETERMINADA. NÃO É RECUPERÁVEL a partir dos artefatos existentes.** O raw não existe nos artefatos preservados. Nenhum subcódigo novo é atribuído retroativamente à chamada 4.

Conjunto de causas compatíveis com a categoria agregada: probabilities não objeto; opções ausentes/extras ou contagem incompatível; valores não numéricos, não finitos ou fora de `[0,1]`; soma fora da tolerância; choice válida abaixo da máxima. São possibilidades, nunca causas confirmadas. Duplicata textual, choice desconhecida e pergunta extra têm outras categorias quando são a primeira falha. Não permitem explicar a ocorrência histórica.

## Contrato atual, sem relaxamento

O [contrato detalhado](experiments/jev/v2/probability-diagnostics/probability-contract.md) foi extraído do código congelado, não de intenção presumida da API.

- Objetos planos ou com protótipo null; perguntas e opções exatamente iguais às esperadas. Arrays, ausência e extras de perguntas/opções invalidam.
- Cada probabilidade precisa ser number finito, entre zero e um inclusive. Não existe conversão de string/null nem preenchimento.
- Soma em Binary64, na ordem do criteria do request: rejeita se `Math.abs(sum - 1) > 0.000001`. A tolerância absoluta continua **0,000001**. Nenhuma normalização ou alteração de vetor.
- Choice é enum exato e precisa ter probabilidade igual à máxima. Empates são aceitos. Confidence é independente, obrigatória e finita em `[0,1]`.
- JSON textual é verificado antes de sobrescrever chaves: duplicatas de pergunta, opção, choice e probabilities são recusadas, inclusive escapes Unicode equivalentes. Objetos já materializados não recuperam duplicatas perdidas anteriormente.
- Extras de envelope/usage/answer continuam descartados pela allowlist; extras de probabilities não são removidos para aceitar. Ordem da resposta não altera a projeção.

Exemplos aceitos: soma 1, `0.5+0.5`, `0.1+0.2+0.7`, muitas casas, somas próximas de 1 por aproximadamente ±1e-9, choice empatada e opção única em 1. Exemplos recusados: 0.999, 1.001, todas zero, negativo, valor maior que um, NaN/Infinity em objetos, string numérica, null e choice abaixo da máxima.

A fronteira nominal é assimétrica por representação binária: soma JS 0.999999 tem delta -1.0000000000287557e-6 e rejeita; 1.000001 tem delta 9.999999999177334e-7 e aceita. Isso caracteriza a regra existente; não justifica alterá-la. NaN/Infinity em texto são `INVALID_JSON`, diferentemente de valores não finitos em objetos JS.

## Diagnóstico implementado

[probability-diagnostics.mjs](experiments/jev/v2/probability-diagnostics/probability-diagnostics.mjs) expõe wrappers typed e V2. Ambos retornam `{ parsed, diagnostic }`, conservando diretamente o resultado do parser antigo em `parsed`. Não há parser substituto, coerção, seleção automática, correção de enum ou consulta ao oráculo.

Subcódigos reproduzidos: `PROBABILITIES_NOT_OBJECT`, `PROBABILITIES_MISSING`, `PROBABILITY_QUESTION_MISSING`, `PROBABILITY_UNKNOWN_QUESTION`, `PROBABILITY_OPTION_MISSING`, `PROBABILITY_UNKNOWN_OPTION`, `PROBABILITY_NOT_NUMBER`, `PROBABILITY_NOT_FINITE`, `PROBABILITY_BELOW_ZERO`, `PROBABILITY_ABOVE_ONE`, `PROBABILITY_SUM_MISMATCH`, `PROBABILITY_CHOICE_MISMATCH`, `PROBABILITY_DUPLICATE_KEY`, `PROBABILITY_EMPTY`, `CHOICE_MISSING`, `CHOICE_UNKNOWN` e `SAFE_INSPECTION_UNAVAILABLE`. Erros anteriores ao vetor mantêm sua categoria, sem atribuição indevida às probabilidades.

Um vetor sintético `{A:0.2,B:0.7,C:0.1}` com choice A reproduz `INVALID_PROBABILITIES`. O wrapper mantém essa categoria e acrescenta `PROBABILITY_CHOICE_MISMATCH`, com soma, máxima e opções identificadas de forma sanitizada. Não passa a aceitar a resposta.

Os campos solicitados estão presentes: código, pergunta, contagens, opções ausentes/desconhecidas, soma/delta, min/max, choice/máximas, finitude/tipos, hash do texto exato, modelos e identidade local de stage/attempt. Ausências de observação permanecem null/listas vazias. Estatísticas de vetores incompletos cobrem somente opções esperadas presentes, explicitadas pelas contagens e listas.

O mecanismo recebe texto, executa o parser estrito, produz diagnóstico enquanto o texto ainda está transitório em memória e retorna somente a projeção e o diagnóstico. Não persiste raw. Não foi integrado ao executor S2-B, cuja autorização permanece encerrada. O scorer não foi alterado; erros estruturais continuam fora dos denominadores semânticos.

## Formatos históricos caracterizados

| Evidência sanitizada | S0 | Prefixo válido S2-B |
| --- | --- | --- |
| Respostas lidas | 20 | 3 |
| Vetores de probabilities | 232 | 60 |
| Opções por vetor | 2, 3 ou 5 | 2, 3 ou 4 |
| Valores number / outros tipos | 634 / 0 | 151 / 0 |
| Precisão decimal JS observada | 0, 1, 2, 16 ou 17 casas | 0, 1 ou 2 casas |
| Soma mínima / máxima | 0.9999999999999999 / 1.0000000000000002 | 1 / 1 |
| Maior delta absoluto | 2.220446049250313e-16 | 0 |
| Choice na máxima | 232/232 | 60/60 |
| Empates | 0 | 0 |

O [compatibility-report.json](experiments/jev/v2/probability-diagnostics/compatibility-report.json) detalha cada resposta/pergunta e a matriz numérica. Precisão significa representação JS mais curta após parsing; não mede casas do token original nem confiança do modelo. Os três registros S2-B foram caracterizados usando somente `question_observations` existentes, sem inventar raw original. Essas amostras não provam um contrato universal nem a causa da quarta chamada.

## Equivalência, regressão e privacidade

Antes da primeira escrita, os **72 testes anteriores passaram, zero falhas**. Antes da implementação também foram verificados S0, freezes S1/S2-A, matriz e requests; um snapshot de hashes dos 17 arquivos do run S2-B e do lock foi salvo no namespace novo. A verificação final também confere a lista de arquivos históricos, detectando adições/remoções.

Validação final: **72 anteriores + 85 novos = 157 PASS, zero falhas**. Sem remoção ou enfraquecimento de teste existente.

- 68 fixtures específicas: 18 aceitas e 50 recusadas, incluindo oito duplicatas (quatro posições × literal/escape Unicode), protótipos, fronteiras numéricas e enum exato.
- 500 vetores determinísticos adicionais: 250 aceitos e 250 recusados; igualdade completa entre retorno original e wrapper e nenhuma mutação do input.
- 17 fixtures anteriores S2-A, 20 responses S0 e três projeções S2-B comparadas; resultados normalizados e categorias permanecem iguais. A equivalência geral decorre também de construção: a decisão e o objeto `parsed` vêm diretamente do parser original.
- 119 variantes de privacidade verificadas, incluindo 51 conversões adicionais para texto bruto com extras privados. Zero ocorrências das cinco sentinelas falsas no retorno persistível e nos relatórios JSON.
- Getters, proxies hostis/revogados, toJSON, metadados hostis, valores privados em lugar de números e IDs privados disfarçados de opções/perguntas foram exercitados. O diagnóstico não executa getters nem acrescenta traps; quando não consegue inspecionar com segurança, retorna código local sanitizado, sem mensagem externa.
- IDs conhecidos vêm somente do request/plano local confiável; IDs/choices desconhecidos viram hashes opacos. O helper não percorre conteúdo livre nem serializa objetos brutos. `raw_sha256` é null para objetos JS, evitando toJSON/getters.
- Hashes S0/S1/S2-A, matriz, requests, scorer, ledger, summary, errors, budget, authorization, quatro stage-results e lock S2-B permaneceram intactos. Zero alteração no produto.

Comando executado, na raiz:

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs experiments/jev/s2b/runtime.test.mjs experiments/jev/v2/probability-diagnostics/probability-diagnostics.test.mjs
```

Também executados: geração offline dos relatórios com verificação de preservação, conferência de links locais, whitespace e `git diff --check`. Nenhum comando de testes reais, ambiente ou runner pago foi usado. Os testes antigos de runtime criam diretórios de simulação próprios, sem transporte; esses diretórios ignorados pelo Git não pertencem ao run real preservado.

Não executados: smoke real JEV/OpenAI, UI do Angario, banco/Production e suítes/build de `web/`. O checkpoint proibiu rede e não alterou produto nem fluxo de integração existente; o PASS é restrito ao mecanismo offline. Não certifica execução real, integração ao executor nem robustez semântica do lote interrompido.

## Raw: recomendação B + C

Hash apenas protege conteúdo, mas não explica o defeito: foi o limite histórico do S2-B. Recomendo **B, diagnóstico estrutural sanitizado, + C, projeção allowlisted, mantendo o hash**. A prova offline está no helper e em [privacy-report.json](experiments/jev/v2/probability-diagnostics/privacy-report.json).

Raw criptografado/efêmero permanece somente uma proposta, sem implementação. Exigiria gate próprio para acesso, chaves, retenção e descarte. Nenhum raw sensível foi persistido neste checkpoint. Dados usados são fixtures e artefatos já sanitizados; nenhuma chave ou arquivo de ambiente foi lido.

## Opções futuras para decisão humana — nenhuma executada

Referência exclusivamente histórica de preço: [snapshot S2-B](experiments/jev/s2b/pricing-verified.json), verificado em 16/10/2026: US$0,042/Mtok de entrada e saída gratuita. Não houve nova consulta externa. Projeção indicativa usa a média do prefixo, 2.164 tokens de entrada/chamada (US$0,000090888/chamada). Reserva conservadora usa 65.536 tokens por chamada (US$0,002752512). Estes valores são estimativas, não preço reconfirmado nem cobrança observada; contextos maiores podem afastar o custo da média do prefixo.

| Opção | Benefício | Risco / limite | Chamadas propostas | Custo indicativo / reserva conservadora | Comparabilidade com S2-B |
| --- | --- | --- | --- | --- | --- |
| A — novo lote do zero | Cobrir a matriz completa, repetições, pares e mutantes | Maior exposição a falhas e custo; exige preparar executor com diagnóstico e novo gate | 180, tentativa única, encerramento em hard gate | US$0,016359840 / US$0,495452160 | Melhor se matriz/requests/modelo permanecerem iguais; run novo, sem unir métricas com prefixo HOLD |
| B — lote diagnóstico reduzido | Exercitar captura em conjunto limitado antes de lote amplo | Não demonstra robustez completa; seleção/repetições precisam ser aprovadas | Exemplo: 12 (três casos × duas tasks × duas repetições) | US$0,001090656 / US$0,033030144 | Parcial e descritiva; não completar denominadores do lote de 180 |
| C — poucas chamadas para contrato de probabilities | Verificar observabilidade e envelope real com menor exposição | Não força a falha histórica nem prova comportamento geral; novos probes sintéticos | 2–6, sem retry da chamada 4 | US$0,000181776–0,000545328 / US$0,005505024–0,016515072 | Apenas contrato/diagnóstico; sem comparação semântica agregada com S2-B |
| D — encerrar JEV experimental | Sem novos custos ou chamadas; mantém evidências disponíveis | Renuncia a novas evidências reais | 0 | US$0 / US$0 | Nenhuma nova amostra; HOLD histórico continua |

Recomendação para deliberação: **opção C**, caso ainda haja interesse no experimento, com desenho e limite explícitos para validar observabilidade antes de considerar B/A. Isso não seleciona nem autoriza uma execução. A decisão humana deve definir quantidade, teto financeiro, modelo, conteúdo sintético, critério de parada e desenho de novo run. Não se deve relaxar o parser para fazer um lote passar.

**S2-B authorization closed by HOLD.** A autorização anterior de 180/US$0,50 foi parcialmente consumida e encerrada pelo HOLD. As 176 chamadas não iniciadas não são crédito de autorização ativo. Lock, ledger e estado de parada permanecem preservados. Nenhum retry da chamada 4, chamada 5, resume ou S3 foi iniciado.

## Arquivos e alcance

Namespace novo: [experiments/jev/v2/probability-diagnostics/](experiments/jev/v2/probability-diagnostics/).

| Arquivo | Papel |
| --- | --- |
| [probability-contract.md](experiments/jev/v2/probability-diagnostics/probability-contract.md) | Contrato, subcódigos, precisão e estratégia de raw |
| [probability-diagnostics.mjs](experiments/jev/v2/probability-diagnostics/probability-diagnostics.mjs) | Helper/wrappers sem transporte, ambiente, arquivos ou logger |
| [probability-fixtures.mjs](experiments/jev/v2/probability-diagnostics/probability-fixtures.mjs) | Fixtures sintéticas independentes de aceitação esperada |
| [probability-diagnostics.test.mjs](experiments/jev/v2/probability-diagnostics/probability-diagnostics.test.mjs) | 85 testes novos, incluindo equivalência, privacidade e preservação |
| [characterize.mjs](experiments/jev/v2/probability-diagnostics/characterize.mjs) | Gerador exclusivamente offline, com escrita limitada ao namespace novo |
| [compatibility-report.json](experiments/jev/v2/probability-diagnostics/compatibility-report.json) | Matriz de 68 fixtures, 23 registros históricos e estatísticas |
| [privacy-report.json](experiments/jev/v2/probability-diagnostics/privacy-report.json) | Evidências sanitizadas de 119 variantes, zero sentinelas |
| [preservation-before.json](experiments/jev/v2/probability-diagnostics/preservation-before.json) | Snapshot anterior à implementação, 72 testes e hashes históricos |
| [freeze.json](experiments/jev/v2/probability-diagnostics/freeze.json) | Freeze próprio do S2-C, sem sobrescrever freezes anteriores |

Única atualização fora desse namespace e deste relatório: append em [PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md). Nenhuma mudança em PROJECT.md é necessária: a arquitetura permanente do produto não mudou.

Áreas potencialmente impactadas: somente consumidores futuros que optarem pelo wrapper experimental. Atualmente o executor histórico e o Angario não o importam. Reverter o experimento consiste em deixar de usar o namespace novo; não há migração, alteração de dados ou runtime de produto para desfazer.

Riscos/limites conhecidos: causa histórica irrecuperável; amostra finita; estatísticas Binary64; IDs do request dependem da fronteira local confiável; hashes não substituem criptografia; observabilidade sem teste de transporte real; necessidade de gate antes de qualquer persistência/execução externa futura.

**Chamadas neste checkpoint: JEV 0; OpenAI 0; créditos 0. Produto, banco, Radar, WhatsApp e Production intocados. Sem commit, push, merge, PR ou deploy. STOP JEV-S2-C.**
