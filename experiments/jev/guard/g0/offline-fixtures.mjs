import {benchmark,oracle} from './corpus.mjs';
import {buildGuardRequest,parseGuardResponse} from './contract.mjs';

// Respostas de teste, não observações do modelo. O oráculo não participa do request.
export function fixtureWire(c,choices={}){
 const req=buildGuardRequest(c),o=oracle.find(o=>o.case_id===c.case_id),values={verdict:o.expected_verdict,...o.expected_dimensions,...choices};
 return{model:req.model,usage:{input_tokens:100,output_tokens:20,total_tokens:120},answers:Object.fromEntries(Object.entries(req.questions).map(([id,q])=>{
  const choice=values[id];return[id,{type:'choice',choice,confidence:.5,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===choice?1:0]))}];}))};
}
export function fixtureRecord(c,choices={},repetition=1){const parsed=parseGuardResponse(JSON.stringify(fixtureWire(c,choices)),c);return{case_id:c.case_id,stage:'validation',repetition,structural_status:parsed.status==='COMPLETED'?'STRUCTURALLY_VALID':'INVALID_RESPONSE',result:parsed.result};}
export const fixtureRecords=()=>benchmark.map(c=>fixtureRecord(c));
