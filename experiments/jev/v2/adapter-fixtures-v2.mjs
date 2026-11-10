import { allCases, validationFields } from './matrix-v2.mjs';
import { buildRequestV2 } from './request-v2.mjs';

// Fixtures de contrato criadas manualmente; não leem as expectativas do oráculo.
export const syntheticPrivacy = ['FAKE_SECRET_DO_NOT_LOG', '+5511999999999', 'Pessoa Exemplo', 'fake-token-123'];
export const fixtureCase = id => {
  const c = allCases.find(c => c.case_id === id);
  return { case_id: c.case_id, input: structuredClone(c.input) };
};
export function wireFixture(c, stage, selections = {}) {
  const request = buildRequestV2(c, stage);
  const answers = Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
    const keys = Object.keys(q.criteria), selected = selections[id] ?? (keys.includes('NO') ? 'NO' : keys[0]);
    return [id, { type: 'choice', choice: selected, confidence: 0.5,
      probabilities: Object.fromEntries(keys.map(k => [k, k === selected ? 1 : 0])) }];
  }));
  return { model: 'jev-1.14.0', answers, usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } };
}
const validation = (verdict, overrides = {}) => ({ verdict, ...Object.fromEntries(validationFields.map(f => [f, ['protocol', 'temporal', 'partial_answer_allowed'].includes(f) ? 'NOT_APPLICABLE' : 'PASS'])), ...overrides });
export function fixturesV2() {
  const minimal = fixtureCase('V2-16'), full = fixtureCase('V2-20'), partial = fixtureCase('V2-02');
  const minimalRaw = wireFixture(minimal, 'decision', { action: 'RESPOND', intent: 'SOCIAL', enough_context: 'YES', entity_resolution: 'ENTITY_AMBIGUOUS' });
  const fullRaw = wireFixture(full, 'decision', { action: 'RESPOND', intent: 'FACTUAL', enough_context: 'YES', current_0: 'YES', history_20: 'YES',
    prohibited_CROSS_ENTITY: 'YES', prohibited_HISTORICAL_AS_CURRENT: 'YES', temporal_CURRENT_FACT: 'YES', temporal_HISTORICAL_FACT: 'YES', temporal_SUPERSEDED_FACT: 'YES', temporal_HISTORICAL_SUPPORT_REQUIRED: 'YES' });
  const partialRaw = wireFixture(partial, 'validation', validation('APPROVE', { protocol: 'PASS', temporal: 'PASS', partial_answer_allowed: 'PASS' }));
  const rejected = fixtureCase('V2-06');
  const rejectedRaw = wireFixture(rejected, 'validation', validation('REJECT', { grounding: 'FAIL', factuality: 'FAIL', protocol: 'FAIL', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL' }));
  const inconclusive = fixtureCase('V2-12');
  const inconclusiveRaw = wireFixture(inconclusive, 'validation', validation('INCONCLUSIVE', { grounding: 'INCONCLUSIVE', factuality: 'INCONCLUSIVE', protocol: 'INCONCLUSIVE', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'INCONCLUSIVE' }));
  const list = {
    VALID_DECISION_MINIMAL: { c: minimal, stage: 'decision', raw: minimalRaw },
    VALID_DECISION_FULL: { c: full, stage: 'decision', raw: fullRaw },
    VALID_VALIDATION_APPROVE: { c: partial, stage: 'validation', raw: partialRaw },
    VALID_VALIDATION_REJECT: { c: rejected, stage: 'validation', raw: rejectedRaw },
    VALID_VALIDATION_INCONCLUSIVE: { c: inconclusive, stage: 'validation', raw: inconclusiveRaw },
    PARTIAL_VALID: { c: partial, stage: 'validation', raw: structuredClone(partialRaw) },
    PARTIAL_INVALID_OMISSION: { c: fixtureCase('V2-04'), stage: 'validation', raw: wireFixture(fixtureCase('V2-04'), 'validation', validation('REJECT', { temporal: 'PASS', coverage: 'FAIL', omission: 'FAIL', partial_answer_allowed: 'PASS' })) },
    PARTIAL_INVALID_INVENTION: { c: fixtureCase('V2-03'), stage: 'validation', raw: wireFixture(fixtureCase('V2-03'), 'validation', validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', protocol: 'FAIL', temporal: 'FAIL', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL', partial_answer_allowed: 'PASS' })) },
  };
  const clone = () => structuredClone(list.VALID_VALIDATION_APPROVE);
  list.INVALID_ENUM = clone(); list.INVALID_ENUM.raw.answers.verdict.choice = 'permitir';
  list.MISSING_REQUIRED = clone(); delete list.MISSING_REQUIRED.raw.answers.grounding;
  list.UNKNOWN_FIELDS = clone(); list.UNKNOWN_FIELDS.raw.internal_reasoning = syntheticPrivacy;
  list.UNKNOWN_FIELDS.raw.answers.verdict.debug = syntheticPrivacy;
  list.INVALID_CONFIDENCE = clone(); list.INVALID_CONFIDENCE.raw.answers.verdict.confidence = null;
  list.INVALID_HISTORY_IDS = structuredClone(list.VALID_DECISION_FULL); list.INVALID_HISTORY_IDS.raw.answers.history_invented = { type: 'choice', choice: 'YES', confidence: 1, probabilities: { YES: 1, NO: 0 } };
  list.PII_EXTRA_FIELD = clone();
  for (const key of ['internal_reasoning', 'chain_of_thought', 'secret', 'debug', 'prompt', 'raw_context', 'dev_notes']) {
    list.PII_EXTRA_FIELD.raw[key] = syntheticPrivacy;
    list.PII_EXTRA_FIELD.raw.answers.verdict[key] = syntheticPrivacy;
    list.PII_EXTRA_FIELD.raw.usage[key] = syntheticPrivacy;
  }
  list.MALFORMED_RESPONSE = { ...clone(), raw: '{"model":' };
  list.OPERATIONAL_ERROR = { error_type: 'TIMEOUT', timestamp: '2026-01-01T00:00:01.000Z', duration_ms: 1000, secret: syntheticPrivacy };
  list.USAGE_PRESENT = clone();
  list.USAGE_MISSING = clone(); delete list.USAGE_MISSING.raw.usage;
  return list;
}
