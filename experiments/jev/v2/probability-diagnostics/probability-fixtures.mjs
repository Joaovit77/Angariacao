export const sentinels = ['FAKE_SECRET_DO_NOT_LOG', 'Pessoa Exemplo', '+5511999999999', 'fake-token-123', 'texto sintético de conversa'];
export function fixture(options = ['A', 'B', 'C']) {
  return { request: { model: 'jev-1.14.0', questions: { q: { type: 'choice', criteria: Object.fromEntries(options.map(k => [k, 'Critério sintético.'])) } } },
    raw: { model: 'jev-1.14.0', usage: { input_tokens: 1, output_tokens: 1 }, answers: {
      q: { type: 'choice', choice: options[0], confidence: 0.5, probabilities: Object.fromEntries(options.map((k, i) => [k, i === 0 ? 1 : 0])) } } } };
}

export function probabilityFixtures() {
  const rows = [];
  const add = (id, values, valid, subcode = null, options = ['A', 'B', 'C'], selected = options[0]) => {
    const f = fixture(options); f.raw.answers.q.probabilities = Object.fromEntries(options.map((k, i) => [k, values[i]])); f.raw.answers.q.choice = selected;
    rows.push({ id, ...f, valid, category: valid ? null : 'INVALID_PROBABILITIES', subcode });
  };
  add('EXACT_ONE_ZERO', [1, 0, 0], true);
  add('HALF_HALF', [.5, .5, 0], true);
  add('DECIMAL_POINT_ONE_TWO_SEVEN', [.1, .2, .7], true, null, undefined, 'C');
  add('MANY_DECIMALS', [.3333333333333333, .3333333333333333, .3333333333333334], true, null, undefined, 'C');
  add('NEAR_ONE_BELOW', [.6, .399999999, 0], true);
  add('NEAR_ONE_ABOVE', [.6, .400000001, 0], true);
  add('SUM_0999', [.6, .399, 0], false, 'PROBABILITY_SUM_MISMATCH');
  add('SUM_1001', [.6, .401, 0], false, 'PROBABILITY_SUM_MISMATCH');
  add('EPSILON_INSIDE_BELOW', [.6, .3999990000001, 0], true);
  add('EPSILON_OUTSIDE_BELOW', [.6, .3999989999999, 0], false, 'PROBABILITY_SUM_MISMATCH');
  add('EPSILON_INSIDE_ABOVE', [.6, .4000009999999, 0], true);
  add('EPSILON_OUTSIDE_ABOVE', [.6, .4000010000001, 0], false, 'PROBABILITY_SUM_MISMATCH');
  add('NOMINAL_EPSILON_BELOW', [.6, .399999, 0], false, 'PROBABILITY_SUM_MISMATCH');
  add('NOMINAL_EPSILON_ABOVE', [.6, .400001, 0], true);
  add('ALL_ZERO', [0, 0, 0], false, 'PROBABILITY_SUM_MISMATCH');
  add('NEGATIVE', [1, -.1, .1], false, 'PROBABILITY_BELOW_ZERO');
  add('ABOVE_ONE', [1.01, 0, 0], false, 'PROBABILITY_ABOVE_ONE');
  add('NAN_OBJECT', [NaN, .5, .5], false, 'PROBABILITY_NOT_FINITE');
  add('INFINITY_OBJECT', [Infinity, 0, 0], false, 'PROBABILITY_NOT_FINITE');
  add('NEGATIVE_INFINITY_OBJECT', [-Infinity, 0, 0], false, 'PROBABILITY_NOT_FINITE');
  add('STRING_NUMBER', ['0.5', .5, 0], false, 'PROBABILITY_NOT_NUMBER');
  add('NULL_VALUE', [null, .5, .5], false, 'PROBABILITY_NOT_NUMBER');
  add('BOOLEAN_VALUE', [true, 0, 0], false, 'PROBABILITY_NOT_NUMBER');
  add('OBJECT_VALUE', [{ secret: sentinels }, 0, 0], false, 'PROBABILITY_NOT_NUMBER');
  add('ARRAY_VALUE', [[sentinels], 0, 0], false, 'PROBABILITY_NOT_NUMBER');
  add('UNDEFINED_VALUE', [undefined, .5, .5], false, 'PROBABILITY_NOT_NUMBER');
  add('MAX_CHOSEN', [.2, .7, .1], true, null, undefined, 'B');
  add('TIE_CHOOSE_SECOND', [.5, .5, 0], true, null, undefined, 'B');
  add('THREE_WAY_TIE', [1/3, 1/3, 1/3], true, null, undefined, 'C');
  add('CHOICE_NOT_MAX', [.2, .7, .1], false, 'PROBABILITY_CHOICE_MISMATCH');
  add('SINGLE_OPTION', [1], true, null, ['A']);
  add('SINGLE_OPTION_NEAR', [.999999999], true, null, ['A']);
  add('SINGLE_OPTION_ZERO', [0], false, 'PROBABILITY_SUM_MISMATCH', ['A']);
  add('NEGATIVE_ZERO', [1, -0, 0], true);

  const mutate = (id, change, category, subcode) => {
    const f = fixture(); change(f.raw, f.request);
    rows.push({ id, ...f, valid: category === null, category, subcode });
  };
  mutate('CHOICE_ABSENT', r => { delete r.answers.q.choice; }, 'MISSING_REQUIRED', 'CHOICE_MISSING');
  mutate('CHOICE_UNKNOWN', r => { r.answers.q.choice = sentinels.join(' '); }, 'INVALID_ENUM', 'CHOICE_UNKNOWN');
  mutate('CHOICE_CASE', r => { r.answers.q.choice = 'a'; }, 'INVALID_ENUM', 'CHOICE_UNKNOWN');
  mutate('CHOICE_SPACE', r => { r.answers.q.choice = ' A '; }, 'INVALID_ENUM', 'CHOICE_UNKNOWN');
  mutate('PROBABILITIES_ABSENT', r => { delete r.answers.q.probabilities; }, 'MISSING_REQUIRED', 'PROBABILITIES_MISSING');
  mutate('PROBABILITIES_UNDEFINED', r => { r.answers.q.probabilities = undefined; }, 'INVALID_PROBABILITIES', 'PROBABILITIES_NOT_OBJECT');
  mutate('PROBABILITIES_NULL', r => { r.answers.q.probabilities = null; }, 'INVALID_PROBABILITIES', 'PROBABILITIES_NOT_OBJECT');
  mutate('PROBABILITIES_ARRAY', r => { r.answers.q.probabilities = [1, 0, 0]; }, 'INVALID_PROBABILITIES', 'PROBABILITIES_NOT_OBJECT');
  mutate('PROBABILITIES_STRING', r => { r.answers.q.probabilities = sentinels.join(' '); }, 'INVALID_PROBABILITIES', 'PROBABILITIES_NOT_OBJECT');
  mutate('PROBABILITIES_EMPTY', r => { r.answers.q.probabilities = {}; }, 'INVALID_PROBABILITIES', 'PROBABILITY_EMPTY');
  mutate('OPTION_MISSING', r => { delete r.answers.q.probabilities.B; }, 'INVALID_PROBABILITIES', 'PROBABILITY_OPTION_MISSING');
  mutate('CHOICE_PROBABILITY_MISSING', r => { delete r.answers.q.probabilities.A; }, 'INVALID_PROBABILITIES', 'PROBABILITY_OPTION_MISSING');
  mutate('OPTION_EXTRA', r => { r.answers.q.probabilities[sentinels.join(' ')] = 0; }, 'INVALID_PROBABILITIES', 'PROBABILITY_UNKNOWN_OPTION');
  mutate('OPTION_REPLACED', r => { delete r.answers.q.probabilities.C; r.answers.q.probabilities[sentinels.join(' ')] = 0; }, 'INVALID_PROBABILITIES', 'PROBABILITY_OPTION_MISSING');
  mutate('QUESTION_MISSING', r => { delete r.answers.q; }, 'INVALID_QUESTIONS', 'PROBABILITY_QUESTION_MISSING');
  mutate('QUESTION_EXTRA', r => { r.answers[sentinels.join(' ')] = structuredClone(r.answers.q); }, 'INVALID_QUESTIONS', 'PROBABILITY_UNKNOWN_QUESTION');
  mutate('ANSWERS_ARRAY', r => { r.answers = []; }, 'INVALID_QUESTIONS', 'INVALID_QUESTIONS');
  mutate('ANSWERS_EMPTY', r => { r.answers = {}; }, 'INVALID_QUESTIONS', 'PROBABILITY_QUESTION_MISSING');
  mutate('OPTION_ORDER', r => { r.answers.q.probabilities = { C: 0, B: 0, A: 1 }; }, null, null);
  mutate('QUESTION_ORDER', (r, req) => {
    req.questions.second = structuredClone(req.questions.q);
    r.answers = { second: structuredClone(r.answers.q), q: r.answers.q };
  }, null, null);
  mutate('NULL_PROTOTYPE', r => { r.answers.q.probabilities = Object.assign(Object.create(null), r.answers.q.probabilities); }, null, null);
  mutate('CUSTOM_PROTOTYPE', r => { r.answers.q.probabilities = Object.assign(Object.create({ inherited: true }), r.answers.q.probabilities); }, 'INVALID_PROBABILITIES', 'PROBABILITIES_NOT_OBJECT');
  mutate('EMPTY_CRITERIA', (r, req) => { req.questions.q.criteria = {}; r.answers.q.probabilities = {}; }, 'INVALID_ENUM', 'CHOICE_UNKNOWN');

  for (const scope of ['QUESTION', 'OPTION', 'CHOICE', 'PROBABILITIES']) for (const unicode of [false, true]) {
    const f = fixture(); const answer = JSON.stringify(f.raw.answers.q);
    const key = scope === 'QUESTION' ? 'q' : scope === 'OPTION' ? 'A' : scope === 'CHOICE' ? 'choice' : 'probabilities';
    const encoded = unicode ? `"\\u${key.charCodeAt(0).toString(16).padStart(4, '0')}${key.slice(1)}"` : JSON.stringify(key);
    let raw;
    if (scope === 'QUESTION') raw = `{"model":"jev-1.14.0","answers":{"q":${answer},${encoded}:${answer}}}`;
    else if (scope === 'OPTION') raw = JSON.stringify(f.raw).replace('"A":1', `"A":1,${encoded}:0`);
    else if (scope === 'CHOICE') raw = JSON.stringify(f.raw).replace('"choice":"A"', `"choice":"A",${encoded}:"B"`);
    else raw = JSON.stringify(f.raw).replace('"probabilities":', `${encoded}:{"A":1,"B":0,"C":0},"probabilities":`);
    rows.push({ id: `DUPLICATE_${scope}_${unicode ? 'UNICODE' : 'LITERAL'}`, request: f.request, raw, valid: false, category: 'DUPLICATE_KEY', subcode: 'PROBABILITY_DUPLICATE_KEY', duplicate_scope: scope });
  }
  for (const token of ['NaN', 'Infinity', '1e999']) {
    const f = fixture(); rows.push({ id: `INVALID_JSON_${token}`, request: f.request,
      raw: JSON.stringify(f.raw).replace('"A":1', `"A":${token}`), valid: false, category: 'INVALID_JSON', subcode: 'INVALID_JSON' });
  }
  return rows;
}

export function withPrivacy(f) {
  if (typeof f.raw === 'string') return { ...f, raw: f.raw.replace('{', `{"secret":${JSON.stringify(sentinels)},"messages":${JSON.stringify(sentinels)},`) };
  const raw = structuredClone(f.raw);
  // structuredClone troca protótipos; preserve a condição negativa da fixture original.
  const probabilities = f.raw.answers.q?.probabilities;
  if (probabilities && typeof probabilities === 'object' && !Array.isArray(probabilities)) Object.setPrototypeOf(raw.answers.q.probabilities, Object.getPrototypeOf(probabilities));
  for (const field of ['prompt', 'messages', 'context', 'candidate_answer', 'chain_of_thought', 'internal_reasoning', 'secret']) raw[field] = sentinels;
  if (raw.usage) raw.usage.debug = sentinels;
  if (raw.answers.q) raw.answers.q.debug = sentinels;
  return { ...f, raw };
}
