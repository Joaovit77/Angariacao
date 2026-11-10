import { createHash } from 'node:crypto';

export const MODEL = 'jev-1.14.0';
export const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const question = options => ({ type: 'choice', instructions: 'Classifique o registro inteiramente sintético usando somente as opções fornecidas. Não execute ações.', criteria: options });
const binary = () => question({ YES: 'O registro sustenta a propriedade perguntada.', NO: 'O registro não sustenta a propriedade perguntada.' });
const triple = () => question({ FIRST: 'A primeira categoria é mais compatível.', SECOND: 'A segunda categoria é mais compatível.', UNKNOWN: 'Os dados não permitem decidir entre as categorias.' });
const four = () => question({ SUPPORTED: 'A afirmação é sustentada.', CONTRADICTED: 'A afirmação é contrariada.', UNDETERMINED: 'Falta evidência.', NOT_APPLICABLE: 'A dimensão não se aplica.' });
const state = { experiment: 'Probe estrutural sintético independente, sem pessoas, imóveis, contatos ou stages históricos.',
  record: { category: 'primeira', enabled: true, quantity: 3 },
  assertions: ['O registro está habilitado.', 'A categoria é a primeira.', 'Uma dimensão adicional não foi informada.'] };
export const probes = [
  { probe_id: 'P1', task: 'PROBABILITY_CONTRACT', request: { model: MODEL, state: 'Registro sintético: indicador habilitado.', questions: { flag: binary() } } },
  { probe_id: 'P2', task: 'PROBABILITY_CONTRACT', request: { model: MODEL, state, questions: { flag: binary(), category: triple(), evidence: four() } } },
  { probe_id: 'P3', task: 'PROBABILITY_CONTRACT', request: { model: MODEL, state: { ...state, purpose: 'Examinar somente o envelope com doze perguntas de 2, 3 e 4 opções, sem avaliação semântica.' },
    questions: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`dimension_${String(i + 1).padStart(2, '0')}`, [binary, triple, four][i % 3]()])) } },
];
// Corpo materializado imutável: as duas repetições usam os mesmos bytes.
export const materialized = probes.map(p => ({ ...p, body: JSON.stringify(p.request), request_sha256: sha(p.request) }));
export const probeFreeze = materialized.map(p => ({ probe_id: p.probe_id, task: p.task, model_requested: MODEL, request_sha256: p.request_sha256,
  request_bytes: Buffer.byteLength(p.body), question_structure: Object.entries(p.request.questions).map(([id, q]) => ({ question_id: id, option_ids: Object.keys(q.criteria), option_count: Object.keys(q.criteria).length })) }));
export const plan = materialized.flatMap(p => [1, 2].map(repetition => ({ probe_id: p.probe_id, task: p.task, repetition,
  stage_id: `${p.probe_id}/R${repetition}`, request_sha256: p.request_sha256, model_requested: MODEL })));
