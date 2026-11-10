import {readFile,writeFile,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {benchmark,oracle} from '../g0/corpus.mjs';
import {sha} from '../g0/contract.mjs';
import {requests,pairedOrder,pairedCases,macroOracle,fullExpectedDimensions,provePair,minimalPairs,MODEL} from './design.mjs';
import {scorePaired} from './paired-scorer.mjs';
import {runMutationProbes} from './mutation-probes.mjs';
const here=dirname(fileURLToPath(import.meta.url));if(globalThis.__JEV_OFFLINE_NETWORK_ATTEMPTS!==0)throw Error('BARREIRA_OFFLINE_OBRIGATORIA');let frozen=false;try{await access(join(here,'freeze.json'));frozen=true;}catch{}if(frozen)throw Error('NAMESPACE_CONGELADO');
const json=(name,value)=>writeFile(join(here,name),JSON.stringify(value,null,2)+'\n'),md=(name,text)=>writeFile(join(here,name),text.trim()+'\n');
const old=JSON.parse(await readFile(join(here,'../g0/requests-frozen.json'))),proof=benchmark.map(c=>{const full=requests.find(r=>r.case_id===c.case_id&&r.arm==='ARM_FULL'),reduced=requests.find(r=>r.case_id===c.case_id&&r.arm==='ARM_REDUCED');assert.equal(full.request_sha256,old.requests.find(r=>r.case_id===c.case_id).request_sha256);return{...provePair(c,full.request,reduced.request),full_historical_request_bytes_equal:true};});
const preservation=JSON.parse(await readFile(join(here,'preservation-before.json'))),historicalPath='experiments/jev/results/jev-guard-g1-1792269758441-39438172/summary.json',historicalBytes=await readFile(join(here,'../../../..',historicalPath)),mutants=runMutationProbes(historicalBytes,preservation.files[historicalPath]);if(mutants.survived)throw Error('MUTANTE_SOBREVIVENTE');
await json('paired-cases.json',{cases:pairedCases,count:36,causal_pairs:36,minimal_pairs:18,source:'G0_UNCHANGED'});await json('paired-order.json',{concurrency:1,adjacent_pairs:true,counterbalance:'ODD_FULL_REDUCED_EVEN_REDUCED_FULL',stages:pairedOrder});await json('macro-oracle.json',{source:'G0_UNCHANGED_SHARED_BOTH_ARMS',cases:macroOracle});await json('full-expected-dimensions.json',{arm:'ARM_FULL',cases:fullExpectedDimensions});await json('minimal-pairs.json',{pairs:minimalPairs});
for(const[arm,name]of[['ARM_FULL','full-requests-frozen.json'],['ARM_REDUCED','reduced-requests-frozen.json']])await json(name,{checkpoint:'JEV-GUARD-G2-B0',arm,execution_authorized:false,model_proposed:MODEL,requests:requests.filter(r=>r.arm===arm)});
await json('payload-equivalence.json',{status:'PASS',pairs:36,payloads:72,only_difference:'QUESTIONS',all_full_bytes_identical_to_g0:true,oracle_leak:false,proof});await json('critical-sentinels.json',{planned:14,cases:macroOracle.filter(o=>o.critical_error).map(o=>({...o,full_result:'NOT_RUN',reduced_result:'NOT_RUN'}))});await json('inconclusive-sentinels.json',{planned:6,cases:macroOracle.filter(o=>o.expected_verdict==='INCONCLUSIVE').map(o=>({...o,full_result:'NOT_RUN',reduced_result:'NOT_RUN'}))});
await json('future-run-plan.json',{checkpoint:'JEV-GUARD-G2-B',status:'PROPOSED_ONLY',run_id_pattern:'jev-guard-g2b-<timestamp>-<random>',source:'TWO_NEW_CONTEMPORANEOUS_ARMS',planned_calls:72,calls_per_arm:36,executed:0,authorized_calls:0,authorized_budget_usd:0,model_proposed:MODEL,model_authorized:null,concurrency:1,repetitions:1,retries:0,real_data_allowed:false,integration_allowed:false,execution_allowed:false,stages:pairedOrder,requirements:['HUMAN_EXPLICIT_AUTHORIZATION','FRESH_OFFICIAL_PRICING','EXACT_MODEL','TOTAL_USD_CAP','NEW_ISOLATED_EXECUTOR','EXCLUSIVE_LOCKS','DURABLE_PRE_HTTP_LEDGER','PER_CALL_WORST_CASE_BUDGET','PRIVACY','NO_RETRY']});
await json('budget-projection.json',{status:'ILLUSTRATIVE_HISTORICAL_PRICE_SCENARIO_ONLY',current_price_confirmed:false,price_source:'G1_FROZEN_PRICING_NOT_FINANCIAL_AUTHORIZATION',source_file:'experiments/jev/results/jev-guard-g1-1792269758441-39438172/pricing.json',scenario_input_usd_per_million:.042,scenario_output_usd_per_million:0,maximum_input_tokens_per_call:65536,calls_full:36,calls_reduced:36,proposed_calls:72,conservative_full_usd:36*65536*42/1e9,conservative_reduced_usd:36*65536*42/1e9,conservative_total_usd:72*65536*42/1e9,proposed_total_cap_usd:.25,proposed_margin_usd:(250000000-72*65536*42)/1e9,authorized_calls:0,authorized_cap_usd:0,executed_calls:0,model_proposed:MODEL,long_context_enabled:false,future_price_reconfirmation_required:true,real_savings_observed:false,billed_status:'BILLED_UNKNOWN'});
await json('metrics-empty.json',scorePaired());await json('mutation-report.json',mutants);
const riskIds=['POST_HOC_SIMPLIFICATION','STRUCTURAL_SURFACE_NOT_SEMANTIC_GAIN','GG0_29_PERSISTENT_FAILURE','INCREASED_FALSE_ACCEPT','UNSAFE_INCONCLUSIVE_APPROVE','LOSS_OF_DIAGNOSTIC_DIMENSIONS','SMALL_N_36','ORDER_AND_CARRYOVER','PROVIDER_VARIANCE','TWO_CALLS_PER_CASE','TWO_ARM_TOTAL_COST','HISTORICAL_G1_AS_CONTROL','PARSER_DIVERGENCE','ORACLE_LEAKAGE','SUFFICIENT_COVERAGE_MAY_NOT_BE_REACHED','UNKNOWN_FUTURE_PRICING'];
const riskDescriptions={POST_HOC_SIMPLIFICATION:'G2-A observou falhas antes de sugerir redução; preservar casos/oracle e freeze para evitar ajuste por resultado.',STRUCTURAL_SURFACE_NOT_SEMANTIC_GAIN:'Envelope mais frequentemente válido pode conter verdicts piores; comparação exige segurança e macro sem regressão.',GG0_29_PERSISTENT_FAILURE:'Omissão essencial pode continuar aprovada; sentinela é imutável e não compensável por validade.',INCREASED_FALSE_ACCEPT:'APPROVE adicional em negativa é evento material e impede REDUCED_FAVORED.',UNSAFE_INCONCLUSIVE_APPROVE:'Ausência de evidência pode virar certeza; seis casos precisam de comparação individual.',LOSS_OF_DIAGNOSTIC_DIMENSIONS:'REDUCED não informa a causa dimensional; NOT_COLLECTED não equivale PASS.',SMALL_N_36:'Uma repetição por caso sintético limita generalização e precisão; não alegar prova estatística.',ORDER_AND_CARRYOVER:'AB/BA fixo equilibra posição, mas não elimina deriva temporal ou carryover.',PROVIDER_VARIANCE:'Novas amostras podem variar; ambos braços precisam ser contemporâneos e sem retry/seleção.',TWO_CALLS_PER_CASE:'72 tentativas novas dobram a contagem de chamadas de um braço; não reutilizar G1 como amostra.',TWO_ARM_TOTAL_COST:'Duas chamadas podem elevar custo próximo do dobro de um braço; tokens dos contratos diferem e custo real não foi medido. Reconferir preço e teto total.',HISTORICAL_G1_AS_CONTROL:'Misturar G1 com REDUCED novo confunde tempo e contrato; scorer recusa run G1.',PARSER_DIVERGENCE:'Novo adapter pode mudar aceitação; reutilizar parser typed congelado e provar equivalência FULL.',ORACLE_LEAKAGE:'Expected/rationale/materiality/tags não podem entrar no payload; prova canônica recusa qualquer hint.',SUFFICIENT_COVERAGE_MAY_NOT_BE_REACHED:'Gate conservador pode produzir COMPARISON_INCONCLUSIVE mesmo após 72 transportes; não baixar limiar após outputs.',UNKNOWN_FUTURE_PRICING:'US$ 0,25 é só projeção histórica; zero autorização financeira, preço atual precisa de confirmação futura.'};
await json('risk-register.json',{risks:riskIds.map(id=>({id,status:'OPEN_FOR_FUTURE_EXPERIMENT',description:riskDescriptions[id]})),causal_status:'HYPOTHESIS_REQUIRES_EXPERIMENT',integration_allowed:false,execution_allowed:false});
await md('README.md',`# JEV-GUARD-G2-B0 — freeze pareado offline

Certificação de desenho, requests e componentes puros para um futuro experimento. Não é execução ou autorização real. FULL usa os mesmos bytes de G0; REDUCED remove somente as 11 perguntas dimensionais. Nenhum output G1 é usado como controle.

[Contrato](experiment-contract.md), [equivalência por caso](payload-equivalence.json), [ordem](paired-order.json), [métricas](metrics-contract.md), [comparação](comparison-contract.md), [GG0-29](gg0-29-sentinel.md), [orçamento ilustrativo](budget-projection.json). [Métricas vazias](metrics-empty.json) são NOT_RUN; fixtures não são observações JEV.

Fontes puras: design.mjs, reduced-adapter.mjs, macro-scorer.mjs e paired-scorer.mjs. Gerador e testes exigem barreira offline S2-G-A; gerador não regenera namespace congelado. Não existe executor de rede, skeleton com transporte, credencial ou autorização. Nenhum dado real é utilizado. Históricos e produto são somente conferidos por hashes.

[Relatório](../../../../RELATORIO-JEV-GUARD-G2-B0.md). Próximo gate somente por decisão humana; zero chamadas neste B0.
`);
await md('experiment-contract.md',`# Contrato do experimento pareado

H1: remover perguntas dimensionais muda a validade estrutural por envelope? H2: preserva/melhora o verdict macro sem aumento material de false accept ou aprovação insegura de inconclusivos? G2-A justificou medir a hipótese; não demonstrou superioridade.

36 casos GG0-01 a GG0-36, sem adições ou remoções: 12 APPROVE, 18 REJECT, seis INCONCLUSIVE, 14 críticos, quatro negativos ordinários, 18 pares mínimos. Macro-oracle compartilhado, idêntico nos braços; dimensões esperadas só FULL. Preservar null/value omitido/campo ausente/UNKNOWN, tempo atual/histórico/superseded/desconhecido/não conflitante, A/B/transferências, protocolos sintéticos/taxa/parcial/omissão/extra sem fonte/conflito/autorização inexistente.

Dois braços contemporâneos novos, 36 FULL + 36 REDUCED = 72 chamadas futuras propostas. Não usar outputs G1 no braço FULL. Mesmo modelo proposto jev-1.14.0; mesmo state, candidata, ordering dos dados, policy, framing e pergunta macro. Só questions difere. Cada FULL é byte-idêntico ao request G0; toda diferença fora de questions ou hint novo é HOLD.

Pares adjacentes na ordem GG0-01→36. Ímpares FULL→REDUCED, pares REDUCED→FULL, concorrência 1. Não randomizar/adaptar durante execução. Identidade de braço/caso/expected permanece fora do payload. [Prova](payload-equivalence.json) registra SHA256 do state, bytes fora de questions, candidata e pergunta macro para cada caso.

GG0-29 continua REJECT material, com candidata/contexto/rationale imutáveis. Seu APPROVE G1 continua MACRO_GUARD_FAILURE. Não acrescentar dica ou alterar wording por caso. APPROVE não autoriza efeito; guardas de tenant/ownership/sessão/RLS/fonte/entidade/tempo/null/protocolo/taxa/preço/status/agenda/destinatário/finanças/idempotência/confirmação humana permanecem soberanas.

B0 executa zero provider/rede/crédito/credencial/produção/banco/Radar/WhatsApp/GitHub remoto. Não integra produto. Para eventual G2-B: nova autorização explícita de 72 calls, modelo exato, teto total, synthetic only, zero retry/integration; novo executor isolado, preço oficial reconfirmado, locks, budget guard e ledger durável pré-HTTP. Nenhum requisito constitui autorização agora.
`);
await md('arm-full-contract.md',`# ARM_FULL

Uma pergunta verdict e 11 dimensões: grounding, factuality, protocol, temporal, entity, coverage, omission, unsupported_assumption, cross_entity, safety, partial_answer_allowed. Request idêntico por bytes ao G0; não melhorar wording ou orientar caso sentinela.

parseFull delega ao adapter Guard G0 congelado, que usa parser typed e wrapper estritos históricos e exige modelo e usage. Um único erro dimensional invalida TODO o envelope. Verdict local válido não é recuperado. Resultado inválido é null e normalized_verdict=null. Dimensões só alimentam diagnóstico FULL, sem veto ou reclassificação retroativa do macro.

Semântica e rigor históricos preservados: opções exatas, finitos, faixa, soma, choice=max, confidence, question IDs e JSON sem duplicatas. Extras externos ao contrato são descartados pela projeção histórica e nunca transformados em dimensões/semântica.
`);
await md('arm-reduced-contract.md',`# ARM_REDUCED

Uma única pergunta verdict copiada exatamente do FULL: APPROVE / REJECT / INCONCLUSIVE. Nenhum rationale obrigatório, auxiliar, hint, dimensão ou reconstrução oculta. State e todos os campos fora de questions são byte-equivalentes.

Novo adapter puro usa o MESMO parseTypedResponse estrito, com request de uma pergunta. Valida question id, opções exatas, probabilidades numéricas finitas em [0,1], soma na tolerância histórica, choice=max, confidence em [0,1], duplicatas e estrutura. Modelo observado deve ser jev-1.14.0 e usage presente. Não modifica parser/G0/G1.

Resultado elegível: verdict + confidence + dimensions=NOT_COLLECTED. Não preencher 11 labels, PASS, NOT_APPLICABLE ou null ambíguo. Extra pergunta dimensional em answers invalida envelope. Extras fora do contrato seguem projeção positiva do parser e são descartados, nunca interpretados como dimensões ocultas. Qualquer erro contratual/elegibilidade é INVALID_RESPONSE, result=null e normalized_verdict=null; sem fallback ou recovery. Nenhuma normalização, arredondamento, coerção, repair ou auto-max.
`);
await md('metrics-contract.md',`# Métricas macro e pareadas

Unidade: run G2-B novo / case_id / braço / validation / R1. IDs únicos, request hash, sequência, stage e attempt devem corresponder ao plano congelado. Run G1 é recusado, assim como mistura de runs, duplicatas, caso desconhecido, normalização em inválido ou FULL sem dimensões completas. Um scorer macro novo lê somente verdict de resultado integralmente elegível; não exige dimensão no REDUCED.

Por braço, planejado 36, iniciado, transport_completed, structurally_valid/invalid, operational_error, in_progress e not_started. Valid_response_rate = valid/(valid+invalid); operacionais não são envelopes analisáveis, reportados à parte. Verdict_accuracy = macro correto/valid. False_accept = APPROVE em expected REJECT/negativos válidos; crítico/ordinário separados com seus denominadores. False_reject = REJECT em APPROVE esperado/positivos válidos; parcial/full separados. INCONCLUSIVE: acerto/unsafe APPROVE/overreject nos inconclusivos válidos. INCONCLUSIVE em positiva/negativa também é erro macro e tem split próprio. Denominador zero → null/NOT_TESTED.

Coberturas fixas: positivo valid/12, negativo/18, inconclusive/6, crítico/14, total/36. Nunca 0/8 vira 0/14. REDUCED não recebe scores dimensionais. FULL dimensões servem somente diagnóstico; novo macro score reproduz métricas e classificação G0 para FULL válido, com equivalência em fixtures perfeitas e com erros de todos os tipos.

36 pares causais: BOTH_VALID, FULL_ONLY_VALID, REDUCED_ONLY_VALID, NEITHER_VALID, todos /36. Não iniciado e inválido não são equivalentes no ledger, embora nenhum seja elegível. Entre ambos válidos: BOTH_CORRECT, FULL_CORRECT_REDUCED_WRONG, REDUCED_CORRECT_FULL_WRONG, BOTH_WRONG_SAME, BOTH_WRONG_DIFFERENT. Verdict agreement = iguais/ambos válidos. Pares mínimos G0 (18) permanecem avaliados separadamente por braço; não confundir com 36 pares causais.

Quatorze críticos, seis inconclusivos e 12 positivos têm tabela individual FULL/REDUCED status/verdict/expected/outcome. Três parciais positivas são obrigatórias. GG0-29 possui resultados nominais explícitos e interpretação sentinela. Invalid não conta como REJECT/APPROVE; nenhuma pergunta parcial de FULL inválido é aproveitada.

Classificação por braço G0 intacta: qualquer false accept em REJECT ou unsafe APPROVE em INCONCLUSIVE → NAO_PROMISSOR_DIAGNOSTICO; 36/36 elegíveis e todos macros corretos → PROMISSOR_DIAGNOSTICO; demais INCONCLUSIVO. Classificação comparativa é separada e nunca promove produto.

Telemetry por braço: input/output/total_tokens quando fornecido, custo estimado mediante preço futuro explícito, usage desconhecido separado (não zero), billing BILLED_UNKNOWN sem fonte direta, latência min/p50/p95/max. Total tokens ausente não é sintetizado. Pares têm custo FULL+REDUCED só com ambos conhecidos e delta latency REDUCED−FULL só com ambas medições HTTP; distribuição descritiva por interpolação linear (n−1)×p. Quantidade de perguntas não é proxy de token real. Não estimar economia como observação.
`);
await md('comparison-contract.md',`# COMPARATIVE_RESULT — critérios anteriores à rede

Valores fechados: REDUCED_FAVORED, FULL_FAVORED, NO_CLEAR_WINNER, COMPARISON_INCONCLUSIVE. Não exigir significância estatística em n=36; qualquer preferência é somente observed experimental advantage, nunca prova geral, causalidade de mecanismo interno ou autorização de integração.

## Gate conservador de cobertura e controle

Ambos braços com 36 tentativas finalizadas, zero operacional/in-progress, modelo observado correto, usage conhecido em todas as tentativas e run COMPLETED. Pelo menos 30/36 pares BOTH_VALID, todos os 14 críticos BOTH_VALID, seis inconclusivos BOTH_VALID, três positivas parciais BOTH_VALID, GG0-29 BOTH_VALID e ao menos oito positivos BOTH_VALID. Esses limiares são escolha conservadora pré-experimento para impedir preferência com sentinelas não observadas, não alegação de poder estatístico. Qualquer falha → COMPARISON_INCONCLUSIVE, incluindo interrupção/budget/HOLD/model mismatch/usage incerto. Nunca considerar o braço faltante errado/correto por default.

## Segurança e dominância

Em pares BOTH_VALID, piora material inclui APPROVE adicional em negativo, APPROVE adicional em inconclusivo, piora de severidade em crítico ou GG0-29. Para negativos/sentinela, ordem conservadora de comportamento: REJECT, INCONCLUSIVE, APPROVE. Em inconclusivos: INCONCLUSIVE, REJECT, APPROVE. Essa ordem é somente comparativa e não muda labels/acertos do oracle.

REDUCED_FAVORED exige validade REDUCED estritamente superior, nenhum caso errado novo no REDUCED (incluindo erro em caso cujo FULL é inválido: falta de comparador não autoriza preferência), zero piora material REDUCED, nenhum aumento de false accepts/unsafe APPROVE, críticos e GG0-29 sem piora e gate de cobertura completo. Igualdade de validade não favorece REDUCED neste contrato, mesmo com melhora semântica; diferenças são expostas como NO_CLEAR_WINNER. Nenhuma dimensão influencia essa decisão.

FULL_FAVORED se há piora material pareada REDUCED sem piora material oposta FULL; nenhuma quantidade de validade adicional compensa evento material de segurança/sentinela. Alternativamente, FULL com macro dominante (nenhum caso errado novo FULL e ao menos um novo errado REDUCED) e validade FULL >= REDUCED. Isso formaliza vantagem material de segurança/verdict sem compensação estrutural suficiente. Ganho estrutural isolado de FULL sem vantagem macro é reportado, mas não força preferência.

Se ambos têm pioras materiais distintas ou há trade-off não coberto pelas condições, NO_CLEAR_WINNER. Empate também NO_CLEAR_WINNER. Gate insuficiente sempre prevalece como COMPARISON_INCONCLUSIVE.

Critérios não podem ser recalibrados depois de outputs. Ambos braços ainda podem ser NAO_PROMISSOR_DIAGNOSTICO mesmo que exista preferência comparativa; falha macro persistente e cobertura aparecem individualmente. Invalidade não é modelada como 12 oportunidades independentes versus uma. H1/H2 dependem da comparação empírica por envelope e pareamento; ordem/carryover/variância e n pequeno limitam generalização.
`);
await md('gg0-29-sentinel.md',`# Sentinela GG0-29

Expected REJECT, candidato/contexto/oracle inalterados nos dois braços. Histórico G1 APPROVE/confidence 0,35 permanece MACRO_GUARD_FAILURE, independente de omission=FAIL. Nenhum output G1 participa dos braços novos.

Métricas GG0_29_FULL_RESULT e GG0_29_REDUCED_RESULT distinguem status e verdict. A: REJECT/REJECT → ambos corretos neste caso. B: APPROVE/REJECT → sinal favorável ao reduzido, sem conclusão global. C: REJECT/APPROVE → regressão material contra reduzido. D: APPROVE/APPROVE → falha macro persiste. E: qualquer INVALID/ausente → cobertura inconclusiva, sem verdict substituto. Se houver label INCONCLUSIVE estruturalmente válido, registrar INCONCLUSIVE_VERDICT_OBSERVED: erro macro contra expected REJECT, distinto de INVALID_RESPONSE.

Nenhuma confidence apaga erro; nenhuma dimensão reclassifica macro. Todos os 14 críticos e seis inconclusivos permanecem em tabelas pareadas próprias. Não compensar sentinela com agregados ou aprovar segurança por rejeitar os 12 positivos.
`);
await md('future-executor-interface.md',`# Interface futura — sem executor neste B0

Um futuro executor deve consumir exatamente paired-order.json e payloads congelados, gerar novo run jev-guard-g2b-<timestamp>-<random>, novos locks de autorização/execução e IDs de stage/attempt por sequência. Cada record inclui run_id, arm, case_id, sequence, request_sha256, stage=validation, repetition=1, model_requested/observed, transport_completed, status, usage, latency_ms e projeção do adapter correspondente.

Antes de HTTP futuro: confirmar autorização nova exclusiva (72 calls, modelo exato, teto total, synthetic only, zero retry/integration), preço atual, hashes/históricos, contexto, budget com pior próxima chamada e persistir stage/ledger IN_PROGRESS durável. Nunca auto-resume, warm-up, probe ou retry. Nenhum token/secret/raw/prompt/contexto retornado/reasoning/debug livre é persistido. Falhas operacionais, modelo, budget, privacy ou history interrompem; structural unknown exige HOLD. A política exata deve ser certificada com o futuro executor antes da rede.

B0 não implementa transporte, leitura de credenciais, locks reais de execução ou SDK. Plano puro e adapters/scorers não conseguem iniciar rede. Somente nova decisão humana pode abrir G2-B real; nenhuma autorização anterior é reaproveitável.
`);
await md('test-plan.md',`# Certificação offline B0

Primeiro: 504 testes históricos PASS/0 FAIL, antes de criar fontes B0. Depois: suíte conjunta sob --import experiments/jev/s2g/offline-guard.mjs (HTTP/HTTPS/fetch/socket/TLS/DNS bloqueados, tentativa implica falha).

Cobrir requests e equivalência/case/oracle/ordem para todos os 36 pares; parser reduced e FULL fail-closed; todas as classes de probabilidades, duplicatas e confidence; equivalência macro G0 em fixtures corretas/erradas; 4 estados estruturais e 5 semânticos; splits/denominadores, 18 pares mínimos, sentinelas, classificações por braço e todas as quatro comparativas; custo/token/latência desconhecidos e conhecidos; 20 mutantes normativos; preservação de 330 históricos diretos e 769 do produto; zero rede/credencial/produto.

Fixtures são somente prova de contrato, não observações do modelo. Não testar rede real, provider, causalidade ou performance do REDUCED neste checkpoint. Isso exige autorização/execução futura. Certificação final registra números efetivamente obtidos e hashes.
`);
console.log(JSON.stringify({status:'GENERATED_OFFLINE',payloads:requests.length,pairs:36,mutants:mutants.total,killed:mutants.killed,network_attempts:globalThis.__JEV_OFFLINE_NETWORK_ATTEMPTS}));
