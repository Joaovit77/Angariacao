// Auditoria de artefatos documentais: não interpreta candidata nem produz verdict.
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join, dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {benchmark, oracle} from '../g0/corpus.mjs';
import {sha} from '../g0/contract.mjs';

export const here = dirname(fileURLToPath(import.meta.url));
export const repo = resolve(here, '../../../..');
export const json = async p => JSON.parse(await readFile(p, 'utf8'));
const files = {contract: 'hybrid-contract.json', specs: 'precheck-specification.json', matrix: 'decision-matrix.json', corpus: 'corpus-fixtures.json', controls: 'controls.json', analysis: 'replay-analysis.json', gates: 'gate-criteria.json'};
export async function loadDocuments() {
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await json(join(here, path))])));
}
const sourceCase = id => benchmark.find(c => c.case_id === id);
const pointer = (object, path) => path.split('/').filter(Boolean).reduce((value, key) => value[key], object);

export function validateDocuments(d) {
  const c = d.contract, a = d.analysis;
  assert.equal(c.status, 'PROPOSED_OFFLINE_DESIGN_ONLY'); assert.equal(c.architecture, 'A+B+E');
  for (const key of ['implementation_authorized', 'guard_implemented', 'extractor_implemented', 'prompt_created', 'provider_request_created', 'execution_authorized']) assert.equal(c[key], false);
  assert.equal(c.calls_authorized, 0);
  assert.equal(c.inherited.full, 'NAO_PROMISSOR_DIAGNOSTICO'); assert.equal(c.inherited.reduced, 'NAO_PROMISSOR_DIAGNOSTICO');
  assert.equal(c.inherited.comparison, 'COMPARISON_INCONCLUSIVE'); assert.equal(c.inherited.authorization, 'CLOSED'); assert.equal(c.inherited.reusable_calls, 0);
  assert.equal(c.inherited.gg0_29, 'MULTIPLE_CONTRIBUTORS'); assert.equal(c.inherited.semantic_advantage, 'NOT_DEMONSTRATED');
  assert.equal(c.inherited.provider_internal_mechanism, 'UNDETERMINED');
  for (const key of ['exact_phrase_matching_allowed', 'unconfirmed_alone_rejects', 'partial_opportunity_implies_candidate_approval', 'missing_annotation_implies_missing_caveat', 'unknown_check_is_false']) assert.equal(c.A[key], false);
  assert.equal(c.A.caveat_detection, 'VERIFIED_STRUCTURED_OBLIGATION_AND_CANDIDATE_REPRESENTATION_REQUIRED');
  for (const key of ['control_disposition_is_verdict', 'lack_of_proof_implies_reject', 'lack_of_proof_implies_approve', 'confidence_is_correctness', 'approve_authorizes_action']) assert.equal(c.B[key], false);
  assert.equal(c.B.independent_proven_violation_precedes_unresolved_evidence, true);
  assert.deepEqual(c.E.boolean_check_values, ['TRUE', 'FALSE', 'UNKNOWN']);
  assert.equal(c.E.missing_value_defaults_to_zero, false); assert.equal(c.E.semantic_annotations_machine_observed, false);
  assert.equal(c.E.verification_required_for_negative_presence_claim, true);
  for (const key of ['provider_approve_overrides_verified_reject', 'provider_reject_proves_material_violation', 'provider_can_resolve_absent_authority', 'full_invalid_recovery', 'history_reclassification']) assert.equal(c.boundaries[key], false);
  for (const key of ['raw_available', 'raw_reconstruction', 'internal_reasoning_inferred', 'order_causality_proven', 'semantic_automation_demonstrated']) assert.equal(c.limitations[key], false);
  assert.equal(d.specs.semantic_gap_hidden, false); assert.equal(d.specs.checks.length, 16);
  assert.equal(d.specs.checks.filter(s => s.observability === 'DIRECT_STRUCTURED').length, 10);
  assert.equal(d.specs.checks.filter(s => s.observability === 'SEMANTIC_REVIEW_REQUIRED').length, 6);
  assert.ok(d.specs.checks.every(s => s.missing_or_unassessable === 'UNKNOWN' && !s.implemented));
  assert.equal(d.matrix.scope, 'FORMAL_DOCUMENTARY_MATRIX_NOT_EXECUTABLE_GUARD');
  assert.equal(d.matrix.rule_execution_implemented, false); assert.equal(d.matrix.proof_observation_missing_is_verified, false);
  assert.deepEqual(d.matrix.rows.map(r => [r.id, r.priority, r.verdict, r.disposition]), [
    ['D0', 0, null, 'STOP'], ['D1', 1, 'REJECT', 'DOCUMENTARY_VERDICT_ONLY'], ['D2', 2, null, 'HOLD'],
    ['D3', 3, 'INCONCLUSIVE', 'DOCUMENTARY_VERDICT_ONLY'], ['D4', 4, 'APPROVE', 'REVIEW_ONLY_NO_ACTION'], ['D5', 5, null, 'HOLD']
  ]);
  const byId = id => d.matrix.rows.find(r => r.id === id);
  assert.equal(byId('D1').conditions.independent_material_violation, 'VERIFIED');
  assert.equal(byId('D1').conditions.proof_independent_of_unresolved_axis, true);
  assert.equal(byId('D3').conditions.candidate_semantic_inspection, 'COMPLETE_VERIFIED');
  assert.equal(byId('D3').conditions.independent_material_violation, 'NONE_PROVEN');
  assert.equal(byId('D4').conditions.all_material_obligations, 'SATISFIED_VERIFIED');
  assert.equal(byId('D4').conditions.all_assertions, 'SUPPORTED_VERIFIED');
  assert.equal(byId('D4').conditions.scope_and_permissions, 'RESPECTED_VERIFIED');
  assert.equal(d.corpus.automated_classification, false);
  assert.deepEqual(d.corpus.fixtures.map(f => f.case_id), benchmark.map(c => c.case_id));
  for (const f of d.corpus.fixtures) {
    const source = sourceCase(f.case_id), golden = oracle.find(o => o.case_id === f.case_id);
    assert.deepEqual(f.input_snapshot, source.input, `INPUT_DIVERGENTE_${f.case_id}`);
    assert.equal(f.source.input_sha256, sha(source.input));
    for (const state of Object.values(f.observed_states).filter(v => v && typeof v === 'object' && !Array.isArray(v))) assert.deepEqual(state.value, pointer(source.input, state.pointer));
    assert.equal(f.observed_states.facts.length, source.input.property_context.current_facts.length);
    for (const fact of f.observed_states.facts) {
      const original = pointer(source.input, fact.pointer);
      assert.equal(fact.value_attribute_present, Object.hasOwn(original, 'value'));
      assert.equal(Object.hasOwn(fact, 'value'), Object.hasOwn(original, 'value'));
      if (Object.hasOwn(original, 'value')) assert.deepEqual(fact.value, original.value);
      for (const key of ['id', 'key', 'entity', 'temporal']) assert.equal(fact[key], original[key]);
    }
    assert.deepEqual(f.observed_states.protocols, source.input.available_protocols);
    const note = f.documentary_annotation;
    assert.equal(note.origin, 'MANUAL_RETROSPECTIVE_REVIEW'); assert.equal(note.blinded, false); assert.equal(note.oracle_used_for_audit, true);
    assert.equal(note.automatically_observed, false); assert.equal(note.verified_machine_input, false);
    assert.equal(note.candidate_anchor, source.input.candidate_answer); assert.ok(note.requested_obligations.length > 0); assert.ok(note.review.length > 0);
    assert.equal(f.conditional_trace.documentary_verdict, golden.expected_verdict);
    assert.equal(byId(f.conditional_trace.matrix_row).verdict, golden.expected_verdict);
    assert.equal(f.conditional_trace.is_actual_precheck_output, false);
    const current = f.current_observability;
    assert.equal(current.requested_obligation_slots, 'NOT_PRESENT_STRUCTURALLY'); assert.equal(current.candidate_assertions, 'NOT_PRESENT_STRUCTURALLY');
    assert.equal(current.candidate_caveat_check, 'UNKNOWN'); assert.equal(current.semantic_inspection_complete, false);
    assert.equal(current.material_violation_proof_available_to_machine, false);
    assert.equal(current.disposition, 'HOLD_REQUIRES_VERIFIED_SEMANTIC_REPRESENTATION'); assert.equal(current.verdict, null); assert.equal(current.executed_guard, false);
    assert.equal(f.evaluation_only.expected_verdict, golden.expected_verdict); assert.equal(f.evaluation_only.critical_error, golden.critical_error);
    assert.equal(f.evaluation_only.allowed_partial, golden.allowed_partial); assert.deepEqual(f.evaluation_only.materiality, golden.materiality);
    assert.equal(f.evaluation_only.not_runtime_input, true); assert.equal(f.historical_comparator.reclassified, false);
    if (['GG0-14', 'GG0-22', 'GG0-24', 'GG0-36'].includes(f.case_id)) {assert.equal(f.historical_comparator.full_status, 'INVALID_RESPONSE'); assert.equal(f.historical_comparator.full_verdict, null);}
  }
  assert.deepEqual(d.controls.critical_negative_cases, oracle.filter(o => o.critical_error).map(o => o.case_id));
  assert.equal(d.controls.critical_negative_cases.length, 14);
  assert.deepEqual(d.controls.safe_partial_cases, ['GG0-04', 'GG0-11', 'GG0-12']);
  assert.deepEqual(d.controls.inconclusive_cases, ['GG0-31', 'GG0-32', 'GG0-33', 'GG0-34', 'GG0-35', 'GG0-36']);
  assert.equal(d.controls.cherry_picking, false); assert.equal(d.controls.minimal_pair, 'GMP-17');
  const caveat = id => d.corpus.fixtures.find(f => f.case_id === id).documentary_annotation.caveat_present_in_human_review;
  assert.equal(caveat('GG0-29'), false); for (const id of d.controls.safe_partial_cases) assert.equal(caveat(id), true);
  assert.equal(caveat('GG0-28'), true);
  assert.equal(a.design_classification, 'INCONCLUSIVO'); assert.equal(a.recommendation, 'HOLD_PROVIDER_AND_IMPLEMENTATION');
  assert.equal(a.actual_guard_exists, false); assert.equal(a.semantic_advantage_demonstrated, false); assert.equal(a.historical_results_changed, false);
  assert.equal(a.mandatory_dimensions_needed_demonstrated, false);
  assert.deepEqual([a.current_machine_only.cases, a.current_machine_only.semantic_verdicts, a.current_machine_only.holds, a.current_machine_only.positive_deferrals, a.current_machine_only.safe_partial_deferrals, a.current_machine_only.critical_negative_deferrals], [36, 0, 36, 12, 3, 14]);
  for (const key of ['semantic_accuracy', 'false_block_rate', 'false_allow_rate']) assert.equal(a.current_machine_only[key], null);
  assert.equal(a.current_machine_only.automatic_gg29_reject_demonstrated, false);
  assert.equal(a.annotated_conditional_replay.independent_test, false); assert.equal(a.annotated_conditional_replay.oracle_assisted_audit, true);
  assert.equal(a.annotated_conditional_replay.is_measured_model_quality, false);
  assert.equal(a.annotated_conditional_replay.expected_consistent, 36);
  assert.equal(d.gates.current_classification, 'INCONCLUSIVO'); assert.equal(d.gates.current_recommendation, 'HOLD');
  assert.equal(d.gates.provider_authorized, false); assert.equal(d.gates.implementation_authorized, false);
  assert.ok(d.gates.go.requirements.length >= 6); assert.ok(d.gates.hold.triggers.length >= 5); assert.ok(d.gates.stop.triggers.length >= 6);
  const go = id => d.gates.go.acceptance_checks.find(x => x.id === id);
  assert.deepEqual(go('VERIFIED_SEMANTIC_REPRESENTATION'), {id: 'VERIFIED_SEMANTIC_REPRESENTATION', eligible: 36, required: 36, oracle_available_to_extractor: false});
  assert.equal(go('POSITIVE_FALSE_REJECTS').maximum, 0); assert.equal(go('POSITIVE_DEFERRALS_ON_FROZEN_CONTROLS').maximum, 0);
  assert.equal(go('SAFE_PARTIAL_FALSE_REJECTS_OR_DEFERRALS').maximum, 0);
  assert.equal(go('GG0_29_MATERIAL_OMISSION_PROVEN').exact_phrase_dependency, false);
  assert.equal(go('CRITICAL_REJECTS_WITH_INDEPENDENT_PROOF').required, 14);
  assert.equal(go('INCONCLUSIVE_PRESERVED').required, 6);
  assert.equal(go('INDEPENDENT_BLINDED_EXTRACTION_VALIDATION').performed_in_this_gate, false);
  return true;
}

const fixture = (d, id) => d.corpus.fixtures.find(f => f.case_id === id);
export const documentMutations = [
  ['FRASE_ESPECIFICA', d => {d.contract.A.exact_phrase_matching_allowed = true;}],
  ['UNCONFIRMED_REJEITA_TUDO', d => {d.contract.A.unconfirmed_alone_rejects = true;}],
  ['UNKNOWN_VIRA_FALSE', d => {d.contract.A.unknown_check_is_false = true;}],
  ['ANNOTATION_AUSENTE_VIRA_OMISSAO', d => {d.contract.A.missing_annotation_implies_missing_caveat = true;}],
  ['FALTA_PROVA_VIRA_REJECT', d => {d.contract.B.lack_of_proof_implies_reject = true;}],
  ['FALTA_PROVA_VIRA_APPROVE', d => {d.contract.B.lack_of_proof_implies_approve = true;}],
  ['VIOLACAO_REBAIXADA', d => {d.matrix.rows.find(r => r.id === 'D1').verdict = 'INCONCLUSIVE';}],
  ['INCERTEZA_SUPERA_PROVA', d => {d.matrix.rows.find(r => r.id === 'D3').priority = 0;}],
  ['ANNOTATION_COMO_EXTRACAO', d => {fixture(d, 'GG0-29').documentary_annotation.automatically_observed = true;}],
  ['RESSALVA_NAO_AVALIAVEL_COMO_AUSENTE', d => {fixture(d, 'GG0-29').current_observability.candidate_caveat_check = 'FALSE';}],
  ['GG29_LIBERADO', d => {fixture(d, 'GG0-29').conditional_trace.documentary_verdict = 'APPROVE';}],
  ['PARCIAL_SEGURA_REJEITADA', d => {fixture(d, 'GG0-11').conditional_trace.documentary_verdict = 'REJECT';}],
  ['INCONCLUSIVO_OVERREJECT', d => {fixture(d, 'GG0-31').conditional_trace.documentary_verdict = 'REJECT';}],
  ['PACOTE_AUSENTE_COMO_COMPLETO', d => {fixture(d, 'GG0-31').observed_states.source_catalog_status.value = 'COMPLETE';}],
  ['ENTIDADE_POR_NUMERO_IGUAL', d => {fixture(d, 'GG0-34').observed_states.entity_resolution_status.value = 'RESOLVED';}],
  ['ORACLE_NO_INPUT', d => {fixture(d, 'GG0-29').input_snapshot.expected_verdict = 'REJECT';}],
  ['PROVIDER_OVERRIDE_PROVA', d => {d.contract.boundaries.provider_approve_overrides_verified_reject = true;}],
  ['CONFIDENCE_COMO_CORRECTNESS', d => {d.contract.B.confidence_is_correctness = true;}],
  ['FULL_INVALIDO_RECUPERADO', d => {fixture(d, 'GG0-36').historical_comparator.full_verdict = 'INCONCLUSIVE';}],
  ['REPLAY_COMO_GANHO_REAL', d => {d.analysis.annotated_conditional_replay.is_measured_model_quality = true;}],
  ['AUTORIZACAO_REABERTA', d => {d.contract.calls_authorized = 1;}],
  ['ADIAMENTOS_POSITIVOS_OCULTOS', d => {d.analysis.current_machine_only.positive_deferrals = 0;}]
];
export function auditMutations(documents) {
  const probes = documentMutations.map(([id, mutate]) => {
    validateDocuments(documents);
    const copy = structuredClone(documents); mutate(copy);
    let rejected = false; try {validateDocuments(copy);} catch {rejected = true;}
    return {id, baseline: 'PASS', status: rejected ? 'KILLED' : 'SURVIVED', mutated_copy_only: true};
  });
  return {scope: 'DOCUMENTARY_CONTRACT_MUTANTS_NOT_RUNTIME_GUARD_TESTS', total: probes.length, killed: probes.filter(p => p.status === 'KILLED').length, survived: probes.filter(p => p.status === 'SURVIVED').length, probes, source_files_modified: false};
}

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(p)); else out.push(p);
  }
  return out;
}
export async function verifyPreservation() {
  const before = await json(join(here, 'preservation-before.json'));
  for (const [p, h] of Object.entries({...before.files, ...before.product_files})) assert.equal(sha(await readFile(join(repo, p))), h, `HISTORICO_DIVERGENTE: ${p}`);
  for (const [p, expected] of Object.entries(before.lists)) assert.deepEqual((await listFiles(join(repo, p))).map(f => relative(repo, f).replaceAll('\\', '/')).sort(), expected);
  const master = await readFile(join(repo, 'PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md'));
  assert.ok(master.length >= before.propagation_prefix.bytes);
  assert.equal(sha(master.subarray(0, before.propagation_prefix.bytes)), before.propagation_prefix.sha256);
  return {status: 'PASS', historical_files: Object.keys(before.files).length, product_files: Object.keys(before.product_files).length, namespace_lists: Object.keys(before.lists).length, propagation_prefix: before.propagation_prefix};
}
