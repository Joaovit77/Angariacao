// Consistência documental somente: não interpreta textos nem decide casos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../../../..');
export const sha = value => createHash('sha256').update(value).digest('hex');
export const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
export function loadDocuments() {
  return Object.fromEntries(Object.entries({design:'audit-design', families:'semantic-families', architectures:'architecture-comparison', review:'future-review-requirements', sources:'source-admissibility', cases:'case-references'}).map(([key, name]) => [key,json(path.join(here,`${name}.json`))]));
}

const prohibited = ['oracle_as_input','rationale_as_input','expected_generates_obligation','exact_gg29_regex','global_unconfirmed_caveat','annotation_is_automatic','not_found_means_absent','character_coverage_proves_semantic_completeness','reject_for_missing_proof','approve_for_no_contradiction','hold_is_semantic_success','hold_false_block_hidden','other_llm_is_deterministic','provider_self_attestation','historical_reclassification','operational_prompt_change','cost_alone_promotes_architecture','confidence_is_correctness','controlled_renderer_certifies_old_free_text'];
const required = ['completeness_requires_obligation_enumeration','completeness_requires_claim_enumeration','completeness_requires_relationship_check','caveat_missing_requires_full_inspection','claim_requires_source_binding','binding_can_be_unresolved_without_approval'];
export function validateDocuments(d) {
  assert.equal(d.design.scope,'SEMANTIC_OBSERVABILITY_AUDIT_DESIGN_ONLY');
  assert.equal(d.design.classification,'OBSERVABILITY_INCONCLUSIVE');
  assert.equal(d.design.recommendation,'HOLD');
  for (const key of prohibited) assert.equal(d.design.rules[key],false,`REGRA_PROIBIDA:${key}`);
  for (const key of required) assert.equal(d.design.rules[key],true,`REGRA_EXIGIDA:${key}`);
  assert.equal(d.design.rules.calls_authorized,0,'CHAMADAS_FECHADAS');
  for (const [key,value] of Object.entries(d.design.execution)) assert.equal(value, key === 'codex_role' ? 'DOCUMENT_AUTHOR_NOT_HUMAN_REVIEWER' : typeof value === 'number' ? 0 : false,`EXECUCAO:${key}`);
  assert.deepEqual(d.design.verification_states,['VIOLATION_PROVEN','NO_VIOLATION_FOUND_WITH_COMPLETE_INSPECTION','INSPECTION_INCOMPLETE','UNKNOWN']);
  assert.equal(d.design.no_violation_found_means_universal_absence,false);
  for (const metric of Object.values(d.design.metrics)) assert.deepEqual(metric,{value:null,status:'NOT_MEASURED'});
  assert.equal(Object.keys(d.design.metrics).length,11);
  const inherited=d.design.inherited;
  for (const key of ['g2b_full','g2b_reduced']) assert.equal(inherited[key],'NAO_PROMISSOR_DIAGNOSTICO');
  assert.equal(inherited.comparison,'COMPARISON_INCONCLUSIVE');
  assert.equal(inherited.authorization,'CLOSED'); assert.equal(inherited.reusable_calls,0);
  assert.equal(inherited.gg0_29,'MULTIPLE_CONTRIBUTORS');
  assert.equal(inherited.g2cb0_classification,'INCONCLUSIVO'); assert.equal(inherited.g2cb0_recommendation,'HOLD');
  assert.equal(inherited.semantic_advantage,'NOT_DEMONSTRATED'); assert.equal(inherited.provider_internal_mechanism,'UNDETERMINED');
  assert.deepEqual(inherited.b0_hold_scenario,{cases:36,positive_deferrals:12,safe_partial_deferrals:3,source:'B0_FROZEN_SCENARIO_NOT_B1_EXECUTION'});
  assert.equal(inherited.b0_unconfirmed_positive_controls,10);
  assert.equal(d.design.admissibility.legacy_annotation,'ORACLE_ASSISTED_ONLY');
  assert.equal(d.design.admissibility.legacy_human_label_proves_independent_human_execution,false);
  for (const key of ['oracle','rationale','expected_verdict','historical_materiality']) assert.equal(d.design.admissibility[key],'EVALUATION_ONLY');
  assert.equal(d.design.b0_matrix_reference.changed,false);
  assert.equal(d.design.b0_matrix_reference.path,'experiments/jev/guard/g2cb0/decision-matrix.json');
  assert.equal(d.design.b0_matrix_reference.sha256,'736f9c1bd67ed50be158f73f07d77bea042084ea1585c879841538ddeeee83d7');
  for (const [key,value] of Object.entries(d.design.next_gate)) if(key !== 'description') assert.equal(value,false,`PROXIMO_GATE:${key}`);

  assert.deepEqual(d.families.families.map(f=>f.name),['requested_obligations','required_caveat','required_caveat_present_or_missing','candidate_assertions_and_bindings','all_obligations_and_claims_checked','no_independent_violation_proven']);
  assert.deepEqual(d.families.questions.map(q=>q.id),Array.from({length:20},(_,i)=>i+1));
  assert.equal(d.families.answer_count,120);
  for(const f of d.families.families) {
    assert.equal(f.current_operational_certified,false);
    assert.ok(['NOT_DEMONSTRATED','UNRESOLVED'].includes(f.state));
    assert.equal(f.legacy_annotation_evidence_class,'ORACLE_ASSISTED_ONLY');
    assert.deepEqual(f.answers.map(a=>a.question_id),Array.from({length:20},(_,i)=>i+1));
    for(const a of f.answers){assert.ok(a.value.length>0 && a.basis.length>20); assert.equal(a.evidence_kind,'DOCUMENTARY_DESIGN_NOT_EXECUTED_CERTIFICATION');}
    assert.equal(f.answers.find(a=>a.question_id===19).value,'UNKNOWN');
  }
  assert.deepEqual(d.architectures.approaches.map(a=>a.id),['H1','H2','H3','H4','H5']);
  assert.equal(d.architectures.axes.length,18);
  assert.equal(d.architectures.approaches.find(a=>a.id==='H4').problem_displacement,true);
  assert.equal(d.architectures.approaches.find(a=>a.id==='H5').status,'VALID_ALTERNATIVE');
  for(const axis of d.architectures.axes){assert.deepEqual(Object.keys(axis.ratings),['H1','H2','H3','H4','H5']);for(const level of Object.values(axis.ratings))assert.ok(['LOW','MEDIUM','HIGH','UNKNOWN'].includes(level));}
  assert.equal(d.review.status,'PROPOSED_NOT_EXECUTED');
  for(const key of ['human_review_performed','reviewers_recruited','oracle_assisted_annotations_accepted','forced_consensus','semantic_completeness_from_spans_alone','old_oracle_used_to_resolve_disagreement','blind_validation_started','blinded_packets_created','new_ground_truth_created'])assert.equal(d.review[key],false,`REVISAO:${key}`);
  assert.equal(d.review.forms_filled,0); assert.equal(d.review.independent_reviewers_required,2);
  for(const key of ['reviewers_must_not_be_codex','adjudication_required_on_disagreement','prior_exposure_requires_quarantine','obligations_before_candidate','source_binding_mandatory','claim_span_required','all_spans_accounted_required','unassessed_items_must_be_recorded','missing_caveat_requires_complete_inspection','version_history_required','release_labels_only_after_records_sealed'])assert.equal(d.review[key],true);
  for(const key of ['oracle','rationale','expected_verdict','historical_materiality','historical_annotations','original_case_ids'])assert.ok(d.review.reviewer_view.forbidden_fields.includes(key));
  assert.equal(d.review.reviewer_view.candidate_visible_only_after_obligations_locked,true);
  assert.equal(d.sources.actual_human_review_in_b1,false); assert.equal(d.sources.independent_human_evidence_present,false);
  assert.equal(d.sources.origin_label_is_human_execution_certificate,false); assert.equal(d.sources.doc_author_is_human_reviewer,false);
  assert.equal(d.sources.layers.find(l=>l.name==='legacy_annotations').evidence_class,'ORACLE_ASSISTED_ONLY');
  assert.equal(d.cases.scope,'REFERENCES_AND_HASHES_ONLY_NOT_NEW_DATASET');
  assert.equal(d.cases.source_cases,36); assert.equal(d.cases.input_copied,false); assert.equal(d.cases.annotations_created,false);
  assert.deepEqual(d.cases.case_ids,Array.from({length:36},(_,i)=>`GG0-${String(i+1).padStart(2,'0')}`));
  assert.deepEqual(d.cases.references.map(r=>r.case_id),d.cases.case_ids);
  for(const r of d.cases.references){assert.equal(r.new_annotation_produced,false); assert.equal(r.new_verdict_produced,false);assert.match(r.input_sha256,/^[a-f0-9]{64}$/);}
  assert.deepEqual(d.cases.existing_critical_case_ids,[13,14,15,16,17,18,19,20,21,22,23,24,27,30].map(i=>`GG0-${i}`));
  assert.deepEqual(d.cases.safe_partial_ids,['GG0-04','GG0-11','GG0-12']);
  assert.deepEqual(d.cases.inconclusive_ids,[31,32,33,34,35,36].map(i=>`GG0-${i}`));
  return {status:'PASS_DOCUMENTARY_CONSISTENCY_ONLY',semantic_certification:false};
}

function walk(root) {
  return fs.readdirSync(path.join(repo,root),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${root}/${e.name}`):[`${root}/${e.name}`]).sort();
}
export function verifyPreservation() {
  const before=json(path.join(here,'preservation-before.json'));
  assert.equal(Object.keys(before.files).length,551); assert.equal(Object.keys(before.product_files).length,769);
  for(const [file,hash] of Object.entries({...before.files,...before.product_files}))assert.equal(sha(fs.readFileSync(path.join(repo,file))),hash,`PRESERVACAO:${file}`);
  for(const [root,files] of Object.entries(before.lists))assert.deepEqual(walk(root),files,`INVENTARIO:${root}`);
  const propagation=fs.readFileSync(path.join(repo,'PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md'));
  assert.equal(sha(propagation.subarray(0,before.propagation_prefix.bytes)),before.propagation_prefix.sha256);
  return {historical_files:551,product_files:769,namespace_lists:Object.keys(before.lists).length,all_bytes_preserved:true,master_prefix_preserved:true};
}
