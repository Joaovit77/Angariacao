import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { matrix, allCases, pairs, mutants, protocolVariants, decisionFields, validationFields } from './matrix-v2.mjs';
import { buildRequestV2 } from './request-v2.mjs';
import { scoreV2 } from './scoring-v2.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const objectHash = obj => hash(JSON.stringify(obj));
const at = (obj, pointer) => pointer.slice(1).split('/').reduce((v, k) => v[k], obj);
const remove = (obj, pointer) => {
  const clone = structuredClone(obj), keys = pointer.slice(1).split('/');
  let parent = clone; for (const k of keys.slice(0, -1)) parent = parent[k];
  delete parent[keys.at(-1)]; return clone;
};
const find = id => allCases.find(c => c.case_id === id);

test('IDs, referências, seleções e dimensões completos; dataset 24 + 6 sem dupla contagem', () => {
  assert.equal(matrix.length, 24); assert.equal(allCases.length, 30);
  assert.equal(new Set(allCases.map(c => c.case_id)).size, 30);
  assert.equal(pairs.length, 22); assert.equal(mutants.length, 11);
  for (const c of allCases) {
    assert.equal(c.source, 'SYNTHETIC'); assert.ok(c.justification.length > 20);
    assert.deepEqual(Object.keys(c.expected.decision).sort(), [...decisionFields].sort());
    assert.deepEqual(Object.keys(c.expected.validation.dimensions).sort(), [...validationFields].sort());
    for (const [field, universe] of [
      ['relevant_current_facts', c.input.property_context.current_facts.map(f => f.id)],
      ['relevant_historical_facts', c.input.conversation_context.map(h => h.id)],
      ['applicable_protocols', c.input.available_protocols.map(p => p.id)],
    ]) {
      const e = c.expected.decision[field], ids = [...e.required, ...e.optional, ...e.forbidden];
      assert.equal(new Set(ids).size, ids.length, `${c.case_id}/${field}`);
      assert.ok(ids.every(id => universe.includes(id)), `${c.case_id}/${field}`);
    }
    const failures = Object.values(c.expected.validation.dimensions).filter(v => v === 'FAIL');
    assert.equal(failures.length > 0, c.expected.validation.verdict === 'REJECT', c.case_id);
  }
  assert.equal(Object.keys(protocolVariants).length, 7);
  assert.ok(Object.values(protocolVariants).every(id => find(id)));
  assert.ok(mutants.every(m => pairs.some(p => p.id === m.pair_id)));
});

test('todos os pares alteram somente o atributo declarado', () => {
  for (const p of pairs) {
    const a = find(p.control).input, b = find(p.variant).input;
    assert.notDeepEqual(at(a, p.attribute), at(b, p.attribute), p.id);
    assert.deepEqual(remove(a, p.attribute), remove(b, p.attribute), p.id);
  }
});

test('pares de arrays preservam a causa sem misturar mudanças de conteúdo', () => {
  const recent = find('V2-19').input.conversation_context;
  const old = find('V2-20').input.conversation_context;
  const sort = a => [...a].sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(sort(recent), sort(old));
  assert.deepEqual(recent.filter(m => m.id !== 'h-acesso'), old.filter(m => m.id !== 'h-acesso'));
  assert.equal(recent.findIndex(m => m.id === 'h-acesso'), 99);
  assert.equal(old.findIndex(m => m.id === 'h-acesso'), 20);
  const noisy = find('V2-21').input.conversation_context;
  assert.deepEqual(noisy.slice(0, 100), old); assert.equal(noisy.length, 180);
  assert.ok(noisy.slice(100).every(m => m.fact === null));
  const media = find('V2-24').input.conversation_context;
  assert.equal(media.length, old.length);
  assert.deepEqual(media.filter(m => m.fact), old.filter(m => m.fact));
  assert.ok(media.some(m => m.kind === 'midia')); assert.ok(media.some(m => m.kind === 'vazia'));
  for (let i = 0; i < old.length; i++) assert.deepEqual({ ...media[i], text: old[i].text, kind: old[i].kind }, old[i]);
  const conflict = find('V2-X02').input.conversation_context;
  assert.deepEqual(conflict.slice(0, -1), old); assert.equal(conflict.at(-1).id, 'h-conflito');
  const duplicate = find('V2-X03').input.available_protocols;
  assert.deepEqual(duplicate.slice(0, 1), find('V2-11').input.available_protocols);
  assert.equal(duplicate[0].title, duplicate[1].title); assert.notEqual(duplicate[0].content, duplicate[1].content);
  const confirmed = find('V2-X06').input.property_context.current_facts;
  assert.deepEqual(confirmed.slice(0, -1), find('V2-20').input.property_context.current_facts);
  assert.equal(confirmed.at(-1).key, 'entrada_independente'); assert.equal(confirmed.at(-1).value, true);
});

test('nenhuma expectativa, justificativa, ID de caso ou candidata vaza na decisão', () => {
  for (const c of allCases) for (const stage of ['decision', 'validation']) {
    const marked = structuredClone(c);
    marked.expected.private_marker = 'ORACULO_NAO_ENVIAR'; marked.input.untrusted_extra = 'ORACULO_NAO_ENVIAR';
    marked.justification = 'ORACULO_NAO_ENVIAR'; marked.title = 'ORACULO_NAO_ENVIAR';
    const request = buildRequestV2(marked, stage), text = JSON.stringify(request);
    assert.equal(text.includes('ORACULO_NAO_ENVIAR'), false);
    assert.equal(text.includes(c.case_id), false);
    assert.equal(Object.hasOwn(request.state, 'candidate_answer'), stage === 'validation');
    assert.equal(Object.hasOwn(request, 'tools'), false);
    assert.equal(Object.hasOwn(request, 'authorization'), false);
  }
});

test('dataset e requests são sintéticos e não contêm PII ou credenciais aparentes', () => {
  const texts = [JSON.stringify(allCases), ...allCases.flatMap(c => ['decision', 'validation'].map(s => JSON.stringify(buildRequestV2(c, s))))];
  const patterns = [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, /\b\d{10,14}\b/, /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, /\b(?:sk|sb_secret)-[A-Za-z0-9_-]{12,}/, /Bearer\s+\S+/i, /\beyJ[A-Za-z0-9_-]{20,}\./];
  for (const text of texts) for (const pattern of patterns) assert.equal(pattern.test(text), false, pattern.toString());
  // A origem inventada é a garantia primária; busca por padrões é defesa adicional, não anonimização.
  assert.ok(allCases.every(c => c.input.property_context.current_facts.every(f => ['imovel-A', 'imovel-B'].includes(f.entity))));
});

const dResult = c => ({ ...structuredClone(c.expected.decision),
  relevant_current_facts: [...c.expected.decision.relevant_current_facts.required],
  relevant_historical_facts: [...c.expected.decision.relevant_historical_facts.required],
  applicable_protocols: [...c.expected.decision.applicable_protocols.required], confidence: 0.8 });
const vResult = c => ({ verdict: c.expected.validation.verdict, dimensions: structuredClone(c.expected.validation.dimensions), reasons: validationFields.filter(f => c.expected.validation.dimensions[f] === 'FAIL'), confidence: 0.8 });
const row = (c, stage, repetition, result, error = null) => ({ case_id: c.case_id, stage, repetition, result, error });

test('ação correta não compensa histórico perdido; recall não compensa seleção de ruído', () => {
  const c = find('V2-20'), a = dResult(c), b = dResult(c), good = dResult(c);
  a.relevant_historical_facts = []; b.relevant_historical_facts.push('hist-000');
  const s = scoreV2([row(c, 'decision', 1, a), row(c, 'decision', 2, b), row(c, 'decision', 3, good)], [c]);
  assert.equal(s.metrics.action_accuracy.value, 1);
  assert.deepEqual(s.metrics.decision_completeness, { numerator: 1, denominator: 3, value: 1 / 3 });
  assert.equal(s.metrics.history_selection_accuracy.value, 1 / 3);
  assert.equal(s.metrics.history_required_recall.value, 2 / 3);
  assert.equal(s.metrics.history_irrelevant_selection_rate.value, 1 / 3);
});

test('falsa rejeição parcial e inconclusão correta permanecem distintos de timeout', () => {
  const partial = find('V2-02'), unknown = find('V2-12'), negative = find('V2-06');
  const wrong = vResult(partial); wrong.verdict = 'REJECT'; wrong.dimensions.grounding = 'FAIL'; wrong.reasons = ['grounding'];
  const s = scoreV2([row(partial, 'validation', 1, wrong), row(unknown, 'validation', 1, vResult(unknown)), row(negative, 'validation', 1, null, { code: 'timeout-sintetico' })], [partial, unknown, negative]);
  assert.equal(s.metrics.false_reject_rate.value, 1);
  assert.equal(s.metrics.false_accept_rate.value, null);
  assert.equal(s.metrics.inconclusive_accuracy.value, 1);
  assert.equal(s.metrics.reason_precision.value, 0);
  assert.equal(s.operational_errors, 1); assert.equal(s.not_executed_stages, 15);
  assert.equal(s.metrics.validation_accuracy.value, 0.5);
});

test('liberação crítica não é compensada por outra dimensão correta', () => {
  const c = find('V2-X05'), actual = vResult(c); actual.verdict = 'APPROVE';
  const s = scoreV2([row(c, 'validation', 1, actual)], [c]);
  assert.equal(s.metrics.false_accept_rate.value, 1);
  assert.equal(s.metrics.hard_gate_false_accepts.length, 1);
  assert.ok(s.metrics.hard_gate_false_accepts[0].violated.includes('protocol'));
});

test('confiança usa quartis descritivos sem threshold de aceitação', () => {
  const data = ['V2-05', 'V2-06', 'V2-12', 'V2-02'].map(find);
  const records = data.map((c, i) => { const result = vResult(c); result.confidence = [0.1, 0.2, 0.8, 0.9][i]; if (i === 2) result.verdict = 'APPROVE'; if (i === 3) result.verdict = 'REJECT'; return row(c, 'validation', 1, result); });
  const s = scoreV2(records, data), calibration = s.metrics.confidence_calibration.validation;
  assert.equal(calibration.descriptive_q25, 0.1); assert.equal(calibration.descriptive_q75, 0.8);
  assert.equal(calibration.high_confidence_error_rate.value, 1);
  assert.equal(calibration.low_confidence_correct.length, 1);
  assert.equal(calibration.confidence_wrong.length, 2);
  assert.equal(s.metrics.inconclusive_unsafe_approvals.length, 1);
});

test('três repetições preservam divergências de veredicto, razões e variância', () => {
  const c = find('V2-02');
  const records = [1, 2, 3].map((r, i) => { const a = vResult(c); a.confidence = [0.2, 0.4, 0.6][i]; if (r === 3) { a.verdict = 'REJECT'; a.reasons = ['grounding']; a.dimensions.grounding = 'FAIL'; } return row(c, 'validation', r, a); });
  const s = scoreV2(records, [c]);
  assert.equal(s.metrics.consistency_between_repetitions.verdict.value, 1 / 3);
  assert.equal(s.metrics.consistency_between_repetitions.reasons.value, 1 / 3);
  assert.ok(Math.abs(s.metrics.confidence_variance[0].population_variance - 0.02666666666666666) < 1e-12);
  assert.deepEqual(scoreV2(records, [c]), s);
});

test('registros inválidos não fabricam métricas e duplicatas interrompem scoring', () => {
  const c = find('V2-01');
  const bad = row(c, 'validation', 1, {}), s = scoreV2([bad], [c]);
  assert.equal(s.structural_errors, 1); assert.equal(s.metrics.validation_accuracy.value, null);
  assert.throws(() => scoreV2([bad, bad], [c]));
  assert.throws(() => scoreV2([{ ...bad, repetition: 4 }], [c]));
  assert.equal(scoreV2([], [c]).not_executed_stages, 6);
});

test('S0 mantém bytes históricos e números originais', () => {
  const preservation = JSON.parse(readFileSync(join(here, 's0-preservation.json')));
  assert.equal(Object.keys(preservation).length, 69);
  for (const [file, digest] of Object.entries(preservation)) assert.equal(hash(readFileSync(join(repo, file))), digest, file);
  const old = JSON.parse(readFileSync(join(repo, 'experiments/jev/results/real-1792191699709/summary.json'))).metrics;
  for (const [name, expected] of Object.entries({ decision_accuracy: [10, 10], validation_accuracy: [9, 10], false_accept: [0, 5], false_reject: [1, 5], protocol_accuracy: [8, 10], entity_accuracy: [8, 10], temporal_accuracy: [6, 10], grounding_accuracy: [9, 10] })) assert.deepEqual([old[name].numerator, old[name].denominator], expected, name);
});

test('freeze detecta alteração de expectations, requests ou contratos', () => {
  const frozen = JSON.parse(readFileSync(join(here, 'freeze-v2.json')));
  const requests = allCases.flatMap(c => ['decision', 'validation'].map(stage => ({ case_id: c.case_id, stage, request: buildRequestV2(c, stage) })));
  assert.equal(objectHash(allCases), frozen.materialized_matrix_sha256);
  assert.equal(objectHash(requests), frozen.requests_sha256);
  for (const [file, digest] of Object.entries(frozen.files)) assert.equal(hash(readFileSync(join(here, file))), digest, file);
  const changed = structuredClone(allCases); changed[1].expected.validation.verdict = 'REJECT';
  assert.notEqual(objectHash(changed), frozen.materialized_matrix_sha256);
});

test('plano preserva três repetições idênticas sem executar transporte', () => {
  const plan = JSON.parse(readFileSync(join(here, 'planned-run-v2.json')));
  assert.equal(plan.real_execution_authorized, false); assert.equal(plan.calls_executed_in_s1, 0);
  assert.equal(plan.schedule.length, 180); assert.equal(plan.repetitions, 3);
  const keys = new Set();
  for (const r of plan.schedule) {
    const key = `${r.case_id}/${r.repetition}/${r.stage}`; assert.equal(keys.has(key), false); keys.add(key);
    assert.equal(r.request_sha256, objectHash(buildRequestV2(find(r.case_id), r.stage)));
  }
  for (const file of ['matrix-v2.mjs', 'request-v2.mjs', 'scoring-v2.mjs']) {
    const text = readFileSync(join(here, file), 'utf8');
    assert.equal(/\bfetch\s*\(|process\.env|\.env\.local|https?:\/\//.test(text), false, file);
  }
});
