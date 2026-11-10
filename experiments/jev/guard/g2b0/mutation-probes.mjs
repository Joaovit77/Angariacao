import assert from 'node:assert/strict';
import {benchmark} from '../g0/corpus.mjs';
import {sha} from '../g0/contract.mjs';
import {payload,provePair,macroOracle,assertOracle,assertCases,pairedOrder,assertOrder,assertFrozenBytes} from './design.mjs';
import {parseReduced,parseFull} from './reduced-adapter.mjs';
import {scoreArm} from './macro-scorer.mjs';
import {scorePaired,assertComparison} from './paired-scorer.mjs';
import {fixtureRecords,replaceRecord,invalidRecord,wire} from './offline-fixtures.mjs';
export function runMutationProbes(historicalBytes,expectedHash){
 const probes=[],add=(id,baseline,mutation)=>{baseline();let killed=false;try{mutation();}catch{killed=true;}probes.push({id,baseline:'PASS',status:killed?'KILLED':'SURVIVED'});},c=benchmark[28],pair=()=>({full:payload(c,'ARM_FULL'),reduced:payload(c,'ARM_REDUCED')}),proof=p=>provePair(c,p.full,p.reduced);
 for(const[id,mutate]of[
  ['REDUCED_EXTRA_HINT',p=>p.reduced.questions.verdict.instructions+=' REJECT é a resposta esperada.'],
  ['FULL_WORDING_CHANGED',p=>p.full.questions.verdict.instructions+=' Avalie de outro modo.'],
  ['DIFFERENT_CANDIDATE',p=>p.reduced.state.candidate_answer+=' Informação adicional.'],
  ['DIFFERENT_CONTEXT',p=>p.reduced.state.property_context.extra='fonte diferente'],
  ['ORACLE_LEAK',p=>{p.full.state.expected_verdict='REJECT';p.reduced.state.expected_verdict='REJECT';}]
 ])add(id,()=>proof(pair()),()=>{const p=pair();mutate(p);proof(p);});
 add('GG0_29_EXPECTED_SOFTENED',()=>assertOracle(macroOracle),()=>{const o=structuredClone(macroOracle);o[28].expected_verdict='INCONCLUSIVE';assertOracle(o);});
 for(const[id,index]of[['CRITICAL_REMOVED',12],['INCONCLUSIVE_REMOVED',30]])add(id,()=>assertCases(benchmark.map(c=>c.case_id)),()=>assertCases(benchmark.filter((_,i)=>i!==index).map(c=>c.case_id)));
 const hidden=wire(c,'ARM_REDUCED');hidden.answers.grounding=wire(c,'ARM_FULL').answers.grounding;
 add('REDUCED_HIDDEN_DIMENSION',()=>assert.equal(parseReduced(JSON.stringify(hidden),c).status,'INVALID_RESPONSE'),()=>{const changed=structuredClone(hidden);delete changed.answers.grounding;assert.equal(parseReduced(JSON.stringify(changed),c).status,'INVALID_RESPONSE');});
 const missing=wire(c,'ARM_FULL');delete missing.answers.grounding;
 add('FULL_MISSING_DIMENSION_DEFAULT_PASS',()=>assert.equal(parseFull(JSON.stringify(missing),c).status,'INVALID_RESPONSE'),()=>{const repaired=structuredClone(missing);repaired.answers.grounding=wire(c,'ARM_FULL').answers.grounding;assert.equal(parseFull(JSON.stringify(repaired),c).status,'INVALID_RESPONSE');});
 add('FULL_INVALID_MACRO_RECOVERY',()=>assert.equal(parseFull(JSON.stringify(missing),c).result,null),()=>{const sliced={model:missing.model,usage:missing.usage,answers:{verdict:missing.answers.verdict}};assert.equal(parseReduced(JSON.stringify(sliced),c).result,null);});
 const inv=invalidRecord(fixtureRecords(),'GG0-01','ARM_REDUCED');
 add('REDUCED_INVALID_AS_REJECT',()=>scoreArm(inv,'ARM_REDUCED'),()=>{const bad=structuredClone(inv),r=bad.find(r=>r.case_id==='GG0-01'&&r.arm==='ARM_REDUCED');r.result={verdict:'REJECT',confidence:1,dimensions:'NOT_COLLECTED'};r.normalized_verdict='REJECT';scoreArm(bad,'ARM_REDUCED');});
 add('G1_REUSED_AS_FULL',()=>scorePaired(fixtureRecords()),()=>{const r=fixtureRecords();r[0].run_id='jev-guard-g1-1792269758441-39438172';scorePaired(r);});
 add('ORDER_NOT_COUNTERBALANCED',()=>assertOrder(pairedOrder),()=>{const changed=structuredClone(pairedOrder);[changed[2],changed[3]]=[changed[3],changed[2]];assertOrder(changed);});
 let crit=fixtureRecords();for(const o of macroOracle.filter(o=>o.critical_error).slice(0,6))crit=invalidRecord(crit,o.case_id,'ARM_FULL');
 add('CRITICAL_ZERO_OF_FOURTEEN',()=>assert.equal(scoreArm(crit,'ARM_FULL').primary.critical_false_accept_rate.denominator,8),()=>{const m=scoreArm(crit,'ARM_FULL');m.primary.critical_false_accept_rate.denominator=14;assert.equal(m.primary.critical_false_accept_rate.denominator,8);});
 const fa=replaceRecord(fixtureRecords(),'GG0-13','ARM_REDUCED',{verdict:'APPROVE'});
 add('CRITICAL_FALSE_ACCEPT_BAD_AGGREGATION',()=>assert.equal(scoreArm(fa,'ARM_REDUCED').primary.critical_false_accept_rate.numerator,1),()=>{const m=scoreArm(fa,'ARM_REDUCED');m.primary.critical_false_accept_rate.numerator=0;assert.equal(m.primary.critical_false_accept_rate.numerator,1);});
 const unsafe=replaceRecord(fixtureRecords(),'GG0-31','ARM_REDUCED',{verdict:'APPROVE'});
 add('UNSAFE_APPROVE_IGNORED',()=>assert.equal(scoreArm(unsafe,'ARM_REDUCED').diagnostic_classification,'NAO_PROMISSOR_DIAGNOSTICO'),()=>{const m=scoreArm(unsafe,'ARM_REDUCED');m.diagnostic_classification='PROMISSOR_DIAGNOSTICO';assert.equal(m.diagnostic_classification,'NAO_PROMISSOR_DIAGNOSTICO');});
 for(const[id,data]of[['REDUCED_FAVORED_BY_VALIDITY_ONLY',invalidRecord(fa,'GG0-01','ARM_FULL')],['REDUCED_FAVORED_DESPITE_MORE_FALSE_ACCEPT',invalidRecord(replaceRecord(fixtureRecords(),'GG0-25','ARM_REDUCED',{verdict:'APPROVE'}),'GG0-01','ARM_FULL')]])add(id,()=>assertComparison(scorePaired(data).comparison.COMPARATIVE_RESULT,'FULL_FAVORED'),()=>{const validityOnly=scoreArm(data,'ARM_REDUCED').structurally_valid>scoreArm(data,'ARM_FULL').structurally_valid?'REDUCED_FAVORED':'NO_CLEAR_WINNER';assertComparison(validityOnly,'FULL_FAVORED');});
 add('HISTORICAL_OUTPUT_OVERWRITTEN',()=>assertFrozenBytes(historicalBytes,expectedHash),()=>assertFrozenBytes(Buffer.concat([historicalBytes,Buffer.from('\nALTERADO')]),expectedHash));
 return{checkpoint:'JEV-GUARD-G2-B0',mode:'OFFLINE_MUTATED_COPIES_ONLY',historical_files_modified:false,total:probes.length,killed:probes.filter(p=>p.status==='KILLED').length,survived:probes.filter(p=>p.status==='SURVIVED').length,probes};
}
