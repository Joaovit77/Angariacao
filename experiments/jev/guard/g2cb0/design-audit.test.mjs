import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {benchmark, oracle} from '../g0/corpus.mjs';
import {sha} from '../g0/contract.mjs';
import {here, json, loadDocuments, validateDocuments, auditMutations, documentMutations, verifyPreservation} from './artifact-audit.mjs';

const d = await loadDocuments(), f = id => d.corpus.fixtures.find(f => f.case_id === id), mutants = auditMutations(d);

test('contrato documental válido, sem implementação, prompt, request ou autorização', () => {assert.equal(validateDocuments(d), true);});
test('auditoria não altera documentos nem gera decisões novas', () => {const before = sha(d); validateDocuments(d); auditMutations(d); assert.equal(sha(d), before);});
test('história FULL/REDUCED negativos, comparação inconclusiva e autorização encerrada', () => {
  assert.equal(d.contract.inherited.authorization, 'CLOSED'); assert.equal(d.contract.inherited.comparison, 'COMPARISON_INCONCLUSIVE'); assert.equal(d.contract.inherited.gg0_29, 'MULTIPLE_CONTRIBUTORS');
});
test('36 fixtures são cópias exatas, não corpus alterado', () => {
  assert.equal(d.corpus.fixtures.length, 36);
  for (const x of d.corpus.fixtures) assert.deepEqual(x.input_snapshot, benchmark.find(c => c.case_id === x.case_id).input);
});
test('todos os14 críticos, três parciais e seis inconclusivos preservados', () => {
  assert.equal(d.controls.critical_negative_cases.length, 14); assert.equal(d.controls.safe_partial_cases.length, 3); assert.equal(d.controls.inconclusive_cases.length, 6);
  for (const id of d.controls.critical_negative_cases) assert.equal(f(id).conditional_trace.documentary_verdict, 'REJECT');
});
test('GG04/11/12 são permitidos só na leitura condicional;GG29 mantémREJECT', () => {
  for (const id of ['GG0-04', 'GG0-11', 'GG0-12']) {assert.equal(f(id).conditional_trace.documentary_verdict, 'APPROVE'); assert.equal(f(id).documentary_annotation.caveat_present_in_human_review, true);}
  assert.equal(f('GG0-29').conditional_trace.documentary_verdict, 'REJECT'); assert.equal(f('GG0-29').documentary_annotation.caveat_present_in_human_review, false);
});
test('GMP17 mantém mesmo contexto; diff conhecido não é detector automático', async () => {
  const pair = (await json(join(here, '../g2b0/minimal-pairs.json'))).pairs.find(p => p.pair_id === 'GMP-17');
  const left = f(pair.left).input_snapshot, right = f(pair.right).input_snapshot;
  assert.equal(left.candidate_answer.replace(pair.edit.text, ''), right.candidate_answer);
  const x = structuredClone(left), y = structuredClone(right); delete x.candidate_answer; delete y.candidate_answer; assert.deepEqual(x, y);
  assert.equal(d.analysis.current_machine_only.automatic_gg29_reject_demonstrated, false);
});
test('INCONCLUSIVE documental não éREJECT nemAPPROVE e não afirma mudar provider', () => {
  for (const id of d.controls.inconclusive_cases) assert.equal(f(id).conditional_trace.documentary_verdict, 'INCONCLUSIVE');
  assert.equal(d.analysis.semantic_advantage_demonstrated, false);
});
test('D1 prova independente precede incompletude eD3 incerteza', () => {
  const reject = d.matrix.rows.find(r => r.id === 'D1'), inc = d.matrix.rows.find(r => r.id === 'D3');
  assert.ok(reject.priority < inc.priority); assert.equal(reject.conditions.proof_independent_of_unresolved_axis, true);
});
test('APPROVE exige candidata inteira, obrigações, fontes e permissões', () => {
  const approve = d.matrix.rows.find(r => r.id === 'D4');
  assert.equal(approve.conditions.all_material_obligations, 'SATISFIED_VERIFIED'); assert.equal(approve.conditions.all_assertions, 'SUPPORTED_VERIFIED'); assert.equal(approve.disposition, 'REVIEW_ONLY_NO_ACTION');
});
test('HOLD/STOP não são novos verdicts semânticos', () => {
  for (const row of d.matrix.rows.filter(r => ['HOLD', 'STOP'].includes(r.disposition))) assert.equal(row.verdict, null);
  assert.equal(d.contract.B.control_disposition_is_verdict, false);
});
test('todos os estados de caveat automáticos sãoUNKNOWN, nãoMISSING_VERIFIED', () => {
  assert.ok(d.corpus.fixtures.every(x => x.current_observability.candidate_caveat_check === 'UNKNOWN'));
  assert.equal(d.contract.A.missing_annotation_implies_missing_caveat, false);
});
test('10 estados estruturados são separados dos seis vínculos que requerem semântica', () => {
  assert.equal(d.specs.checks.filter(x => x.observability === 'DIRECT_STRUCTURED').length, 10);
  assert.equal(d.specs.checks.filter(x => x.observability === 'SEMANTIC_REVIEW_REQUIRED').length, 6);
});
test('UNKNOWN, null, atributo ausente e pacote não fornecido não se confundem', () => {
  assert.equal(f('GG0-21').observed_states.facts[0].value_kind, 'NULL');
  assert.equal(f('GG0-22').observed_states.facts[0].value_kind, 'MISSING_ATTRIBUTE'); assert.equal(Object.hasOwn(f('GG0-22').observed_states.facts[0], 'value'), false);
  assert.equal(f('GG0-24').observed_states.facts[1].value_kind, 'EXPLICIT_UNKNOWN');
  assert.equal(f('GG0-31').observed_states.source_catalog_status.value, 'NOT_PROVIDED');
});
test('conflito32, identidade33/34 e temporalidade36 mantêm estados originais', () => {
  assert.equal(f('GG0-32').observed_states.evidence_bundle_status.value, 'CONFLICTING_EQUAL_AUTHORITY');
  assert.equal(f('GG0-33').observed_states.entity_resolution_status.value, 'MISSING'); assert.equal(f('GG0-34').observed_states.entity_resolution_status.value, 'AMBIGUOUS');
  assert.equal(f('GG0-36').observed_states.facts[0].temporal, 'UNKNOWN_CURRENT_STATE');
});
test('UNCONFIRMED aparece em10 positivos; regra global causaria false block', () => {
  const ids = d.corpus.fixtures.filter(x => x.evaluation_only.expected_verdict === 'APPROVE' && x.observed_states.commercial_confirmation.value === 'UNCONFIRMED').map(x => x.case_id);
  assert.equal(ids.length, 10); assert.ok(['GG0-04', 'GG0-11', 'GG0-12'].every(id => ids.includes(id)));
  assert.equal(d.contract.A.unconfirmed_alone_rejects, false);
});
test('todas as positivas adiadas é custo de disponibilidade explícito, não sucesso', () => {
  assert.deepEqual([d.analysis.current_machine_only.holds, d.analysis.current_machine_only.positive_deferrals, d.analysis.current_machine_only.safe_partial_deferrals], [36, 12, 3]);
  assert.equal(d.analysis.current_machine_only.false_block_rate, null);
});
test('replay anotado não é teste cego ou qualidade JEV medida', () => {
  assert.equal(d.analysis.annotated_conditional_replay.independent_test, false); assert.equal(d.analysis.annotated_conditional_replay.oracle_assisted_audit, true); assert.equal(d.analysis.annotated_conditional_replay.is_measured_model_quality, false);
});
test('annotations não são entrada de máquina e evaluation_only não vaza para fonte', () => {
  for (const x of d.corpus.fixtures) {assert.equal(x.documentary_annotation.verified_machine_input, false); assert.equal(x.evaluation_only.not_runtime_input, true); assert.equal(Object.hasOwn(x.input_snapshot, 'expected_verdict'), false);}
});
test('GG28 com ressalva presente ainda omite parte conhecida: não aprovar por caveat isolado', () => {
  assert.equal(f('GG0-28').documentary_annotation.caveat_present_in_human_review, true); assert.equal(f('GG0-28').conditional_trace.documentary_verdict, 'REJECT');
});
test('false allow de parte verdadeira não é aceito em negativos comerciais/extra/operacionais', () => {
  for (const id of ['GG0-16', 'GG0-17', 'GG0-23', 'GG0-24', 'GG0-25', 'GG0-26', 'GG0-27', 'GG0-29', 'GG0-30']) assert.equal(f(id).conditional_trace.documentary_verdict, 'REJECT');
});
test('nenhum FULL inválido é recuperado ou usado como evidência semântica', () => {
  for (const id of ['GG0-14', 'GG0-22', 'GG0-24', 'GG0-36']) assert.equal(f(id).historical_comparator.full_verdict, null);
});
test('oracle permanece canônico nos36 casos, sem reclassificação histórica', () => {
  for (const x of d.corpus.fixtures) assert.equal(x.evaluation_only.expected_verdict, oracle.find(o => o.case_id === x.case_id).expected_verdict);
  assert.equal(d.analysis.historical_results_changed, false);
});
test('critérios objetivos recomendamHOLD, sem gate/prompt/provider autorizado', () => {
  assert.equal(d.gates.current_classification, 'INCONCLUSIVO'); assert.equal(d.gates.current_recommendation, 'HOLD');
  assert.equal(d.gates.provider_authorized, false); assert.equal(d.gates.implementation_authorized, false);
});
test('524 históricos,769 produto e16 listas preservados', async () => {
  const check = await verifyPreservation(); assert.equal(check.historical_files, 524); assert.equal(check.product_files, 769); assert.equal(check.namespace_lists, 16);
});
test('fontes novas são auditoria documental sem transporte, extrator ou guard', async () => {
  const source = await readFile(join(here, 'artifact-audit.mjs'), 'utf8');
  assert.equal(/fetch\(|parseEnv|process\.env|\.env\.local|node:https|node:http|node:net|node:tls|node:dns|function\s+(?:classifyCandidate|decideVerdict|parseCandidate)/.test(source), false);
  assert.equal(d.contract.guard_implemented, false); assert.equal(d.contract.extractor_implemented, false);
});
test('barreira offline e zero tentativas', () => {assert.equal(globalThis.__JEV_OFFLINE_NETWORK_ATTEMPTS, 0);});
for (const [id] of documentMutations) test(`mutante documental ${id}`, () => {
  const result = mutants.probes.find(p => p.id === id); assert.equal(result.baseline, 'PASS'); assert.equal(result.status, 'KILLED');
});
test('todos os22 mutantes morrem somente em cópias de artefatos', () => {
  assert.equal(mutants.total, 22); assert.equal(mutants.killed, 22); assert.equal(mutants.survived, 0); assert.equal(mutants.source_files_modified, false);
});
