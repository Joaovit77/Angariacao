import {validateAnalysis} from './analysis.mjs';

export const mutations = [
  ['GG29_REMOVIDO', a => {a.gg29.case_id = 'REMOVIDO';}],
  ['INVALID_COM_VERDICT', a => {a.invalid_full[0].normalized_verdict = 'REJECT';}],
  ['ESTRUTURA_VIRA_VITORIA_SEMANTICA', a => {a.findings.semantic = 'SEMANTIC_ADVANTAGE_OBSERVED';}],
  ['ORACLE_ACOMODA_MODELO', a => {a.oracle_review.find(x => x.case_id === 'GG0-29').expected = 'APPROVE';}],
  ['INCONCLUSIVE_VIRA_REJECT', a => {a.inconclusives[0].expected = 'REJECT';}],
  ['CONFIDENCE_CORRIGE_VERDICT', a => {a.facts.confidence_corrects_verdict = true;}],
  ['CRITICOS_FULL_DENOMINADOR_14', a => {a.facts.critical.full.denominator = 14;}],
  ['AGREEMENT_36_36', a => {a.facts.agreement.numerator = 36; a.facts.agreement.denominator = 36;}],
  ['GG36_FULL_BACKFILL', a => {a.invalid_full.find(x => x.case_id === 'GG0-36').semantic_credit = true;}],
  ['ORDEM_CAUSAL', a => {a.findings.order.causal_claim = true;}],
  ['REASONING_INVENTADO', a => {a.limits.internal_reasoning_reconstructed = true;}],
  ['COMPARISON_RECLASSIFICADA', a => {a.facts.comparison = 'REDUCED_FAVORED';}]
];
export function runMutations(analysis, bundle) {
  const probes = mutations.map(([id, mutate]) => {
    validateAnalysis(analysis, bundle);
    const copy = structuredClone(analysis); mutate(copy);
    let rejected = false; try {validateAnalysis(copy, bundle);} catch {rejected = true;}
    return {id, baseline: 'PASS', status: rejected ? 'KILLED' : 'SURVIVED', historical_files_modified: false};
  });
  return {total: probes.length, killed: probes.filter(x => x.status === 'KILLED').length, survived: probes.filter(x => x.status === 'SURVIVED').length, probes, network_attempts: 0, historical_files_modified: false};
}
