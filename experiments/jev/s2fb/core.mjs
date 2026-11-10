import assert from 'node:assert/strict';
import{readFile,open,mkdir}from'node:fs/promises';
import{join,relative}from'node:path';
import{atomicJson}from'../s2b/core.mjs';
import{verifyHistory as oldHistory,verifyPrice as oldPrice,privacyScan,listArtifacts,project as probabilityProjection}from'../s2d/core.mjs';
import{parseV2Response}from'../v2/adapter-v2.mjs';
import{parseV2ResponseWithDiagnostics}from'../v2/probability-diagnostics/probability-diagnostics.mjs';
import{matrix as scenarios,requests,plannedStages as plan,oracle as qualityRules,caseById,sha}from'../s2f/design.mjs';
const MODEL='jev-1.14.0';
const requestFreeze=requests.map(r=>({request_id:r.request_id,request_sha256:r.request_sha256}));
import{analyze}from'./analysis.mjs';
export{privacyScan,listArtifacts};
export function verifyPrice(p){oldPrice(p);if(p.documented_request_context_tokens!==64000||p.documented_question_context_tokens!==32000||p.long_context_enabled!==false||p.output_free_confirmed!==true)stop('PRICING_GATE');}
export const MAX_CALLS=24,WORST_TOKENS=65536,PRICE_NANO=42,CAP_NANO=80_000_000;
const stop=code=>{throw new Error(code);};
export async function verifyHistory(repo,before){
 await oldHistory(repo,before);
 for(const[p,expected]of Object.entries(before.lists)){const actual=(await listArtifacts(join(repo,p))).map(f=>relative(repo,f).replaceAll('\\','/')).sort();if(JSON.stringify(actual)!==JSON.stringify(expected))stop('HISTORY_GATE');}
}
export function budget(ledger){
 const started=ledger.stages.filter(s=>s.attempt_id),known=started.filter(s=>s.record?.usage_status==='USAGE_PRESENT');
 const input=known.reduce((n,s)=>n+s.record.usage.input_tokens,0),output=known.reduce((n,s)=>n+s.record.usage.output_tokens,0),unknown=started.length-known.length,nano=input*PRICE_NANO,reserve=unknown*WORST_TOKENS*PRICE_NANO;
 return{authorized_calls:24,cap_usd:.08,started_calls:started.length,usage_known_calls:known.length,usage_unknown_calls:unknown,input_tokens:known.length?input:null,output_tokens:known.length?output:null,
  known_estimated_cost_usd:nano/1e9,estimated_cost_usd:unknown?null:nano/1e9,unknown_usage_reserved_usd:reserve/1e9,estimated_upper_bound_usd:(nano+reserve)/1e9,worst_case_next_call_usd:WORST_TOKENS*PRICE_NANO/1e9,billed_status:'BILLED_UNKNOWN',billed_cost:null};
}
export function guard(ledger){const b=budget(ledger);if(ledger.status!=='RUNNING'||b.started_calls>=24||b.usage_unknown_calls||!Number.isSafeInteger((b.input_tokens??0)*PRICE_NANO)||!Number.isFinite(b.known_estimated_cost_usd)||b.known_estimated_cost_usd+b.worst_case_next_call_usd>.08)stop('BUDGET_OR_STATE_GATE');return b;}
export async function claim(root,runId){const f=await open(join(root,'s2fb-authorization.lock'),'wx');try{await f.writeFile(JSON.stringify({checkpoint:'JEV-S2-F-B',run_id:runId,max_calls:24,cap_usd:.08,auto_resume:false}));await f.sync();}finally{await f.close();}}
export function projectSemantic(raw,c,stage){
 const req=requests.find(r=>r.request_id===stage.request_id),generic=probabilityProjection(raw,req.request,stage);
 const old=parseV2Response(raw,c,stage.stage),wrapper=parseV2ResponseWithDiagnostics(raw,c,stage.stage);
 try{assert.deepEqual(wrapper.parsed,old);if(old.status!==generic.parser_status)stop('PARSER_DIVERGENCE');if(old.status==='COMPLETED')assert.deepEqual(old.question_observations,generic.normalized_answers);}catch{stop('PARSER_DIVERGENCE');}
 const{normalized_answers,...safe}=generic;return{...safe,result:old.result??null};
}
export function summary(ledger){
 const rows=ledger.stages.flatMap(s=>s.record?[s.record]:[]),times=rows.map(r=>r.latency_ms).filter(Number.isFinite).sort((a,b)=>a-b),count=x=>rows.filter(r=>r.classification===x).length,a=analyze(ledger);
 return{checkpoint:'JEV-S2-F-B',run_id:ledger.run_id,status:ledger.status,halt_reason:ledger.halt_reason,authorized_calls:24,started_calls:ledger.stages.filter(s=>s.attempt_id).length,
  completed_transport:rows.filter(r=>r.transport_completed).length,structurally_valid:count('STRUCTURALLY_VALID'),invalid_probabilities:rows.filter(r=>r.parser_category==='INVALID_PROBABILITIES').length,
  classified_diagnostics:count('DIAGNOSTIC_EVENT_CLASSIFIED'),unclassified_structural:count('UNCLASSIFIED_STRUCTURAL'),operational_errors:count('FAILED_OPERATIONAL'),budget:budget(ledger),
  latency_ms:{min:times[0]??null,p50:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.ceil((times.length-1)/2)])/2:null,max:times.at(-1)??null},
  decision:a.decision.classification,validation:a.validation.classification,critical_semantic_events:a.critical.length,retries:0,auto_resume:false,raw_persisted:false};
}
export async function runCampaign({directory,runId,pricing,send,preservationCheck=async()=>{},scan=privacyScan,hooks={},pause=async()=>{},persist=atomicJson}){
 verifyPrice(pricing);if(!/^jev-s2f-diagnostic-[0-9]{13}-[a-f0-9]{8}$/.test(runId))stop('RUN_ID_GATE');
 const execution=await open(join(directory,'execution.lock'),'wx');try{await execution.writeFile(JSON.stringify({run_id:runId,auto_resume:false}));await execution.sync();}finally{await execution.close();}
 await mkdir(join(directory,'stage-results'),{recursive:false});
 const ledger={run_id:runId,status:'RUNNING',halt_reason:null,stages:plan.map((s,i)=>({...s,planned_stage_id:s.stage_id,stage_id:`${runId}/${s.request_id}/R${s.repetition}`,case_id:caseById(s.scenario_id).case_id,index:i+1,status:'NOT_STARTED',attempt_id:null,record:null}))};
 const write=(name,value)=>persist(join(directory,name),value);
 const emit=async()=>{const a=analyze(ledger);await write('ledger.json',ledger);await write('budget.json',budget(ledger));await write('summary.json',summary(ledger));
  await write('decision-metrics.json',a.decision);await write('validation-metrics.json',a.validation);await write('repetition-comparison.json',a.comparisons);await write('critical-events.json',a.critical);await write('history-metrics.json',a.history);await write('pair-metrics.json',a.pairs);await write('structural-analysis.json',a.structural);await write('confidence-analysis.json',a.confidence);
  await write('probabilities-summary.json',ledger.stages.flatMap(s=>s.record?[{stage_id:s.stage_id,classification:s.record.classification,questions:s.record.questions??[]}]:[]));
  await write('errors.json',ledger.stages.flatMap(s=>s.record&&s.record.classification!=='STRUCTURALLY_VALID'?[{stage_id:s.stage_id,classification:s.record.classification,parser_category:s.record.parser_category??null,diagnostic_subcode:s.record.diagnostic_subcode??null,operational_code:s.record.operational_code??null}]:[]));};
 try{
  await write('manifest.json',{checkpoint:'JEV-S2-F-B',run_id:runId,model:MODEL,stages:ledger.stages.map(({record,...s})=>s),concurrency:1,retries:0,auto_resume:false,quality_rules:qualityRules});
  await write('authorization.json',{checkpoint:'JEV-S2-F-B',run_id:runId,human_authorization:true,authorized_calls:24,max_calls:24,model:MODEL,budget_usd:.08,cap_usd:.08,purpose:'JEV-S2-F-B diagnostic only',source:'human explicit authorization',retries:0,auto_resume:false,previous_authorizations:'NOT_REUSED'});
  await write('pricing.json',pricing);await write('plan-freeze.json',{requests:requestFreeze,planned_stages:plan});
  await write('oracle-freeze.json',{scenarios:scenarios.map(c=>({scenario_id:c.scenario_id,case_id:c.case_id,input_sha256:sha(c.input),expected:c.expected,rationale:c.rationale})),oracle:qualityRules});await emit();
  for(const stage of ledger.stages){
   await preservationCheck();verifyPrice(pricing);stage.budget_before_send=guard(ledger);
   const req=requests.find(r=>r.request_id===stage.request_id),c=caseById(stage.scenario_id);
   if(sha(req.body)!==stage.request_sha256||sha(req.request)!==stage.request_sha256||req.request.model!==MODEL||Buffer.byteLength(req.body)+2048>64000
    ||Object.values(req.request.questions).some(q=>Buffer.byteLength(JSON.stringify(req.request.state))+Buffer.byteLength(JSON.stringify(q))+2048>32000))stop('REQUEST_FREEZE_OR_CONTEXT_GATE');
   stage.attempt_id=`${runId}-a${String(stage.index).padStart(3,'0')}`;stage.status='IN_PROGRESS';stage.started_at=new Date().toISOString();
   const durableStage=await write(`stage-results/${String(stage.index).padStart(3,'0')}.json`,{run_id:runId,...stage});const durableLedger=await write('ledger.json',ledger);
   if(![durableStage,durableLedger].every(r=>r?.file_synced&&r.atomic_rename&&r.readback_verified))stop('PERSISTENCE_VERIFY_GATE');
   stage.durability={stage:durableStage,ledger:durableLedger};await hooks.afterBegin?.(stage);await scan(directory);
   const began=performance.now();let response,operation=null;try{response=await send(req.body);}catch{operation='NETWORK_TLS_DNS_OR_TIMEOUT';}await hooks.afterTransport?.(stage);
   const latency=Math.round(performance.now()-began),http=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:null;
   let raw=typeof response?.text==='string'?response.text:null;if(!operation&&(http===null||http<200||http>=300))operation=http===null?'INVALID_TRANSPORT':'HTTP_ERROR';if(!operation&&(!raw||!raw.trim()))operation='EMPTY_TRANSPORT';
   const base={run_id:runId,stage_id:stage.stage_id,planned_stage_id:stage.planned_stage_id,request_id:stage.request_id,case_id:stage.case_id,scenario_id:stage.scenario_id,scenario_aliases:stage.scenario_aliases,task:stage.task,stage:stage.stage,repetition:stage.repetition,attempt_id:stage.attempt_id,request_sha256:stage.request_sha256,
    started_at:stage.started_at,completed_at:new Date().toISOString(),http_status:http,latency_ms:latency,durability:stage.durability,budget_before_send:stage.budget_before_send};
   stage.record=operation?{...base,classification:'FAILED_OPERATIONAL',operational_code:operation,transport_completed:http!==null,model_requested:MODEL,model_observed:null,usage_status:'USAGE_MISSING',usage:null,result:null,questions:[],raw_sha256:raw===null?null:sha(raw)}
    :{...base,transport_completed:true,...projectSemantic(raw,c,stage)};
   raw=null;response=null;stage.status=stage.record.classification;
   await write(`stage-results/${String(stage.index).padStart(3,'0')}.json`,stage.record);await emit();await scan(directory);await preservationCheck();
   if(operation)stop('OPERATIONAL_GATE');if(stage.record.model_observed!==MODEL)stop('MODEL_MISMATCH_GATE');if(stage.record.usage_status!=='USAGE_PRESENT')stop('USAGE_GATE');
   if(stage.record.usage.input_tokens>WORST_TOKENS)stop('USAGE_EXCEEDS_RESERVATION');if(stage.record.classification==='UNCLASSIFIED_STRUCTURAL')stop('UNCLASSIFIED_STRUCTURAL_GATE');if(budget(ledger).estimated_upper_bound_usd>.08)stop('BUDGET_GATE');
   // Erro semântico sintético não muda request, plano, orçamento ou critério de parada.
   if(stage.index<24)await pause();
  }ledger.status='PASS';
 }catch(e){const codes=new Set(['OPERATIONAL_GATE','MODEL_MISMATCH_GATE','USAGE_GATE','USAGE_EXCEEDS_RESERVATION','UNCLASSIFIED_STRUCTURAL_GATE','BUDGET_GATE','BUDGET_OR_STATE_GATE','REQUEST_FREEZE_OR_CONTEXT_GATE','PARSER_DIVERGENCE','PRIVACY_GATE','RAW_OR_PRIVATE_FIELD_GATE','HISTORY_GATE','PRICING_GATE']);ledger.status='HOLD';ledger.halt_reason=codes.has(e?.message)?e.message:'PERSISTENCE_OR_INTERRUPTION_GATE';}
 try{await emit();const check=await scan(directory);await write('privacy-check.json',check);const hashes={};for(const path of await listArtifacts(directory))if(!path.endsWith('hashes.json'))hashes[relative(directory,path).replaceAll('\\','/')]=sha(await readFile(path));
 await write('hashes.json',hashes);await scan(directory);await preservationCheck();}catch{ledger.status='HOLD';ledger.halt_reason='FINAL_PRESERVATION_OR_PRIVACY_GATE';await emit();throw Error('FINAL_PRESERVATION_OR_PRIVACY_GATE');}return summary(ledger);
}
