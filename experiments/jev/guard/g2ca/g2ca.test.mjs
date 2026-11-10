import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DIMENSIONS} from '../g0/corpus.mjs';
import {sha, rate} from '../g0/contract.mjs';
import {analyze, assertHistoricalFacts, describeDimensions, validateAnalysis, INVALID_IDS, PROBLEM_IDS} from './analysis.mjs';
import {here, json, loadEvidence, verifyPreservation} from './io.mjs';
import {runMutations, mutations} from './mutation-probes.mjs';

const bundle = await loadEvidence(), rules = await json(join(here, 'analysis-rules.json'));
const a = analyze(bundle, rules), probes = runMutations(a, bundle);
const fullRecord = id => bundle.ledger.stages.find(t => t.case_id === id && t.arm === 'ARM_FULL').record;

test('fatos preservados: execução PASS, dois braços negativos, comparação inconclusiva e autorização encerrada', () => {
  assertHistoricalFacts(bundle); validateAnalysis(a, bundle);
  assert.equal(a.facts.execution, 'PASS'); assert.equal(a.facts.reusable_calls, 0);
});
test('análise pura não modifica evidência nem oracle', () => {
  const before = sha(bundle); analyze(bundle, rules); assert.equal(sha(bundle), before);
});
test('oracle alterado em cópia é rejeitado sem reclassificar resultado histórico', () => {
  const copy = structuredClone(bundle); copy.oracle[28].expected_verdict = 'APPROVE';
  assert.throws(() => analyze(copy, rules), /ORACLE_ALTERADO/);
});
test('GG0-29 é obrigatório e mantém false APPROVE mesmo com confidence baixa', () => {
  assert.equal(a.gg29.expected, 'REJECT'); assert.equal(a.gg29.full, 'APPROVE'); assert.equal(a.gg29.reduced, 'APPROVE');
  assert.equal(a.gg29.classification, 'MACRO_GUARD_FAILURE');
  const copy = structuredClone(bundle); copy.ledger.stages.find(t => t.case_id === 'GG0-29' && t.arm === 'ARM_FULL').record.result.confidence = 0;
  assert.equal(analyze(copy, rules).gg29.full, 'APPROVE');
});
test('GG0-29 identifica omission correta, coverage errada e contexto de parcial legítima', () => {
  const dims = Object.fromEntries(a.gg29.dimensions.map(d => [d.dimension, d]));
  assert.equal(dims.omission.observed, 'FAIL'); assert.equal(dims.omission.correct, true);
  assert.equal(dims.coverage.observed, 'INCONCLUSIVE'); assert.equal(dims.coverage.expected, 'FAIL');
  assert.equal(dims.partial_answer_allowed.observed, 'PASS'); assert.equal(dims.partial_answer_allowed.correct, true);
  assert.equal(a.gg29.dimensions.filter(x => x.correct).length, 9);
});
test('contrafactual documental distingue sinal material de mistura dimensional, sem corrigir verdict', () => {
  assert.equal(a.gg29.counterfactual.label, 'DIMENSIONS_SUPPORT_REJECT');
  assert.deepEqual(a.gg29.counterfactual.material_signals, ['omission']);
  assert.deepEqual(a.gg29.counterfactual.missing_material_signals, ['coverage']);
  assert.equal(a.gg29.dimensional_mixture, true); assert.equal(a.gg29.exclusive_aggregation_cause, false);
});
test('um FAIL sem prova material não vira rejeição automática em inconclusivo', () => {
  const row = a.inconclusives.find(x => x.case_id === 'GG0-31');
  assert.equal(row.full.support.label, 'DIMENSIONS_MIXED');
  assert.deepEqual(row.full.support.spurious_fails, ['coverage', 'omission']);
  assert.equal(row.expected, 'INCONCLUSIVE');
});
test('contrafactual de inválido não consulta resultado mesmo se alguém tentar preenchê-lo', () => {
  const fake = structuredClone(fullRecord('GG0-36')); fake.result = {verdict: 'APPROVE', dimensions: {}};
  const g = bundle.oracle.find(o => o.case_id === 'GG0-36');
  assert.equal(describeDimensions(fake, g, rules).label, 'DIMENSIONS_INSUFFICIENT');
  assert.equal(describeDimensions(fake, g, rules).semantic_eligible, false);
});
test('onze dimensões mapeadas com vetor observado, somente32 envelopes válidos', () => {
  assert.deepEqual(a.dimension_map.map(x => x.dimension), DIMENSIONS);
  assert.deepEqual(a.dimension_map.map(x => x.correct), [32, 26, 22, 20, 32, 26, 23, 29, 8, 32, 24]);
  assert.ok(a.dimension_map.every(x => x.eligible_cases === 32 && x.correct + x.incorrect === 32));
  assert.equal(a.dimension_map.reduce((n, x) => n + x.correct, 0), 274);
});
test('matriz preserva observações e expected originais sem inventar dimensão', () => {
  for (const map of a.dimension_map) for (const r of map.rows) {
    assert.equal(r.expected, bundle.oracle.find(o => o.case_id === r.case_id).expected_dimensions[map.dimension]);
    assert.equal(r.observed, fullRecord(r.case_id).result.dimensions[map.dimension]);
    assert.equal(r.confidence, fullRecord(r.case_id).questions.find(q => q.question_id === map.dimension).confidence);
  }
});
test('invalidez não entra em qualquer denominador semântico ou dimensional', () => {
  assert.ok(a.dimension_map.every(d => d.rows.every(r => !INVALID_IDS.includes(r.case_id))));
  assert.ok(a.consistency.rows.every(r => !INVALID_IDS.includes(r.case_id)));
  assert.deepEqual(a.facts.full_accuracy, rate(28, 32));
});
test('denominador zero permanece null/NOT_TESTED nas associações', () => {
  const grounding = a.dimension_map.find(x => x.dimension === 'grounding');
  assert.deepEqual(grounding.p_macro_wrong_given_dimension_wrong, rate(0, 0));
});
test('coocorrências não são causas: coverage4/6 e cross_entity4/24', () => {
  assert.deepEqual(a.dimension_map.find(x => x.dimension === 'coverage').p_macro_wrong_given_dimension_wrong, rate(4, 6));
  assert.deepEqual(a.dimension_map.find(x => x.dimension === 'cross_entity').p_macro_wrong_given_dimension_wrong, rate(4, 24));
  assert.equal(a.limits.universal_causality_proven, false);
});
test('coortes macro/dimensões somam32 com três casos inteiramente corretos', () => {
  assert.deepEqual(a.consistency.groups, {macro_correct_all_dimensions_correct: 3, macro_correct_some_dimension_wrong: 25, macro_wrong_dimensions_support_error: 0, macro_wrong_dimensions_support_expected: 1, macro_wrong_dimensions_mixed: 3, macro_wrong_dimensions_insufficient: 0});
  assert.deepEqual(a.consistency.rows.filter(x => x.all_dimensions_correct).map(x => x.case_id), ['GG0-02', 'GG0-07', 'GG0-08']);
});
test('seis inconclusivos preservam incerteza, controles corretos e limite deGG36', () => {
  assert.deepEqual(a.inconclusives.map(x => x.reduced.verdict), ['REJECT', 'REJECT', 'INCONCLUSIVE', 'INCONCLUSIVE', 'REJECT', 'REJECT']);
  assert.deepEqual(a.inconclusives.map(x => x.full.normalized_verdict), ['REJECT', 'REJECT', 'INCONCLUSIVE', 'INCONCLUSIVE', 'REJECT', null]);
  assert.equal(a.inconclusives.at(-1).full.dimensions, null);
});
test('controlesGG33/34 têm omission FAIL apesar do macro correto', () => {
  for (const id of ['GG0-33', 'GG0-34']) {
    const x = a.inconclusives.find(x => x.case_id === id);
    assert.equal(x.full.normalized_verdict, 'INCONCLUSIVE'); assert.ok(x.excessive_negative_dimensions.includes('omission'));
  }
});
test('quatro falhas estruturais têm perguntas e posições observadas, sem macro recuperado', () => {
  assert.deepEqual(a.invalid_full.map(x => x.failures.map(q => q.question_id)), [['partial_answer_allowed'], ['omission'], ['factuality'], ['unsupported_assumption']]);
  assert.deepEqual(a.invalid_full.map(x => x.sequence), [28, 44, 48, 72]);
  assert.ok(a.invalid_full.every(x => x.result === null && x.normalized_verdict === null && x.semantic_credit === false));
  assert.ok(a.invalid_full.every(x => x.failures.every(q => q.options === 4 && Math.abs(q.sum - .99) < 1e-12)));
});
test('ordem é associação descritiva:4/18 segundos versus0/18 primeiros', () => {
  assert.equal(a.findings.order.causal_claim, false);
  assert.deepEqual(a.findings.order.even_second_invalid, rate(4, 18));
  assert.deepEqual(a.findings.order.odd_first_invalid, rate(0, 18));
});
test('ganho estrutural e eficiência não viram ganho semântico ou vencedor', () => {
  assert.equal(a.findings.structural, 'REDUCED_STRUCTURAL_ADVANTAGE_OBSERVED');
  assert.equal(a.findings.semantic, 'NOT_DEMONSTRATED'); assert.equal(a.findings.efficiency, 'EFFICIENCY_ADVANTAGE_OBSERVED');
  assert.equal(a.facts.comparison, 'COMPARISON_INCONCLUSIVE'); assert.deepEqual(a.facts.agreement, rate(32, 32));
});
test('zero críticos FULL usa11 elegíveis e não14 planejados', () => {
  assert.deepEqual(a.facts.critical.full, rate(0, 11)); assert.deepEqual(a.facts.critical.reduced, rate(0, 14));
  assert.deepEqual(a.facts.critical.full_coverage, rate(11, 14));
});
test('GG29 e os sete outros casos problemáticos possuem classificação, impacto e recomendação', () => {
  assert.deepEqual(a.failure_taxonomy.map(x => x.case_id), PROBLEM_IDS);
  assert.ok(a.failure_taxonomy.every(x => x.evidence_strength && x.operational_impact && x.recommended_next_test && !x.implemented));
});
test('auditoria do oracle preserva expected mesmo quando admite ambiguidade', () => {
  assert.equal(a.oracle_review.find(x => x.case_id === 'GG0-29').classification, 'CLEARLY_SUPPORTED');
  assert.ok(a.oracle_review.filter(x => x.classification === 'SUPPORTED_WITH_AMBIGUITY').every(x => x.expected === 'INCONCLUSIVE'));
  assert.ok(a.oracle_review.every(x => !x.changes_historical_score));
});
test('GMP17 modifica só ressalva e preserva erro dos dois braços', async () => {
  const pairs = await json(join(here, '../g2b0/minimal-pairs.json')), p = pairs.pairs.find(p => p.pair_id === 'GMP-17');
  const left = bundle.cases.find(c => c.case_id === p.left), right = bundle.cases.find(c => c.case_id === p.right);
  assert.equal(left.input.candidate_answer.replace(p.edit.text, ''), right.input.candidate_answer);
  const x = structuredClone(left.input), y = structuredClone(right.input); delete x.candidate_answer; delete y.candidate_answer; assert.deepEqual(x, y);
  assert.equal(fullRecord('GG0-04').result.dimensions.omission, 'PASS'); assert.equal(fullRecord('GG0-29').result.dimensions.omission, 'FAIL');
});
test('nenhuma reconstrução de raw, reasoning ou implementação de recomendações', () => {
  assert.equal(a.limits.raw_reconstructed, false); assert.equal(a.limits.internal_reasoning_reconstructed, false);
  assert.equal(a.limits.recommendations_implemented, false); assert.equal(a.limits.scorer_changed, false);
});
test('opções A–F são documentais, sem prompt, autorização ou execução', async () => {
  const x = await json(join(here, 'next-experiment-options.json'));
  assert.deepEqual(x.options.map(o => o.id), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(x.selected_for_execution, null); assert.equal(x.authorized_calls, 0);
  assert.ok(x.options.every(o => !o.implemented && !o.prompt_created && !o.execution_authorized && o.calls_authorized === 0));
});
test('artefatos quantitativos persistidos refletem projeção pura dos históricos', async () => {
  for (const [file, value] of Object.entries({'analysis.json': a, 'dimension-error-map.json': a.dimension_map, 'macro-dimension-consistency.json': a.consistency, 'oracle-review.json': a.oracle_review, 'mutation-report.json': probes})) assert.deepEqual(await json(join(here, file)), value);
});
test('486 arquivos históricos,769 do produto e listas permanecem íntegros', async () => {
  const check = await verifyPreservation(); assert.equal(check.historical_files, 486); assert.equal(check.product_files, 769); assert.equal(check.status, 'PASS');
});
test('metodologia precede aplicação e hashes documentais não divergem', async () => {
  const reference = await json(join(here, 'methodology-reference.json'));
  assert.equal(reference.rules_sha256, sha(await readFile(join(here, 'analysis-rules.json'))));
  assert.equal(reference.methodology_sha256, sha(await readFile(join(here, 'methodology.md'))));
  assert.equal(reference.before_analyzer_application, true);
});
test('fontes novas não têm transporte, runner real nem carregamento de credenciais', async () => {
  for (const f of ['analysis.mjs', 'io.mjs', 'mutation-probes.mjs', 'generate.mjs']) {
    const content = await readFile(join(here, f), 'utf8');
    assert.equal(/fetch\(|parseEnv|process\.env|\.env\.local|from\s*['"][^'"]*runner|node:https|node:http|node:net|node:tls|node:dns/.test(content), false);
  }
});
test('barreira técnica permanece sem tentativas e sem novas chamadas', () => {
  assert.equal(globalThis.__JEV_OFFLINE_NETWORK_ATTEMPTS, 0);
  for (const k of ['new_calls', 'openai', 'network', 'credits', 'credentials']) assert.equal(a.facts[k], 0);
});
for (const [id] of mutations) test(`mutante obrigatório ${id}: baseline aceita e mutação rejeitada`, () => {
  const p = probes.probes.find(x => x.id === id); assert.equal(p.baseline, 'PASS'); assert.equal(p.status, 'KILLED');
});
test('doze mutantes mortos em memória sem alterar histórico', () => {
  assert.equal(probes.total, 12); assert.equal(probes.killed, 12); assert.equal(probes.survived, 0); assert.equal(probes.historical_files_modified, false);
});
