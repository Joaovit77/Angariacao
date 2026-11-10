import { createHash } from 'node:crypto';
import { open, rename, readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { allCases, pairs, mutants, decisionFields, validationFields } from '../v2/matrix-v2.mjs';
import { buildRequestV2 } from '../v2/request-v2.mjs';
import { createLedger, beginAttempt, completeResponse, completeOperationalError, scoringRecords } from '../v2/adapter-run-v2.mjs';
import { fieldCorrect, scoreV2 } from '../v2/scoring-v2.mjs';

export const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const expectedHashes = {
  matrix: '84fb8a7e1bf29a7549bf2cfe4c423fbbbf295fbeb1752459b7f164ffb172018c',
  requests: 'fed25c670d8d06b0b793efe854d18168939d0cce77bf64868e1d570da7da7cf3',
  freeze: '03baa866fbf1fb5fda8a065f8c6a0136c3f4679543306de8b678ed232acf2a60',
  adapter: '4eada006d631cebda9a71142e9b78e592252f472176e2584f4826848e3df4c75',
};
const bad = code => { const error = new Error(code); error.local_code = code; throw error; };
export async function verifyFrozen(v2) {
  const requests = allCases.flatMap(c => ['decision', 'validation'].map(stage => ({ case_id: c.case_id, stage, request: buildRequestV2(c, stage) })));
  const actual = { matrix: sha(allCases), requests: sha(requests), freeze: sha(await readFile(join(v2, 'freeze-v2.json'))), adapter: sha(await readFile(join(v2, 'adapter-freeze.json'))) };
  if (Object.entries(expectedHashes).some(([k, v]) => actual[k] !== v)) bad('HASH_GATE');
  for (const file of ['freeze-v2.json', 'adapter-freeze.json']) {
    const frozen = JSON.parse(await readFile(join(v2, file), 'utf8'));
    for (const [name, digest] of Object.entries(frozen.files)) if (sha(await readFile(join(v2, name))) !== digest) bad('HASH_GATE');
  }
  const old = JSON.parse(await readFile(join(v2, 's0-preservation.json'), 'utf8'));
  for (const [name, digest] of Object.entries(old)) if (sha(await readFile(join(v2, '../../..', name))) !== digest) bad('HASH_GATE');
  return actual;
}

export async function atomicJson(path, value, beforeRename = null) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}`;
  const file = await open(temporary, 'wx');
  try { await file.writeFile(bytes, 'utf8'); await file.sync(); } finally { await file.close(); }
  if (beforeRename) await beforeRename();
  await rename(temporary, path);
  let directorySync = 'SUPPORTED';
  try { const folder = await open(dirname(path), 'r'); try { await folder.sync(); } finally { await folder.close(); } }
  catch (e) { if (!['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP', 'EACCES'].includes(e.code)) throw e; directorySync = 'UNSUPPORTED_ON_PLATFORM'; }
  if (sha(await readFile(path)) !== sha(bytes)) bad('PERSISTENCE_VERIFY_GATE');
  return { file_synced: true, atomic_rename: true, readback_verified: true, directory_sync: directorySync };
}
export async function claimAuthorization(resultsRoot, runId) {
  // Exclusividade persistente: novo processo não ganha outro orçamento sem decisão humana.
  const lock = await open(join(resultsRoot, 's2b-authorization.lock'), 'wx');
  try { await lock.writeFile(JSON.stringify({ run_id: runId, max_calls: 180, cap_usd: 0.50, auto_resume: false })); await lock.sync(); }
  finally { await lock.close(); }
}

// Nano-USD: 0,042 USD/Mtok equivale exatamente a 42 nano-USD/token.
export function budgetOf(ledger) {
  const started = ledger.stages.filter(s => s.attempt_id);
  const records = ledger.stages.flatMap(s => s.record ? [s.record] : []);
  const withUsage = records.filter(r => r.usage_status === 'USAGE_PRESENT' && r.usage);
  const input = withUsage.reduce((n, r) => n + r.usage.input_tokens, 0), output = withUsage.reduce((n, r) => n + r.usage.output_tokens, 0);
  const knownNano = input * 42, worstNano = 65536 * 42, remaining = 180 - started.length;
  return { authorized_cap_usd: 0.50, authorized_cap_nano_usd: 500000000, known_cost_nano_usd: knownNano, known_cost_usd: knownNano / 1e9,
    cost_type: 'ESTIMATED', billed_cost: null, billed_status: 'BILLED_UNKNOWN', input_tokens: withUsage.length ? input : null,
    output_tokens: withUsage.length ? output : null, usage_known_calls: withUsage.length, usage_unknown_calls: started.length - withUsage.length,
    worst_case_next_call_usd: worstNano / 1e9, worst_case_next_call_nano_usd: worstNano,
    projected_remaining_cost_usd: remaining * worstNano / 1e9,
    known_plus_remaining_worst_case_usd: (knownNano + remaining * worstNano) / 1e9,
    authorized_max: 180, started_calls: started.length, completed_calls: records.filter(r => r.status === 'COMPLETED').length,
    failed_calls: records.filter(r => r.status !== 'COMPLETED').length, remaining_calls: remaining,
    in_progress: ledger.stages.filter(s => s.status === 'IN_PROGRESS').length };
}
export function guardBudget(ledger) {
  const b = budgetOf(ledger);
  if (b.started_calls >= 180 || b.usage_unknown_calls > 0 || b.known_cost_nano_usd + b.worst_case_next_call_nano_usd > b.authorized_cap_nano_usd) bad('BUDGET_GATE');
  return b;
}
export function contextGate(request) {
  const bytes = Buffer.byteLength(JSON.stringify(request));
  const state = Buffer.byteLength(JSON.stringify(request.state));
  const maxQuestion = Math.max(...Object.values(request.questions).map(q => Buffer.byteLength(JSON.stringify(q))));
  const reserve = 2048;
  // Filtro conservador, sem tokenizer oficial local: não chama se a margem em bytes não couber.
  const evidence = { body_bytes: bytes, state_bytes: state, largest_question_bytes: maxQuestion, encoding_reserve: reserve,
    per_request_conservative_units: bytes + reserve, per_question_conservative_units: state + maxQuestion + reserve,
    documented_request_tokens: 64000, documented_question_tokens: 32000, exact_tokenization: false,
    methodology: 'Bytes UTF-8 do JSON + reserva de 2.048; filtro conservador local, não contagem exata do tokenizer.' };
  if (bytes > 32 * 1024 * 1024 || evidence.per_request_conservative_units > 64000 || evidence.per_question_conservative_units > 32000) bad('CONTEXT_UNCERTAIN_GATE');
  return evidence;
}
export function analyze(ledger) {
  const records = scoringRecords(ledger), scored = scoreV2(records);
  const complete = ledger.stages.flatMap(s => s.record?.status === 'COMPLETED' ? [s.record] : []);
  const find = (id, stage, repetition) => complete.find(r => r.case_id === id && r.stage === stage && r.repetition === repetition);
  const correct = (c, d, v) => Boolean(d && v && decisionFields.every(f => fieldCorrect(d.result[f], c.expected.decision[f]))
    && v.result.verdict === c.expected.validation.verdict && validationFields.every(f => v.result.dimensions[f] === c.expected.validation.dimensions[f]));
  const pairResults = pairs.map(p => {
    const repetitions = [1, 2, 3].map(repetition => {
      const left = allCases.find(c => c.case_id === p.control), right = allCases.find(c => c.case_id === p.variant);
      const ld = find(left.case_id, 'decision', repetition), lv = find(left.case_id, 'validation', repetition), rd = find(right.case_id, 'decision', repetition), rv = find(right.case_id, 'validation', repetition);
      return { repetition, outcome: ![ld, lv, rd, rv].every(Boolean) ? 'pair_inconclusive' : correct(left, ld, lv) && correct(right, rd, rv) ? 'pair_pass' : 'pair_fail' };
    });
    return { ...p, criterion: 'Ambos os endpoints completos conforme dez campos decisórios, verdict e onze dimensões; sem majority vote.', repetitions,
      outcome: repetitions.some(r => r.outcome === 'pair_inconclusive') ? 'pair_inconclusive' : repetitions.every(r => r.outcome === 'pair_pass') ? 'pair_pass' : 'pair_fail' };
  });
  const consistency = allCases.flatMap(c => ['decision', 'validation'].map(stage => {
    const rows = [1, 2, 3].map(r => find(c.case_id, stage, r));
    const classify = values => new Set(values.map(v => JSON.stringify(v))).size === 1 ? '3/3 iguais' : new Set(values.map(v => JSON.stringify(v))).size === 2 ? '2/3 iguais' : '3 diferentes';
    return { case_id: c.case_id, stage, complete: rows.every(Boolean), primary: rows.every(Boolean) ? classify(rows.map(r => r.result[stage === 'decision' ? 'action' : 'verdict'])) : null,
      reasons: stage === 'validation' && rows.every(Boolean) ? classify(rows.map(r => [...r.result.reasons].sort())) : null,
      main_fields: rows.every(Boolean) ? classify(rows.map(r => stage === 'decision' ? Object.fromEntries(decisionFields.map(f => [f, Array.isArray(r.result[f]) ? [...r.result[f]].sort() : r.result[f]])) : r.result.dimensions)) : null };
  }));
  return { scored, pairs: pairResults, mutants: mutants.map(m => ({ ...m, pair: pairResults.find(p => p.id === m.pair_id) })), consistency };
}

export async function runCampaign({ directory, runId, plan, pricing, hashes, send, now = () => new Date().toISOString(), pause = async () => {}, persistence = atomicJson }) {
  let ledger = createLedger(runId, plan);
  const persist = (name, data) => persistence(join(directory, name), data);
  const campaign = { checkpoint: 'JEV-S2-B', run_id: runId, status: 'RUNNING', started_at: now(), halt_reason: null, model_requested: 'jev-1.14.0', authorized_max: 180, authorized_cap_usd: 0.50 };
  await mkdir(join(directory, 'stage-results'), { recursive: false });
  await persist('pricing.json', pricing); await persist('hashes.json', hashes);
  await persist('ledger.json', ledger); await persist('budget.json', budgetOf(ledger)); await persist('manifest.json', campaign);
  const exportArtifacts = async () => {
    const a = analyze(ledger), budget = budgetOf(ledger);
    const latencies = ledger.stages.flatMap(s => s.record ? [s.record.duration_ms] : []).sort((x, y) => x - y);
    const summary = { ...campaign, ended_at: campaign.status === 'RUNNING' ? null : now(), budget,
      stage_states: Object.fromEntries(['COMPLETED', 'FAILED_OPERATIONAL', 'FAILED_STRUCTURAL', 'IN_PROGRESS', 'NOT_STARTED'].map(status => [status, ledger.stages.filter(s => s.status === status).length])),
      model_observed: [...new Set(ledger.stages.flatMap(s => s.record?.model_observed ? [s.record.model_observed] : []))],
      latency_ms: { count: latencies.length, p50: latencies.length ? latencies[Math.ceil(latencies.length / 2) - 1] : null, max: latencies.at(-1) ?? null },
      classifications: { decisor: 'INCONCLUSIVO', validador: 'INCONCLUSIVO' }, metrics: a.scored.metrics };
    await persist('budget.json', budget); await persist('metrics-partial.json', a.scored);
    await persist('pairs.json', a.pairs); await persist('mutants.json', a.mutants); await persist('consistency.json', a.consistency);
    await persist('errors.json', ledger.stages.flatMap(s => s.record?.status !== 'COMPLETED' && s.record ? [{ stage_id: `${s.case_id}/${s.stage}/${s.repetition}`, attempt_id: s.attempt_id, error: s.record.parse_error ?? s.record.operational_error }] : []));
    await persist('summary.json', summary); await persist('manifest.json', { ...campaign, ...budget });
    if (campaign.status === 'RUN_COMPLETED') await persist('metrics-final.json', a.scored);
    return summary;
  };
  await exportArtifacts();
  for (let index = 0; index < plan.schedule.length; index++) {
    try {
      guardBudget(ledger);
      const scheduled = plan.schedule[index], c = allCases.find(c => c.case_id === scheduled.case_id), request = buildRequestV2(c, scheduled.stage);
      if (sha(request) !== scheduled.request_sha256 || request.model !== 'jev-1.14.0') bad('HASH_GATE');
      const context = contextGate(request);
      const attempt = `${runId}-a${String(index + 1).padStart(3, '0')}`;
      ledger = beginAttempt(ledger, attempt, now());
      const pending = ledger.stages[index];
      Object.assign(pending, { stage_id: `${scheduled.case_id}/${scheduled.stage}/${scheduled.repetition}`, model_requested: 'jev-1.14.0', run_id: runId, context_check: context });
      await persist('ledger.json', ledger); await persist('manifest.json', { ...campaign, ...budgetOf(ledger) });
      // A tentativa já está durable IN_PROGRESS; qualquer falha daqui consome o limite de chamadas.
      const start = performance.now();
      let response;
      try { response = await send(JSON.stringify(request)); }
      catch (e) {
        ledger = completeOperationalError(ledger, attempt, { timestamp: now(), duration_ms: Math.round(performance.now() - start), error_type: e?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK' });
      }
      if (response) {
        if (response.status < 200 || response.status >= 300) ledger = completeOperationalError(ledger, attempt, { timestamp: now(), duration_ms: Math.round(performance.now() - start), error_type: 'HTTP', http_status: response.status });
        else {
          ledger = completeResponse(ledger, attempt, response.text, { timestamp: now(), duration_ms: Math.round(performance.now() - start) });
          ledger.stages[index].record.raw_sha256 = sha(response.text);
        }
      }
      const record = ledger.stages[index].record;
      if (!record) bad('INVALID_TRANSPORT_ENVELOPE');
      await persist(`stage-results/${String(index + 1).padStart(3, '0')}.json`, record);
      await persist('ledger.json', ledger);
      const scored = scoreV2(scoringRecords(ledger));
      if (ledger.status === 'HALTED') { campaign.status = 'HOLD'; campaign.halt_reason = ledger.halt_reason; }
      else if (scored.metrics.hard_gate_false_accepts.length || scored.metrics.inconclusive_unsafe_approvals.length) { campaign.status = 'HOLD'; campaign.halt_reason = 'HARD_GATE_SEMANTICO'; ledger.status = 'HALTED'; ledger.halt_reason = campaign.halt_reason; await persist('ledger.json', ledger); }
      if (budgetOf(ledger).known_cost_nano_usd > 500000000) { campaign.status = 'HOLD'; campaign.halt_reason = 'BUDGET_GATE'; }
      await exportArtifacts();
      if (campaign.status === 'HOLD') break;
      await pause();
    } catch (e) {
      campaign.status = 'HOLD'; campaign.halt_reason = e?.local_code ?? 'PERSISTENCE_OR_LOCAL_GATE';
      try { await exportArtifacts(); } catch { /* O último ledger atômico continua sendo a referência recuperável. */ }
      break;
    }
  }
  if (campaign.status === 'RUNNING') { campaign.status = 'RUN_COMPLETED'; }
  return await exportArtifacts();
}
