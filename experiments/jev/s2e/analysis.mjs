import { scoreV2, fieldCorrect, rate } from '../v2/scoring-v2.mjs';
import { scenarios, requests, decisionFields, validationFields } from './scenarios.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function analyze(ledger){
 const records=ledger.stages.flatMap(s=>s.record?[{case_id:s.scenario_id,repetition:s.repetition,stage:s.stage,result:s.record.result,
  error:s.record.classification==='FAILED_OPERATIONAL'?{code:s.record.operational_code}:null}]:[]);
 const score=scoreV2(records,scenarios,2),m=score.metrics;
 const ds=ledger.stages.filter(s=>s.stage==='decision'&&s.record?.result),vs=ledger.stages.filter(s=>s.stage==='validation'&&s.record?.result);
 const details=ledger.stages.flatMap(s=>{if(!s.record?.result)return[];const e=scenarios.find(c=>c.case_id===s.scenario_id).expected[s.stage],r=s.record.result;
  const fields=s.stage==='decision'?Object.fromEntries(decisionFields.map(f=>[f,fieldCorrect(r[f],e[f])])):{verdict:r.verdict===e.verdict,...Object.fromEntries(validationFields.map(f=>[f,r.dimensions[f]===e.dimensions[f]]))};
  return[{scenario_id:s.scenario_id,task:s.task,repetition:s.repetition,stage_id:s.stage_id,fields,complete:Object.values(fields).every(Boolean),confidence:r.confidence,result:r}];});
 const critical=vs.filter(s=>s.record.result.verdict==='APPROVE').map(s=>({type:'CRITICAL_SEMANTIC_EVENT',kind:'FALSE_ACCEPT',scenario_id:s.scenario_id,repetition:s.repetition,
  risk:{E1_TEMPORAL:'SUPERSEDED_FACT_AS_CURRENT',E2_ENTITY:'CROSS_ENTITY_TRANSFER',E3_PARTIAL_INVENTION:'INVENTED_RATE_PROTOCOL'}[s.scenario_id],dimensions_expected_fail:validationFields.filter(f=>scenarios.find(c=>c.case_id===s.scenario_id).expected.validation.dimensions[f]==='FAIL'),confidence:s.record.result.confidence}));
 const comparisons=requests.map(r=>{
  const stages=ledger.stages.filter(s=>s.scenario_id===r.scenario_id&&s.stage===r.stage),[a,b]=stages.map(s=>s.record);
  if(!a||!b)return{scenario_id:r.scenario_id,task:r.task,classification:'INCOMPLETE',complete_pair:false};
  const sameStatus=a.parser_status===b.parser_status&&a.classification===b.classification,sameSubcode=a.diagnostic_subcode===b.diagnostic_subcode;
  const strip=x=>{if(!x)return null;const{confidence,...rest}=x;return rest;};
  const choices=q=>(q??[]).map(q=>[q.question_id,q.chosen_option]);
  const semantics=sameStatus&&sameSubcode&&equal(strip(a.result),strip(b.result))&&equal(choices(a.questions),choices(b.questions));
  const qprojection=q=>(q??[]).map(q=>({question_id:q.question_id,probabilities:q.probabilities,confidence:q.confidence}));
  const exact=semantics&&equal(a.result,b.result)&&equal(qprojection(a.questions),qprojection(b.questions));
  return{scenario_id:r.scenario_id,task:r.task,complete_pair:true,classification:exact?'EXACT_MATCH':semantics?'SEMANTIC_MATCH_WITH_CONFIDENCE_VARIATION':'MATERIAL_DISAGREEMENT',
   structural_match:sameStatus,subcode_match:sameSubcode,main_fields_match:equal(strip(a.result),strip(b.result)),probability_choices_match:equal(choices(a.questions),choices(b.questions)),
   confidence_r1:a.result?.confidence??null,confidence_r2:b.result?.confidence??null,dimensions_r1:a.result?.dimensions??null,dimensions_r2:b.result?.dimensions??null,
   reasons_r1:a.result?.reasons??null,reasons_r2:b.result?.reasons??null,
   questions:(a.questions??[]).map(q=>({question_id:q.question_id,r1:{choice:q.chosen_option,confidence:q.confidence,sum:q.sum,delta:q.sum_delta_from_1},
    r2:(()=>{const t=b.questions?.find(t=>t.question_id===q.question_id);return t?{choice:t.chosen_option,confidence:t.confidence,sum:t.sum,delta:t.sum_delta_from_1}:null;})()}))};
 });
 const badSource=ds.some(s=>{const e=scenarios.find(c=>c.case_id===s.scenario_id).expected.decision;return !fieldCorrect(s.record.result.relevant_current_facts,e.relevant_current_facts);});
 const decisionClass=ds.length<6?'INCONCLUSIVO':m.action_accuracy.value<1||m.decision_field_accuracy.per_field.entity_resolution.value<1||badSource?'NÃO PROMISSOR DIAGNÓSTICO':m.decision_completeness.value===1?'PROMISSOR DIAGNÓSTICO':'INCONCLUSIVO';
 const allDimensions=Object.values(m.validation_field_accuracy).every(r=>r.value===1);
 const validationClass=vs.length<6?'INCONCLUSIVO':critical.length?'NÃO PROMISSOR DIAGNÓSTICO':m.validation_accuracy.value===1&&allDimensions?'PROMISSOR DIAGNÓSTICO':'INCONCLUSIVO';
 return{decision:{classification:decisionClass,valid_stages:ds.length,action_accuracy:m.action_accuracy,decision_field_accuracy:m.decision_field_accuracy,decision_completeness:m.decision_completeness,
  entity_accuracy:m.decision_field_accuracy.per_field.entity_resolution,temporal_accuracy:m.decision_field_accuracy.per_field.temporal_resolution,
  protocol_selection_accuracy:m.decision_field_accuracy.per_field.applicable_protocols,missing_information_accuracy:m.decision_field_accuracy.per_field.missing_information,
  prohibited_assumption_accuracy:m.decision_field_accuracy.per_field.prohibited_assumptions,history_selection_accuracy:m.history_selection_accuracy,history_required_recall:m.history_required_recall,history_irrelevant_selection_rate:m.history_irrelevant_selection_rate,
  history_applicability:'Histórico opcional E1; recall obrigatório 0/0 é não aplicável, não prova recuperação.',confidence:m.confidence_calibration.decision,details:details.filter(d=>d.task==='DECISION')},
 validation:{classification:validationClass,valid_stages:vs.length,validation_verdict_accuracy:m.validation_accuracy,dimension_metrics:m.validation_field_accuracy,dimension_applicability:m.dimension_applicability,
  false_accept_rate:m.false_accept_rate,false_reject_rate:m.false_reject_rate,reason_precision:m.reason_precision,reason_recall:m.reason_recall,reason_dimension_consistency:m.reason_dimension_consistency,
  false_reject_applicability:'Todas as três candidatas exigem REJECT; false reject 0/0 é não aplicável. Este desenho não testa candidata parcial correta em VALIDATION.',
  confidence:m.confidence_calibration.validation,details:details.filter(d=>d.task==='VALIDATION')},comparisons,critical,coverage:{planned:12,received:score.received_stages,valid:score.valid_stages,not_executed:score.not_executed_stages,incomplete_groups:score.incomplete_repetition_groups}};
}
