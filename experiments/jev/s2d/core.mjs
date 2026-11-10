import assert from 'node:assert/strict';
import { readFile, readdir, open, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { atomicJson, verifyFrozen } from '../s2b/core.mjs';
import { parseTypedResponse, parseJsonStrict } from '../v2/adapter-v2.mjs';
import { parseTypedResponseWithDiagnostics as wrap, characterizeAccepted } from '../v2/probability-diagnostics/probability-diagnostics.mjs';
import { materialized, probeFreeze, plan, MODEL, sha } from './probes.mjs';

export const MAX_CALLS = 6, CAP_NANO = 50_000_000, WORST_TOKENS = 65536, PRICE_NANO = 42;
const halt = code => { throw new Error(code); };
export async function verifyHistory(repo, preservation) {
  assert.deepEqual(await verifyFrozen(join(repo, 'experiments/jev/v2')), preservation.frozen);
  for (const [file, digest] of Object.entries(preservation.files)) if (sha(await readFile(join(repo, file))) !== digest) halt('HISTORY_GATE');
  for(const prefix of ['experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/', 'experiments/jev/v2/probability-diagnostics/']) {
    const actual=(await listArtifacts(join(repo,prefix))).map(path=>relative(repo,path).replaceAll('\\','/')).sort();
    const expected=Object.keys(preservation.files).filter(path=>path.startsWith(prefix)).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))halt('HISTORY_GATE');
  }
}
export function verifyPrice(price) {
  if (price.model !== MODEL || price.input_usd_per_million !== .042 || price.output_usd_per_million !== 0 || price.maximum_request_tokens_for_reservation !== WORST_TOKENS
    || price.source !== 'https://docs.typesafe.ai/models' || !Number.isFinite(Date.parse(price.verified_at_utc)) || Math.abs(Date.now() - Date.parse(price.verified_at_utc)) > 86400000) halt('PRICING_GATE');
}
export function budget(ledger) {
  const started = ledger.stages.filter(s => s.attempt_id), known = started.filter(s => s.record?.usage_status === 'USAGE_PRESENT');
  const input = known.reduce((s, r) => s + r.record.usage.input_tokens, 0), output = known.reduce((s, r) => s + r.record.usage.output_tokens, 0);
  const unknown = started.length - known.length, knownNano = input * PRICE_NANO, reserve = unknown * WORST_TOKENS * PRICE_NANO;
  return { authorized_calls: MAX_CALLS, cap_usd: CAP_NANO / 1e9, started_calls: started.length, usage_known_calls: known.length, usage_unknown_calls: unknown,
    input_tokens: known.length ? input : null, output_tokens: known.length ? output : null, known_estimated_cost_usd: knownNano / 1e9,
    estimated_cost_usd: unknown ? null : knownNano / 1e9, unknown_usage_reserved_usd: reserve / 1e9, estimated_upper_bound_usd: (knownNano + reserve) / 1e9,
    worst_case_next_call_usd: WORST_TOKENS * PRICE_NANO / 1e9, billed_cost: null, billed_status: 'BILLED_UNKNOWN' };
}
export function guard(ledger) {
  const b = budget(ledger);
  if (ledger.status !== 'RUNNING' || b.started_calls >= MAX_CALLS || b.usage_unknown_calls || !Number.isFinite(b.known_estimated_cost_usd)
    || b.known_estimated_cost_usd + b.worst_case_next_call_usd > CAP_NANO / 1e9) halt('BUDGET_OR_STATE_GATE');
  return b;
}
export async function claim(root, runId) {
  const f = await open(join(root, 's2d-authorization.lock'), 'wx');
  try { await f.writeFile(JSON.stringify({ checkpoint: 'JEV-S2-D', run_id: runId, max_calls: MAX_CALLS, cap_usd: .05, auto_resume: false })); await f.sync(); }
  finally { await f.close(); }
}
const eligible = new Set(['PROBABILITIES_NOT_OBJECT', 'PROBABILITY_OPTION_MISSING', 'PROBABILITY_UNKNOWN_OPTION', 'PROBABILITY_NOT_NUMBER',
  'PROBABILITY_NOT_FINITE', 'PROBABILITY_BELOW_ZERO', 'PROBABILITY_ABOVE_ONE', 'PROBABILITY_SUM_MISMATCH', 'PROBABILITY_CHOICE_MISMATCH', 'PROBABILITY_EMPTY']);

function perQuestion(raw, request, wholeHash, stage) {
  let body;
  try { body = parseJsonStrict(raw); } catch { return []; }
  if (!body || typeof body !== 'object' || !body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) return [];
  const rows = [];
  for (const [id, question] of Object.entries(request.questions)) {
    if (!Object.hasOwn(body.answers, id)) { rows.push({ question_id: id, returned: false, expected_option_count: Object.keys(question.criteria).length }); continue; }
    const answer = body.answers[id];
    const envelope = { model: body.model, answers: { [id]: answer }, usage: body.usage };
    const localRequest = { model: MODEL, questions: { [id]: question } }, p = wrap(envelope, localRequest);
    const d = p.parsed.status === 'COMPLETED' ? characterizeAccepted(p.parsed.answers, localRequest)[0] : p.diagnostic;
    const probabilities = {};
    for (const key of Object.keys(question.criteria)) {
      const value = answer && typeof answer === 'object' && answer.probabilities && typeof answer.probabilities === 'object' ? answer.probabilities[key] : undefined;
      if (typeof value === 'number' && Number.isFinite(value)) probabilities[key] = value;
    }
    const confidence = answer && typeof answer.confidence === 'number' && Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1 ? answer.confidence : null;
    rows.push({ ...d, question_id: id, returned: true, probabilities, confidence, parser_accepted: p.parsed.status === 'COMPLETED',
      option_set_match: d?.observed_option_count === Object.keys(question.criteria).length && d?.missing_option_ids?.length === 0 && d?.unknown_option_ids?.length === 0,
      absolute_sum_delta: typeof d?.sum_delta_from_1 === 'number' ? Math.abs(d.sum_delta_from_1) : null,
      tie: Array.isArray(d?.max_option_ids) && d.max_option_ids.length > 1, raw_sha256: wholeHash, stage_id: stage.stage_id, attempt_id: stage.attempt_id });
  }
  for (const id of Object.keys(body.answers).filter(id => !Object.hasOwn(request.questions, id))) rows.push({ question_id: `unknown-sha256:${sha(id)}`, returned: true,
    parser_accepted: false, error_code: 'PROBABILITY_UNKNOWN_QUESTION', expected_option_count: null });
  return rows;
}
export function project(raw, request, stage) {
  const old = parseTypedResponse(raw, request), wrapped = wrap(raw, request);
  try { assert.deepEqual(wrapped.parsed, old); } catch { halt('PARSER_DIVERGENCE'); }
  const parsed = wrapped.parsed, rawHash = sha(raw);
  // O wrapper congelado não reconhece IDs S2-D; identidade vem do plano local, fora de parsed.
  const diagnostic = wrapped.diagnostic ? { ...wrapped.diagnostic, raw_sha256: rawHash, stage_id: stage.stage_id, attempt_id: stage.attempt_id } : null;
  const questions = perQuestion(raw, request, rawHash, stage);
  const classified = parsed.error?.code === 'INVALID_PROBABILITIES' && eligible.has(diagnostic?.error_code)
    && diagnostic.question_id !== null && diagnostic.expected_option_count !== null
    && typeof diagnostic.value_type_summary === 'object' && questions.filter(q => q.returned && !q.parser_accepted).every(q => eligible.has(q.error_code));
  return { model_requested: parsed.model_requested, model_observed: parsed.model_observed, model_mismatch: parsed.model_mismatch,
    usage_status: parsed.usage_status, usage: parsed.usage, parser_status: parsed.status, parser_category: parsed.error?.code ?? null,
    diagnostic_subcode: diagnostic?.error_code ?? null, diagnostic, raw_sha256: rawHash, questions,
    normalized_answers: parsed.status === 'COMPLETED' ? parsed.answers : null,
    classification: parsed.status === 'COMPLETED' ? 'STRUCTURALLY_VALID' : classified ? 'DIAGNOSTIC_EVENT_CLASSIFIED' : 'UNCLASSIFIED_STRUCTURAL' };
}

export function summarize(ledger) {
  const rows = ledger.stages.flatMap(s => s.record ? [s.record] : []), latencies = rows.map(r => r.latency_ms).filter(Number.isFinite).sort((a,b) => a-b);
  const count = kind => rows.filter(r => r.classification === kind).length;
  const p50 = latencies.length ? (latencies[Math.floor((latencies.length - 1) / 2)] + latencies[Math.ceil((latencies.length - 1) / 2)]) / 2 : null;
  return { checkpoint: 'JEV-S2-D', run_id: ledger.run_id, status: ledger.status, halt_reason: ledger.halt_reason,
    authorized_calls: MAX_CALLS, started_calls: ledger.stages.filter(s => s.attempt_id).length, completed_transport: rows.filter(r => r.transport_completed).length,
    structurally_valid: count('STRUCTURALLY_VALID'), invalid_probabilities: rows.filter(r => r.parser_category === 'INVALID_PROBABILITIES').length,
    classified_diagnostics: count('DIAGNOSTIC_EVENT_CLASSIFIED'), unclassified_structural: count('UNCLASSIFIED_STRUCTURAL'), operational_errors: count('FAILED_OPERATIONAL'),
    budget: budget(ledger), latency_ms: { min: latencies[0] ?? null, p50, max: latencies.at(-1) ?? null },
    semantic_scoring: 'NOT_APPLICABLE', retries: 0, auto_resume: false, raw_persisted: false };
}
export function compare(ledger) {
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  return materialized.map(p => {
    const rows = ledger.stages.filter(s => s.probe_id === p.probe_id).map(s => s.record);
    if (rows.some(r => !r)) return { probe_id: p.probe_id, complete_pair: false };
    const [a,b] = rows, by = selector => same(selector(a), selector(b));
    return { probe_id: p.probe_id, complete_pair: true, structural_consistency: a.parser_status === b.parser_status,
      classification_consistency: a.classification === b.classification, subcode_consistency: a.diagnostic_subcode === b.diagnostic_subcode,
      model_consistency: a.model_observed === b.model_observed, usage_consistency: same(a.usage,b.usage),
      question_structure_consistency: by(r => r.questions?.map(q=>[q.question_id,q.expected_option_count,q.observed_option_count])),
      option_set_consistency: by(r => r.questions?.map(q=>[q.question_id,Object.keys(q.probabilities ?? {})])),
      choice_consistency: by(r => r.questions?.map(q=>q.chosen_option)), max_option_consistency: by(r => r.questions?.map(q=>q.max_option_ids)),
      confidence_consistency: by(r => r.questions?.map(q=>q.confidence)),
      questions: p.request && Object.keys(p.request.questions).map(id => {
        const x = a.questions?.find(q=>q.question_id===id), y = b.questions?.find(q=>q.question_id===id);
        return { question_id: id, r1: x ?? null, r2: y ?? null, sum_change: typeof x?.sum === 'number' && typeof y?.sum === 'number' ? y.sum-x.sum : null };
      }) };
  });
}
export async function listArtifacts(directory) {
  const rows=[]; for(const entry of await readdir(directory,{withFileTypes:true})) {
    const path=join(directory,entry.name); if(entry.isDirectory()) rows.push(...await listArtifacts(path)); else rows.push(path);
  } return rows;
}
export async function privacyScan(directory, forbidden = []) {
  const files = await listArtifacts(directory);
  for(const path of files) {
    const text = await readFile(path,'utf8');
    if (forbidden.some(value => typeof value === 'string' && value.length > 0 && text.includes(value))) halt('PRIVACY_GATE');
    if (/"(?:raw|raw_text|prompt|raw_context|chain_of_thought|internal_reasoning|secret|debug|Authorization)"\s*:/.test(text)) halt('RAW_OR_PRIVATE_FIELD_GATE');
  }
  return { status:'PASS', files_checked:files.length, forbidden_value_matches:0, raw_persisted:false };
}

export async function runProbe({directory,runId,pricing,send,preservationCheck=async()=>{},scan=privacyScan,hooks={},pause=async()=>{},persist=atomicJson}) {
  verifyPrice(pricing);
  if (!/^jev-s2d-probdiag-[0-9]{13}-[a-f0-9]{8}$/.test(runId)) halt('RUN_ID_GATE');
  // Um segundo processo não pode abrir ou retomar este run, mesmo após falha ou conclusão.
  const execution = await open(join(directory,'execution.lock'),'wx'); try { await execution.writeFile(JSON.stringify({run_id:runId,auto_resume:false})); await execution.sync(); } finally { await execution.close(); }
  await mkdir(join(directory,'stage-results'),{recursive:false});
  const ledger={run_id:runId,status:'RUNNING',halt_reason:null,stages:plan.map((s,i)=>({...s,index:i+1,status:'NOT_STARTED',attempt_id:null,record:null}))};
  const write = (file,value) => persist(join(directory,file),value);
  const emit = async () => {
    await write('ledger.json',ledger); await write('budget.json',budget(ledger)); await write('summary.json',summarize(ledger));
    await write('probabilities-summary.json',ledger.stages.flatMap(s=>s.record?[{stage_id:s.stage_id,classification:s.record.classification,questions:s.record.questions ?? []}]:[]));
    await write('repetition-comparison.json',compare(ledger)); await write('errors.json',ledger.stages.flatMap(s=>s.record && s.record.classification!=='STRUCTURALLY_VALID'?[{stage_id:s.stage_id,classification:s.record.classification,parser_category:s.record.parser_category ?? null,diagnostic_subcode:s.record.diagnostic_subcode ?? null,operational_code:s.record.operational_code ?? null}]:[]));
  };
  try {
    await write('manifest.json',{checkpoint:'JEV-S2-D',run_id:runId,model:MODEL,order:plan,concurrency:1,retries:0,auto_resume:false,semantic_oracle:false});
    await write('authorization.json',{checkpoint:'JEV-S2-D',run_id:runId,human_authorization:true,max_calls:MAX_CALLS,cap_usd:.05,model:MODEL,previous_s2b_authorization:'CLOSED_BY_HOLD',retries:0,auto_resume:false});
    await write('pricing.json',pricing); await write('probes-freeze.json',probeFreeze); await emit();
    for(const stage of ledger.stages) {
      await preservationCheck(); verifyPrice(pricing); guard(ledger);
      const p=materialized.find(p=>p.probe_id===stage.probe_id);
      if(sha(p.body)!==stage.request_sha256 || sha(p.request)!==stage.request_sha256 || p.request.model!==MODEL || Buffer.byteLength(p.body)+2048>64000
        || Object.values(p.request.questions).some(q=>Buffer.byteLength(JSON.stringify(p.request.state))+Buffer.byteLength(JSON.stringify(q))+2048>32000)) halt('REQUEST_FREEZE_OR_CONTEXT_GATE');
      stage.attempt_id=`${runId}-a${String(stage.index).padStart(3,'0')}`;stage.status='IN_PROGRESS';stage.started_at=new Date().toISOString();
      await write(`stage-results/${String(stage.index).padStart(3,'0')}.json`,{run_id:runId,...stage}); await write('ledger.json',ledger);
      await hooks.afterBegin?.(stage); await scan(directory);
      const began=performance.now();let response,operation=null;
      try{response=await send(p.body);}catch{operation='NETWORK_TLS_DNS_OR_TIMEOUT';}
      await hooks.afterTransport?.(stage);
      const latency=Math.round(performance.now()-began), status=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:null;
      let raw=typeof response?.text==='string'?response.text:null;
      if(!operation && (status===null||status<200||status>=300))operation=status===null?'INVALID_TRANSPORT':'HTTP_ERROR';
      if(!operation && (!raw||!raw.trim()))operation='EMPTY_TRANSPORT';
      const base={run_id:runId,stage_id:stage.stage_id,probe_id:stage.probe_id,repetition:stage.repetition,attempt_id:stage.attempt_id,
        started_at:stage.started_at,completed_at:new Date().toISOString(),http_status:status,request_sha256:stage.request_sha256,latency_ms:latency};
      if(operation) stage.record={...base,classification:'FAILED_OPERATIONAL',operational_code:operation,transport_completed:status!==null,model_requested:MODEL,model_observed:null,
        usage_status:'USAGE_MISSING',usage:null,raw_sha256:raw===null?null:sha(raw),questions:[]};
      else stage.record={...base,transport_completed:true,...project(raw,p.request,stage)};
      raw=null;response=null;
      stage.status=stage.record.classification;
      await write(`stage-results/${String(stage.index).padStart(3,'0')}.json`,stage.record); await emit();
      await scan(directory); await preservationCheck();
      if(operation)halt('OPERATIONAL_GATE');
      if(stage.record.model_observed!==MODEL)halt('MODEL_MISMATCH_GATE');
      if(stage.record.usage_status!=='USAGE_PRESENT')halt('USAGE_GATE');
      if(stage.record.usage.input_tokens>WORST_TOKENS)halt('USAGE_EXCEEDS_RESERVATION');
      if(stage.record.classification==='UNCLASSIFIED_STRUCTURAL')halt('UNCLASSIFIED_STRUCTURAL_GATE');
      if(budget(ledger).estimated_upper_bound_usd>.05)halt('BUDGET_GATE');
      if(stage.index<MAX_CALLS)await pause();
    }
    ledger.status='PASS_DIAGNOSTIC';
  } catch(e) {
    const allowed=new Set(['OPERATIONAL_GATE','MODEL_MISMATCH_GATE','USAGE_GATE','UNCLASSIFIED_STRUCTURAL_GATE','BUDGET_GATE','BUDGET_OR_STATE_GATE','REQUEST_FREEZE_OR_CONTEXT_GATE','PARSER_DIVERGENCE','PRIVACY_GATE','RAW_OR_PRIVATE_FIELD_GATE','HISTORY_GATE','USAGE_EXCEEDS_RESERVATION','PRICING_GATE']);
    ledger.status='HOLD'; ledger.halt_reason=allowed.has(e?.message)?e.message:'PERSISTENCE_OR_INTERRUPTION_GATE';
  }
  await emit();
  const checked=await scan(directory); await write('privacy-check.json',checked);
  const hashes={};for(const path of await listArtifacts(directory))if(!path.endsWith('hashes.json'))hashes[path.slice(directory.length+1).replaceAll('\\','/')]=sha(await readFile(path));
  await write('hashes.json',hashes);await scan(directory);await preservationCheck();
  return summarize(ledger);
}
