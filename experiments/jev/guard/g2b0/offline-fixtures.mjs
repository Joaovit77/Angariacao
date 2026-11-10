import {benchmark} from '../g0/corpus.mjs';
import {fixtureWire} from '../g0/offline-fixtures.mjs';
import {pairedOrder} from './design.mjs';
import {parseFull,parseReduced} from './reduced-adapter.mjs';
export const FIXTURE_RUN='jev-guard-g2b-1900000000000-a1b2c3d4';
// Fixtures sintéticas de contrato; nenhum output histórico ou observação do provider.
export function wire(c,arm,verdict){const full=fixtureWire(c,verdict?{verdict}:{});return arm==='ARM_FULL'?full:{model:full.model,usage:full.usage,answers:{verdict:full.answers.verdict}};}
export function fixtureRecord(caseId,arm,{verdict,mutate,latency_ms=100}={}){const c=benchmark.find(c=>c.case_id===caseId),w=wire(c,arm,verdict);mutate?.(w);const parsed=(arm==='ARM_FULL'?parseFull:parseReduced)(JSON.stringify(w),c),p=pairedOrder.find(p=>p.case_id===caseId&&p.arm===arm);return{...parsed,run_id:FIXTURE_RUN,case_id:caseId,arm,sequence:p.sequence,stage:'validation',repetition:1,request_sha256:p.request_sha256,stage_id:`${FIXTURE_RUN}/${p.request_id}`,attempt_id:`${FIXTURE_RUN}-a${String(p.sequence).padStart(3,'0')}`,transport_completed:true,latency_ms,source:'SYNTHETIC_FIXTURE_NOT_PROVIDER_OUTPUT'};}
export const fixtureRecords=()=>pairedOrder.map(p=>fixtureRecord(p.case_id,p.arm));
export function replaceRecord(rows,caseId,arm,options){return rows.map(r=>r.case_id===caseId&&r.arm===arm?fixtureRecord(caseId,arm,options):r);}
export function invalidRecord(rows,caseId,arm){return rows.map(r=>r.case_id===caseId&&r.arm===arm?{...r,status:'INVALID_RESPONSE',result:null,normalized_verdict:null,error_code:'INVALID_PROBABILITIES'}:r);}
