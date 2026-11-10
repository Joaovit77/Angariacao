import {oracle} from '../g0/corpus.mjs';
import {sha} from '../g0/contract.mjs';
import {assertHistoricalFacts,assertOracleUnchanged,assertHistoricalDigest,assertCriticalCoverage,assertMacroFailure,assertDiagnosticFidelity,assertFutureDesign,futureDesign} from './analysis.mjs';
export function runMutationProbes(bundle,a){
 const probes=[];const add=(id,baseline,mutated)=>{baseline();let killed=false;try{mutated();}catch{killed=true;}probes.push({id,baseline:'PASS',mutation:killed?'KILLED':'SURVIVED'});};
 for(const choice of['REJECT','APPROVE'])add(`INVALID_AS_${choice}`,()=>assertHistoricalFacts(bundle.ledger,bundle.summary,bundle.metrics),()=>{const l=structuredClone(bundle.ledger);l.stages[10].record.result={verdict:choice};l.stages[10].record.normalized_verdict=choice;assertHistoricalFacts(l,bundle.summary,bundle.metrics);});
 const critical={planned:14,valid:8,invalid:6,false_accept_numerator:0,false_accept_denominator:8};
 add('CRITICAL_ZERO_OF_FOURTEEN',()=>assertCriticalCoverage(critical),()=>assertCriticalCoverage({...critical,false_accept_denominator:14}));
 add('IGNORE_GG0_29',()=>assertMacroFailure(a.macroFailure),()=>assertMacroFailure({...a.macroFailure,classification:'NO_FAILURE'}));
 add('CHANGE_ORACLE',()=>assertOracleUnchanged(oracle),()=>{const changed=structuredClone(oracle);changed[28].expected_verdict='APPROVE';assertOracleUnchanged(changed);});
 add('NORMALIZE_SUM',()=>assertDiagnosticFidelity(a.sum.rows,a.sum.rows),()=>{const changed=structuredClone(a.sum.rows);const row=changed[0];for(const k of Object.keys(row.observed_probabilities))row.observed_probabilities[k]/=row.sum;row.sum=1;assertDiagnosticFidelity(a.sum.rows,changed);});
 add('AUTO_MAX_CHOICE',()=>assertDiagnosticFidelity(a.choice.rows,a.choice.rows),()=>{const changed=structuredClone(a.choice.rows);changed[0].choice=changed[0].max_options[0];assertDiagnosticFidelity(a.choice.rows,changed);});
 add('DIMENSION_RECLASSIFIES_HISTORICAL_VERDICT',()=>assertHistoricalFacts(bundle.ledger,bundle.summary,bundle.metrics),()=>{const l=structuredClone(bundle.ledger);l.stages[28].record.result.verdict='REJECT';l.stages[28].record.normalized_verdict='REJECT';assertHistoricalFacts(l,bundle.summary,bundle.metrics);});
 add('FALSE_CAUSALITY_FEWER_QUESTIONS_SOLVES',()=>assertFutureDesign(futureDesign()),()=>assertFutureDesign({...futureDesign(),causal_claim:'PROVEN',less_questions_proven_to_solve:true}));
 const bytes=JSON.stringify(bundle.ledger),digest=sha(bytes);
 add('OVERWRITE_G1_HISTORY',()=>assertHistoricalDigest(bytes,digest),()=>{const changed=structuredClone(bundle.ledger);changed.stages[0].record.result.verdict='REJECT';assertHistoricalDigest(JSON.stringify(changed),digest);});
 add('REMOVE_INCONCLUSIVE_FROM_FUTURE_DESIGN',()=>assertFutureDesign(futureDesign()),()=>assertFutureDesign({...futureDesign(),cases:futureDesign().cases.slice(0,30)}));
 return{checkpoint:'JEV-GUARD-G2-A',mode:'OFFLINE_MUTATED_COPIES_ONLY',historical_files_modified:false,total:probes.length,killed:probes.filter(p=>p.mutation==='KILLED').length,survived:probes.filter(p=>p.mutation==='SURVIVED').length,probes};
}
