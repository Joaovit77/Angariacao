import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { parseTypedResponse, parseV2Response } from '../adapter-v2.mjs';
import { buildRequestV2 } from '../request-v2.mjs';
import { fixturesV2, fixtureCase } from '../adapter-fixtures-v2.mjs';
import { verifyFrozen } from '../../s2b/core.mjs';
import { parseTypedResponseWithDiagnostics as wrap, parseV2ResponseWithDiagnostics as wrapV2, characterizeAccepted } from './probability-diagnostics.mjs';
import { probabilityFixtures, fixture, sentinels, withPrivacy } from './probability-fixtures.mjs';

const here = fileURLToPath(new URL('.', import.meta.url)), repo = resolve(here, '../../../..');
const identity = { stage_id: 'probability-contract', attempt_id: 's2c-offline-a001' };
const hash = value => createHash('sha256').update(value).digest('hex');
const noPrivate = value => { const serialized = JSON.stringify(value); for (const marker of sentinels) assert.equal(serialized.includes(marker), false); };

for (const f of probabilityFixtures()) test(`contrato e equivalência: ${f.id}`, () => {
  const old = parseTypedResponse(f.raw, f.request), actual = wrap(f.raw, f.request, identity);
  assert.deepEqual(actual.parsed, old);
  assert.equal(old.status, f.valid ? 'COMPLETED' : 'INVALID_RESPONSE');
  assert.equal(old.error?.code ?? null, f.category);
  assert.equal(actual.diagnostic?.error_code ?? null, f.subcode);
  if (f.duplicate_scope) assert.equal(actual.diagnostic.duplicate_scope, f.duplicate_scope);
  if (!f.valid) {
    assert.equal(actual.diagnostic.category, f.category);
    assert.equal(actual.diagnostic.stage_id, identity.stage_id);
    assert.equal(actual.diagnostic.attempt_id, identity.attempt_id);
    assert.equal(actual.diagnostic.raw_sha256, typeof f.raw === 'string' ? hash(f.raw) : null);
  } else {
    const observations = characterizeAccepted(old.answers, f.request);
    assert.ok(observations.every(r => r.error_code === null && r.choice_is_max && r.is_finite));
    assert.deepEqual(wrap(JSON.stringify(f.raw), f.request).parsed, parseTypedResponse(JSON.stringify(f.raw), f.request));
  }
  noPrivate(actual);
});

test('privacidade cobre todas as fixtures e todos os subcódigos sem persistir sentinelas', () => {
  for (const f of probabilityFixtures().map(withPrivacy)) {
    const actual = wrap(f.raw, f.request, { stage_id: sentinels.join(' '), attempt_id: sentinels.join(' ') });
    noPrivate(actual);
    assert.equal(actual.parsed.status, f.valid ? 'COMPLETED' : 'INVALID_RESPONSE');
    assert.equal(actual.diagnostic?.error_code ?? null, f.subcode);
    if (actual.diagnostic) { assert.equal(actual.diagnostic.stage_id, null); assert.equal(actual.diagnostic.attempt_id, null); }
  }
});

test('campos de diagnóstico conhecidos, contagens, soma e máximas são precisos', () => {
  const f = fixture(); f.raw.answers.q.probabilities = { A: .2, B: .7, C: .1 };
  const d = wrap(JSON.stringify(f.raw), f.request, identity).diagnostic;
  assert.equal(d.error_code, 'PROBABILITY_CHOICE_MISMATCH'); assert.equal(d.category, 'INVALID_PROBABILITIES');
  assert.equal(d.question_id, 'q'); assert.equal(d.expected_option_count, 3); assert.equal(d.observed_option_count, 3);
  assert.deepEqual(d.missing_option_ids, []); assert.deepEqual(d.unknown_option_ids, []);
  assert.equal(d.sum, .2 + .7 + .1); assert.equal(d.sum_delta_from_1, d.sum - 1);
  assert.equal(d.min_probability, .1); assert.equal(d.max_probability, .7);
  assert.equal(d.chosen_option, 'A'); assert.deepEqual(d.max_option_ids, ['B']); assert.equal(d.is_finite, true);
  assert.deepEqual(d.value_type_summary, { number: 3 });
  assert.equal(d.raw_sha256, hash(JSON.stringify(f.raw))); assert.equal(d.model_requested, 'jev-1.14.0'); assert.equal(d.model_observed, 'jev-1.14.0');
});

test('texto bruto com extras privados é diagnosticado antes do descarte em todo caso JSON representável', () => {
  const notRepresentable = new Set(['NAN_OBJECT', 'INFINITY_OBJECT', 'NEGATIVE_INFINITY_OBJECT', 'UNDEFINED_VALUE', 'PROBABILITIES_UNDEFINED', 'CUSTOM_PROTOTYPE']);
  let checked = 0;
  for (const f of probabilityFixtures().filter(f => typeof f.raw !== 'string' && !notRepresentable.has(f.id))) {
    const privateFixture = withPrivacy(f), raw = JSON.stringify(privateFixture.raw), p = wrap(raw, f.request, identity);
    assert.equal(p.parsed.status, f.valid ? 'COMPLETED' : 'INVALID_RESPONSE', f.id);
    assert.equal(p.diagnostic?.error_code ?? null, f.subcode, f.id);
    noPrivate(p); checked++;
  }
  assert.equal(checked, 51);
});

test('duplicatas de identificadores privados e em campos extras permanecem opacas', () => {
  const f = fixture(), privateKey = JSON.stringify(sentinels.join(' '));
  const question = `{"model":"jev-1.14.0","answers":{${privateKey}:{},${privateKey}:{}}}`;
  const option = JSON.stringify(f.raw).replace('"A":1', `"A":1,${privateKey}:0,${privateKey}:0`);
  const extra = JSON.stringify(f.raw).replace('"model":', `"secret":{${privateKey}:1,${privateKey}:2},"model":`);
  for (const raw of [question, option, extra]) {
    const p = wrap(raw, f.request); assert.equal(p.parsed.error.code, 'DUPLICATE_KEY'); noPrivate(p);
    assert.equal(p.diagnostic.error_code, raw === extra ? 'DUPLICATE_KEY' : 'PROBABILITY_DUPLICATE_KEY');
  }
});

test('opções desconhecidas são opacas, sem coerção nem remoção para aceitar', () => {
  const f = fixture(); delete f.raw.answers.q.probabilities.B; f.raw.answers.q.probabilities[sentinels.join(' ')] = 0;
  const p = wrap(f.raw, f.request); assert.equal(p.parsed.status, 'INVALID_RESPONSE');
  assert.deepEqual(p.diagnostic.missing_option_ids, ['B']); assert.match(p.diagnostic.unknown_option_ids[0], /^unknown-sha256:[a-f0-9]{64}$/);
  assert.equal(p.diagnostic.observed_option_count, 3); noPrivate(p);
});

test('getters de campos tipados nunca são executados para diagnosticar', () => {
  for (const location of ['body', 'answers', 'answer', 'probabilities', 'value', 'choice']) {
    const f = fixture(); let calls = 0;
    const descriptor = { enumerable: true, get() { calls++; throw new Error(sentinels.join(' ')); } };
    if (location === 'body') Object.defineProperty(f.raw, 'model', descriptor);
    if (location === 'answers') Object.defineProperty(f.raw, 'answers', descriptor);
    if (location === 'answer') Object.defineProperty(f.raw.answers, 'q', descriptor);
    if (location === 'probabilities') Object.defineProperty(f.raw.answers.q, 'probabilities', descriptor);
    if (location === 'value') Object.defineProperty(f.raw.answers.q.probabilities, 'A', descriptor);
    if (location === 'choice') Object.defineProperty(f.raw.answers.q, 'choice', descriptor);
    const p = wrap(f.raw, f.request); assert.equal(p.parsed.status, 'INVALID_RESPONSE');
    assert.equal(p.diagnostic.error_code, 'SAFE_INSPECTION_UNAVAILABLE'); assert.equal(calls, 0); noPrivate(p);
  }
});

test('diagnóstico não invoca traps adicionais de proxies hostis ou revogados', () => {
  for (const location of ['body', 'answers', 'answer', 'probabilities', 'value']) {
    let calls = 0; const hostile = new Proxy({}, { getPrototypeOf() { calls++; throw new Error(sentinels.join(' ')); }, getOwnPropertyDescriptor() { calls++; throw new Error(sentinels.join(' ')); } });
    const f = fixture();
    if (location === 'body') f.raw = hostile;
    if (location === 'answers') f.raw.answers = hostile;
    if (location === 'answer') f.raw.answers.q = hostile;
    if (location === 'probabilities') f.raw.answers.q.probabilities = hostile;
    if (location === 'value') f.raw.answers.q.probabilities.A = hostile;
    const old = parseTypedResponse(f.raw, f.request), oldCalls = calls; calls = 0;
    const p = wrap(f.raw, f.request); assert.deepEqual(p.parsed, old); assert.equal(calls, oldCalls); noPrivate(p);
    assert.equal(p.parsed.status, 'INVALID_RESPONSE');
  }
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  const f = fixture(); f.raw = proxy;
  assert.equal(wrap(f.raw, f.request).diagnostic.error_code, 'SAFE_INSPECTION_UNAVAILABLE');
});

test('extras com getters, toJSON e proxies não são percorridos nem serializados', () => {
  const f = fixture(); let calls = 0;
  const privateGetter = { enumerable: true, get() { calls++; throw new Error(sentinels.join(' ')); } };
  for (const obj of [f.raw, f.raw.usage, f.raw.answers.q]) {
    Object.defineProperty(obj, 'secret', privateGetter);
    obj.toJSON = () => { calls++; throw new Error(sentinels.join(' ')); };
    obj.internal_reasoning = new Proxy({}, { ownKeys() { calls++; throw new Error(sentinels.join(' ')); } });
  }
  const p = wrap(f.raw, f.request); assert.equal(p.parsed.status, 'COMPLETED'); assert.equal(calls, 0); noPrivate(p);
});

test('valores privados não numéricos e getters na identidade permanecem sanitizados', () => {
  for (const marker of sentinels) {
    const f = fixture(); f.raw.answers.q.probabilities.A = marker;
    const identityGetter = { get attempt_id() { throw new Error(marker); } };
    const p = wrap(f.raw, f.request, identityGetter); assert.equal(p.diagnostic.error_code, 'PROBABILITY_NOT_NUMBER');
    assert.equal(p.diagnostic.sum, null); assert.equal(p.diagnostic.min_probability, null); assert.equal(p.diagnostic.max_probability, null); noPrivate(p);
  }
});

test('fixtures S2-A preservam o resultado normalizado completo, erros e descarte de extras', () => {
  for (const f of Object.values(fixturesV2()).filter(f => f.raw !== undefined)) {
    const p = wrapV2(f.raw, f.c, f.stage);
    assert.deepEqual(p.parsed, parseV2Response(f.raw, f.c, f.stage)); noPrivate(p);
  }
});

test('negativos de envelope, confidence, enum, usage, contexto e profundidade continuam inválidos', () => {
  const f = fixture();
  for (const raw of [null, undefined, [], {}, 1, true, false, NaN, 'null', '[]', 'false', 'NaN', '1e999', '{', '{"a":1,}', '[1,]', 'true false', '['.repeat(66) + '0' + ']'.repeat(66), ' '.repeat(2097153)]) {
    const p = wrap(raw, f.request); assert.deepEqual(p.parsed, parseTypedResponse(raw, f.request)); assert.equal(p.parsed.status, 'INVALID_RESPONSE'); noPrivate(p);
  }
  for (const confidence of [undefined, null, NaN, Infinity, -.1, 1.01, '0.5']) {
    const f = fixture(); f.raw.answers.q.confidence = confidence;
    const p = wrap(f.raw, f.request); assert.equal(p.parsed.status, 'INVALID_RESPONSE'); assert.deepEqual(p.parsed, parseTypedResponse(f.raw, f.request));
  }
  for (const usage of [{}, [], '1', { input_tokens: '100', output_tokens: 20 }, { input_tokens: -1, output_tokens: 20 }, { input_tokens: NaN, output_tokens: 20 }, { input_tokens: 100, output_tokens: 20, total_tokens: 5 }]) {
    const f = fixture(); f.raw.usage = usage; const p = wrap(f.raw, f.request);
    assert.equal(p.parsed.status, 'INVALID_RESPONSE'); assert.equal(p.diagnostic.error_code, 'INVALID_USAGE');
  }
  const c = fixtureCase('V2-01');
  assert.deepEqual(wrapV2('{}', c, 'wrong').parsed, parseV2Response('{}', c, 'wrong'));
  c.input.conversation_context.push({ id: 'invalido_!' });
  assert.deepEqual(wrapV2('{}', c, 'decision').parsed, parseV2Response('{}', c, 'decision'));
});

test('equivalência determinística em 500 vetores sem normalização automática', () => {
  let state = 123456; const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2**32;
  let accepted = 0, rejected = 0;
  for (let i = 0; i < 500; i++) {
    const f = fixture(); const a = next(), b = next() * (1 - a), c = 1 - a - b;
    f.raw.answers.q.probabilities = { A: a, B: b, C: c };
    f.raw.answers.q.choice = Object.entries(f.raw.answers.q.probabilities).sort((x, y) => y[1] - x[1])[0][0];
    if (i % 2) f.raw.answers.q.probabilities.A += .01;
    const before = JSON.stringify(f.raw), old = parseTypedResponse(f.raw, f.request), p = wrap(f.raw, f.request);
    assert.deepEqual(p.parsed, old); assert.equal(JSON.stringify(f.raw), before);
    if (old.status === 'COMPLETED') accepted++; else rejected++;
  }
  assert.equal(accepted, 250); assert.equal(rejected, 250);
});

test('20 responses S0 preservadas têm equivalência e formatos caracterizáveis', () => {
  const base = join(repo, 'experiments/jev/results/real-1792191699709');
  const requests = JSON.parse(readFileSync(join(base, 'requests.json')));
  const files = readdirSync(base).filter(n => /^response-.*\.json$/.test(n)); assert.equal(files.length, 20);
  for (const file of files) {
    const raw = readFileSync(join(base, file), 'utf8');
    const row = requests.find(r => file === `response-${r.case_id}-${r.stage}.json`); assert.ok(row);
    const old = parseTypedResponse(raw, row.request), p = wrap(raw, row.request);
    assert.deepEqual(p.parsed, old); assert.equal(old.status, 'COMPLETED');
    assert.ok(characterizeAccepted(old.answers, row.request).every(r => r.choice_is_max)); noPrivate(p);
  }
});

test('três registros S2-B válidos preservam todo o resultado e o quarto não é reconstruído', () => {
  const base = join(repo, 'experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/stage-results');
  for (const name of ['001.json', '002.json', '003.json']) {
    const record = JSON.parse(readFileSync(join(base, name))), c = fixtureCase(record.case_id), request = buildRequestV2(c, record.stage);
    const raw = { model: record.model_observed, answers: record.question_observations, usage: { input_tokens: record.usage.input_tokens, output_tokens: record.usage.output_tokens } };
    const old = parseV2Response(raw, c, record.stage), p = wrapV2(raw, c, record.stage);
    assert.deepEqual(p.parsed, old); assert.deepEqual(p.parsed.result, record.result);
    assert.equal(p.parsed.status, 'COMPLETED'); assert.ok(characterizeAccepted(record.question_observations, request).every(r => r.choice_is_max));
  }
  const fourth = JSON.parse(readFileSync(join(base, '004.json')));
  assert.equal(fourth.parse_error.code, 'INVALID_PROBABILITIES'); assert.equal(fourth.result, null); assert.equal(fourth.question_observations, null);
  assert.equal(fourth.raw_sha256, '87035cb089b69154c4d8234e44a91b010741155851d1f66c8615e124dd41ac33');
});

test('S0/S1/S2-A, matriz, requests, run S2-B e lock permanecem nos hashes iniciais', async () => {
  const before = JSON.parse(readFileSync(join(here, 'preservation-before.json')));
  assert.deepEqual(await verifyFrozen(join(repo, 'experiments/jev/v2')), before.frozen);
  for (const [file, digest] of Object.entries(before.files)) assert.equal(hash(readFileSync(join(repo, file))), digest, file);
  const run = 'experiments/jev/results/s2b-jev-s2b-1792195299496-15869859';
  const files = [];
  const walk = p => { for (const entry of readdirSync(join(repo, p), { withFileTypes: true })) {
    const file = `${p}/${entry.name}`; if (entry.isDirectory()) walk(file); else files.push(file);
  } };
  walk(run); assert.deepEqual(files.sort(), Object.keys(before.files).filter(n => n.startsWith(run + '/')).sort());
});

test('helper puro não tem transporte, ambiente, arquivos, logger nem import de runner', () => {
  const source = readFileSync(join(here, 'probability-diagnostics.mjs'), 'utf8');
  assert.equal(/\bfetch\s*\(|process\.env|\.env\.local|console\.|https?:\/\/|node:(?:http|https|net|tls|dns|fs)|runner\.mjs/.test(source), false);
});

test('freeze S2-C confere os novos artefatos quando presente', () => {
  const path = join(here, 'freeze.json'); if (!existsSync(path)) return;
  const freeze = JSON.parse(readFileSync(path)); for (const [file, digest] of Object.entries(freeze.files)) assert.equal(hash(readFileSync(join(here, file))), digest, file);
});
