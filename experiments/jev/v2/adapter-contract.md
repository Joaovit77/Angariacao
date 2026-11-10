# JEV-S2-A — adapter/parser V2 offline

Versão adapter-1.0.0. Sem transporte, credenciais, rede, logger ou escrita de resultados.
S0 e [freeze S1](freeze-v2.json) permanecem intactos. O novo [adapter-freeze](adapter-freeze.json)
protege estes arquivos sem recalcular expectativas ou requests V2.

## Uso puro e fronteiras

`parseV2Response(raw, {input}, stage)` aceita texto JSON bruto ou objeto de fixture, tarefa
exata `decision`/`validation` e entrada sintética congelada. Constrói somente a descrição das
perguntas V2 para validar IDs e enums; não transporta nada. Não consulta `expected` ou `justification`.
`parseTypedResponse(raw, request)` valida o formato Choice genérico, também exercitado com três
respostas S0 sanitizadas lidas diretamente dos arquivos históricos. Compatibilidade do envelope
S0 não significa aceitar suas perguntas antigas como V2: essas respostas são rejeitadas pelo
adapter completo quando faltam campos V2.

Arquivos: [adapter-v2.mjs](adapter-v2.mjs), [adapter-run-v2.mjs](adapter-run-v2.mjs),
[fixtures](adapter-fixtures-v2.mjs) e [testes](adapter-v2.test.mjs).

```powershell
node --test experiments/jev/harness.test.mjs experiments/jev/v2/v2.test.mjs experiments/jev/v2/adapter-v2.test.mjs
```

## Normalização e erros

Sucesso tem status COMPLETED, result, question_observations sanitizadas, model_requested,
model_observed, model_mismatch, usage_status e usage. Decision normaliza action, intent,
enough_context, relevant_current_facts, relevant_historical_facts, missing_information,
applicable_protocols, prohibited_assumptions, entity_resolution, temporal_resolution e confidence.
Validation normaliza verdict, dimensions com os onze campos V2, reasons e confidence.

Confidence primária é a retornada na pergunta action ou verdict; todas as demais confidences e
distribuições continuam em question_observations. Zero, um e 0,5 são preservados; nenhum threshold,
clamp, trim, coercion ou interpretação favorável. Probability deve ter todas e somente as opções,
valores finitos em 0–1, soma um com tolerância numérica de 10⁻⁶ e choice entre os máximos.

Erro de estrutura → INVALID_RESPONSE, result=null, PARSE_ERROR com código fechado. Não há
INCONCLUSIVE sintético para JSON inválido, timeout, campos ausentes ou confiança desconhecida.
Campo obrigatório ausente não vira seleção vazia. Todas as perguntas esperadas precisam responder;
trocar tarefas ou acrescentar ID de pergunta desconhecido é erro estrutural.

Histórico/fatos/protocolos usam índices das perguntas para selecionar exclusivamente IDs já
presentes na entrada. Catálogo duplicado é INVALID_CONTEXT; nunca deduplicar silenciosamente.
NO explícito pode produzir seleção vazia válida estruturalmente e incorreta semanticamente;
o scorer, não o adapter, detecta recall perdido. O mesmo vale para selecionar mídia/ruído ou
fonte inadequada: seleção retornada não é corrigida pelo oráculo.

## Razões sem inferência causal

O request V2 congelado **não tem pergunta de texto livre para reasons**. No contrato S1, reasons
são nomes das dimensões explicitamente reprovadas. Portanto o adapter faz apenas a projeção
`pergunta nomeada com choice=FAIL → nome da dimensão em reasons`, preservando cada rótulo devolvido.
Não cria justificativa, não infere causa pelo verdict e não usa expectativas para completar razões.
REJECT com todas as dimensões PASS continua REJECT + reasons vazio; APPROVE com entity FAIL continua
APPROVE + razão entity. Ambas as inconsistências continuam visíveis ao scorer. Top-level reasons,
raciocínio livre ou explicações extras não fazem parte do protocolo congelado e são descartados.

## Allowlist e JSON hostil

Somente campos tipados conhecidos entram no resultado. Extras de corpo, answer e usage são
ignorados, incluindo internal_reasoning, chain_of_thought, secret, debug, prompt, raw_context e
dev_notes. Extras não são serializados nem acessados por getter. Campos estruturais conhecidos
com getter, tipo incorreto, enum desconhecido, array/objeto inesperado ou confidence inválida
falham fechado. Exceção hostil vira código local, sem message externa, stack ou payload.

O mapa answers é contrato de identidade de perguntas, não lugar de debug: IDs extras ali são
INVALID_QUESTIONS. Extras dentro de uma answer conhecida são descartados. Assim não há aceitação
silenciosa de campos decisórios como validação ou vice-versa.

Texto JSON é parseado com detecção de chave duplicada, inclusive escapes equivalentes, antes da
sobrescrita; limite local de 2 MiB e profundidade 64. Whitespace externo JSON é permitido,
whitespace no enum não. NaN/Infinity, JSON incompleto e número não finito são inválidos.
Um objeto JavaScript que já perdeu duplicatas em outro parser não permite recuperá-las: o futuro
transportador deverá entregar texto bruto, não chamar JSON.parse/response.json antes deste parser.

Fixtures privadas usam somente sentinelas evidentemente falsas solicitadas, sem dados reais.
Testes confirmam ausência dessas sentinelas em normalização, erro, ledger e snapshot.

## Usage e modelo

`parseUsage` é separado: USAGE_PRESENT com input_tokens/output_tokens inteiros seguros ≥0;
total_tokens só é preservado quando fornecido e consistente com a soma. Total ausente fica null,
sem inferência. Usage ausente/null → USAGE_MISSING e usage=null, nunca consumo zero.
Usage presente inválido → USAGE_INVALID e falha estrutural de resposta, sem fabricar tokens.
Se answers falharem depois de usage válido, os tokens conhecidos continuam preservados no erro.

Modelo observado deve ser ID versionado JEV, independente do solicitado. Divergência é flag
model_mismatch e não é escondida ou convertida em modelo solicitado. O resultado semântico
estruturalmente válido permanece preservado; o ledger interrompe progressão por divergência.
Também interrompe se usage faltar, para não continuar gasto futuro sem consumo observado.

## Erro operacional e ligação ao scorer

Erro de transporte futuro tem kind OPERATIONAL_ERROR, status FAILED_OPERATIONAL, case_id, task,
stage, repetition, run_id, attempt_id, timestamp UTC, duration_ms, error_type fechado
(TIMEOUT/NETWORK/HTTP/ABORTED) e http_status numérico quando HTTP. Sem secret, Bearer, request,
contexto, corpo de erro ou stack. Modelo observado/usage não observados ficam null.

`scoringRecords(ledger)` entrega somente a unidade que o scorer S1 espera. Erro operacional
gera error seguro e result=null; erro de parser gera error=null/result=null e permanece
structural_errors. Não executado não gera registro. Isso mantém os denominadores semânticos,
operacionais, estruturais e ausentes congelados. Não altera o scorer.

## Plano e preservação parcial

`validatePlan` confronta as 180 identidades e hashes com as entradas congeladas e a ordem por
rotação: inícios V2-01, V2-11 e V2-21, três repetições, duas tarefas, zero retries/regeneração.
Não seleciona melhor saída nem reorganiza o plano depois de receber resultados.

`createLedger` prepara 180 NOT_STARTED, sem executar nenhum transporte. `beginAttempt` registra
attempt_id único dentro do run, prefixado por run_id, e timestamp antes de aceitar resultado;
duas tentativas simultâneas nesse ledger ou ID reutilizado são recusados. O chamador futuro deve
garantir run_id único entre runs e persistir o IN_PROGRESS antes de qualquer chamada.

`completeResponse` ou `completeOperationalError` finaliza uma única tentativa pendente. O ledger
distingue COMPLETED, FAILED_OPERATIONAL, NOT_STARTED e extensões FAILED_STRUCTURAL/IN_PROGRESS.
Se há falha, divergência de modelo ou usage ausente, fica HALTED; não permite nova tentativa,
sobrescrita ou resume automático. Em crash, IN_PROGRESS permanece sem resultado e não vira
NOT_STARTED. Runs anteriores não são mesclados ou reclassificados.

`partialSnapshot` serializa o estado em memória produzido por essas funções, sem raw response;
não é importador de snapshot externo não confiável. N−1 resultados anteriores permanecem
inalterados se N falhar. Nenhum arquivo real de execução foi criado neste checkpoint.

## Limites da certificação offline e próximo gate

Esta etapa certifica contrato puro, parser, normalização, metadados e estados em memória.
Não valida capacidade JEV V2, autenticação, transporte real, limites financeiros/contexto,
concorrência multiprocesso, exclusividade de run_id global ou gravação atômica em disco.
O futuro executor precisa garantir esses pontos e validar o adapter-freeze antes de uso.
Nenhum módulo fornecido consegue enviar request, carregar secret ou acionar retry/resume.

JEV-S2-B só poderá começar após autorização humana explícita para chamadas reais, modelo,
teto financeiro e número máximo de chamadas. Não executar S2-B por consequência de PASS S2-A.
