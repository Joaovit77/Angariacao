import { buildRequestV2 } from './request-v2.mjs';
import { validationFields } from './matrix-v2.mjs';

// Módulo puro: sem transporte, ambiente, arquivos, logs ou inferência semântica.
const fail = code => { throw new Error(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (value, key, required = true) => {
  if (!object(value)) fail('INVALID_OBJECT');
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) { if (required) fail('MISSING_REQUIRED'); return undefined; }
  if (!Object.hasOwn(descriptor, 'value')) fail('INVALID_ACCESSOR');
  return descriptor.value;
};
const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const modelId = m => typeof m === 'string' && /^jev-[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(m);
const codes = new Set(['INVALID_OBJECT', 'MISSING_REQUIRED', 'INVALID_ACCESSOR', 'INVALID_JSON', 'DUPLICATE_KEY', 'RESPONSE_TOO_LARGE', 'RESPONSE_TOO_DEEP', 'INVALID_MODEL', 'INVALID_QUESTIONS', 'INVALID_ANSWER', 'INVALID_ENUM', 'INVALID_CONFIDENCE', 'INVALID_PROBABILITIES', 'INVALID_USAGE', 'INVALID_CONTEXT', 'INVALID_STAGE']);
const errorCode = error => {
  try { const message = Object.getOwnPropertyDescriptor(error, 'message')?.value; return codes.has(message) ? message : 'INVALID_RESPONSE'; }
  catch { return 'INVALID_RESPONSE'; }
};

// Duplicatas são detectadas no texto, antes de qualquer sobrescrita de propriedade pelo JSON.
export function parseJsonStrict(text) {
  if (typeof text !== 'string') fail('INVALID_JSON');
  if (text.length > 2_097_152 || Buffer.byteLength(text, 'utf8') > 2_097_152) fail('RESPONSE_TOO_LARGE');
  let position = 0;
  const space = () => { while (/[\x20\t\r\n]/.test(text[position] ?? '') && position < text.length) position++; };
  const string = () => {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === '\\') { position++; continue; }
      if (char === '"') {
        try { return JSON.parse(text.slice(start, position)); } catch { fail('INVALID_JSON'); }
      }
    }
    fail('INVALID_JSON');
  };
  const value = depth => {
    if (depth > 64) fail('RESPONSE_TOO_DEEP');
    space(); const char = text[position];
    if (char === '"') return string();
    if (char === '{') {
      position++; space(); const result = Object.create(null), keys = new Set();
      if (text[position] === '}') { position++; return result; }
      while (position < text.length) {
        space(); if (text[position] !== '"') fail('INVALID_JSON');
        const key = string(); if (keys.has(key)) fail('DUPLICATE_KEY'); keys.add(key);
        space(); if (text[position++] !== ':') fail('INVALID_JSON');
        result[key] = value(depth + 1); space(); const separator = text[position++];
        if (separator === '}') return result;
        if (separator !== ',') fail('INVALID_JSON');
      }
      fail('INVALID_JSON');
    }
    if (char === '[') {
      position++; space(); const result = [];
      if (text[position] === ']') { position++; return result; }
      while (position < text.length) {
        result.push(value(depth + 1)); space(); const separator = text[position++];
        if (separator === ']') return result;
        if (separator !== ',') fail('INVALID_JSON');
      }
      fail('INVALID_JSON');
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(literal, position)) { position += literal.length; return result; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(position));
    if (!number) fail('INVALID_JSON'); position += number[0].length;
    const result = Number(number[0]); if (!Number.isFinite(result)) fail('INVALID_JSON'); return result;
  };
  const result = value(0); space(); if (position !== text.length) fail('INVALID_JSON'); return result;
}

export function parseUsage(raw) {
  if (raw === undefined || raw === null) return { status: 'USAGE_MISSING', usage: null };
  try {
    const input = own(raw, 'input_tokens'), output = own(raw, 'output_tokens'), total = own(raw, 'total_tokens', false);
    if (![input, output].every(n => Number.isSafeInteger(n) && n >= 0)
      || (total !== undefined && (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(input + output) || total !== input + output))) fail('INVALID_USAGE');
    return { status: 'USAGE_PRESENT', usage: { input_tokens: input, output_tokens: output, total_tokens: total ?? null } };
  } catch { return { status: 'USAGE_INVALID', usage: null }; }
}

export function parseTypedResponse(raw, request) {
  let requested = null, observed = null, usage = { status: 'USAGE_MISSING', usage: null };
  try {
    requested = own(request, 'model'); if (!modelId(requested)) { requested = null; fail('INVALID_MODEL'); }
    const body = typeof raw === 'string' ? parseJsonStrict(raw) : raw;
    const model = own(body, 'model'); if (!modelId(model)) fail('INVALID_MODEL'); observed = model;
    usage = parseUsage(own(body, 'usage', false)); if (usage.status === 'USAGE_INVALID') fail('INVALID_USAGE');
    const answers = own(body, 'answers'), questions = own(request, 'questions');
    if (!object(answers) || !object(questions)) fail('INVALID_QUESTIONS');
    const ids = Object.keys(questions);
    if (Object.keys(answers).length !== ids.length || Object.keys(answers).some(id => !Object.hasOwn(questions, id))) fail('INVALID_QUESTIONS');
    const safe = {};
    for (const id of ids) {
      const answer = own(answers, id), question = own(questions, id);
      if (own(question, 'type') !== 'choice' || own(answer, 'type') !== 'choice') fail('INVALID_ANSWER');
      const criteria = own(question, 'criteria'); if (!object(criteria)) fail('INVALID_QUESTIONS');
      const choices = Object.keys(criteria), selected = own(answer, 'choice');
      if (typeof selected !== 'string' || !choices.includes(selected)) fail('INVALID_ENUM');
      const confidence = own(answer, 'confidence'); if (!unit(confidence)) fail('INVALID_CONFIDENCE');
      const probabilities = own(answer, 'probabilities');
      if (!object(probabilities) || Object.keys(probabilities).length !== choices.length || Object.keys(probabilities).some(k => !choices.includes(k))) fail('INVALID_PROBABILITIES');
      const pairs = choices.map(k => [k, own(probabilities, k)]);
      if (pairs.some(([, n]) => !unit(n)) || Math.abs(pairs.reduce((s, [, n]) => s + n, 0) - 1) > 0.000001
        || own(probabilities, selected) < Math.max(...pairs.map(([, n]) => n))) fail('INVALID_PROBABILITIES');
      safe[id] = { type: 'choice', choice: selected, confidence, probabilities: Object.fromEntries(pairs) };
    }
    return { status: 'COMPLETED', answers: safe, error: null, model_requested: requested, model_observed: observed,
      model_mismatch: requested !== observed, usage_status: usage.status, usage: usage.usage };
  } catch (error) {
    return { status: 'INVALID_RESPONSE', answers: null, error: { type: 'PARSE_ERROR', code: errorCode(error) },
      model_requested: requested, model_observed: observed,
      model_mismatch: observed === null ? null : requested !== observed, usage_status: usage.status, usage: usage.usage };
  }
}

export function parseV2Response(raw, c, stage) {
  let request;
  try {
    if (!['decision', 'validation'].includes(stage)) fail('INVALID_STAGE');
    for (const list of [c.input.property_context.current_facts, c.input.conversation_context, c.input.available_protocols]) {
      if (!Array.isArray(list) || list.some(item => typeof item.id !== 'string' || !/^[a-z][A-Za-z0-9-]{0,79}$/.test(item.id)) || new Set(list.map(item => item.id)).size !== list.length) fail('INVALID_CONTEXT');
    }
    request = buildRequestV2({ input: c.input }, stage);
  } catch (error) {
    return { status: 'INVALID_RESPONSE', result: null, error: { type: 'PARSE_ERROR', code: errorCode(error) },
      model_requested: 'jev-1.14.0', model_observed: null, model_mismatch: null, usage_status: 'USAGE_MISSING', usage: null, question_observations: null };
  }
  const parsed = parseTypedResponse(raw, request);
  if (parsed.status !== 'COMPLETED') return { ...parsed, result: null, question_observations: null };
  const a = parsed.answers, select = prefix => Object.entries(a).filter(([id, answer]) => id.startsWith(prefix) && answer.choice === 'YES').map(([id]) => id.slice(prefix.length));
  let result;
  if (stage === 'decision') {
    result = {
      action: a.action.choice, intent: a.intent.choice, enough_context: a.enough_context.choice === 'YES',
      relevant_current_facts: c.input.property_context.current_facts.filter((_, i) => a[`current_${i}`].choice === 'YES').map(f => f.id),
      relevant_historical_facts: c.input.conversation_context.filter((_, i) => a[`history_${i}`].choice === 'YES').map(h => h.id),
      missing_information: select('missing_'),
      applicable_protocols: c.input.available_protocols.filter((_, i) => a[`protocol_${i}`].choice === 'YES').map(p => p.id),
      prohibited_assumptions: select('prohibited_'), entity_resolution: a.entity_resolution.choice,
      temporal_resolution: select('temporal_'), confidence: a.action.confidence,
    };
  } else {
    const dimensions = Object.fromEntries(validationFields.map(f => [f, a[f].choice]));
    // Projeção dos FAIL explicitamente retornados nas perguntas nomeadas; nunca do veredicto.
    result = { verdict: a.verdict.choice, dimensions, reasons: validationFields.filter(f => a[f].choice === 'FAIL'), confidence: a.verdict.confidence };
  }
  const { answers, ...metadata } = parsed;
  return { ...metadata, result, question_observations: answers };
}
