import assert from 'node:assert/strict';
import {readFile,open,mkdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {atomicJson} from '../../s2b/core.mjs';
import {verifyHistory as oldHistory,verifyPrice as oldPrice} from '../../s2fb/core.mjs';
import {privacyScan as oldScan,listArtifacts,project as probabilityProjection} from '../../s2d/core.mjs';
import {benchmark} from '../g0/corpus.mjs';
import {MODEL,sha,buildGuardRequest,parseGuardResponse} from '../g0/contract.mjs';
import {analyze,latency} from './analysis.mjs';
export {listArtifacts};
export async function privacyScan(directory,forbidden=[]){const check=await oldScan(directory,forbidden);for(const p of await listArtifacts(directory)){const text=await readFile(p,'utf8');if(/"(?:context|reasoning|returned_prompt|returned_context|response_text|raw_response)"\s*:|\+55\d|\bLD-\d/.test(text))stop('RAW_OR_PRIVATE_FIELD_GATE');}return{...check,returned_context_or_reasoning_persisted:false,real_data_persisted:false};}
export const MAX_CALLS=36,WORST_TOKENS=65536,PRICE_NANO=42,CAP_NANO=120_000_000;
const stop=code=>{throw Error(code);};
export const plan=benchmark.map((c,i)=>({case_id:c.case_id,index:i+1,stage:'validation',task:'VALIDATION',repetition:1,request_sha256:sha(buildGuardRequest(c))}));
export function verifyPrice(p){oldPrice(p);if(p.authorized_cap_usd!==.12||p.all_36_calls_conservative_usd!==.099090432||p.long_context_header_sent!==false)stop('PRICING_GATE');}
export async function verifyHistory(repo,before){await oldHistory(repo,before);for(const[p,h]of Object.entries(before.product_files))if(sha(await readFile(join(repo,p)))!==h)stop('PRODUCT_GATE');}
export function budget(ledger){
 const started=ledger.stages.filter(s=>s.attempt_id),known=started.filter(s=>s.record?.usage_status==='USAGE_PRESENT');
 for(const s of known)if(!Number.isSafeInteger(s.record.usage?.input_tokens)||s.record.usage.input_tokens<0||!Number.isSafeInteger(s.record.usage.output_tokens)||s.record.usage.output_tokens<0)stop('USAGE_GATE');
 const input=known.reduce((n,s)=>n+s.record.usage.input_tokens,0),output=known.reduce((n,s)=>n+s.record.usage.output_tokens,0),unknown=started.length-known.length,nano=input*PRICE_NANO,reserve=unknown*WORST_TOKENS*PRICE_NANO;
 const totalKnown=known.length>0&&known.every(s=>Number.isSafeInteger(s.record.usage.total_tokens));
 return{authorized_calls:MAX_CALLS,cap_usd:.12,started_calls:started.length,usage_known_calls:known.length,usage_unknown_calls:unknown,input_tokens:known.length?input:null,output_tokens:known.length?output:null,total_tokens:totalKnown?known.reduce((n,s)=>n+s.record.usage.total_tokens,0):null,
 known_estimated_cost_usd:nano/1e9,estimated_cost_usd:unknown?null:nano/1e9,unknown_usage_reserved_usd:reserve/1e9,estimated_upper_bound_usd:(nano+reserve)/1e9,remaining_estimated_margin_usd:(CAP_NANO-nano-reserve)/1e9,worst_case_next_call_usd:WORST_TOKENS*PRICE_NANO/1e9,billed_status:'BILLED_UNKNOWN',billed_cost:null};
}
export function guard(l){const b=budget(l);if(l.status!=='RUNNING'||b.started_calls>=MAX_CALLS||b.usage_unknown_calls||!Number.isSafeInteger((b.input_tokens??0)*PRICE_NANO)||!Number.isFinite(b.known_estimated_cost_usd)||((b.input_tokens??0)+WORST_TOKENS)*PRICE_NANO>CAP_NANO)stop('BUDGET_OR_STATE_GATE');return b;}
export async function claim(root,runId){const f=await open(join(root,'guard-g1-authorization.lock'),'wx');try{await f.writeFile(JSON.stringify({checkpoint:'JEV-GUARD-G1',run_id:runId,authorized_calls:36,budget_usd:.12,retry_allowed:false,auto_resume:false}));await f.sync();}finally{await f.close();}}
export function projectSemantic(raw,c,stage){
 const req=buildGuardRequest(c),generic=probabilityProjection(raw,req,stage),guarded=parseGuardResponse(raw,c);
 try{assert.equal(guarded.parser_status,generic.parser_status);if(guarded.status==='COMPLETED')assert.deepEqual(guarded.question_observations,generic.normalized_answers);}catch{stop('PARSER_DIVERGENCE');}
 const {normalized_answers,...safe}=generic;
 return{...safe,classification:guarded.status==='COMPLETED'?'STRUCTURALLY_VALID':generic.classification==='STRUCTURALLY_VALID'?'UNCLASSIFIED_STRUCTURAL':generic.classification,structural_status:guarded.status==='COMPLETED'?'STRUCTURALLY_VALID':'INVALID_RESPONSE',eligibility_error:guarded.error_code,result:guarded.result,normalized_verdict:guarded.result?.verdict??null};
}
export function summary(ledger){const a=analyze(ledger),rows=ledger.stages.flatMap(s=>s.record?[s.record]:[]),count=c=>rows.filter(r=>r.classification===c).length,started=ledger.stages.filter(s=>s.attempt_id).length;return{checkpoint:'JEV-GUARD-G1',run_id:ledger.run_id,status:ledger.status,halt_reason:ledger.halt_reason,mode:'SYNTHETIC_BENCHMARK',planned:36,started,transport_completed:rows.filter(r=>r.transport_completed).length,structurally_valid:count('STRUCTURALLY_VALID'),structurally_invalid:count('DIAGNOSTIC_EVENT_CLASSIFIED')+count('UNCLASSIFIED_STRUCTURAL'),classified_diagnostics:count('DIAGNOSTIC_EVENT_CLASSIFIED'),structural_unknown:count('UNCLASSIFIED_STRUCTURAL'),operational_errors:count('FAILED_OPERATIONAL'),not_started:36-started,in_progress:ledger.stages.filter(s=>s.status==='IN_PROGRESS').length,budget:budget(ledger),latency:latency(ledger),primary:a.metrics.primary,splits:a.metrics.splits,coverage:a.metrics.coverage,pairs:a.pairs.accuracy,diagnostic_classification:a.metrics.diagnostic_classification,retries:0,auto_resume:false,raw_persisted:false,openai_calls:0,integration_allowed:false,real_data_allowed:false};}
export async function runCampaign({directory,runId,pricing,send,preservationCheck=async()=>{},scan=privacyScan,hooks={},pause=async()=>{},persist=atomicJson,freezeEvidence={}}){
 verifyPrice(pricing);if(!/^jev-guard-g1-[0-9]{13}-[a-f0-9]{8}$/.test(runId))stop('RUN_ID_GATE');
 const execution=await open(join(directory,'execution.lock'),'wx');try{await execution.writeFile(JSON.stringify({run_id:runId,auto_resume:false}));await execution.sync();}finally{await execution.close();}
 await mkdir(join(directory,'stage-results'),{recursive:false});
 const ledger={run_id:runId,status:'RUNNING',halt_reason:null,stages:plan.map(s=>({...s,stage_id:`${runId}/${s.case_id}/validation/R1`,status:'NOT_STARTED',attempt_id:null,record:null}))};
 const write=(name,value)=>persist(join(directory,name),value);
 const emit=async()=>{const a=analyze(ledger),s=summary(ledger);await write('ledger.json',ledger);await write('budget.json',s.budget);await write('summary.json',s);
  await write('structural-summary.json',Object.fromEntries(['planned','started','transport_completed','structurally_valid','structurally_invalid','classified_diagnostics','structural_unknown','operational_errors','not_started','in_progress'].map(k=>[k,s[k]])));
  await write('verdict-metrics.json',{...a.metrics,details:a.details,ordinary_false_accepts:a.ordinary});await write('dimension-metrics.json',{metrics:a.metrics.secondary,applicability:a.metrics.dimension_applicability,details:a.dimensions});
  await write('critical-false-accepts.json',{rate:a.metrics.primary.critical_false_accept_rate,details:a.critical,critical_cases:a.details.filter(r=>r.critical_error)});
  await write('false-rejects.json',{rate:a.metrics.primary.false_reject_rate,partial:a.metrics.splits.partial_false_reject,full:a.metrics.splits.full_answer_false_reject,details:a.falseRejects});await write('inconclusive-metrics.json',a.inconclusive);await write('pair-metrics.json',a.pairs);await write('confidence-analysis.json',a.confidence);await write('latency.json',s.latency);
  await write('probabilities-summary.json',ledger.stages.flatMap(s=>s.record?[{stage_id:s.stage_id,classification:s.record.classification,questions:s.record.questions??[]}]:[]));
  await write('errors.json',ledger.stages.flatMap(s=>s.record&&s.record.classification!=='STRUCTURALLY_VALID'?[{stage_id:s.stage_id,case_id:s.case_id,classification:s.record.classification,parser_category:s.record.parser_category??null,diagnostic_subcode:s.record.diagnostic_subcode??null,operational_code:s.record.operational_code??null}]:[]));};
 try{
  await preservationCheck();
  await write('manifest.json',{checkpoint:'JEV-GUARD-G1',run_id:runId,mode:'SYNTHETIC_BENCHMARK',model:MODEL,stages:ledger.stages.map(({record,...s})=>s),concurrency:1,repetitions:1,retries:0,auto_resume:false,quality_contract:'G0_UNMODIFIED'});
  await write('authorization.json',{checkpoint:'JEV-GUARD-G1',run_id:runId,human_authorization:true,authorized_calls:36,model:MODEL,budget_usd:.12,scope:'JEV-GUARD-G1 synthetic benchmark only',real_data_allowed:false,integration_allowed:false,retry_allowed:false,auto_resume:false,previous_authorizations:'NOT_REUSED'});
  await write('pricing.json',pricing);await write('benchmark-freeze.json',{...freezeEvidence,requests:plan});await write('oracle-freeze.json',{source:'experiments/jev/guard/g0/oracle.json',sha256:freezeEvidence.oracle_sha256??null,scorer:'experiments/jev/guard/g0/contract.mjs',scorer_sha256:freezeEvidence.scorer_sha256??null});await emit();
  for(const stage of ledger.stages){
   await preservationCheck();verifyPrice(pricing);stage.budget_before_send=guard(ledger);
   const c=benchmark.find(c=>c.case_id===stage.case_id),request=buildGuardRequest(c),body=JSON.stringify(request);
   if(sha(body)!==stage.request_sha256||request.model!==MODEL||Buffer.byteLength(body)+2048>64000||Object.values(request.questions).some(q=>Buffer.byteLength(JSON.stringify(request.state))+Buffer.byteLength(JSON.stringify(q))+2048>32000))stop('REQUEST_FREEZE_OR_CONTEXT_GATE');
   stage.attempt_id=`${runId}-a${String(stage.index).padStart(3,'0')}`;stage.status='IN_PROGRESS';stage.started_at=new Date().toISOString();stage.model_requested=MODEL;
   const durableStage=await write(`stage-results/${String(stage.index).padStart(3,'0')}.json`,{run_id:runId,...stage}),durableLedger=await write('ledger.json',ledger);
   if(![durableStage,durableLedger].every(r=>r?.file_synced&&r.atomic_rename&&r.readback_verified))stop('PERSISTENCE_VERIFY_GATE');
   stage.durability={stage:durableStage,ledger:durableLedger};await hooks.afterBegin?.(stage);await scan(directory);
   const began=performance.now();let response,operation=null;try{response=await send(body);}catch{operation='NETWORK_TLS_DNS_OR_TIMEOUT';}await hooks.afterTransport?.(stage);
   const elapsed=Math.round(performance.now()-began),http=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:null;
   let raw=typeof response?.text==='string'?response.text:null;if(!operation&&(http===null||http<200||http>=300))operation=http===null?'INVALID_TRANSPORT':'HTTP_ERROR';if(!operation&&(!raw||!raw.trim()))operation='EMPTY_TRANSPORT';
   const base={run_id:runId,stage_id:stage.stage_id,case_id:stage.case_id,stage:'validation',task:'VALIDATION',repetition:1,attempt_id:stage.attempt_id,request_sha256:stage.request_sha256,started_at:stage.started_at,completed_at:new Date().toISOString(),http_status:http,latency_ms:elapsed,durability:stage.durability,budget_before_send:stage.budget_before_send};
   stage.record=operation?{...base,classification:'FAILED_OPERATIONAL',structural_status:'FAILED_OPERATIONAL',operational_code:operation,transport_completed:http!==null,model_requested:MODEL,model_observed:null,usage_status:'USAGE_MISSING',usage:null,result:null,normalized_verdict:null,questions:[],raw_sha256:raw===null?null:sha(raw)}:{...base,transport_completed:true,...projectSemantic(raw,c,stage)};
   raw=null;response=null;stage.status=stage.record.classification;
   await write(`stage-results/${String(stage.index).padStart(3,'0')}.json`,stage.record);await emit();await scan(directory);await preservationCheck();
   if(operation)stop('OPERATIONAL_GATE');if(stage.record.model_observed!==MODEL)stop('MODEL_MISMATCH_GATE');if(stage.record.usage_status!=='USAGE_PRESENT')stop('USAGE_GATE');
   if(stage.record.usage.input_tokens>WORST_TOKENS)stop('USAGE_EXCEEDS_RESERVATION');if(stage.record.classification==='UNCLASSIFIED_STRUCTURAL')stop('UNCLASSIFIED_STRUCTURAL_GATE');if(budget(ledger).estimated_upper_bound_usd>.12)stop('BUDGET_GATE');
   // Resultado semântico não modifica plano, pedido, oráculo ou critério operacional.
   if(stage.index<36)await pause();
  }ledger.status='PASS';
 }catch(e){const codes=new Set(['OPERATIONAL_GATE','MODEL_MISMATCH_GATE','USAGE_GATE','USAGE_EXCEEDS_RESERVATION','UNCLASSIFIED_STRUCTURAL_GATE','BUDGET_GATE','BUDGET_OR_STATE_GATE','REQUEST_FREEZE_OR_CONTEXT_GATE','PARSER_DIVERGENCE','PRIVACY_GATE','RAW_OR_PRIVATE_FIELD_GATE','HISTORY_GATE','PRODUCT_GATE','PRICING_GATE','PERSISTENCE_VERIFY_GATE']);ledger.status='HOLD';ledger.halt_reason=codes.has(e?.message)?e.message:'PERSISTENCE_OR_INTERRUPTION_GATE';}
 try{await emit();const check=await scan(directory);await write('privacy-check.json',check);const hashes={};for(const p of await listArtifacts(directory))if(!p.endsWith('hashes.json'))hashes[relative(directory,p).replaceAll('\\','/')]=sha(await readFile(p));await write('hashes.json',hashes);await scan(directory);await preservationCheck();}catch{ledger.status='HOLD';ledger.halt_reason='FINAL_PRESERVATION_OR_PRIVACY_GATE';await emit();throw Error('FINAL_PRESERVATION_OR_PRIVACY_GATE');}return summary(ledger);
}
