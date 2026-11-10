import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
import { verifyHistory } from '../s2e/core.mjs';
import { matrix, oracle, pairs, symmetry, requests, plannedStages, calculateCalls, budgetProjection, sha, inputProjection, changedPaths } from './design.mjs';
// Gerador offline: somente fontes congelados e projeções históricas sanitizadas, sem ambiente/rede.
const here=fileURLToPath(new URL('.',import.meta.url)),repo=resolve(here,'../../..');
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const before=await json(join(here,'preservation-before.json'));await verifyHistory(repo,before);
for(const[p,expected]of Object.entries(before.lists)){const actual=[];async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){const f=join(path,e.name);if(e.isDirectory())await walk(f);else actual.push(relative(repo,f).replaceAll('\\','/'));}}await walk(join(repo,p));assert.deepEqual(actual.sort(),expected);}
const historical=join(repo,'experiments/jev/results/s2e-jev-s2e-semantic-1792255143175-41551ba6');
const ledger=await json(join(historical,'ledger.json')),summary=await json(join(historical,'summary.json')),decision=await json(join(historical,'decision-metrics.json')),validation=await json(join(historical,'validation-metrics.json'));
assert.equal(summary.started_calls,12);assert.equal(summary.completed_transport,12);assert.equal(summary.structurally_valid,10);assert.equal(summary.invalid_probabilities,2);
assert.equal(decision.action_accuracy.numerator,6);assert.equal(decision.decision_completeness.numerator,0);assert.equal(decision.decision_field_accuracy.micro.numerator,48);assert.equal(validation.valid_stages,4);
const defects=ledger.stages.filter(s=>s.record.diagnostic).map(s=>{const d=s.record.diagnostic,q=s.record.questions.find(q=>q.question_id===d.question_id);return{stage_id:s.stage_id,question_id:d.question_id,category:d.category,subcode:d.error_code,probabilities:q.probabilities,choice:q.chosen_option,max_option_ids:q.max_option_ids,sum:q.sum,sum_delta_from_1:q.sum_delta_from_1,raw_sha256:d.raw_sha256};});
const confidencePriorities=ledger.stages.filter(s=>s.stage_id==='E2_ENTITY/VALIDATION/R2'||s.stage_id.startsWith('E3_PARTIAL_INVENTION/DECISION/')).map(s=>{
 const id=s.task==='DECISION'?'prohibited_INVENT_COMMERCIAL':'temporal',q=s.record.questions.find(q=>q.question_id===id);return{stage_id:s.stage_id,question_id:id,observed_choice:q.chosen_option,confidence:q.confidence,expected:s.task==='DECISION'?'YES':'PASS'};});
const observed={checkpoint:'JEV-S2-E',source_run:summary.run_id,source_summary_sha256:sha(await readFile(join(historical,'summary.json'))),transport_completed:12,models:{requested:'jev-1.14.0',observed_count:12},structurally_valid:10,invalid_probabilities:2,
 defects,decision:{classification:decision.classification,action_accuracy:decision.action_accuracy,completeness:decision.decision_completeness,micro:decision.decision_field_accuracy.micro,per_field:decision.decision_field_accuracy.per_field},
 validation:{classification:validation.classification,valid_stages:4,verdict_accuracy:validation.validation_verdict_accuracy,dimensions:validation.dimension_metrics,false_accept:validation.false_accept_rate,false_reject:validation.false_reject_rate,false_reject_status:'NÃO TESTADO'},
 confidence_priorities:confidencePriorities,historical_s2b_cause:'NÃO DETERMINADA / NÃO RECUPERÁVEL',reinterpretation:false};
assert.deepEqual(defects[0].probabilities,{PASS:.01,FAIL:.05,INCONCLUSIVE:0,NOT_APPLICABLE:.93});assert.equal(defects[0].sum,.9900000000000001);
assert.deepEqual(defects[1].probabilities,{PASS:.03,FAIL:.48,INCONCLUSIVE:.02,NOT_APPLICABLE:.47});assert.equal(defects[1].choice,'NOT_APPLICABLE');
assert.deepEqual(confidencePriorities.map(p=>p.confidence),[.93,.94,.94]);
const audits=pairs.map(p=>({...p,observed_input_differences:changedPaths(inputProjection(matrix.find(c=>c.scenario_id===p.left),p.scope),inputProjection(matrix.find(c=>c.scenario_id===p.right),p.scope))}));
for(const a of audits)assert.deepEqual(a.observed_input_differences,a.allowed_input_differences,a.pair_id);
const questions=[
 ['Q1','SUM_MISMATCH reaparece?',['T1','T2','E1','P1','P2'],'Frequência e vetores completos por pergunta/estrutura, sem normalizar.'],
 ['Q2','CHOICE_MISMATCH reaparece?',['E1','E2','E3','P1','P2'],'Comparar choice original à máxima, ties permitidos, sem correção.'],
 ['Q3','Falhas concentram-se em VALIDATION?',['ALL'],'Taxas por tarefa com denominadores distintos: dez DECISION e quatorze VALIDATION planejados.'],
 ['Q4','Há associação com quantidade de perguntas?',['ALL'],'Estratificar por tarefa e question_count. Somente associação descritiva; nenhum contraste isolado de quantidade, sem inferência causal.'],
 ['Q5','Supersessão é reconhecida com distinção explícita?',['T1','T2','H1'],'Comparar fonte atual, histórico obrigatório e estados superado versus desconhecido.'],
 ['Q6','Erro factual é separado de erro temporal?',['T1','E1','E3'],'T1 exige temporal FAIL; transferências entre valores atuais exigem temporal PASS, mesmo com factuality FAIL.'],
 ['Q7','Transferência é detectada nos dois sentidos?',['E1','E2','E3'],'B para A e A para B negativos, com controle correto E2; inversão é controle direcional declarado.'],
 ['Q8','Risco é marcado antes de qualquer candidata?',['T1','E1','P1','H1','E4'],'DECISION sem candidata: riscos presentes; E4 controla marcação indevida com fonte única explícita.'],
 ['Q9','entity FAIL, cross_entity FAIL e temporal PASS coexistem?',['E1','E3'],'Comparar onze dimensões independentes, sem derivá-las de REJECT.'],
 ['Q10','Invenção é rejeitada com parcial ainda permitida?',['P1','P2'],'REJECT para invenção; APPROVE para parcial correta; partial_answer_allowed PASS em ambas.'],
 ['Q11','Erros de campo com confidence nativa alta se repetem?',['P1','P2','E1','E3'],'Registar erro e confidence da própria pergunta em R1/R2. Quartil descritivo por campo; não usar confidence primária como confiança na completude.'],
 ['Q12','Candidata correta/parcial é aceita?',['T2','E2','P2'],'Três controles APPROVE, duas repetições: seis exposições planejadas para false reject; inválidos permanecem fora da semântica.'],
].map(([id,question,cases,method])=>({id,question,cases,method,scope_limit:id==='Q4'?'DESCRIPTIVE_ONLY_NOT_CAUSAL':'SMALL_SAMPLE_NO_GENERALIZATION'}));
const pricing=await json(join(repo,'experiments/jev/s2e/pricing-verified.json'));
const budget={checkpoint:'JEV-S2-F-A',historical_source:'experiments/jev/s2e/pricing-verified.json',source_sha256:sha(await readFile(join(repo,'experiments/jev/s2e/pricing-verified.json'))),historical_verified_at:pricing.verified_at_utc,
 input_usd_per_million_historical:pricing.input_usd_per_million,output_usd_per_million_historical:pricing.output_usd_per_million,observed_s2e_input_tokens:27366,observed_s2e_calls:12,
 average_reference_usd_per_call:.000095781,maximum_request_tokens_reserved:65536,projections:[12,16,20,24].map(n=>budgetProjection(n)),
 recommended_calls:24,quantity_reason:'Dezoito chamadas dos três pares centrais; seis de histórico não superado, direção inversa e controle explícito. Repetições idênticas, sem duplicar DECISION de pares só de candidata.',
 minimum_full_worst_case_reservation_usd:.066060288,previous_cap_usd:.05,twenty_and_twenty_four_exceed_previous_full_reservation:true,
 authorization_active:false,requires_new_human_quantity_and_cap:true,requires_fresh_official_price_before_network:true};
const risks={checkpoint:'JEV-S2-F-A',risks:[
 {id:'R1',risk:'Dois R por request são insuficientes para chamar erro de sistemático ou estimar taxa rara.',mitigation:'Publicar contagens, indisponibilidade e pares, sem generalização.'},
 {id:'R2',risk:'Q4 não isola quantidade de perguntas: tarefa, conteúdo e tamanho variam juntos.',mitigation:'Somente associação descritiva; bloco causal de expansão/redução de perguntas exige novo desenho/gate, fora das 24.'},
 {id:'R3',risk:'Semântica de aplicabilidade temporal/cross_entity é justamente alvo da investigação.',mitigation:'Rótulos V2, expected/applicability/rationale independentes e congelados; divergência não permite ajuste pós-resposta.'},
 {id:'R4',risk:'Taxa média S2-E e preço antigo não garantem custo futuro.',mitigation:'Reconfirmar preço e cap novo; 24 reservas integrais excedem US$0,05 antigo.'},
 {id:'R5',risk:'Estrutural inválido pode remover controles positivos e tornar false reject não testado na prática.',mitigation:'Denominador real somente de válidos; reportar cobertura dos seis controles e 0/0 como não testado.'},
 {id:'R6',risk:'Confidence alta de action/verdict pode esconder erro em outros campos.',mitigation:'Confidence e correção por pergunta, sem threshold; R1/R2 e quartis somente descritivos.'},
 {id:'R7',risk:'Confundir falha nova com causa do S2-B ou misturar denominadores.',mitigation:'Runs separados; histórico causa NÃO DETERMINADA / NÃO RECUPERÁVEL.'},
 {id:'R8',risk:'Corpos podem trazer extras privados ou falhas estruturais inesperadas.',mitigation:'Wrapper/parser congelados, projeção positiva, IDs opacos, sem raw, scan e hard stops.'},
 ],future_hard_stops:['MODEL_MISMATCH','OPERATIONAL_ERROR','STRUCTURAL_UNKNOWN','PRIVACY_BREACH','RAW_PERSISTED','BUDGET_VIOLATION','RETRY_ATTEMPT','USAGE_UNAVAILABLE_FOR_BUDGET','HISTORICAL_ARTIFACT_CHANGED','PARSER_WRAPPER_DIVERGENCE'],
 classified_invalid_probabilities:{continue_only_if:['specific_safe_subcode','correct_model','known_usage','budget_safe','privacy_pass','raw_discarded'],structurally_valid:false,semantic_denominator_included:false,correction_allowed:false},
 current_execution:{network:0,jev:0,openai:0,credits:0,authorization:false}};
const plan={checkpoint:'JEV-S2-F-A',mode:'OFFLINE_PROPOSAL_ONLY',authorized:false,executed_calls:0,recommended_calls:calculateCalls(),unique_requests:requests.length,repetitions:2,concurrency_proposed:1,retries_proposed:0,
 requests:requests.map(r=>({request_id:r.request_id,scenario_id:r.scenario_id,scenario_aliases:r.scenario_aliases,task:r.task,model:r.model,request_sha256:r.request_sha256,
  question_count:Object.keys(r.request.questions).length,option_counts:Object.fromEntries(Object.entries(r.request.questions).map(([k,q])=>[k,Object.keys(q.criteria).length])),request:r.request})),stages:plannedStages,
 no_real_run_created:true,no_run_id:true,no_attempt_id:true,no_authorization_lock_created:true,scope_not_planned:[{scenario_id:'H1',task:'VALIDATION'},{scenario_id:'E3',task:'DECISION'},{scenario_id:'E4',task:'VALIDATION'}]};
for(const[name,value]of Object.entries({'diagnostic-matrix.json':{checkpoint:'JEV-S2-F-A',cases:matrix.map(({expected,...c})=>c),pairs:audits,symmetry},'oracle-mini.json':{checkpoint:'JEV-S2-F-A',semantics_only:true,numeric_probability_targets:false,cases:oracle},'requests-plan.json':plan,'budget-projection.json':budget,'risk-register.json':risks,'investigation-map.json':questions,'s2e-observed-facts.json':observed}))await writeFile(join(here,name),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({cases:matrix.length,minimum_pairs:audits.length,directional_controls:1,unique_requests:requests.length,proposed_calls:calculateCalls(),decision_calls:plannedStages.filter(s=>s.stage==='decision').length,validation_calls:plannedStages.filter(s=>s.stage==='validation').length,positive_validation_calls:plannedStages.filter(s=>s.stage==='validation'&&matrix.find(c=>c.scenario_id===s.scenario_id).expected.validation.verdict==='APPROVE').length,network:0}));
