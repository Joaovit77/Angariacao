import assert from 'node:assert/strict';
import {benchmark, oracle, DIMENSIONS} from '../g0/corpus.mjs';
import {sha, rate} from '../g0/contract.mjs';
import {quantiles} from '../g2b0/macro-scorer.mjs';

export const RUN_ID = 'jev-guard-g2b-1792280596715-d49a4dc0';
export const INVALID_IDS = ['GG0-14', 'GG0-22', 'GG0-24', 'GG0-36'];
export const PROBLEM_IDS = ['GG0-14', 'GG0-22', 'GG0-24', 'GG0-29', 'GG0-31', 'GG0-32', 'GG0-35', 'GG0-36'];
const of = id => oracle.find(o => o.case_id === id);
const eligible = r => r.status === 'STRUCTURALLY_VALID';
const distribution = values => ({...quantiles(values), mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null});

export function assertHistoricalFacts(bundle) {
  assert.equal(sha(bundle.oracle), sha(oracle), 'ORACLE_ALTERADO');
  assert.equal(sha(bundle.cases), sha(benchmark), 'CORPUS_ALTERADO');
  const {summary: s, ledger: l, authorization: a, paired: p} = bundle;
  assert.equal(s.run_id, RUN_ID); assert.equal(l.run_id, RUN_ID);
  assert.equal(s.execution_status, 'PASS'); assert.equal(s.run_status, 'COMPLETED');
  assert.equal(s.calls_started, 72); assert.equal(s.transport_completed, 72);
  assert.equal(s.retries, 0); assert.equal(s.operational_errors, 0);
  assert.equal(s.in_progress, 0); assert.equal(s.not_started, 0);
  assert.deepEqual(s.full, {valid: 32, invalid: 4, classification: 'NAO_PROMISSOR_DIAGNOSTICO'});
  assert.deepEqual(s.reduced, {valid: 36, invalid: 0, classification: 'NAO_PROMISSOR_DIAGNOSTICO'});
  assert.equal(s.COMPARATIVE_RESULT, 'COMPARISON_INCONCLUSIVE');
  assert.equal(a.status, 'CLOSED'); assert.equal(a.remaining_calls_reusable, false);
  assert.equal(a.calls_not_started, 0); assert.equal(l.stages.length, 72);
  assert.deepEqual(l.stages.filter(t => t.arm === 'ARM_FULL' && !eligible(t.record)).map(t => t.case_id), INVALID_IDS);
  for (const t of l.stages) {
    assert.equal(t.record.model_observed, 'jev-1.14.0');
    assert.equal(t.record.run_id, RUN_ID);
    if (!eligible(t.record)) { assert.equal(t.record.result, null); assert.equal(t.record.normalized_verdict, null); }
  }
  assert.deepEqual(p.verdict_agreement, rate(32, 32));
  assert.deepEqual(p.semantic.BOTH_CORRECT, rate(28, 32));
  assert.deepEqual(p.semantic.BOTH_WRONG_SAME, rate(4, 32));
  assert.deepEqual(bundle.full.primary.critical_false_accept_rate, rate(0, 11));
  assert.deepEqual(bundle.reduced.primary.critical_false_accept_rate, rate(0, 14));
  assert.deepEqual(bundle.full.primary.verdict_accuracy, rate(28, 32));
  assert.deepEqual(bundle.reduced.primary.verdict_accuracy, rate(31, 36));
}

// Contrafactual documental assistido pelo oracle; não retorna verdict corrigido.
export function describeDimensions(record, golden, rules) {
  assert.equal(rules.scope, 'DOCUMENTARY_ORACLE_ASSISTED_COUNTERFACTUAL_ONLY');
  if (!eligible(record)) return {label: 'DIMENSIONS_INSUFFICIENT', semantic_eligible: false, material_signals: [], uncertainty_signals: [], spurious_fails: [], missing_material_signals: []};
  const observed = record.result.dimensions;
  const material = golden.materiality.level === 'MATERIAL';
  const materialSignals = DIMENSIONS.filter(d => material && golden.expected_dimensions[d] === 'FAIL' && observed[d] === 'FAIL');
  const uncertainty = DIMENSIONS.filter(d => golden.expected_dimensions[d] === 'INCONCLUSIVE' && observed[d] === 'INCONCLUSIVE');
  const spurious = DIMENSIONS.filter(d => observed[d] === 'FAIL' && golden.expected_dimensions[d] !== 'FAIL');
  const missed = DIMENSIONS.filter(d => material && golden.expected_dimensions[d] === 'FAIL' && observed[d] !== 'FAIL');
  const label = materialSignals.length ? 'DIMENSIONS_SUPPORT_REJECT' : DIMENSIONS.some(d => ['FAIL', 'INCONCLUSIVE'].includes(observed[d])) ? 'DIMENSIONS_MIXED' : 'DIMENSIONS_SUPPORT_APPROVE';
  return {label, semantic_eligible: true, material_signals: materialSignals, uncertainty_signals: uncertainty, spurious_fails: spurious, missing_material_signals: missed};
}

export function analyze(bundle, rules) {
  assertHistoricalFacts(bundle);
  const fullRows = bundle.ledger.stages.filter(t => t.arm === 'ARM_FULL' && eligible(t.record));
  const consistencyRows = fullRows.map(t => {
    const g = of(t.case_id), r = t.record, support = describeDimensions(r, g, rules);
    return {case_id: t.case_id, expected_verdict: g.expected_verdict, observed_verdict: r.normalized_verdict, macro_correct: r.normalized_verdict === g.expected_verdict,
      all_dimensions_correct: DIMENSIONS.every(d => r.result.dimensions[d] === g.expected_dimensions[d]),
      incorrect_dimensions: DIMENSIONS.filter(d => r.result.dimensions[d] !== g.expected_dimensions[d]), support,
      aggregation_contradiction: support.material_signals.length > 0 && r.normalized_verdict === 'APPROVE'};
  });
  const wrong = consistencyRows.filter(x => !x.macro_correct);
  const supports = (row, verdict) => row.support.label === `DIMENSIONS_SUPPORT_${verdict}`;
  const consistency = {
    eligible: 32, excluded_invalid_ids: INVALID_IDS, denominator: 32,
    groups: {
      macro_correct_all_dimensions_correct: consistencyRows.filter(x => x.macro_correct && x.all_dimensions_correct).length,
      macro_correct_some_dimension_wrong: consistencyRows.filter(x => x.macro_correct && !x.all_dimensions_correct).length,
      macro_wrong_dimensions_support_error: wrong.filter(x => supports(x, x.observed_verdict)).length,
      macro_wrong_dimensions_support_expected: wrong.filter(x => supports(x, x.expected_verdict)).length,
      macro_wrong_dimensions_mixed: wrong.filter(x => x.support.label === 'DIMENSIONS_MIXED').length,
      macro_wrong_dimensions_insufficient: wrong.filter(x => x.support.label === 'DIMENSIONS_INSUFFICIENT').length
    }, rows: consistencyRows
  };
  const dimensionMap = DIMENSIONS.map(d => {
    const rows = fullRows.map(t => {
      const g = of(t.case_id), r = t.record, q = r.questions.find(q => q.question_id === d);
      return {case_id: t.case_id, expected: g.expected_dimensions[d], observed: r.result.dimensions[d], correct: g.expected_dimensions[d] === r.result.dimensions[d], confidence: q.confidence,
        macro_correct: r.normalized_verdict === g.expected_verdict, historical_materiality: g.materiality, critical: g.critical_error};
    });
    const errors = rows.filter(x => !x.correct), macroWrongErrors = errors.filter(x => !x.macro_correct);
    return {dimension: d, eligible_cases: 32, correct: 32 - errors.length, incorrect: errors.length, expected_not_applicable: rows.filter(x => x.expected === 'NOT_APPLICABLE').length,
      error_rate: rate(errors.length, 32), macro_correct_coexistence: errors.filter(x => x.macro_correct).length, macro_wrong_coexistence: macroWrongErrors.length,
      p_macro_wrong_given_dimension_wrong: rate(macroWrongErrors.length, errors.length), p_dimension_wrong_given_macro_wrong: rate(macroWrongErrors.length, 4),
      material_cases: errors.filter(x => x.historical_materiality.level === 'MATERIAL').map(x => x.case_id),
      missed_expected_material_fail_cases: errors.filter(x => x.expected === 'FAIL' && x.historical_materiality.level === 'MATERIAL').map(x => x.case_id),
      confidence: {all: distribution(rows.map(x => x.confidence)), correct: distribution(rows.filter(x => x.correct).map(x => x.confidence)), incorrect: distribution(errors.map(x => x.confidence))},
      confusion: Object.fromEntries([...new Set(rows.map(x => `${x.expected} -> ${x.observed}`))].map(k => [k, rows.filter(x => `${x.expected} -> ${x.observed}` === k).length])), rows};
  });
  const g29record = fullRows.find(t => t.case_id === 'GG0-29').record;
  const gg29 = {case_id: 'GG0-29', expected: 'REJECT', full: 'APPROVE', reduced: 'APPROVE', classification: 'MACRO_GUARD_FAILURE',
    counterfactual: consistencyRows.find(x => x.case_id === 'GG0-29').support,
    dimensional_mixture: true, aggregation_failure_supported: true, exclusive_aggregation_cause: false,
    macro_reasoning_failure: {grade: 'UNDETERMINED', reason: 'Os dois macros erram, mas há sinal material omission=FAIL no FULL que sustentaria rejeição; não se satisfaz atribuição exclusiva à falha macro sem sinal interno.'},
    dimensions: DIMENSIONS.map(d => ({dimension: d, observed: g29record.result.dimensions[d], expected: of('GG0-29').expected_dimensions[d], correct: g29record.result.dimensions[d] === of('GG0-29').expected_dimensions[d],
      confidence: g29record.questions.find(q => q.question_id === d).confidence,
      material_impact: ['coverage', 'omission'].includes(d) ? 'HIGH' : d === 'cross_entity' ? 'LOW_TAXONOMY_ONLY' : 'NONE_OBSERVED',
      relation_to_verdict: d === 'omission' ? 'Detecta ressalva material ausente; contradiz APPROVE.' : d === 'coverage' ? 'INCONCLUSIVE não captura expected FAIL; erro dimensional coexistente.' : d === 'partial_answer_allowed' ? 'PASS descreve oportunidade de parcial segura; não aprova esta candidata sem ressalva.' : d === 'cross_entity' ? 'N/A em vez de PASS; sem transferência demonstrada nem explicação material para APPROVE.' : 'Sinal independente sem contradição material detectada neste eixo.'}))};
  const inconclusives = benchmark.filter(c => of(c.case_id).expected_verdict === 'INCONCLUSIVE').map(c => {
    const f = bundle.ledger.stages.find(t => t.case_id === c.case_id && t.arm === 'ARM_FULL').record;
    const r = bundle.ledger.stages.find(t => t.case_id === c.case_id && t.arm === 'ARM_REDUCED').record;
    return {case_id: c.case_id, expected: 'INCONCLUSIVE', input: c.input, oracle_rationale: of(c.case_id).rationale, expected_dimensions: of(c.case_id).expected_dimensions,
      full: {status: f.status, normalized_verdict: f.normalized_verdict, dimensions: eligible(f) ? structuredClone(f.result.dimensions) : null, support: describeDimensions(f, of(c.case_id), rules)},
      reduced: {status: r.status, verdict: r.normalized_verdict, overreject: r.normalized_verdict === 'REJECT', dimensions: 'NOT_COLLECTED'},
      excessive_negative_dimensions: eligible(f) ? DIMENSIONS.filter(d => f.result.dimensions[d] === 'FAIL' && of(c.case_id).expected_dimensions[d] !== 'FAIL') : null,
      uncertainty_detected: eligible(f) ? DIMENSIONS.filter(d => of(c.case_id).expected_dimensions[d] === 'INCONCLUSIVE' && f.result.dimensions[d] === 'INCONCLUSIVE') : null,
      calibration_failure: r.normalized_verdict === 'REJECT', internal_mechanism: 'UNDETERMINED'};
  });
  const invalidFull = bundle.ledger.stages.filter(t => t.arm === 'ARM_FULL' && !eligible(t.record)).map(t => ({
    case_id: t.case_id, sequence: t.sequence, status: 'INVALID_RESPONSE', result: null, normalized_verdict: null, semantic_credit: false,
    arm_order: 'EVEN_REDUCED_FULL', full_position: 2, expected: of(t.case_id).expected_verdict, code: t.record.error_code, subcode: t.record.diagnostic_subcode,
    failures: t.record.questions.filter(q => !q.parser_accepted).map(q => ({question_id: q.question_id, dimension: q.question_id,
      question_position: ['verdict', ...DIMENSIONS].indexOf(q.question_id) + 1, options: q.observed_option_count, probabilities: structuredClone(q.probabilities), sum: q.sum,
      delta: q.sum_delta_from_1, absolute_delta: q.absolute_sum_delta, choice: q.chosen_option, confidence: q.confidence, error_code: q.error_code})),
    full_semantics: 'NOT_ANALYZED', provider_internal_cause: 'UNDETERMINED'
  }));
  const oracleReview = [...PROBLEM_IDS, 'GG0-33', 'GG0-34'].sort().map(id => ({case_id: id, expected: of(id).expected_verdict, classification: ['GG0-31', 'GG0-32', 'GG0-35', 'GG0-36'].includes(id) ? 'SUPPORTED_WITH_AMBIGUITY' : 'CLEARLY_SUPPORTED',
    rationale: of(id).rationale, ambiguity: ['GG0-31', 'GG0-32', 'GG0-35', 'GG0-36'].includes(id) ? 'Redação assertiva da candidata pode sugerir extrapolação em leitura isolada; a política/contexto específicos distinguem não verificabilidade de violação independente comprovada. Esperado histórico preservado.' : 'Contexto, policy e distinção do corpus sustentam o expected sem alteração.',
    changes_historical_score: false}));
  const failureTaxonomy = PROBLEM_IDS.map(id => {
    const structural = INVALID_IDS.includes(id), calibration = ['GG0-31', 'GG0-32', 'GG0-35', 'GG0-36'].includes(id);
    return {case_id: id, primary_failure_class: id === 'GG0-29' ? 'MULTIPLE_CONTRIBUTORS' : structural ? 'STRUCTURAL_SURFACE_PROBLEM' : 'INCONCLUSIVE_CALIBRATION_FAILURE',
      secondary_failure_class: id === 'GG0-29' ? ['VERDICT_AGGREGATION_FAILURE', 'DIMENSIONAL_REASONING_FAILURE'] : id === 'GG0-36' ? ['INCONCLUSIVE_CALIBRATION_FAILURE'] : calibration ? ['DIMENSIONAL_REASONING_FAILURE', 'MACRO_REASONING_FAILURE'] : [],
      final_map_category: id === 'GG0-29' ? 'AGGREGATION' : id === 'GG0-36' ? 'STRUCTURAL_AND_SEMANTIC' : structural ? 'STRUCTURAL_ONLY' : 'CALIBRATION',
      evidence_strength: 'HIGH', evidence_scope: 'Saídas preservadas e desvios do contrato; mecanismo interno não determinado.',
      macro_reasoning_grade: !structural && calibration ? 'PLAUSIBLE' : 'UNDETERMINED',
      macro_reasoning_evidence_reason: 'Concordância dos erros macro não identifica a etapa interna. Nos inconclusivos válidos há sinais de incerteza e FAIL espúrios; nenhuma agregação operacional sem oracle foi demonstrada como suficiente.',
      operational_impact: id === 'GG0-29' ? 'HIGH' : structural ? 'HIGH' : 'MEDIUM',
      impact_reason: id === 'GG0-29' ? 'False APPROVE de resposta com ressalva comercial essencial ausente; não é crítico no oracle histórico, mas poderia deixar passar informação incompleta.' : structural ? 'Envelope obrigatório indisponível; reduz cobertura de sentinelas. Não significa autorização de ação nem false accept comprovado.' : 'Overreject bloqueia decisão verificável apenas após mais evidência; reduz utilidade sem unsafe APPROVE observado.',
      recommended_next_test: id === 'GG0-29' ? 'Desenhar offline contraste de obrigação comercial e ressalva preservando GMP-17/positivas.' : structural ? 'Desenhar isolamento de superfície/posição em gate futuro, sem recuperar envelope.' : 'Desenhar contrastes entre prova de violação e estado não resolvido com positivos/negativos de controle.',
      implemented: false, internal_mechanism: 'UNDETERMINED'};
  });
  const facts = {run_id: RUN_ID, execution: 'PASS', full_classification: 'NAO_PROMISSOR_DIAGNOSTICO', reduced_classification: 'NAO_PROMISSOR_DIAGNOSTICO', comparison: 'COMPARISON_INCONCLUSIVE',
    full_valid: rate(32, 36), reduced_valid: rate(36, 36), full_accuracy: rate(28, 32), reduced_accuracy: rate(31, 36), agreement: rate(32, 32),
    critical: {full: rate(0, 11), reduced: rate(0, 14), full_coverage: rate(11, 14)}, positive_partial_correct: {full: rate(3, 3), reduced: rate(3, 3)},
    authorization_status: 'CLOSED', reusable_calls: 0, confidence_corrects_verdict: false, new_calls: 0, openai: 0, network: 0, credits: 0, credentials: 0};
  return {facts, gg29, inconclusives, invalid_full: invalidFull, dimension_map: dimensionMap, consistency, oracle_review: oracleReview, failure_taxonomy: failureTaxonomy,
    findings: {structural: 'REDUCED_STRUCTURAL_ADVANTAGE_OBSERVED', semantic: 'NOT_DEMONSTRATED', efficiency: 'EFFICIENCY_ADVANTAGE_OBSERVED',
      agreement: 'STRONG_DESCRIPTIVE_SIGNAL', structural_surface_hypothesis: 'SUPPORTED', structural_surface_scope: 'Mecanismo observável do envelope: as quatro falhas são dimensionais adicionais. Probabilidade causal geral de falha por quantidade de perguntas permanece não identificada.',
      order: {classification: 'DESCRIPTIVE_ASSOCIATION_ONLY', causal_claim: false, even_second_invalid: rate(4, 18), odd_first_invalid: rate(0, 18)},
      dimensions_current_role: 'E_COMBINATION_B_C_D', production_necessity_proven: false},
    limits: {raw_reconstructed: false, internal_reasoning_reconstructed: false, scorer_changed: false, expected_changed: false, recommendations_implemented: false, oracle_assisted_counterfactual_only: true, universal_causality_proven: false}};
}

// Invariantes de evidência independentes das recomendações e do desempenho desejado.
export function validateAnalysis(a, bundle) {
  assertHistoricalFacts(bundle);
  assert.equal(a.gg29.case_id, 'GG0-29'); assert.equal(a.gg29.classification, 'MACRO_GUARD_FAILURE');
  assert.equal(a.gg29.expected, 'REJECT'); assert.equal(a.gg29.full, 'APPROVE'); assert.equal(a.gg29.reduced, 'APPROVE');
  assert.equal(a.gg29.dimensions.length, 11);
  for (const d of a.gg29.dimensions) assert.equal(d.expected, of('GG0-29').expected_dimensions[d.dimension]);
  assert.deepEqual(a.inconclusives.map(x => x.case_id), ['GG0-31', 'GG0-32', 'GG0-33', 'GG0-34', 'GG0-35', 'GG0-36']);
  for (const x of a.inconclusives) { assert.equal(x.expected, 'INCONCLUSIVE'); if (x.case_id === 'GG0-36') { assert.equal(x.full.normalized_verdict, null); assert.equal(x.full.dimensions, null); } }
  assert.deepEqual(a.invalid_full.map(x => x.case_id), INVALID_IDS);
  for (const x of a.invalid_full) { assert.equal(x.result, null); assert.equal(x.normalized_verdict, null); assert.equal(x.semantic_credit, false); assert.equal(x.full_semantics, 'NOT_ANALYZED'); }
  assert.equal(a.facts.full_classification, 'NAO_PROMISSOR_DIAGNOSTICO'); assert.equal(a.facts.reduced_classification, 'NAO_PROMISSOR_DIAGNOSTICO');
  assert.equal(a.facts.comparison, 'COMPARISON_INCONCLUSIVE'); assert.equal(a.facts.authorization_status, 'CLOSED'); assert.equal(a.facts.reusable_calls, 0);
  assert.deepEqual(a.facts.agreement, rate(32, 32)); assert.deepEqual(a.facts.critical.full, rate(0, 11));
  assert.equal(a.facts.confidence_corrects_verdict, false); assert.equal(a.findings.semantic, 'NOT_DEMONSTRATED');
  assert.equal(a.findings.order.causal_claim, false); assert.equal(a.findings.order.classification, 'DESCRIPTIVE_ASSOCIATION_ONLY');
  assert.equal(a.findings.structural, 'REDUCED_STRUCTURAL_ADVANTAGE_OBSERVED'); assert.equal(a.findings.efficiency, 'EFFICIENCY_ADVANTAGE_OBSERVED');
  for (const k of ['raw_reconstructed', 'internal_reasoning_reconstructed', 'scorer_changed', 'expected_changed', 'recommendations_implemented', 'universal_causality_proven']) assert.equal(a.limits[k], false);
  for (const x of a.oracle_review) { assert.equal(x.expected, of(x.case_id).expected_verdict); assert.equal(x.changes_historical_score, false); }
  assert.deepEqual(a.dimension_map.map(x => x.dimension), DIMENSIONS);
  for (const x of a.dimension_map) { assert.equal(x.eligible_cases, 32); assert.equal(x.correct + x.incorrect, 32); assert.equal(x.error_rate.denominator, 32); assert.equal(x.rows.length, 32); assert.ok(x.rows.every(r => !INVALID_IDS.includes(r.case_id))); }
  assert.equal(a.consistency.rows.length, 32); assert.equal(Object.values(a.consistency.groups).reduce((n, v) => n + v, 0), 32);
  assert.deepEqual(a.failure_taxonomy.map(x => x.case_id), PROBLEM_IDS); assert.ok(a.failure_taxonomy.every(x => !x.implemented));
  for (const k of ['new_calls', 'openai', 'network', 'credits', 'credentials']) assert.equal(a.facts[k], 0);
  return true;
}
