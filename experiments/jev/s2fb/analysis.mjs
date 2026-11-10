import {matrix,requests,plannedStages,caseById,pairs,symmetry,isNormalizedResult,denominatorRules} from '../s2f/design.mjs';
import {decisionFields,validationFields} from '../v2/matrix-v2.mjs';
import {fieldCorrect,rate} from '../v2/scoring-v2.mjs';

const canonical=x=>Array.isArray(x)?x.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const strip=x=>{if(!x)return null;const {confidence,...r}=x;return r;};
const quantile=(xs,p)=>{if(!xs.length)return null;const a=[...xs].sort((a,b)=>a-b),i=(a.length-1)*p;return a[Math.floor(i)]+(a[Math.ceil(i)]-a[Math.floor(i)])*(i%1);};
const valid=s=>s.record?.classification==='STRUCTURALLY_VALID'&&isNormalizedResult(s.stage,s.record.result);
const expected=s=>caseById(s.scenario_id).expected[s.stage];
const fields=s=>s.stage==='decision'?Object.fromEntries(decisionFields.map(f=>[f,fieldCorrect(s.record.result[f],expected(s)[f])])):{verdict:s.record.result.verdict===expected(s).verdict,...Object.fromEntries(validationFields.map(f=>[f,s.record.result.dimensions[f]===expected(s).dimensions[f]]))};
const complete=s=>valid(s)&&Object.values(fields(s)).every(Boolean);

// A identidade planejada impede contar um alias como nova observação.
export function verifyRecords(stages){
 const known=new Map(plannedStages.map(s=>[s.stage_id,s])),seen=new Set();
 for(const s of stages){const id=s.planned_stage_id??s.stage_id,p=known.get(id);
  if(!p||seen.has(id)||['request_id','scenario_id','task','stage','repetition','request_sha256'].some(k=>s[k]!==p[k])||!equal(s.scenario_aliases,p.scenario_aliases))throw Error('UNKNOWN_OR_DUPLICATE_STAGE');seen.add(id);
 }
}

// Choices esperados derivam do oráculo congelado; não há probability golden.
export function expectedChoices(req){
 const c=caseById(req.scenario_id),e=c.expected[req.stage];
 if(req.stage==='validation')return Object.fromEntries(Object.entries({verdict:e.verdict,...e.dimensions}).map(([k,v])=>[k,[v]]));
 const out={action:[e.action],intent:[e.intent],enough_context:[e.enough_context?'YES':'NO'],entity_resolution:[e.entity_resolution]};
 for(const [prefix,list,selection]of [['current_',c.input.property_context.current_facts,e.relevant_current_facts],['history_',c.input.conversation_context,e.relevant_historical_facts],['protocol_',c.input.available_protocols,e.applicable_protocols]])
  list.forEach((f,i)=>out[`${prefix}${i}`]=selection.optional.includes(f.id)?['YES','NO']:[selection.required.includes(f.id)?'YES':'NO']);
 for(const id of Object.keys(req.request.questions))for(const [prefix,list]of [['missing_',e.missing_information],['prohibited_',e.prohibited_assumptions],['temporal_',e.temporal_resolution]])if(id.startsWith(prefix))out[id]=[list.includes(id.slice(prefix.length))?'YES':'NO'];
 return out;
}

export function analyze(ledger){
 verifyRecords(ledger.stages);
 const started=ledger.stages.filter(s=>s.attempt_id),rows=ledger.stages.filter(s=>s.record),ds=ledger.stages.filter(s=>s.stage==='decision'&&valid(s)),vs=ledger.stages.filter(s=>s.stage==='validation'&&valid(s));
 const den=denominatorRules(rows.map(s=>({stage_id:s.planned_stage_id??s.stage_id,structural_status:s.record.classification,result:s.record.result})));
 const details=[...ds,...vs].map(s=>({stage_id:s.stage_id,request_id:s.request_id,scenario_id:s.scenario_id,scenario_aliases:s.scenario_aliases,task:s.task,repetition:s.repetition,fields:fields(s),complete:complete(s),result:s.record.result}));
 const dfields=Object.fromEntries(decisionFields.map(f=>[f,rate(ds.filter(s=>fields(s)[f]).length,ds.length)]));
 const vfields=Object.fromEntries(validationFields.map(f=>[f,rate(vs.filter(s=>fields(s)[f]).length,vs.length)]));
 const positives=vs.filter(s=>expected(s).verdict==='APPROVE'),negatives=vs.filter(s=>expected(s).verdict==='REJECT');
 const fa=negatives.filter(s=>s.record.result.verdict==='APPROVE'),fr=positives.filter(s=>s.record.result.verdict==='REJECT');
 const inconclusive=vs.filter(s=>s.record.result.verdict==='INCONCLUSIVE');
 let required=0,recalled=0,selected=0,irrelevant=0;
 for(const s of ds){const e=expected(s).relevant_historical_facts,a=s.record.result.relevant_historical_facts;required+=e.required.length;recalled+=e.required.filter(id=>a.includes(id)).length;selected+=a.length;irrelevant+=a.filter(id=>![...e.required,...e.optional].includes(id)).length;}
 const history={selection_accuracy:dfields.relevant_historical_facts,required_history_recall:rate(recalled,required),irrelevant_selection_rate:rate(irrelevant,selected),status:required?'TESTED':'NOT_TESTED',planned_required_id_exposures:4,
  details:ds.filter(s=>expected(s).relevant_historical_facts.required.length).map(s=>({stage_id:s.stage_id,scenario_id:s.scenario_id,required:expected(s).relevant_historical_facts.required,selected:s.record.result.relevant_historical_facts,temporal:s.record.result.temporal_resolution}))};
 const endpoint=(id,scope,rep)=>ledger.stages.find(s=>s.scenario_aliases.includes(id)&&s.stage===scope&&s.repetition===rep);
 const pairRows=pairs.flatMap(p=>[1,2].map(rep=>{const l=endpoint(p.left,p.scope,rep),r=endpoint(p.right,p.scope,rep),both=valid(l??{})&&valid(r??{});return{pair_id:p.pair_id,left:p.left,right:p.right,scope:p.scope,repetition:rep,left_stage_id:l?.stage_id??null,right_stage_id:r?.stage_id??null,both_valid:both,left_correct:complete(l??{}),right_correct:complete(r??{}),classification:!both?'PAIR_INCONCLUSIVE':complete(l)&&complete(r)?'PAIR_PASS':'PAIR_FAIL'};}));
 const pairMetrics={planned_pairs:5,planned_pair_exposures:10,covered:pairRows.filter(p=>p.both_valid).length,inconclusive:pairRows.filter(p=>!p.both_valid).length,accuracy:rate(pairRows.filter(p=>p.classification==='PAIR_PASS').length,pairRows.filter(p=>p.both_valid).length),details:pairRows,
  directional_control:{...symmetry,repetitions:[1,2].map(rep=>{const a=endpoint('E1','validation',rep),b=endpoint('E3','validation',rep);return{repetition:rep,both_valid:valid(a??{})&&valid(b??{}),classification:!valid(a??{})||!valid(b??{})?'PAIR_INCONCLUSIVE':complete(a)&&complete(b)?'PAIR_PASS':'PAIR_FAIL'};})}};
 const comparisons=requests.map(req=>{const stages=ledger.stages.filter(s=>s.request_id===req.request_id).sort((a,b)=>a.repetition-b.repetition),[a,b]=stages.map(s=>s.record);
  if(!a||!b)return{request_id:req.request_id,task:req.task,complete_pair:false,classification:'INCOMPLETE'};
  const signature=r=>({parser_status:r.parser_status,classification:r.classification,diagnostic_subcode:r.diagnostic_subcode,questions:(r.questions??[]).map(q=>[q.question_id,q.returned,q.parser_accepted,q.error_code])});
  const status=equal(signature(a),signature(b));
  const choices=q=>(q??[]).map(q=>[q.question_id,q.chosen_option]);
  const semantics=status&&equal(strip(a.result),strip(b.result))&&equal(choices(a.questions),choices(b.questions));
  const projection=r=>(r.questions??[]).map(q=>({question_id:q.question_id,probabilities:q.probabilities,confidence:q.confidence,error_code:q.error_code}));
  const exact=semantics&&equal(a.result,b.result)&&equal(projection(a),projection(b));
  return{request_id:req.request_id,scenario_aliases:req.scenario_aliases,task:req.task,complete_pair:true,semantic_comparable:stages.every(valid),classification:!status?'STRUCTURAL_DISAGREEMENT':exact?'EXACT_MATCH':semantics?'SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION':'MATERIAL_DISAGREEMENT',structural_match:status,main_fields_match:equal(strip(a.result),strip(b.result)),choices_match:equal(choices(a.questions),choices(b.questions)),
   result_r1:a.result,result_r2:b.result,subcode_r1:a.diagnostic_subcode,subcode_r2:b.diagnostic_subcode,questions:Object.keys(req.request.questions).map(id=>({question_id:id,r1:a.questions?.find(q=>q.question_id===id)??null,r2:b.questions?.find(q=>q.question_id===id)??null}))};
 });
 const questionRows=[...ds,...vs].flatMap(s=>{const req=requests.find(r=>r.request_id===s.request_id),e=expectedChoices(req);return s.record.questions.filter(q=>q.returned).map(q=>({stage_id:s.stage_id,request_id:s.request_id,scenario_id:s.scenario_id,repetition:s.repetition,task:s.task,question_id:q.question_id,choice:q.chosen_option,confidence:q.confidence,expected_choices:e[q.question_id],correct:e[q.question_id]?.includes(q.chosen_option)??false}));});
 const confidenceGroups=[];
 for(const key of new Set(questionRows.map(q=>`${q.task}/${q.question_id}`))){const rr=questionRows.filter(q=>`${q.task}/${q.question_id}`===key),q75=quantile(rr.map(q=>q.confidence),.75);confidenceGroups.push({key,n:rr.length,min:Math.min(...rr.map(q=>q.confidence)),max:Math.max(...rr.map(q=>q.confidence)),q75,errors:rr.filter(q=>!q.correct).length});}
 const confidenceErrors=questionRows.filter(q=>!q.correct).map(q=>{const g=confidenceGroups.find(g=>g.key===`${q.task}/${q.question_id}`);return{...q,empirical_q75:g.q75,group_n:g.n,high_confidence:q.confidence>=g.q75};});
 const materialQuestion=q=>q.task==='VALIDATION'?['verdict','grounding','factuality','protocol','temporal','entity','unsupported_assumption','cross_entity','partial_answer_allowed'].includes(q.question_id):q.question_id==='action'||q.question_id==='entity_resolution'||/^(current_|history_|prohibited_|temporal_)/.test(q.question_id);
 const critical=[...fa.map(s=>({type:'CRITICAL_SEMANTIC_EVENT',kind:'FALSE_ACCEPT',stage_id:s.stage_id,scenario_id:s.scenario_id,confidence:s.record.result.confidence})),...fr.map(s=>({type:'CRITICAL_SEMANTIC_EVENT',kind:'FALSE_REJECT',stage_id:s.stage_id,scenario_id:s.scenario_id,confidence:s.record.result.confidence}))];
 for(const s of ds){const f=fields(s);for(const [field,kind]of [['relevant_current_facts','WRONG_SOURCE_SELECTION'],['relevant_historical_facts','WRONG_HISTORY_SELECTION'],['entity_resolution','ENTITY_ERROR'],['applicable_protocols','INVENTED_PROTOCOL_SELECTION'],['prohibited_assumptions','CONTEXT_RISK_ERROR'],['temporal_resolution','TEMPORAL_ERROR']])if(!f[field])critical.push({type:'CRITICAL_SEMANTIC_EVENT',kind,stage_id:s.stage_id,scenario_id:s.scenario_id,field,actual:s.record.result[field],expected:expected(s)[field],interpretation:'Divergência de seleção/classificação; não é evidência de texto gerado nem de ação externa.'});}
 for(const q of confidenceErrors.filter(q=>q.high_confidence&&materialQuestion(q)))critical.push({type:'CRITICAL_SEMANTIC_EVENT',kind:'HIGH_CONFIDENCE_MATERIAL_ERROR',...q});
 const promotesPast=s=>{const actual=s.record.result.temporal_resolution,e=expected(s).temporal_resolution;return actual.includes('CURRENT_FACT')&&!e.includes('CURRENT_FACT')||actual.includes('SUPERSEDED_FACT')&&!e.includes('SUPERSEDED_FACT');};
 const repeatedMaterial=requests.filter(r=>r.stage==='decision').filter(req=>{const rr=ds.filter(s=>s.request_id===req.request_id);return rr.length===2&&(['action','relevant_current_facts','relevant_historical_facts','entity_resolution','applicable_protocols'].some(f=>rr.every(s=>!fields(s)[f])&&equal(rr[0].record.result[f],rr[1].record.result[f]))||rr.every(promotesPast)&&equal(rr[0].record.result.temporal_resolution,rr[1].record.result.temporal_resolution));}).map(r=>r.request_id);
 const repeatedFR=requests.filter(r=>r.stage==='validation').filter(req=>fr.filter(s=>s.request_id===req.request_id).length===2).map(r=>r.request_id);
 const dclass=repeatedMaterial.length?'NAO_PROMISSOR_DIAGNOSTICO':ds.length===10&&ds.every(complete)&&pairRows.filter(p=>p.scope==='decision').every(p=>p.classification==='PAIR_PASS')?'PROMISSOR_DIAGNOSTICO':'INCONCLUSIVO';
 const vclass=fa.length||repeatedFR.length?'NAO_PROMISSOR_DIAGNOSTICO':vs.length===14&&vs.every(complete)&&positives.length===6&&positives.every(s=>s.record.result.verdict==='APPROVE')?'PROMISSOR_DIAGNOSTICO':'INCONCLUSIVO';
 const analyzed=rows.filter(s=>s.record.transport_completed&&s.record.classification!=='FAILED_OPERATIONAL');
 const structuralStats=ss=>({analyzable_transports:ss.length,valid_rate:rate(ss.filter(valid).length,ss.length),invalid_rate:rate(ss.filter(s=>!valid(s)).length,ss.length),subcodes:Object.fromEntries([...new Set(ss.flatMap(s=>s.record.questions?.filter(q=>q.returned&&!q.parser_accepted).map(q=>q.error_code)??[]))].filter(Boolean).map(code=>[code,rate(ss.filter(s=>s.record.questions?.some(q=>q.error_code===code)).length,ss.length)]))});
 const structural={started:started.length,received:rows.length,not_started:ledger.stages.length-started.length,operational_errors:rows.filter(s=>s.record.classification==='FAILED_OPERATIONAL').length,unknown:rows.filter(s=>s.record.classification==='UNCLASSIFIED_STRUCTURAL').length,overall:structuralStats(analyzed),by_task:Object.fromEntries(['DECISION','VALIDATION'].map(t=>[t,structuralStats(analyzed.filter(s=>s.task===t))])),by_question_count:Object.fromEntries([12,24,25].map(n=>[n,structuralStats(analyzed.filter(s=>Object.keys(requests.find(r=>r.request_id===s.request_id).request.questions).length===n))])),by_question_id:{},question_count_inference:'ASSOCIACAO_DESCRITIVA_SOMENTE'};
 for(const id of new Set(analyzed.flatMap(s=>(s.record.questions??[]).map(q=>q.question_id)))){const qq=analyzed.flatMap(s=>(s.record.questions??[]).filter(q=>q.question_id===id&&q.returned));structural.by_question_id[id]={returned:qq.length,invalid_rate:rate(qq.filter(q=>!q.parser_accepted).length,qq.length),subcodes:Object.fromEntries([...new Set(qq.filter(q=>!q.parser_accepted).map(q=>q.error_code))].filter(Boolean).map(code=>[code,rate(qq.filter(q=>q.error_code===code).length,qq.length)]))};}
 let predictedReasons=0,supportedReasons=0,requiredReasons=0;
 for(const s of vs){const need=validationFields.filter(f=>expected(s).dimensions[f]==='FAIL'),actual=s.record.result.reasons;predictedReasons+=actual.length;requiredReasons+=need.length;supportedReasons+=actual.filter(f=>need.includes(f)).length;}
 return{decision:{classification:dclass,valid_stages:ds.length,planned_stages:10,coverage:rate(ds.length,10),action_accuracy:dfields.action,field_accuracy:dfields,micro:rate(ds.reduce((n,s)=>n+Object.values(fields(s)).filter(Boolean).length,0),ds.length*10),decision_completeness:den.decision_completeness,repeated_material_requests:repeatedMaterial,details:details.filter(d=>d.task==='DECISION')},
  validation:{classification:vclass,valid_stages:vs.length,planned_stages:14,coverage:rate(vs.length,14),verdict_accuracy:rate(vs.filter(s=>fields(s).verdict).length,vs.length),dimension_metrics:vfields,dimension_applicability:Object.fromEntries(validationFields.map(f=>[f,Object.fromEntries(['PASS','FAIL','INCONCLUSIVE','NOT_APPLICABLE'].map(label=>[label,vs.filter(s=>expected(s).dimensions[f]===label).length]))])),false_accept_rate:den.false_accept_rate,false_reject_rate:den.false_reject_rate,negative_coverage:rate(negatives.length,8),positive_coverage:rate(positives.length,6),inconclusive_predictions:rate(inconclusive.length,vs.length),positive_controls:['T2','E2','P2'].map(id=>{const rr=positives.filter(s=>s.scenario_id===id);return{scenario_id:id,planned:2,valid:rr.length,approved:rr.filter(s=>s.record.result.verdict==='APPROVE').length,rejected:rr.filter(s=>s.record.result.verdict==='REJECT').length,inconclusive:rr.filter(s=>s.record.result.verdict==='INCONCLUSIVE').length};}),reason_precision:rate(supportedReasons,predictedReasons),reason_recall:rate(supportedReasons,requiredReasons),repeated_false_reject_requests:repeatedFR,details:details.filter(d=>d.task==='VALIDATION')},
  history,pairs:pairMetrics,comparisons,confidence:{method:'Quartil 75 empírico por tarefa/question_id; confidence nativa, sem threshold operacional; somente envelopes válidos.',groups:confidenceGroups,errors:confidenceErrors,high_confidence_errors:confidenceErrors.filter(q=>q.high_confidence),structurally_invalid_excluded:analyzed.filter(s=>!valid(s)).length},critical,structural,coverage:den};
}
