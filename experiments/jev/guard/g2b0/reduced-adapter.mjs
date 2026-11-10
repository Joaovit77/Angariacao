import {parseTypedResponse} from '../../v2/adapter-v2.mjs';
import {parseGuardResponse,sha} from '../g0/contract.mjs';
import {payload,MODEL} from './design.mjs';
export function parseReduced(raw,c){
 const parsed=parseTypedResponse(raw,payload(c,'ARM_REDUCED')),eligible=parsed.status==='COMPLETED'&&parsed.model_observed===MODEL&&parsed.usage_status==='USAGE_PRESENT';
 return{status:eligible?'STRUCTURALLY_VALID':'INVALID_RESPONSE',parser_status:parsed.status,error_code:parsed.error?.code??(parsed.model_observed!==MODEL?'MODEL_MISMATCH':parsed.usage_status!=='USAGE_PRESENT'?'USAGE_UNAVAILABLE':null),model_requested:MODEL,model_observed:parsed.model_observed,usage_status:parsed.usage_status,usage:parsed.usage,raw_sha256:typeof raw==='string'?sha(raw):null,normalized_verdict:eligible?parsed.answers.verdict.choice:null,result:eligible?{verdict:parsed.answers.verdict.choice,confidence:parsed.answers.verdict.confidence,dimensions:'NOT_COLLECTED'}:null,dimensions_status:'NOT_COLLECTED'};
}
export function parseFull(raw,c){const p=parseGuardResponse(raw,c);return{status:p.status==='COMPLETED'?'STRUCTURALLY_VALID':'INVALID_RESPONSE',parser_status:p.parser_status,error_code:p.error_code,model_requested:p.model_requested,model_observed:p.model_observed,usage_status:p.usage_status,usage:p.usage,raw_sha256:p.raw_sha256,normalized_verdict:p.result?.verdict??null,result:p.result,dimensions_status:'COLLECTED_FULL_ONLY'};}
