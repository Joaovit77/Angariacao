# JEV-S2-B — lote real V2 interrompido

Data: 16/10/2026, America/Sao_Paulo. Responsável: Codex.

**HOLD — FAILED_STRUCTURAL na quarta chamada (`V2-02/validation/1`), código
`INVALID_PROBABILITIES`.** Parada imediata, sem retry, correção do parser, nova chamada ou resume.
Foram iniciadas quatro chamadas: três respostas normalizadas e uma falha estrutural; 176 estágios
permanecem NOT_STARTED. O critério de 180/180 não foi atingido. **Não é PASS JEV-S2-B.**

Classificação do JEV como **decisor/classificador: INCONCLUSIVO**; como **validador secundário:
INCONCLUSIVO**. O prefixo é insuficiente para concluir robustez; nenhuma integração foi feita.

## Autorização, pré-gates e preservação

Autorização humana: até 180 chamadas reais, modelo obrigatório `jev-1.14.0`, teto total US$ 0,50.
Não houve pedido de nova confirmação desses limites. Foram lidos os relatórios S0/S1/S2-A,
contratos V2 e instruções pertinentes do projeto. Os **65 testes certificados passaram antes
do transporte**, sem correção ou alteração de arquivos congelados. Sete testes novos da infraestrutura
durável/budget também passaram: **72 testes offline, zero falhas**.

Conferidos antes do envio e novamente após a parada:

| Artefato | SHA-256 intacto |
| --- | --- |
| Matriz materializada V2 | `84fb8a7e1bf29a7549bf2cfe4c423fbbbf295fbeb1752459b7f164ffb172018c` |
| Requests preparados V2 | `fed25c670d8d06b0b793efe854d18168939d0cce77bf64868e1d570da7da7cf3` |
| Freeze S1 | `03baa866fbf1fb5fda8a065f8c6a0136c3f4679543306de8b678ed232acf2a60` |
| Adapter freeze S2-A | `4eada006d631cebda9a71142e9b78e592252f472176e2584f4826848e3df4c75` |

Todos os arquivos referenciados pelos freezes e os 69 históricos S0 preservados. Plano confirmado:
30 entradas únicas, 22 pares, 11 mutantes, três repetições, duas tarefas e 180 identidades únicas
na ordem rotacionada original. Nenhuma expectativa, pergunta ou candidata mudou depois das respostas.

## Execução real e parada

Run ID: **`jev-s2b-1792195299496-15869859`**.

Diretório: [resultados duráveis](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/summary.json).
Início em 16/10/2026 **21:01:39** e término **21:01:44** em Brasília
(17/10/2026 00:01:39–00:01:44 UTC). Modelo solicitado e observado nas quatro respostas:
**jev-1.14.0**, sem divergência.

| Ordem | Stage ID | Resultado durável | Latência |
| --- | --- | --- | --- |
| 1 | V2-01/decision/1 | COMPLETED; action RESPOND | 469 ms |
| 2 | V2-01/validation/1 | COMPLETED; verdict APPROVE | 276 ms |
| 3 | V2-02/decision/1 | COMPLETED; action RESPOND | 406 ms |
| 4 | V2-02/validation/1 | FAILED_STRUCTURAL; PARSE_ERROR / INVALID_PROBABILITIES | 274 ms |

Contadores: authorized_max=180; started_calls=4; completed_calls=3; failed_calls=1;
remaining_calls=176. Failed_operational=0; failed_structural=1; IN_PROGRESS=0; NOT_STARTED=176.
Chamadas sem resultado utilizável não foram devolvidas à cota. Nenhum warm-up, ensaio exploratório,
regeneração ou retry real; concorrência um, com pausa entre estágios.

A quarta resposta chegou e o parser certificado recusou o contrato de probabilities.
O código cobre estrutura/opções/valores/soma/escolha máxima; **não foi preservado diagnóstico
por pergunta que permita identificar qual dessas condições falhou**. Não atribuir automaticamente
o defeito ao modelo, à API ou à tolerância numérica do parser. Não afirmar que foi rejeição semântica
da resposta parcial, nem inventar verdict para essa execução. O texto bruto não foi persistido.

Foram preservados o modelo observado, usage conhecido, erro local e hash bruto:
`87035cb089b69154c4d8234e44a91b010741155851d1f66c8615e124dd41ac33`.
Resultado semântico dessa chamada é null. [Registro estrutural](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/stage-results/004.json).
O snapshot registra HALTED; o lock de autorização permanece, impedindo reinício silencioso.

## Preço oficial, orçamento e uso

Preço reconfirmado na [documentação oficial TypeSafe](https://docs.typesafe.ai/models) antes
da primeira inferência, em **16/10/2026 23:57:42 UTC / 20:57:42 Brasília**:
**US$ 0,042 por milhão de tokens de entrada; tokens de saída gratuitos**.
Endpoint oficial mantido conforme [referência HTTP](https://docs.typesafe.ai/api).
Snapshot de preço/contexto: [pricing.json](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/pricing.json).

Budget guard usa inteiros em nano-USD: 42 nano-USD/token e cap de 500.000.000 nano-USD.
Antes de cada chamada, soma consumo conhecido e reserva até 65.536 tokens de entrada,
arredondamento conservador acima dos 64k documentados: **US$ 0,002752512 por próxima chamada**.
Para 180, limite projetado conservador **US$ 0,49545216**, abaixo do teto autorizado.
Nenhum opt-in de long context. Usage desconhecido interromperia, sem tratá-lo como zero.

Uso observado nas **quatro** chamadas, inclusive a estruturalmente inválida:

- **8.656 tokens de entrada; 2.912 tokens de saída**.
- Usage conhecido em 4/4; USAGE_MISSING=0.
- total_tokens não retornado: mantido null, sem soma fabricada nesse campo.
- **Custo estimado conhecido: US$ 0,000363552**, aproximadamente **US$ 0,000364**.
- BILLED_UNKNOWN: fatura real não retornada; sem câmbio ou impostos estimados.
- Latência cliente por tentativa: p50 **276 ms**, máxima **469 ms**; não é tempo puro de inferência.

O orçamento permaneceu seguro; a causa da parada foi estrutural, não financeira.
A projeção remanescente do arquivo budget é informação matemática, **não autorização para retomar**.

## Infraestrutura durável acrescentada

Somente namespace experimental [experiments/jev/s2b](experiments/jev/s2b/README.md): core,
runner, snapshot de preço, sete testes offline e documentação. Nenhum arquivo certificado do
adapter/scorer foi alterado. O runner usa exatamente os requests preparados, sem expected,
oráculo, label de resposta, score ou dados da repetição anterior; decision não recebe candidata.

Persistência: temporário exclusivo → write → sync do arquivo → rename → releitura/hash.
Ledger IN_PROGRESS com run_id, stage_id, attempt_id, task, repetition, started_at e modelo solicitado
é persistido antes do HTTP, junto ao contador conservador reservado. Stage-results é salvo antes
do snapshot seguinte, e manifesto/orçamento/métricas são atualizados por escrita atômica.
Em crash, tentativa pendente permanece consumida de forma conservadora, sem retry/resume.

Um lock criado com exclusividade e sincronizado impede processos paralelos ou nova execução
de reiniciarem o orçamento dessa autorização. Não remover o lock para continuar esta campanha.
Testes reais de filesystem verificaram substituição de snapshot, preservação do anterior em
falha antes do rename, persistência antes do transporte falso e bloqueio de envio se a escrita falhar.
Directory fsync pode ser indisponível no Windows; sync de arquivo, rename e releitura foram exigidos.
Não se promete sobrevivência à falha física do dispositivo.

Contexto: filtro local conservador por bytes UTF-8 com reserva de 2.048, contra limites
documentados de request/pergunta, além de corpo/modelo/hash. Não é tokenizer exato. Todos os
quatro requests enviados passaram; variantes longas não foram alcançadas. Caso futuro não caiba
no filtro, deve ficar HOLD por incerteza sem truncamento ou envio; não se certifica aqui toda
a tokenização dos 180 estágios. Nenhum teste extra de inferência foi usado para esse fim.

## Métricas parciais congeladas

Scorer S1 aplicado aos três resultados normalizados; a falha estrutural permanece separada.
**Esses percentuais descrevem somente o prefixo, não o lote V2.**

| Métrica | Parcial observado |
| --- | --- |
| action_accuracy | 2/2 — 100% |
| decision_field_accuracy micro | 15/20 — 75% |
| decision_completeness | 0/2 — 0% |
| validation_accuracy | 1/1 — 100% |
| false_accept_rate | 0/0 — não aplicável; nenhum negativo foi julgado |
| false_reject_rate | 0/1 — 0% |
| inconclusive_accuracy | 0/0 — não aplicável; nenhum caso de inconclusão esperada alcançado |
| inconclusive_prediction_rate | 0/1 — 0% |
| history_selection_accuracy | 2/2, ambos sem histórico obrigatório; não demonstra recuperação |
| history_required_recall | 0/0 — não aplicável |
| history_irrelevant_selection_rate | 0/0 — não aplicável |
| protocol/entity/temporal/grounding/coverage_accuracy | 1/1 cada, somente candidata positiva |
| reason_precision / reason_recall | 0/0 cada — não aplicável |
| consistency_between_repetitions | Não aplicável: nenhum grupo com três repetições |

Mesmo com action correto, ambas as decisões ficaram incompletas. Em V2-01 faltaram a suposição
INVENT_COMMERCIAL e CURRENT_FACT. Em V2-02 houve lacunas extras COMMERCIAL_RATE e
AUTHORIZED_PROPERTY_CONTEXT, ausência de INVENT_COMMERCIAL e resolução temporal diferente do
esperado. As escolhas foram preservadas, sem filtrar ou corrigir pelo oráculo.

Na única validação utilizável, APPROVE foi correto, mas cross_entity veio NOT_APPLICABLE em vez de
PASS e partial_answer_allowed veio PASS em vez de NOT_APPLICABLE. Veredicto correto não implica
onze dimensões corretas. Reasons vazio não demonstra precisão de razões porque não havia FAIL esperado.
Confidence primária 0,97 nas três saídas válidas; quartis coincidem e incluem todas nas faixas alta
e baixa. Não há evidência de calibração com esta amostra.

**22 pares e 11 mutantes inconclusivos** por comparações incompletas. Nenhum par com quatro
estágios disponíveis na mesma repetição; nenhum grupo 3/3, 2/3 ou três diferentes julgável.
Hard_gate_false_accepts observado vazio; nenhum negativo executado, portanto não comprova ausência
de vazamento crítico. A parada foi anterior ao primeiro caso adversarial.

## Artefatos e privacidade

Preservados no diretório exclusivo do run: manifest, pricing, budget, ledger, authorization,
quatro stage-results, metrics-partial, pairs, mutants, consistency, errors, summary, hashes e
privacy-check. **metrics-final.json não existe**, pois não houve RUN_COMPLETED.

- [Summary](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/summary.json)
- [Ledger durável](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/ledger.json)
- [Métricas parciais](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/metrics-partial.json)
- [Erros](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/errors.json)
- [Privacy check](experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/privacy-check.json)

Somente a variável local Angario_teste foi extraída para autenticação; arquivo não alterado,
nenhuma outra credencial carregada. Header Bearer, texto bruto, contexto privado ou campo extra
desconhecido não foram persistidos. Checagem literal da chave em 16 artefatos: zero ocorrências.
Fixtures/requests enviados são exclusivamente sintéticos. Pastas s2b-offline-* contêm testes
com transporte falso, claramente separados deste único run real; não consomem chamadas JEV.

## Validação, impacto e próximo gate

Pré-transporte: 65 testes certificados + sete novos passaram, zero falhas; quatro hashes e
conteúdo dos freezes conferidos. Fluxo real JEV exercitado apenas até a quarta tentativa, na qual
o hard-stop estrutural funcionou. Limitação: o erro genérico não reteve detalhe sanitizado das
probabilidades inválidas; não é possível reconstruí-las pelo hash. Isso exige investigação offline
de compatibilidade/diagnóstico antes de autorizar outra execução; não alterar tolerância por hipótese.

Zero alteração de Angario/web/provider/prompts, banco, schema/migrations, Production ou Radar.
Zero OpenAI, WhatsApp ou ação operacional. Nenhum ajuste visual. Testes do app, TypeScript, lint,
build e smoke do produto não executados, pois só foi criado executor experimental. M1c-F/Q1 não
foram trabalhados. Sem commit, push, merge, PR ou deploy; HEAD `366dc0f` preservado.

Único documento preexistente alterado: [propagação pendente](PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md),
somente append. Arquivos novos de infraestrutura e este relatório permanecem locais; resultados
ignorados pelo Git. Não há autorização implícita para gastar a cota restante.

**Próximo gate recomendado: HOLD e revisão offline do parser/probabilidades e da observabilidade
sanitizada.** Congelados e evidência parcial devem permanecer intactos. Qualquer correção terá
contrato/validação próprios, e nova execução/continuação exige decisão humana explícita. Não iniciar
S3-D/S3-V, retomar S2-B, integrar JEV ou alterar OpenAI por conta própria. **STOP JEV-S2-B.**
