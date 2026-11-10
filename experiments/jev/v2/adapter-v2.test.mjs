import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { allCases, validationFields } from './matrix-v2.mjs';
import { buildRequestV2 } from './request-v2.mjs';
import { scoreV2 } from './scoring-v2.mjs';
import { parseV2Response, parseTypedResponse, parseJsonStrict, parseUsage } from './adapter-v2.mjs';
import { createLedger, beginAttempt, completeResponse, completeOperationalError, scoringRecords, partialSnapshot, validatePlan } from './adapter-run-v2.mjs';
import { fixturesV2, wireFixture, fixtureCase, syntheticPrivacy } from './adapter-fixtures-v2.mjs';
const root = dirname(fileURLToPath(import.meta.url)), repo = resolve(root, '../../..');
const plan = JSON.parse(readFileSync(join(root, 'planned-run-v2.json')));
const hash = v => createHash('sha256').update(v).digest('hex');
const time = '2026-01-01T00:00:00.000Z', details = { timestamp: '2026-01-01T00:00:01.000Z', duration_ms: 1000 };
const parse = f => parseV2Response(f.raw, f.c, f.stage);
const row = (c, stage, parsed, repetition = 1) => ({ case_id: c.case_id, stage, repetition, result: parsed.result, error: null });
const noPrivate = value => { const text = JSON.stringify(value); for (const sentinel of syntheticPrivacy) assert.equal(text.includes(sentinel), false); };

test('decision mínima preserva seleções vazias legítimas, sem preencher oráculo', () => {
  const f = fixturesV2().VALID_DECISION_MINIMAL, p = parse(f);
  assert.equal(p.status, 'COMPLETED'); assert.equal(p.result.intent, 'SOCIAL');
  assert.deepEqual(p.result.relevant_current_facts, []); assert.deepEqual(p.result.relevant_historical_facts, []);
  assert.equal(p.result.entity_resolution, 'ENTITY_AMBIGUOUS'); assert.equal(p.result.confidence, 0.5);
});
test('decision completa mapeia índices para IDs existentes de forma reproduzível', () => {
  const f = fixturesV2().VALID_DECISION_FULL, p = parse(f);
  assert.deepEqual(p.result.relevant_historical_facts, ['h-acesso']);
  assert.deepEqual(p.result.relevant_current_facts, ['vagas-A']);
  assert.deepEqual(parse(f), p);
  const s = scoreV2([row(f.c, 'decision', p)], [allCases.find(c => c.case_id === f.c.case_id)]);
  assert.equal(s.metrics.decision_completeness.value, 1);
});
for (const name of ['VALID_VALIDATION_APPROVE', 'VALID_VALIDATION_REJECT', 'VALID_VALIDATION_INCONCLUSIVE']) test(`validation preserva ${name}`, () => {
  const f = fixturesV2()[name], p = parse(f);
  assert.equal(p.status, 'COMPLETED'); assert.equal(p.result.verdict, f.raw.answers.verdict.choice);
  assert.deepEqual(Object.keys(p.result.dimensions), validationFields);
});
test('decision e validation não podem ser trocadas ou misturadas', () => {
  const f = fixturesV2().VALID_DECISION_FULL;
  assert.equal(parseV2Response(f.raw, f.c, 'validation').status, 'INVALID_RESPONSE');
  const v = fixturesV2().VALID_VALIDATION_APPROVE;
  assert.equal(parseV2Response(v.raw, v.c, 'decision').status, 'INVALID_RESPONSE');
  v.raw.answers.action = { type: 'choice', choice: 'RESPOND', confidence: 1, probabilities: { RESPOND: 1 } };
  assert.equal(parse(v).status, 'INVALID_RESPONSE');
  assert.equal(parseV2Response(v.raw, v.c, 'VALIDATION').status, 'INVALID_RESPONSE');
});
test('tipos hostis no corpo não viram APPROVE ou INCONCLUSIVE', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE;
  for (const raw of [null, undefined, 'texto', [], {}, 1, true, false, NaN, 'null', '[]', 'false']) {
    const p = parseV2Response(raw, f.c, f.stage);
    assert.equal(p.status, 'INVALID_RESPONSE'); assert.equal(p.result, null); assert.equal(p.error.type, 'PARSE_ERROR'); noPrivate(p);
  }
});
test('enums são fechados e não corrigem case/whitespace/string numérica', () => {
  for (const value of ['approve', ' APPROVE', 'APPROVE ', 'UNKNOWN', '', 0, null, [], {}]) {
    const f = fixturesV2().VALID_VALIDATION_APPROVE; f.raw.answers.verdict.choice = value;
    assert.equal(parse(f).status, 'INVALID_RESPONSE');
  }
});
test('campos obrigatórios ausentes permanecem erro estrutural', () => {
  for (const name of ['VALID_DECISION_MINIMAL', 'VALID_VALIDATION_APPROVE']) {
    const f = fixturesV2()[name];
    for (const id of Object.keys(f.raw.answers)) {
      const bad = structuredClone(f); delete bad.raw.answers[id]; const p = parse(bad);
      assert.equal(p.status, 'INVALID_RESPONSE', id); assert.equal(p.result, null);
    }
  }
});
test('null, arrays, objetos aninhados e strings em campos tipados são recusados', () => {
  for (const value of [null, [], 'PASS', 1, true, { choice: {} }]) {
    const f = fixturesV2().VALID_VALIDATION_APPROVE; f.raw.answers.grounding = value;
    assert.equal(parse(f).status, 'INVALID_RESPONSE');
  }
  const f = fixturesV2().VALID_DECISION_FULL; f.raw.answers.history_20.choice = ['YES'];
  assert.equal(parse(f).status, 'INVALID_RESPONSE');
});
for (const confidence of [0, 1, 0.5]) test(`confidence ${confidence} preservada sem threshold`, () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE; f.raw.answers.verdict.confidence = confidence;
  assert.equal(parse(f).result.confidence, confidence);
});
test('confidence ausente, null, NaN, infinita, textual ou fora da faixa é inválida', () => {
  for (const confidence of [undefined, null, NaN, Infinity, -0.1, 1.01, '0.5']) {
    const f = fixturesV2().VALID_VALIDATION_APPROVE; f.raw.answers.verdict.confidence = confidence;
    assert.equal(parse(f).status, 'INVALID_RESPONSE');
  }
  const f = fixturesV2().VALID_VALIDATION_APPROVE; delete f.raw.answers.verdict.confidence;
  assert.equal(parse(f).status, 'INVALID_RESPONSE');
});
test('probabilidades incompletas, inválidas ou incompatíveis com choice são recusadas', () => {
  for (const mutate of [a => { delete a.probabilities.APPROVE; }, a => { a.probabilities.APPROVE = '1'; }, a => { a.probabilities.APPROVE = NaN; }, a => { a.probabilities.APPROVE = 0.5; }, a => { a.choice = 'REJECT'; }, a => { a.probabilities.UNKNOWN = 0; }]) {
    const f = fixturesV2().VALID_VALIDATION_APPROVE; mutate(f.raw.answers.verdict);
    assert.equal(parse(f).status, 'INVALID_RESPONSE');
  }
});
test('extras arbitrários e sentinelas privadas não contaminam normalização', () => {
  for (const name of ['UNKNOWN_FIELDS', 'PII_EXTRA_FIELD']) {
    const f = fixturesV2()[name], p = parse(f); assert.equal(p.status, 'COMPLETED'); noPrivate(p);
    assert.equal(Object.hasOwn(p, 'internal_reasoning'), false);
    assert.equal(Object.hasOwn(p.result, 'debug'), false);
  }
});
test('getters em extras não são executados; getter obrigatório/proxy falha sem vazar', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE; let hits = 0;
  Object.defineProperty(f.raw, 'secret', { get() { hits++; throw new Error(syntheticPrivacy[0]); } });
  assert.equal(parse(f).status, 'COMPLETED'); assert.equal(hits, 0);
  Object.defineProperty(f.raw.answers.verdict, 'choice', { get() { throw new Error(syntheticPrivacy[0]); } });
  const p = parse(f); assert.equal(p.status, 'INVALID_RESPONSE'); noPrivate(p);
  const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw { get message() { throw new Error('não acessar'); } }; } });
  const proxyResult = parseV2Response(hostile, f.c, f.stage); assert.equal(proxyResult.status, 'INVALID_RESPONSE'); noPrivate(proxyResult);
});
test('JSON duplicado, inclusive chave escapada, é detectado antes da sobrescrita', () => {
  for (const raw of ['{"a":1,"a":2}', '{"choice":"YES","\\u0063hoice":"NO"}', '{"nested":{"x":1,"x":2}}']) assert.throws(() => parseJsonStrict(raw), /DUPLICATE_KEY/);
  const f = fixturesV2().VALID_VALIDATION_APPROVE;
  const raw = JSON.stringify(f.raw).replace('"model":"jev-1.14.0"', '"model":"jev-1.14.0","model":"jev-1.13.0"');
  const p = parseV2Response(raw, f.c, f.stage); assert.equal(p.error.code, 'DUPLICATE_KEY'); assert.equal(p.result, null);
});
test('JSON inválido, profundo ou excessivo falha fechado; espaços externos são permitidos', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE;
  for (const raw of ['{"a":1,}', '[1,]', '{', 'NaN', '1e999', 'true false', '{"x":"\n"}', '['.repeat(66) + '0' + ']'.repeat(66), ' '.repeat(2_097_153)]) assert.equal(parseV2Response(raw, f.c, f.stage).status, 'INVALID_RESPONSE');
  assert.equal(parseV2Response(` \n${JSON.stringify(f.raw)}\t `, f.c, f.stage).status, 'COMPLETED');
});
test('IDs de histórico não são inventados; duplicata de catálogo e seleção ausente são explícitas', () => {
  const f = fixturesV2().INVALID_HISTORY_IDS; assert.equal(parse(f).status, 'INVALID_RESPONSE');
  const missing = fixturesV2().VALID_DECISION_FULL; delete missing.raw.answers.history_20;
  assert.equal(parse(missing).result, null);
  const duplicate = fixturesV2().VALID_DECISION_FULL; duplicate.c.input.conversation_context.push(structuredClone(duplicate.c.input.conversation_context[20]));
  assert.equal(parse(duplicate).error.code, 'INVALID_CONTEXT');
});
test('NO para histórico necessário é preservado como erro semântico, sem correção pelo adapter', () => {
  const f = fixturesV2().VALID_DECISION_FULL;
  f.raw.answers.history_20 = { type: 'choice', choice: 'NO', confidence: 0, probabilities: { YES: 0, NO: 1 } };
  const p = parse(f); assert.deepEqual(p.result.relevant_historical_facts, []);
  const s = scoreV2([row(f.c, 'decision', p)], [allCases.find(c => c.case_id === f.c.case_id)]);
  assert.equal(s.metrics.action_accuracy.value, 1); assert.equal(s.metrics.history_required_recall.value, 0); assert.equal(s.metrics.decision_completeness.value, 0);
});
test('razões são somente FAIL explícitos; REJECT não espalha reprovação', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE;
  f.raw.answers.verdict = { type: 'choice', choice: 'REJECT', confidence: 1, probabilities: { APPROVE: 0, REJECT: 1, INCONCLUSIVE: 0 } };
  const p = parse(f); assert.equal(p.result.verdict, 'REJECT'); assert.deepEqual(p.result.reasons, []);
  assert.ok(Object.values(p.result.dimensions).every(v => v === 'PASS'));
  const s = scoreV2([row(f.c, 'validation', p)], [allCases.find(c => c.case_id === f.c.case_id)]);
  assert.equal(s.metrics.false_reject_rate.value, 1); assert.equal(s.metrics.reason_precision.value, null);
});
test('reason precision preserva motivos indevidos explicitamente retornados', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE;
  f.raw.answers.entity = { type: 'choice', choice: 'FAIL', confidence: 1, probabilities: { PASS: 0, FAIL: 1, INCONCLUSIVE: 0, NOT_APPLICABLE: 0 } };
  const p = parse(f); assert.deepEqual(p.result.reasons, ['entity']);
  const s = scoreV2([row(f.c, 'validation', p)], [allCases.find(c => c.case_id === f.c.case_id)]);
  assert.equal(s.metrics.reason_precision.value, 0); assert.equal(s.metrics.validation_accuracy.value, 1);
});
for (const name of ['PARTIAL_VALID', 'PARTIAL_INVALID_OMISSION', 'PARTIAL_INVALID_INVENTION']) test(`fixture parcial ${name} entra no scorer sem julgamento do adapter`, () => {
  const f = fixturesV2()[name], p = parse(f);
  const s = scoreV2([row(f.c, 'validation', p)], [allCases.find(c => c.case_id === f.c.case_id)]);
  assert.equal(s.metrics.validation_accuracy.value, 1); assert.equal(s.structural_errors, 0);
});
test('INCONCLUSIVE válido difere de JSON inválido e de erro operacional', () => {
  const f = fixturesV2().VALID_VALIDATION_INCONCLUSIVE;
  assert.equal(parse(f).result.verdict, 'INCONCLUSIVE');
  assert.equal(parse(fixturesV2().MALFORMED_RESPONSE).result, null);
  let l = beginAttempt(createLedger('run-offline', plan), 'run-offline-a001', time);
  l = completeOperationalError(l, 'run-offline-a001', fixturesV2().OPERATIONAL_ERROR);
  assert.equal(l.stages[0].record.result, null); assert.equal(l.stages[0].record.kind, 'OPERATIONAL_ERROR'); noPrivate(l);
});
test('usage presente preserva valores e total; ausente/null nunca vira zero', () => {
  assert.deepEqual(parseUsage({ input_tokens: 0, output_tokens: 0 }), { status: 'USAGE_PRESENT', usage: { input_tokens: 0, output_tokens: 0, total_tokens: null } });
  assert.deepEqual(parseUsage(undefined), { status: 'USAGE_MISSING', usage: null });
  assert.deepEqual(parseUsage(null), { status: 'USAGE_MISSING', usage: null });
  assert.equal(parse(fixturesV2().USAGE_PRESENT).usage.total_tokens, 120);
  assert.equal(parse(fixturesV2().USAGE_MISSING).usage, null);
});
test('usage inválido ou contraditório não fabrica metadado', () => {
  for (const usage of [{}, [], '1', { input_tokens: '100', output_tokens: 20 }, { input_tokens: -1, output_tokens: 20 }, { input_tokens: NaN, output_tokens: 20 }, { input_tokens: 100, output_tokens: 20, total_tokens: 5 }, { input_tokens: 100, output_tokens: 20, total_tokens: null }]) {
    assert.equal(parseUsage(usage).status, 'USAGE_INVALID');
    const f = fixturesV2().VALID_VALIDATION_APPROVE; f.raw.usage = usage;
    assert.equal(parse(f).status, 'INVALID_RESPONSE');
  }
});
test('modelos solicitado/observado divergentes permanecem visíveis', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE; f.raw.model = 'jev-1.13.0';
  const p = parse(f); assert.equal(p.status, 'COMPLETED');
  assert.equal(p.model_requested, 'jev-1.14.0'); assert.equal(p.model_observed, 'jev-1.13.0'); assert.equal(p.model_mismatch, true);
  f.raw.model = syntheticPrivacy[0]; const bad = parse(f); assert.equal(bad.status, 'INVALID_RESPONSE'); noPrivate(bad);
});
test('erro de answers preserva usage/modelo conhecidos sem sucesso semântico fictício', () => {
  const f = fixturesV2().VALID_VALIDATION_APPROVE; delete f.raw.answers.grounding;
  const p = parse(f); assert.equal(p.result, null); assert.equal(p.status, 'INVALID_RESPONSE');
  assert.equal(p.usage.input_tokens, 100); assert.equal(p.model_observed, 'jev-1.14.0');
});
test('adapter não consulta expectativas nem corrige seleções de ruído/de outra entidade', () => {
  const f = fixturesV2().VALID_DECISION_FULL;
  f.c.expected = { decision: 'ORACULO_NAO_LER' }; f.c.justification = 'ORACULO_NAO_LER';
  f.raw.answers.current_1 = { type: 'choice', choice: 'YES', confidence: 1, probabilities: { YES: 1, NO: 0 } };
  f.raw.answers.history_0 = { type: 'choice', choice: 'YES', confidence: 1, probabilities: { YES: 1, NO: 0 } };
  const p = parse(f); assert.deepEqual(p.result.relevant_current_facts, ['vagas-A', 'vagas-B']);
  assert.deepEqual(p.result.relevant_historical_facts, ['hist-000', 'h-acesso']);
  assert.equal(JSON.stringify(p).includes('ORACULO_NAO_LER'), false);
  const s = scoreV2([row(f.c, 'decision', p)], [allCases.find(c => c.case_id === f.c.case_id)]);
  assert.equal(s.metrics.history_required_recall.value, 1); assert.equal(s.metrics.history_irrelevant_selection_rate.value, 0.5);
});
test('erro estrutural chega como estrutural ao scorer; operacional sai do denominador semântico', () => {
  let l = beginAttempt(createLedger('run-structural', plan), 'run-structural-a001', time);
  l = completeResponse(l, 'run-structural-a001', '{', details);
  const structural = scoreV2(scoringRecords(l)); assert.equal(structural.structural_errors, 1); assert.equal(structural.operational_errors, 0); assert.equal(structural.valid_stages, 0);
  let op = beginAttempt(createLedger('run-network', plan), 'run-network-a001', time);
  op = completeOperationalError(op, 'run-network-a001', { ...details, error_type: 'HTTP', http_status: 429, stack: syntheticPrivacy, request: syntheticPrivacy, secret: syntheticPrivacy });
  const operational = scoreV2(scoringRecords(op)); assert.equal(operational.operational_errors, 1); assert.equal(operational.structural_errors, 0); assert.equal(operational.metrics.action_accuracy.value, null); noPrivate(op);
});
test('hard gates continuam visíveis se modelo aprovar candidata inadequada', () => {
  for (const [id, dimension] of [['V2-X05', 'protocol'], ['V2-06', 'grounding'], ['V2-10', 'entity'], ['V2-15', 'temporal'], ['V2-X01', 'unsupported_assumption'], ['V2-14', 'safety']]) {
    const c = fixtureCase(id), raw = wireFixture(c, 'validation', { verdict: 'APPROVE' });
    const p = parseV2Response(raw, c, 'validation'); assert.equal(p.result.verdict, 'APPROVE');
    const s = scoreV2([row(c, 'validation', p)], [allCases.find(c => c.case_id === id)]);
    assert.ok(s.metrics.hard_gate_false_accepts[0].violated.includes(dimension), id);
  }
});
test('plano tem 180 chaves únicas e rotação exata, sem perdas ou duplicatas', () => {
  const schedule = validatePlan(plan);
  assert.equal(schedule.length, 180); assert.equal(new Set(schedule.map(s => `${s.case_id}/${s.stage}/${s.repetition}`)).size, 180);
  assert.deepEqual([0, 60, 120].map(i => schedule[i].case_id), ['V2-01', 'V2-11', 'V2-21']);
  for (const change of [p => p.schedule.pop(), p => { p.schedule[1] = p.schedule[0]; }, p => p.schedule.reverse(), p => { p.schedule[0].request_sha256 = 'alterado'; }]) {
    const broken = structuredClone(plan); change(broken); assert.throws(() => validatePlan(broken));
  }
});
test('parser e taxas semânticas são independentes da posição no lote', () => {
  const fs = [fixturesV2().VALID_VALIDATION_APPROVE, fixturesV2().VALID_VALIDATION_REJECT, fixturesV2().VALID_VALIDATION_INCONCLUSIVE];
  const records = fs.map(f => row(f.c, f.stage, parse(f)));
  const dataset = fs.map(f => allCases.find(c => c.case_id === f.c.case_id));
  const forward = scoreV2(records, dataset), reverse = scoreV2([...records].reverse(), dataset);
  for (const key of ['validation_accuracy', 'false_accept_rate', 'false_reject_rate', 'reason_precision', 'inconclusive_accuracy']) assert.deepEqual(forward.metrics[key], reverse.metrics[key]);
});
test('parada na chamada N preserva N-1; snapshot mostra estados e bloqueia resume/retry', () => {
  let l = createLedger('run-prefix', plan);
  for (let i = 0; i < 3; i++) {
    const id = `run-prefix-a${String(i + 1).padStart(3, '0')}`; l = beginAttempt(l, id, time);
    const s = l.stages[i], c = fixtureCase(s.case_id); l = completeResponse(l, id, wireFixture(c, s.stage), details);
  }
  const prefix = structuredClone(l.stages.slice(0, 3));
  l = beginAttempt(l, 'run-prefix-a004', time); l = completeOperationalError(l, 'run-prefix-a004', { ...details, error_type: 'TIMEOUT' });
  assert.deepEqual(l.stages.slice(0, 3), prefix); assert.equal(l.stages[3].status, 'FAILED_OPERATIONAL'); assert.equal(l.stages[4].status, 'NOT_STARTED');
  const snapshot = JSON.parse(partialSnapshot(l)); assert.equal(snapshot.auto_resume_authorized, false); assert.equal(snapshot.status, 'HALTED');
  assert.equal(scoringRecords(snapshot).length, 4);
  assert.throws(() => beginAttempt(snapshot, 'run-prefix-a005', time));
  assert.throws(() => completeOperationalError(snapshot, 'run-prefix-a004', { ...details, error_type: 'TIMEOUT' }));
});
test('tentativa precisa ser registrada antes do resultado, não duplica e fica visível em crash', () => {
  const initial = createLedger('run-attempt', plan);
  assert.throws(() => completeResponse(initial, 'run-attempt-a001', {}, details));
  const active = beginAttempt(initial, 'run-attempt-a001', time);
  assert.equal(active.stages[0].status, 'IN_PROGRESS'); assert.equal(active.stages[0].record, null);
  assert.throws(() => beginAttempt(active, 'run-attempt-a002', time));
  const done = completeResponse(active, 'run-attempt-a001', wireFixture(fixtureCase('V2-01'), 'decision'), details);
  assert.throws(() => beginAttempt(done, 'run-attempt-a001', time));
  assert.equal(initial.stages[0].status, 'NOT_STARTED');
});
test('modelo divergente ou usage ausente para lote futuro sem apagar resultado', () => {
  for (const mutation of [raw => { raw.model = 'jev-1.13.0'; }, raw => { delete raw.usage; }]) {
    let l = beginAttempt(createLedger('run-metadata', plan), 'run-metadata-a001', time);
    const raw = wireFixture(fixtureCase('V2-01'), 'decision'); mutation(raw); l = completeResponse(l, 'run-metadata-a001', raw, details);
    assert.equal(l.status, 'HALTED'); assert.equal(l.stages[0].status, 'COMPLETED'); assert.ok(l.stages[0].record.result);
    assert.throws(() => beginAttempt(l, 'run-metadata-a002', time));
  }
});
test('metadata operacional desconhecida, inválida ou privada não entra no artefato', () => {
  const l = beginAttempt(createLedger('run-safe', plan), 'run-safe-a001', time);
  for (const d of [{ ...details, error_type: syntheticPrivacy[0] }, { ...details, error_type: 'HTTP', http_status: '429' }, { ...details, error_type: 'NETWORK', http_status: 500 }, { ...details, error_type: 'TIMEOUT', duration_ms: NaN }, { ...details, error_type: 'TIMEOUT', timestamp: '2026-02-30T00:00:01Z' }]) assert.throws(() => completeOperationalError(l, 'run-safe-a001', d), /INVALID_RUN_STATE/);
  const safe = completeOperationalError(l, 'run-safe-a001', { ...details, error_type: 'TIMEOUT', secret: syntheticPrivacy, Bearer: syntheticPrivacy, raw_context: syntheticPrivacy }); noPrivate(safe);
});
test('identidade pertence ao plano/tentativa e não pode ser sobrescrita por payload externo', () => {
  let l = beginAttempt(createLedger('run-identity', plan), 'run-identity-a001', time);
  l = completeOperationalError(l, 'run-identity-a001', { ...details, error_type: 'TIMEOUT', case_id: 'V2-X05', repetition: 99, task: 'VALIDATION', stage: 'validation', attempt_id: 'inventada' });
  const r = l.stages[0].record;
  assert.equal(r.case_id, 'V2-01'); assert.equal(r.repetition, 1); assert.equal(r.stage, 'decision'); assert.equal(r.task, 'DECISION'); assert.equal(r.attempt_id, 'run-identity-a001');
});
test('metadata com getter/proxy hostil falha com código local, sem message externa', () => {
  const l = beginAttempt(createLedger('run-hostile', plan), 'run-hostile-a001', time);
  const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(syntheticPrivacy[0]); } });
  assert.throws(() => completeOperationalError(l, 'run-hostile-a001', hostile), { message: 'INVALID_RUN_STATE' });
  const getter = { ...details }; Object.defineProperty(getter, 'error_type', { get() { throw new Error(syntheticPrivacy[0]); } });
  assert.throws(() => completeOperationalError(l, 'run-hostile-a001', getter), { message: 'INVALID_RUN_STATE' });
});
test('S0 sanitizado confirma wire format observado sem fingir cobertura de questões V2', () => {
  const base = join(repo, 'experiments/jev/results/real-1792191699709');
  const requests = JSON.parse(readFileSync(join(base, 'requests.json')));
  for (const [case_id, stage] of [['JEV-S0-02', 'validation'], ['JEV-S0-03', 'validation'], ['JEV-S0-10', 'decision']]) {
    const raw = readFileSync(join(base, `response-${case_id}-${stage}.json`), 'utf8');
    const request = requests.find(r => r.case_id === case_id && r.stage === stage).request;
    const p = parseTypedResponse(raw, request); assert.equal(p.status, 'COMPLETED'); assert.equal(p.model_observed, 'jev-1.14.0'); assert.ok(p.usage.input_tokens > 0);
    assert.equal(parseV2Response(raw, fixtureCase('V2-02'), stage).status, 'INVALID_RESPONSE');
  }
});
test('S0, freeze S1 e arquivos congelados continuam byte a byte preservados', () => {
  const freeze = JSON.parse(readFileSync(join(root, 'freeze-v2.json')));
  for (const [file, digest] of Object.entries(freeze.files)) assert.equal(hash(readFileSync(join(root, file))), digest, file);
  const old = JSON.parse(readFileSync(join(root, 's0-preservation.json')));
  for (const [file, digest] of Object.entries(old)) assert.equal(hash(readFileSync(join(repo, file))), digest, file);
});
test('adapter freeze próprio preserva contrato novo sem sobrescrever S1', () => {
  const freeze = JSON.parse(readFileSync(join(root, 'adapter-freeze.json')));
  for (const [file, digest] of Object.entries(freeze.files)) assert.equal(hash(readFileSync(join(root, file))), digest, file);
  assert.equal(hash(readFileSync(join(root, 'freeze-v2.json'))), freeze.s1_freeze_sha256);
});
test('módulos novos não oferecem transporte, leitura de ambiente ou logger', () => {
  for (const file of ['adapter-v2.mjs', 'adapter-run-v2.mjs', 'adapter-fixtures-v2.mjs']) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.equal(/\bfetch\s*\(|process\.env|\.env\.local|console\.|https?:\/\/|node:(?:http|https|net|tls|dns|fs)/.test(text), false, file);
  }
});
