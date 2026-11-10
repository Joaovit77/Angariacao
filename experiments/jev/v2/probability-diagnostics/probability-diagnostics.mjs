import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import { parseTypedResponse, parseV2Response, parseJsonStrict } from '../adapter-v2.mjs';
import { buildRequestV2 } from '../request-v2.mjs';

// Observabilidade pura: o parser congelado continua sendo a única autoridade de aceitação.
const sha = text => createHash('sha256').update(text).digest('hex');
const opaque = id => `unknown-sha256:${sha(id)}`;
const plain = value => {
  if (isProxy(value)) throw new Error('SAFE_INSPECTION_UNAVAILABLE');
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
};
const data = (value, key) => {
  if (!plain(value)) throw new Error('SAFE_INSPECTION_UNAVAILABLE');
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (d && !Object.hasOwn(d, 'value')) throw new Error('SAFE_INSPECTION_UNAVAILABLE');
  return d ? d.value : undefined;
};
const keys = value => { if (!plain(value)) throw new Error('SAFE_INSPECTION_UNAVAILABLE'); return Object.keys(value); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const unit = value => finite(value) && value >= 0 && value <= 1;
const type = value => value === null ? 'null' : typeof value;
const model = value => typeof value === 'string' && /^jev-[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(value) ? value : null;
const emptyVector = () => ({ question_id: null, expected_option_count: null, observed_option_count: null,
  missing_option_ids: [], unknown_option_ids: [], sum: null, sum_delta_from_1: null,
  min_probability: null, max_probability: null, chosen_option: null, max_option_ids: [],
  is_finite: null, value_type_summary: {} });

function vector(questionId, expected, answer) {
  const row = { ...emptyVector(), question_id: questionId, expected_option_count: expected.length };
  const selected = data(answer, 'choice');
  row.chosen_option = typeof selected === 'string' ? (expected.includes(selected) ? selected : opaque(selected)) : null;
  const p = data(answer, 'probabilities');
  if (!Object.hasOwn(answer, 'probabilities')) return { ...row, error_code: 'PROBABILITIES_MISSING' };
  if (!plain(p)) return { ...row, error_code: 'PROBABILITIES_NOT_OBJECT' };
  const observed = keys(p);
  row.observed_option_count = observed.length;
  row.missing_option_ids = expected.filter(k => !observed.includes(k));
  row.unknown_option_ids = observed.filter(k => !expected.includes(k)).map(opaque);
  // Somente opções esperadas são inspecionadas; extras hostis não são executados.
  const values = expected.filter(k => observed.includes(k)).map(k => [k, data(p, k)]);
  for (const [, n] of values) row.value_type_summary[type(n)] = (row.value_type_summary[type(n)] ?? 0) + 1;
  row.is_finite = values.every(([, n]) => finite(n));
  if (values.length && row.is_finite) {
    const numbers = values.map(([, n]) => n);
    const sum = numbers.reduce((s, n) => s + n, 0);
    row.sum = Number.isFinite(sum) ? sum : null;
    row.sum_delta_from_1 = Number.isFinite(sum) ? sum - 1 : null;
    row.min_probability = Math.min(...numbers); row.max_probability = Math.max(...numbers);
    row.max_option_ids = values.filter(([, n]) => n === row.max_probability).map(([k]) => k);
  }
  let code = null;
  if (!observed.length) code = 'PROBABILITY_EMPTY';
  else if (row.missing_option_ids.length) code = 'PROBABILITY_OPTION_MISSING';
  else if (row.unknown_option_ids.length) code = 'PROBABILITY_UNKNOWN_OPTION';
  else if (values.some(([, n]) => typeof n !== 'number')) code = 'PROBABILITY_NOT_NUMBER';
  else if (!row.is_finite) code = 'PROBABILITY_NOT_FINITE';
  else if (values.some(([, n]) => n < 0)) code = 'PROBABILITY_BELOW_ZERO';
  else if (values.some(([, n]) => n > 1)) code = 'PROBABILITY_ABOVE_ONE';
  else if (Math.abs(row.sum - 1) > 0.000001) code = 'PROBABILITY_SUM_MISMATCH';
  else if (typeof selected === 'string' && expected.includes(selected) && data(p, selected) < row.max_probability) code = 'PROBABILITY_CHOICE_MISMATCH';
  return { ...row, error_code: code };
}

// Segunda leitura lexical apenas para localizar duplicata já recusada pelo parser original.
// Nunca usa JSON.parse no objeto inteiro, que sobrescreveria a chave duplicada.
function duplicateLocation(text, questions) {
  let i = 0;
  const ws = () => { while (i < text.length && /[\x20\t\r\n]/.test(text[i])) i++; };
  const string = () => {
    const start = i++;
    while (i < text.length) { const ch = text[i++]; if (ch === '\\') { i++; continue; } if (ch === '"') return JSON.parse(text.slice(start, i)); }
    throw new Error('SAFE_INSPECTION_UNAVAILABLE');
  };
  const visit = (path, depth = 0) => {
    if (depth > 64) throw new Error('SAFE_INSPECTION_UNAVAILABLE');
    ws();
    if (text[i] === '"') { string(); return; }
    if (text[i] === '{') {
      i++; ws(); const seen = new Set(); if (text[i] === '}') { i++; return; }
      while (i < text.length) {
        ws(); if (text[i] !== '"') throw new Error('SAFE_INSPECTION_UNAVAILABLE');
        const key = string();
        if (seen.has(key)) {
          const knownQ = path[0] === 'answers' && Object.hasOwn(questions, path[1] ?? '') ? path[1] : null;
          const scope = path.length === 1 && path[0] === 'answers' ? 'QUESTION'
            : path.length === 3 && knownQ && path[2] === 'probabilities' ? 'OPTION'
              : path.length === 2 && knownQ && key === 'choice' ? 'CHOICE'
                : path.length === 2 && knownQ && key === 'probabilities' ? 'PROBABILITIES' : 'OTHER';
          throw { duplicate: true, question_id: scope === 'QUESTION' && Object.hasOwn(questions, key) ? key : knownQ, scope };
        }
        seen.add(key); ws(); if (text[i++] !== ':') throw new Error('SAFE_INSPECTION_UNAVAILABLE');
        visit([...path, key], depth + 1); ws(); const separator = text[i++];
        if (separator === '}') return; if (separator !== ',') throw new Error('SAFE_INSPECTION_UNAVAILABLE');
      }
    } else if (text[i] === '[') {
      i++; ws(); if (text[i] === ']') { i++; return; }
      while (i < text.length) { visit([...path, null], depth + 1); ws(); const separator = text[i++]; if (separator === ']') return; if (separator !== ',') throw new Error('SAFE_INSPECTION_UNAVAILABLE'); }
    } else {
      const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i));
      if (!token) throw new Error('SAFE_INSPECTION_UNAVAILABLE'); i += token[0].length; return;
    }
    throw new Error('SAFE_INSPECTION_UNAVAILABLE');
  };
  try { visit([]); } catch (e) {
    if (e?.duplicate === true) return { question_id: e.question_id, duplicate_scope: e.scope,
      error_code: e.scope === 'OTHER' ? 'DUPLICATE_KEY' : 'PROBABILITY_DUPLICATE_KEY' };
    throw new Error('SAFE_INSPECTION_UNAVAILABLE');
  }
  throw new Error('SAFE_INSPECTION_UNAVAILABLE');
}

function identityFields(identity) {
  try {
    const stage = data(identity, 'stage_id'), attempt = data(identity, 'attempt_id');
    return { stage_id: ['decision', 'validation', 'probability-contract'].includes(stage) ? stage : null,
      attempt_id: typeof attempt === 'string' && /^(?:s2c-offline-a[0-9]{3}|jev-s2b-[0-9]{13}-[0-9]{8}-a[0-9]{3})$/.test(attempt) ? attempt : null };
  } catch { return { stage_id: null, attempt_id: null }; }
}

function diagnose(raw, request, parsed, identity) {
  const base = { ...emptyVector(), error_code: parsed.error?.code ?? null,
    category: parsed.error?.code ?? null, raw_sha256: typeof raw === 'string' ? sha(raw) : null,
    model_requested: model(parsed.model_requested), model_observed: model(parsed.model_observed), ...identityFields(identity) };
  if (parsed.status === 'COMPLETED') return null;
  try {
    const questions = data(request, 'questions'), ids = keys(questions);
    if (parsed.error?.code === 'DUPLICATE_KEY' && typeof raw === 'string') {
      const location = duplicateLocation(raw, questions);
      return { ...base, ...location, expected_option_count: location.question_id === null ? null : keys(data(data(questions, location.question_id), 'criteria')).length };
    }
    // Falhas anteriores ao envelope de perguntas não são atribuídas às probabilidades.
    if (!['INVALID_QUESTIONS', 'INVALID_ANSWER', 'INVALID_ENUM', 'INVALID_CONFIDENCE', 'INVALID_PROBABILITIES', 'MISSING_REQUIRED', 'INVALID_ACCESSOR', 'INVALID_RESPONSE'].includes(parsed.error?.code)) return base;
    const body = typeof raw === 'string' ? parseJsonStrict(raw) : raw;
    if (!plain(body)) return base;
    if (!model(data(body, 'model'))) return base;
    const answers = data(body, 'answers'); if (!plain(answers)) return base;
    const observed = keys(answers);
    const missing = ids.filter(id => !observed.includes(id)), unknown = observed.filter(id => !ids.includes(id));
    if (missing.length || unknown.length) return { ...base, error_code: missing.length ? 'PROBABILITY_QUESTION_MISSING' : 'PROBABILITY_UNKNOWN_QUESTION',
      question_id: missing[0] ?? null, missing_question_ids: missing, unknown_question_ids: unknown.map(opaque),
      expected_question_count: ids.length, observed_question_count: observed.length };
    for (const id of ids) {
      const answer = data(answers, id), question = data(questions, id);
      if (!plain(answer) || data(answer, 'type') !== 'choice' || data(question, 'type') !== 'choice') return { ...base, question_id: id };
      const expected = keys(data(question, 'criteria'));
      const selected = data(answer, 'choice');
      if (typeof selected !== 'string' || !expected.includes(selected)) return { ...base, question_id: id,
        expected_option_count: expected.length, chosen_option: typeof selected === 'string' ? opaque(selected) : null,
        error_code: selected === undefined ? 'CHOICE_MISSING' : 'CHOICE_UNKNOWN' };
      if (!unit(data(answer, 'confidence'))) return { ...base, question_id: id };
      const row = vector(id, expected, answer);
      if (row.error_code) return { ...base, ...row };
    }
    return base;
  } catch { return { ...base, error_code: 'SAFE_INSPECTION_UNAVAILABLE' }; }
}

// request e identidade pertencem ao plano local confiável; o corpo do provedor é não confiável.
// parsed é retornado diretamente, sem reconstrução, coerção, correção ou alteração do scorer.
export function parseTypedResponseWithDiagnostics(raw, request, identity = {}) {
  const parsed = parseTypedResponse(raw, request);
  return { parsed, diagnostic: diagnose(raw, request, parsed, identity) };
}

export function parseV2ResponseWithDiagnostics(raw, c, stage, identity = {}) {
  const parsed = parseV2Response(raw, c, stage);
  if (['INVALID_CONTEXT', 'INVALID_STAGE'].includes(parsed.error?.code)) return { parsed, diagnostic: {
    ...emptyVector(), error_code: parsed.error.code, category: parsed.error.code,
    raw_sha256: typeof raw === 'string' ? sha(raw) : null, model_requested: model(parsed.model_requested),
    model_observed: null, ...identityFields(identity) } };
  try { return { parsed, diagnostic: diagnose(raw, buildRequestV2(c, stage), parsed, identity) }; }
  catch { return { parsed, diagnostic: parsed.status === 'COMPLETED' ? null : {
    ...emptyVector(), error_code: 'SAFE_INSPECTION_UNAVAILABLE', category: parsed.error?.code ?? null,
    raw_sha256: typeof raw === 'string' ? sha(raw) : null, model_requested: model(parsed.model_requested),
    model_observed: model(parsed.model_observed), ...identityFields(identity) } }; }
}

// Caracterização somente de projeções já aceitas, sem persistir os valores textuais descartados.
export function characterizeAccepted(answers, request) {
  return keys(data(request, 'questions')).map(id => {
    const expected = keys(data(data(data(request, 'questions'), id), 'criteria'));
    const row = vector(id, expected, data(answers, id));
    const probabilities = data(data(answers, id), 'probabilities');
    const decimals = expected.map(k => {
      const n = data(probabilities, k), s = String(n).toLowerCase(), [mantissa, exponent = '0'] = s.split('e');
      return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent));
    });
    return { ...row, decimal_places_shortest_js: decimals, choice_is_max: row.max_option_ids.includes(row.chosen_option) };
  });
}
