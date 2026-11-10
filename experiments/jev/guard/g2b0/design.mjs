import assert from 'node:assert/strict';
import {benchmark,oracle,DIMENSIONS,minimalPairs} from '../g0/corpus.mjs';
import {buildGuardRequest,sha,MODEL} from '../g0/contract.mjs';
export {MODEL,DIMENSIONS,minimalPairs};
export const ARMS=['ARM_FULL','ARM_REDUCED'];
export const macroOracle=oracle.map(o=>({case_id:o.case_id,expected_verdict:o.expected_verdict,critical_error:o.critical_error,critical_categories:o.critical_categories,allowed_partial:o.allowed_partial,rationale:o.rationale}));
export function payload(c,arm){assert.ok(ARMS.includes(arm));const p=buildGuardRequest(c);if(arm==='ARM_REDUCED')p.questions={verdict:p.questions.verdict};return p;}
export const requests=benchmark.flatMap(c=>ARMS.map(arm=>{const request=payload(c,arm),body=JSON.stringify(request);return{case_id:c.case_id,arm,request_id:`${c.case_id}-${arm==='ARM_FULL'?'FULL':'REDUCED'}`,stage:'validation',repetition:1,model:MODEL,request,body,request_sha256:sha(body)};}));
export const pairedOrder=benchmark.flatMap((c,i)=>(i%2===0?ARMS:[...ARMS].reverse()).map(arm=>requests.find(r=>r.case_id===c.case_id&&r.arm===arm))).map((r,i)=>({sequence:i+1,case_id:r.case_id,arm:r.arm,request_id:r.request_id,request_sha256:r.request_sha256,stage:'validation',repetition:1,status:'PROPOSED_ONLY'}));
const denied=new Set(['expected_verdict','expected_dimensions','materiality','critical_error','rationale','tags','oracle','pair_expected','classification','case_id','arm']);
export function assertNoLeak(p){if(p&&typeof p==='object'){for(const[k,v]of Object.entries(p)){assert.ok(!denied.has(k),'ORACLE_LEAK');assertNoLeak(v);}}}
export function provePair(c,full,reduced){
 assertNoLeak(full);assertNoLeak(reduced);assert.deepEqual(full,payload(c,'ARM_FULL'),'FULL_ALTERADO');assert.deepEqual(reduced,payload(c,'ARM_REDUCED'),'REDUCED_ALTERADO');
 const f={...full},r={...reduced};delete f.questions;delete r.questions;assert.equal(JSON.stringify(f),JSON.stringify(r),'FORA_QUESTIONS');assert.equal(JSON.stringify(full.questions.verdict),JSON.stringify(reduced.questions.verdict),'VERDICT_ALTERADO');
 assert.equal(Object.keys(full.questions).length,12);assert.deepEqual(Object.keys(reduced.questions),['verdict']);
 const state=JSON.stringify(full.state);return{case_id:c.case_id,case_mapping_equal:true,outside_questions_bytes_equal:true,outside_questions_sha256:sha(JSON.stringify(f)),context_bytes_equal:true,context_sha256:sha(state),candidate_bytes_equal:true,candidate_sha256:sha(JSON.stringify(c.input.candidate_answer)),verdict_question_bytes_equal:true,verdict_question_sha256:sha(full.questions.verdict),full_sha256:sha(full),reduced_sha256:sha(reduced),full_questions:12,reduced_questions:1,oracle_leak:false,status:'PASS'};
}
export function assertOrder(order){assert.deepEqual(order,pairedOrder,'ORDEM_ALTERADA');}
export function assertOracle(value){assert.deepEqual(value,macroOracle,'ORACLE_ALTERADO');}
export function assertCases(value){assert.deepEqual(value,benchmark.map(c=>c.case_id),'CASOS_ALTERADOS');}
export function assertFrozenBytes(bytes,expected){assert.equal(sha(bytes),expected,'HISTORICO_ALTERADO');}
export const pairedCases=benchmark.map(c=>({case_id:c.case_id,full_request_id:`${c.case_id}-FULL`,reduced_request_id:`${c.case_id}-REDUCED`,source:'G0_SYNTHETIC_BENCHMARK',source_input_sha256:sha(c.input)}));
export const fullExpectedDimensions=oracle.map(o=>({case_id:o.case_id,expected_dimensions:o.expected_dimensions,applicability:o.applicability}));
