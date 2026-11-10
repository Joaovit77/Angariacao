import assert from 'node:assert/strict';
import {benchmark,oracle} from './corpus.mjs';
import {buildGuardRequest,projectInput,parseGuardResponse,scoreGuard} from './contract.mjs';
import {fixtureRecord,fixtureRecords} from './offline-fixtures.mjs';
const by=id=>benchmark.find(c=>c.case_id===id);
const baseline={cases:benchmark,build:buildGuardRequest,project:projectInput,parse:parseGuardResponse,score:scoreGuard,records:fixtureRecords};
const verdictRecord=(id,verdict)=>fixtureRecord(by(id),{verdict});
function probeDefault(s){const p=s.parse(undefined,by('GG0-01'));assert.equal(p.status,'INVALID_RESPONSE');assert.equal(p.result,null);}
const forbidden=new Set(['case_id','expected','expected_verdict','expected_dimensions','oracle','rationale','materiality','critical_error','critical_categories','allowed_partial','guard_required','tags']);
function noOracle(x){if(x&&typeof x==='object')for(const[k,v]of Object.entries(x)){assert.equal(forbidden.has(k),false,k);noOracle(v);}}
function probePayload(s){for(const c of s.cases){const r=s.build(c);noOracle(r);assert.equal(JSON.stringify(r).includes(c.case_id),false);assert.equal(r.state.candidate_answer,c.input.candidate_answer);assert.equal(r.state.property_context.selected_entity,c.input.property_context.selected_entity);}}
function probeNull(s){const records=s.records(),m=s.score(records);assert.equal(m.primary.critical_false_accept_rate.numerator,0);const o=oracle.find(o=>o.case_id==='GG0-21');assert.equal(o.expected_verdict,'REJECT');assert.equal(by('GG0-21').input.property_context.current_facts[0].value,null);}
function probeProtocol(s){const m=s.score(s.records());assert.equal(m.primary.critical_false_accept_rate.numerator,0);assert.equal(oracle.find(o=>o.case_id==='GG0-17').expected_verdict,'REJECT');}
function probeFalseReject(s){const m=s.score([verdictRecord('GG0-04','REJECT')]);assert.equal(m.primary.false_reject_rate.numerator,1);assert.equal(m.primary.false_reject_rate.denominator,1);assert.equal(m.splits.partial_false_reject.numerator,1);}
function probeCriticalSplit(s){const m=s.score([verdictRecord('GG0-21','APPROVE'),verdictRecord('GG0-25','REJECT')]);assert.equal(m.primary.critical_false_accept_rate.numerator,1);assert.equal(m.primary.critical_false_accept_rate.denominator,1);assert.equal(m.splits.ordinary_false_accept.numerator,0);assert.equal(m.splits.ordinary_false_accept.denominator,1);}
function probeInvalid(s){const c=by('GG0-01'),r=s.parse('{',c);assert.equal(r.status,'INVALID_RESPONSE');assert.equal(r.result,null);const m=s.score([{case_id:c.case_id,stage:'validation',repetition:1,structural_status:'INVALID_RESPONSE',result:null}]);assert.equal(m.valid_stages,0);assert.equal(m.primary.verdict_accuracy.value,null);assert.equal(m.primary.valid_response_rate.value,0);}
function probeDecision(s){for(const c of s.cases)assert.equal(Object.hasOwn(s.project(c,'decision'),'candidate_answer'),false);}
function probeControls(s){assert.equal(s.cases.length,36);const wanted=s.cases.map(c=>oracle.find(o=>o.case_id===c.case_id));assert.equal(wanted.filter(o=>o.expected_verdict==='APPROVE').length,12);assert.equal(wanted.filter(o=>o.expected_verdict==='REJECT').length,18);assert.equal(wanted.filter(o=>o.expected_verdict==='INCONCLUSIVE').length,6);}
export const mutationDefinitions=[
 {mutant_id:'GM-01',defect:'APPROVE por default',probe:probeDefault,mutate:s=>({...s,parse:()=>({status:'COMPLETED',result:{verdict:'APPROVE'}})})},
 {mutant_id:'GM-02',defect:'Oráculo vazando no payload',probe:probePayload,mutate:s=>({...s,build:c=>{const r=s.build(c);r.state.oracle=oracle.find(o=>o.case_id===c.case_id);return r;}})},
 {mutant_id:'GM-03',defect:'Null tratado como atual confirmado',probe:probeNull,mutate:s=>({...s,records:()=>s.records().map(r=>r.case_id==='GG0-21'?verdictRecord('GG0-21','APPROVE'):r)})},
 {mutant_id:'GM-04',defect:'Entidade A/B invertida no payload',probe:probePayload,mutate:s=>({...s,build:c=>{const r=s.build(c),pc=r.state.property_context;if(pc.selected_entity==='IMOVEL_A')pc.selected_entity='IMOVEL_B';else if(pc.selected_entity==='IMOVEL_B')pc.selected_entity='IMOVEL_A';return r;}})},
 {mutant_id:'GM-05',defect:'Protocolo inventado aceito',probe:probeProtocol,mutate:s=>({...s,records:()=>s.records().map(r=>r.case_id==='GG0-17'?verdictRecord('GG0-17','APPROVE'):r)})},
 {mutant_id:'GM-06',defect:'False reject ignorado no score',probe:probeFalseReject,mutate:s=>({...s,score:rows=>{const m=s.score(rows);m.primary.false_reject_rate.numerator=0;m.primary.false_reject_rate.value=0;return m;}})},
 {mutant_id:'GM-07',defect:'Critical false accept agregado sem distinção',probe:probeCriticalSplit,mutate:s=>({...s,score:rows=>{const m=s.score(rows);delete m.primary.critical_false_accept_rate;delete m.splits.critical_false_accept;return m;}})},
 {mutant_id:'GM-08',defect:'Invalid structural tratado como APPROVE',probe:probeInvalid,mutate:s=>({...s,parse:()=>({status:'COMPLETED',result:{verdict:'APPROVE'}})})},
 {mutant_id:'GM-09',defect:'Candidata ausente em validation',probe:probePayload,mutate:s=>({...s,build:c=>{const r=s.build(c);delete r.state.candidate_answer;return r;}})},
 {mutant_id:'GM-10',defect:'Candidata vazando em projeção decision',probe:probeDecision,mutate:s=>({...s,project:(c,stage)=>({...s.project(c,stage),candidate_answer:c.input.candidate_answer})})},
 {mutant_id:'GM-11',defect:'Corpus sem controles positivos',probe:probeControls,mutate:s=>({...s,cases:s.cases.filter(c=>oracle.find(o=>o.case_id===c.case_id).expected_verdict!=='APPROVE')})}
];
export function runMutation(definition){
 // A mesma verificação deve aceitar o comportamento base antes de rejeitar o mutante.
 definition.probe(baseline);
 let killed=false;try{definition.probe(definition.mutate(baseline));}catch{killed=true;}
 return{mutant_id:definition.mutant_id,defect:definition.defect,baseline:'PASS',outcome:killed?'KILLED':'SURVIVED',execution:'OFFLINE_IN_MEMORY',model_calls:0};
}
export const runMutationSuite=()=>mutationDefinitions.map(runMutation);
