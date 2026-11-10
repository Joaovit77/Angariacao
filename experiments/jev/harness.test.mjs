import test from 'node:test';
import assert from 'node:assert/strict';
import { cases, dimensions } from './cases.mjs';
import { buildRequest, parseResponse, normalize, summarize } from './harness.mjs';

test('dez cenários sintéticos, longa com mídia/vazios e expectativas prévias independentes', () => {
  assert.equal(cases.length, 10);
  assert.equal(new Set(cases.map(c => c.case_id)).size, 10);
  const long = cases.at(-1).conversation_context;
  assert.equal(long.length, 101);
  assert.equal(long.filter(m => m.kind === 'midia').length, 10);
  assert.equal(long.filter(m => m.kind === 'vazia').length, 10);
  for (const c of cases) {
    for (const stage of ['decision', 'validation']) {
      const request = buildRequest(c, stage);
      assert.equal(Object.hasOwn(request.state, 'expected_product_outcome'), false);
      assert.equal(Object.hasOwn(request.state, 'reference'), false);
      assert.equal(Object.hasOwn(request.state, 'case_id'), false);
      assert.equal(Object.hasOwn(request.state, 'candidate_answer'), stage === 'validation');
      assert.equal(Object.hasOwn(request, 'tools'), false);
    }
  }
});
function response(request) {
  return { model: 'jev-1.14.0', usage: { input_tokens: 100, output_tokens: 20 }, answers: Object.fromEntries(Object.entries(request.questions).map(([id, q]) => {
    const keys = Object.keys(q.criteria);
    return [id, { type: 'choice', choice: keys[0], confidence: 1, probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0])) }];
  })) };
}
test('parser recusa escolha desconhecida, campos ausentes e probabilidades inválidas', () => {
  const request = buildRequest(cases[0], 'validation');
  const valid = response(request);
  assert.equal(parseResponse(valid, request).answers.verdict.choice, 'APPROVE');
  for (const mutate of [b => { b.answers.verdict.choice = 'inventada'; }, b => { delete b.answers.entity; }, b => { b.answers.verdict.confidence = NaN; }, b => { b.answers.verdict.probabilities.APPROVE = -1; }, b => { b.answers.verdict.probabilities.APPROVE = 0.5; }]) {
    const invalid = structuredClone(valid); mutate(invalid);
    assert.throws(() => parseResponse(invalid, request));
  }
});
test('campos externos arbitrários não entram em respostas preservadas', () => {
  const request = buildRequest(cases[0], 'validation');
  const b = response(request);
  b.headers = { Authorization: 'SEGREDO-SINTETICO' };
  b.answers.verdict.debug = 'SEGREDO-SINTETICO';
  assert.equal(JSON.stringify(parseResponse(b, request)).includes('SEGREDO-SINTETICO'), false);
});
test('candidata ruim não exige bloquear solicitação respondível', () => {
  const c = cases[5];
  assert.equal(c.expected_product_outcome.action, 'RESPOND');
  assert.equal(c.expected_product_outcome.verdict, 'REJECT');
  const request = buildRequest(c, 'validation');
  const parsed = parseResponse(response(request), request);
  const result = normalize(c, 'validation', parsed);
  assert.equal(result.verdict, 'APPROVE');
  const summary = summarize([{ case_id: c.case_id, stage: 'validation', result, error: null, usage: null }]);
  assert.deepEqual(summary.metrics.false_accept, { numerator: 1, denominator: 1, rate: 1 });
  assert.equal(summary.metrics.decision_accuracy.rate, null);
});
test('rejeição falsa, inconclusivo e erro operacional têm contagens distintas', () => {
  const dims = Object.fromEntries(dimensions.map(d => [d, 'PASS']));
  const records = [
    { case_id: cases[0].case_id, stage: 'validation', result: { verdict: 'REJECT', dimensions: dims }, error: null },
    { case_id: cases[4].case_id, stage: 'validation', result: { verdict: 'INCONCLUSIVE', dimensions: dims }, error: null },
    { case_id: cases[1].case_id, stage: 'validation', result: null, error: { code: 'timeout' } },
  ];
  const s = summarize(records);
  assert.equal(s.metrics.false_reject.numerator, 1);
  assert.equal(s.metrics.false_reject.denominator, 1);
  assert.equal(s.metrics.false_accept.numerator, 0);
  assert.equal(s.metrics.inconclusive.rate, 0.5);
  assert.equal(s.operational_errors, 1);
  assert.equal(s.completed_cases, 0);
  assert.equal(s.not_executed_stages, 17);
});
