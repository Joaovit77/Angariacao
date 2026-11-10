import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyFrozen } from '../../s2b/core.mjs';
import { parseTypedResponse, parseV2Response } from '../adapter-v2.mjs';
import { buildRequestV2 } from '../request-v2.mjs';
import { fixtureCase, fixturesV2 } from '../adapter-fixtures-v2.mjs';
import { probabilityFixtures, sentinels, withPrivacy } from './probability-fixtures.mjs';
import { parseTypedResponseWithDiagnostics as wrap, parseV2ResponseWithDiagnostics as wrapV2, characterizeAccepted } from './probability-diagnostics.mjs';

// Gerador exclusivamente offline. Lê somente fixtures, freezes e artefatos históricos sanitizados.
const here = fileURLToPath(new URL('.', import.meta.url)), repo = resolve(here, '../../../..');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const before = await json(join(here, 'preservation-before.json'));
assert.deepEqual(await verifyFrozen(join(repo, 'experiments/jev/v2')), before.frozen);
for (const [file, digest] of Object.entries(before.files)) assert.equal(hash(await readFile(join(repo, file))), digest, file);

function summary(responses) {
  const rows = responses.flatMap(r => r.questions);
  const counts = values => Object.fromEntries([...new Set(values)].sort((a, b) => a - b).map(n => [n, values.filter(v => v === n).length]));
  return { responses: responses.length, question_count_distribution: counts(responses.map(r => r.questions.length)),
    probability_vectors: rows.length, option_count_distribution: counts(rows.map(r => r.expected_option_count)),
    number_values: rows.reduce((s, r) => s + (r.value_type_summary.number ?? 0), 0),
    non_number_values: rows.reduce((s, r) => s + Object.entries(r.value_type_summary).filter(([k]) => k !== 'number').reduce((n, [, count]) => n + count, 0), 0),
    decimal_places_shortest_js_distribution: counts(rows.flatMap(r => r.decimal_places_shortest_js)),
    sum_min: Math.min(...rows.map(r => r.sum)), sum_max: Math.max(...rows.map(r => r.sum)),
    max_abs_sum_delta: Math.max(...rows.map(r => Math.abs(r.sum_delta_from_1))),
    choice_is_max: rows.filter(r => r.choice_is_max).length, ties: rows.filter(r => r.max_option_ids.length > 1).length };
}

const s0Base = join(repo, 'experiments/jev/results/real-1792191699709');
const requests = await json(join(s0Base, 'requests.json')), s0 = [];
for (const name of (await readdir(s0Base)).filter(n => /^response-.*\.json$/.test(n)).sort()) {
  const raw = await readFile(join(s0Base, name), 'utf8'), row = requests.find(r => name === `response-${r.case_id}-${r.stage}.json`);
  assert.ok(row); const old = parseTypedResponse(raw, row.request), current = wrap(raw, row.request);
  assert.deepEqual(current.parsed, old); assert.equal(old.status, 'COMPLETED');
  s0.push({ case_id: row.case_id, stage: row.stage, raw_sha256: hash(raw),
    model_requested: old.model_requested, model_observed: old.model_observed,
    questions: characterizeAccepted(old.answers, row.request) });
}
assert.equal(s0.length, 20);

const s2bBase = join(repo, 'experiments/jev/results/s2b-jev-s2b-1792195299496-15869859/stage-results'), s2b = [];
for (const name of ['001.json', '002.json', '003.json']) {
  const row = await json(join(s2bBase, name)), c = fixtureCase(row.case_id), request = buildRequestV2(c, row.stage);
  const projected = { model: row.model_observed, answers: row.question_observations,
    usage: { input_tokens: row.usage.input_tokens, output_tokens: row.usage.output_tokens } };
  const old = parseV2Response(projected, c, row.stage), current = wrapV2(projected, c, row.stage);
  assert.deepEqual(current.parsed, old); assert.deepEqual(current.parsed.result, row.result); assert.equal(old.status, 'COMPLETED');
  s2b.push({ case_id: row.case_id, stage: row.stage, attempt_id: row.attempt_id, original_raw_sha256: row.raw_sha256,
    source: 'question_observations já normalizadas; projeção não é reconstrução do raw original',
    model_requested: row.model_requested, model_observed: row.model_observed,
    questions: characterizeAccepted(row.question_observations, request) });
}
const fourth = await json(join(s2bBase, '004.json'));
assert.equal(fourth.parse_error.code, 'INVALID_PROBABILITIES');
assert.equal(fourth.question_observations, null);

const fixtures = probabilityFixtures(), matrix = [], diagnostics = [];
const notTextRepresentable = new Set(['NAN_OBJECT', 'INFINITY_OBJECT', 'NEGATIVE_INFINITY_OBJECT', 'UNDEFINED_VALUE', 'PROBABILITIES_UNDEFINED', 'CUSTOM_PROTOTYPE']);
let privateTextVariants = 0;
for (const [i, f] of fixtures.entries()) {
  const identity = { stage_id: 'probability-contract', attempt_id: `s2c-offline-a${String(i + 1).padStart(3, '0')}` };
  const p = wrap(f.raw, f.request, identity), old = parseTypedResponse(f.raw, f.request);
  assert.deepEqual(p.parsed, old); assert.equal(p.parsed.status, f.valid ? 'COMPLETED' : 'INVALID_RESPONSE');
  assert.equal(p.diagnostic?.error_code ?? null, f.subcode);
  const rows = f.valid ? characterizeAccepted(p.parsed.answers, f.request) : [p.diagnostic];
  matrix.push({ fixture_id: f.id, input_kind: typeof f.raw === 'string' ? 'RAW_TEXT' : 'OBJECT', status: p.parsed.status,
    category: p.parsed.error?.code ?? null, subcode: p.diagnostic?.error_code ?? null, questions: rows });
  const privateFixture = withPrivacy(f), safe = wrap(privateFixture.raw, f.request, identity);
  const serialized = JSON.stringify(safe); for (const sentinel of sentinels) assert.equal(serialized.includes(sentinel), false, f.id);
  assert.equal(safe.diagnostic?.error_code ?? null, f.subcode);
  diagnostics.push({ fixture_id: f.id, diagnostic: safe.diagnostic, normalized_private_marker_matches: 0 });
  if (typeof f.raw !== 'string' && !notTextRepresentable.has(f.id)) {
    const textSafe = wrap(JSON.stringify(privateFixture.raw), f.request, identity);
    assert.equal(textSafe.diagnostic?.error_code ?? null, f.subcode);
    for (const sentinel of sentinels) assert.equal(JSON.stringify(textSafe).includes(sentinel), false);
    diagnostics.push({ fixture_id: f.id, input_kind: 'RAW_TEXT_WITH_PRIVATE_EXTRAS', diagnostic: textSafe.diagnostic, normalized_private_marker_matches: 0 });
    privateTextVariants++;
  }
}
let previousFixtureCount = 0;
for (const f of Object.values(fixturesV2()).filter(f => f.raw !== undefined)) {
  assert.deepEqual(wrapV2(f.raw, f.c, f.stage).parsed, parseV2Response(f.raw, f.c, f.stage)); previousFixtureCount++;
}
const report = { checkpoint: 'JEV-S2-C', status: 'PASS', offline: true, calls: { jev: 0, openai: 0 },
  authority: 'Parser S2-A congelado executado diretamente; nenhuma regra de aceitação duplicada decide o resultado.',
  epsilon_absolute: 0.000001, normalized_equivalence: 'BY_CONSTRUCTION_AND_REGRESSION',
  fixtures: { total: fixtures.length, accepted: fixtures.filter(f => f.valid).length, rejected: fixtures.filter(f => !f.valid).length,
    prior_s2a_fixtures_compared: previousFixtureCount, additional_deterministic_vectors_tested: 500 },
  numerical_matrix: matrix,
  precision_method: 'Casas decimais da representação JS mais curta após parsing; não é precisão original do token nem estimativa de erro do modelo.',
  historical_samples: { s0: { summary: summary(s0), responses: s0 }, s2b_valid_prefix: { summary: summary(s2b), responses: s2b } },
  historical_fourth: { run_id: fourth.run_id, case_id: fourth.case_id, stage: fourth.stage, repetition: fourth.repetition,
    status: fourth.status, category: fourth.parse_error.code, raw_sha256: fourth.raw_sha256,
    specific_cause: 'NÃO DETERMINADA', recoverability: 'NÃO RECUPERÁVEL', raw_available: false },
  preservation: { initial_tests: before.initial_tests, frozen: before.frozen, s2b_artifacts_and_lock_unchanged: Object.keys(before.files).length,
    authorization: 'S2-B authorization closed by HOLD', lock_preserved: true, resume_allowed: false },
  limitations: ['Amostra histórica não prova contrato universal da API.', 'Diagnóstico isolado, sem integração automática ao executor S2-B.',
    'JSON textual não representa NaN/Infinity; objetos JS e JSON malformado têm categorias distintas.',
    'Diagnóstico não recupera o raw histórico descartado.', 'Não houve rede, API, credencial ou smoke real.'] };
const privacy = { checkpoint: 'JEV-S2-C', status: 'PASS', fixtures_checked: fixtures.length, additional_private_text_variants_checked: privateTextVariants,
  total_privacy_variants_checked: diagnostics.length, fake_sentinel_count: sentinels.length,
  marker_matches: 0, raw_sensitive_persisted: false, unknown_ids: 'SHA-256 opaco; IDs conhecidos somente do request local confiável',
  excluded_fields: ['question_text', 'prompt', 'messages', 'context', 'candidate_answer', 'chain_of_thought', 'internal_reasoning', 'secret'],
  object_raw_hash: 'null; nenhum JSON.stringify em objetos não confiáveis',
  hostile_objects: 'Regressões específicas para getters, proxies, revogados, toJSON e identidade hostil; nenhum getter executado nem trap adicional.',
  diagnostics };
for (const value of [report, privacy]) for (const sentinel of sentinels) assert.equal(JSON.stringify(value).includes(sentinel), false);
await writeFile(join(here, 'compatibility-report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(join(here, 'privacy-report.json'), JSON.stringify(privacy, null, 2) + '\n');
console.log(JSON.stringify({ fixtures: report.fixtures, s0: report.historical_samples.s0.summary,
  s2b: report.historical_samples.s2b_valid_prefix.summary, privacy: privacy.status, preserved: Object.keys(before.files).length }, null, 2));
