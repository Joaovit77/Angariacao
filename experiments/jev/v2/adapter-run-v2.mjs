import { createHash } from 'node:crypto';
import { allCases } from './matrix-v2.mjs';
import { buildRequestV2 } from './request-v2.mjs';
import { parseV2Response } from './adapter-v2.mjs';

// Livro de execução em memória. Não executa transporte, retry, resume ou persistência real.
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const reject = () => { throw new Error('INVALID_RUN_STATE'); };
const data = (obj, key) => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject(); return descriptor.value;
  } catch { reject(); }
};
const validTime = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const [year, month, day, hour, minute, second] = value.match(/\d+/g).map(Number);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] && hour <= 23 && minute <= 59 && second <= 59;
};
export function validatePlan(plan) {
  if (plan.repetitions !== 3 || plan.unique_inputs !== 30 || plan.maximum_planned_calls !== 180 || plan.retries !== 0 || plan.regenerations !== 0 || plan.schedule.length !== 180) reject();
  const expected = [];
  for (let repetition = 1; repetition <= 3; repetition++) {
    const offset = (repetition - 1) * 10;
    for (const c of [...allCases.slice(offset), ...allCases.slice(0, offset)]) for (const stage of ['decision', 'validation']) expected.push({ case_id: c.case_id, repetition, stage, request_sha256: digest(buildRequestV2(c, stage)) });
  }
  if (plan.schedule.some((r, i) => r.case_id !== expected[i].case_id || r.repetition !== expected[i].repetition || r.stage !== expected[i].stage || r.request_sha256 !== expected[i].request_sha256)) reject();
  return expected;
}
export function createLedger(runId, plan) {
  if (typeof runId !== 'string' || !/^[a-z][a-z0-9-]{2,63}$/.test(runId)) reject();
  const schedule = validatePlan(plan);
  return { version: 'adapter-1.0.0', run_id: runId, status: 'NOT_STARTED', auto_resume_authorized: false,
    stages: schedule.map(s => ({ ...s, task: s.stage.toUpperCase(), status: 'NOT_STARTED', attempt_id: null, started_at: null, record: null })) };
}
export function beginAttempt(ledger, attemptId, timestamp) {
  if (!['NOT_STARTED', 'RUNNING'].includes(ledger.status) || ledger.stages.some(s => s.status === 'IN_PROGRESS') || !validTime(timestamp)
    || typeof attemptId !== 'string' || !new RegExp(`^${ledger.run_id}-a[0-9]{3}$`).test(attemptId)
    || ledger.stages.some(s => s.attempt_id === attemptId)) reject();
  const index = ledger.stages.findIndex(s => s.status === 'NOT_STARTED'); if (index < 0) reject();
  const next = structuredClone(ledger);
  next.status = 'RUNNING';
  Object.assign(next.stages[index], { status: 'IN_PROGRESS', attempt_id: attemptId, started_at: timestamp });
  return next;
}
const pending = (ledger, attemptId) => {
  const index = ledger.stages.findIndex(s => s.status === 'IN_PROGRESS' && s.attempt_id === attemptId);
  if (ledger.status !== 'RUNNING' || index < 0) reject(); return index;
};
const identity = (ledger, index, details) => {
  const s = ledger.stages[index], timestamp = data(details, 'timestamp'), duration = data(details, 'duration_ms');
  if (!validTime(timestamp) || Date.parse(timestamp) < Date.parse(s.started_at) || typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) reject();
  return { run_id: ledger.run_id, case_id: s.case_id, task: s.task, repetition: s.repetition, stage: s.stage,
    attempt_id: s.attempt_id, timestamp, duration_ms: duration };
};
const finish = (ledger, index, record) => {
  const next = structuredClone(ledger); next.stages[index].record = record; next.stages[index].status = record.status;
  const halt = record.status !== 'COMPLETED' || record.model_mismatch === true || record.usage_status === 'USAGE_MISSING';
  next.status = halt ? 'HALTED' : next.stages.every(s => s.status === 'COMPLETED') ? 'COMPLETED' : 'RUNNING';
  next.halt_reason = halt ? record.status !== 'COMPLETED' ? record.kind : record.model_mismatch ? 'MODEL_MISMATCH' : 'USAGE_MISSING' : null;
  return next;
};
export function completeResponse(ledger, attemptId, raw, details) {
  const index = pending(ledger, attemptId), s = ledger.stages[index];
  const id = identity(ledger, index, details), c = allCases.find(c => c.case_id === s.case_id);
  const parsed = parseV2Response(raw, { input: c.input }, s.stage);
  const success = parsed.status === 'COMPLETED';
  const record = { ...id, kind: success ? 'RESPONSE' : 'PARSE_ERROR', status: success ? 'COMPLETED' : 'FAILED_STRUCTURAL',
    model_requested: parsed.model_requested, model_observed: parsed.model_observed, model_mismatch: parsed.model_mismatch,
    usage_status: parsed.usage_status, usage: parsed.usage, result: parsed.result,
    parse_error: parsed.error, operational_error: null, question_observations: parsed.question_observations };
  return finish(ledger, index, record);
}
export function completeOperationalError(ledger, attemptId, details) {
  const index = pending(ledger, attemptId), id = identity(ledger, index, details);
  const type = data(details, 'error_type'); if (!['TIMEOUT', 'NETWORK', 'HTTP', 'ABORTED'].includes(type)) reject();
  let descriptor;
  try { descriptor = Object.getOwnPropertyDescriptor(details, 'http_status'); } catch { reject(); }
  if (descriptor && !Object.hasOwn(descriptor, 'value')) reject();
  const status = descriptor?.value ?? null;
  if (type === 'HTTP' ? !Number.isInteger(status) || status < 400 || status > 599 : status !== null) reject();
  const record = { ...id, kind: 'OPERATIONAL_ERROR', status: 'FAILED_OPERATIONAL',
    error_type: type, http_status: status, model_requested: 'jev-1.14.0', model_observed: null, model_mismatch: null,
    usage_status: 'USAGE_MISSING', usage: null, result: null, parse_error: null,
    operational_error: { type: 'OPERATIONAL_ERROR', error_type: type, http_status: status }, question_observations: null };
  return finish(ledger, index, record);
}
export function scoringRecords(ledger) {
  return ledger.stages.filter(s => s.record).map(({ record: r }) => ({ case_id: r.case_id, repetition: r.repetition, stage: r.stage,
    result: r.result, error: r.kind === 'OPERATIONAL_ERROR' ? { code: r.error_type, http_status: r.http_status } : null }));
}
export function partialSnapshot(ledger) {
  // O estado local é produzido somente por estas funções; não é importador de snapshots externos.
  return JSON.stringify(ledger, null, 2);
}
