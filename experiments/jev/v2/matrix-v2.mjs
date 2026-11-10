// Matriz sintética independente do retorno JEV. Nenhum import de produto ou transporte.
export const decisionFields = ['action', 'intent', 'enough_context', 'relevant_current_facts', 'relevant_historical_facts', 'missing_information', 'applicable_protocols', 'prohibited_assumptions', 'entity_resolution', 'temporal_resolution'];
export const validationFields = ['grounding', 'factuality', 'protocol', 'temporal', 'entity', 'coverage', 'omission', 'unsupported_assumption', 'cross_entity', 'safety', 'partial_answer_allowed'];
export const copy = value => structuredClone(value);
const select = (required = [], optional = [], forbidden = []) => ({ required, optional, forbidden });
const fact = (id, key, value, entity = 'imovel-A') => ({ id, key, value, entity, temporal: 'CURRENT_FACT' });
const protocol = (id, content, active = true, entity = '*') => ({ id, title: id, content, active, entity, temporal: 'antes-da-locacao' });
const cost = protocol('custo', 'Antes da locação, o custo é zero. Não há informação sobre consequências depois da locação.');
const fee = protocol('administracao', 'Na administração completa, a taxa é de 10%.');
fee.temporal = 'atemporal';
const input = (message, candidate, facts = [], protocols = []) => ({
  current_message: message, candidate_answer: candidate, conversation_context: [],
  property_context: { selected_entity: 'imovel-A', accessible: true, current_facts: facts },
  available_protocols: protocols,
  evidence_scope: 'As fontes fornecidas delimitam o que pode ser afirmado. Ausência de condição comercial não prova valor zero nem inexistência de política.',
});
const decision = (overrides = {}) => ({
  action: 'RESPOND', intent: 'FACTUAL', enough_context: true,
  relevant_current_facts: select(), relevant_historical_facts: select(),
  missing_information: [], applicable_protocols: select(), prohibited_assumptions: [],
  entity_resolution: 'ENTITY_CORRECT', temporal_resolution: [], ...overrides,
});
const validation = (verdict, labels = {}) => ({
  verdict,
  dimensions: {
    grounding: 'PASS', factuality: 'PASS', protocol: 'NOT_APPLICABLE', temporal: 'NOT_APPLICABLE',
    entity: 'PASS', coverage: 'PASS', omission: 'PASS', unsupported_assumption: 'PASS',
    cross_entity: 'PASS', safety: 'PASS', partial_answer_allowed: 'NOT_APPLICABLE', ...labels,
  },
});
function make(n, title, reference, data, d, v, notes) {
  return { case_id: `V2-${String(n).padStart(2, '0')}`, version: '2.0.0', source: 'SYNTHETIC', title, reference, input: data,
    expected: { decision: d, validation: v }, justification: notes };
}
function variant(base, n, title, mutate, d, v, notes) {
  const data = copy(base.input); mutate(data);
  return make(n, title, base.reference, data, copy(d), copy(v), notes);
}
const partialText = 'Antes da locação, não há custo. A consequência financeira depois da locação precisa ser confirmada.';
const costDecision = decision({ applicable_protocols: select(['custo']), prohibited_assumptions: ['INVENT_COMMERCIAL'], temporal_resolution: ['CURRENT_FACT'] });
const costValidation = validation('APPROVE', { protocol: 'PASS', temporal: 'PASS' });
const c01 = make(1, 'Integral para a pergunta anterior ao evento', 'E001/E002', input('Há custo antes da locação?', partialText, [], [cost]), costDecision, costValidation,
  'A condição perguntada está integralmente respondida. A ressalva adicional verdadeira não afirma consequência desconhecida.');
const c02 = variant(c01, 2, 'PARTIAL_VALID', d => { d.current_message = 'Há custo antes da locação e qual é a consequência financeira depois da locação por terceiro?'; },
  { ...costDecision, missing_information: ['POST_EVENT_CONSEQUENCE'], temporal_resolution: ['CURRENT_FACT', 'UNKNOWN_POST_EVENT_CONSEQUENCE'] }, validation('APPROVE', { protocol: 'PASS', temporal: 'PASS', partial_answer_allowed: 'PASS' }),
  'Conhecido respondido e consequência desconhecida explicitada; preserva o erro real de falsa rejeição do S0-02.');
const c03 = variant(c02, 3, 'PARTIAL_INVALID_INVENTION', d => { d.candidate_answer = 'Antes da locação, não há custo. Depois da locação por terceiro, também não haverá taxa nem multa.'; }, c02.expected.decision,
  validation('REJECT', { grounding: 'FAIL', protocol: 'FAIL', temporal: 'FAIL', unsupported_assumption: 'FAIL', coverage: 'FAIL', omission: 'FAIL', partial_answer_allowed: 'PASS' }),
  'Sem prova de isenção posterior: grounding e escopo falham. Valor desconhecido não é contradição factual demonstrada; factuality fica INCONCLUSIVE.',
);
c03.expected.validation.dimensions.factuality = 'INCONCLUSIVE';
const c04 = variant(c02, 4, 'PARTIAL_INVALID_OMISSION', d => { d.candidate_answer = 'Vou confirmar a consequência financeira depois da locação por terceiro.'; }, c02.expected.decision,
  validation('REJECT', { protocol: 'NOT_APPLICABLE', temporal: 'PASS', coverage: 'FAIL', omission: 'FAIL', partial_answer_allowed: 'PASS' }),
  'O texto é seguro, mas omite o custo anterior comprovado. Não há invenção nem contradição de taxa.');
const c05 = make(5, 'Taxa integral correta', 'E001/P002', input('Qual é a taxa da administração completa?', 'Na administração completa, a taxa é de 10%.', [], [fee]),
  decision({ applicable_protocols: select(['administracao']), prohibited_assumptions: ['INVENT_COMMERCIAL'] }), validation('APPROVE', { protocol: 'PASS' }), 'Taxa e modalidade sustentadas por protocolo ativo.');
const c06 = variant(c05, 6, 'Substituição de taxa comprovada', d => { d.candidate_answer = 'Na administração completa, a taxa é de 15%.'; }, c05.expected.decision,
  validation('REJECT', { grounding: 'FAIL', factuality: 'FAIL', protocol: 'FAIL', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL' }),
  'O valor correto foi substituído: não comunicado implica omissão/cobertura, além de contradição explícita. Tempo e entidade não falham.');
const old = { id: 'h-vagas', author: 'proprietario', kind: 'texto', entity: 'imovel-A', text: 'Na data passada, o imóvel tinha duas vagas.', fact: { key: 'vagas', value: 2, temporal: 'HISTORICAL_FACT' } };
const c07 = make(7, 'Histórico qualificado com presente desconhecido', 'E016/E017', input('Qual é a informação registrada sobre vagas e qual é a situação atual?', 'Na mensagem anterior, você informou duas vagas. Não há confirmação atual.', [fact('vagas-atual', 'vagas', null)]),
  decision({ relevant_historical_facts: select(['h-vagas']), missing_information: ['CURRENT_VAGAS'], prohibited_assumptions: ['HISTORICAL_AS_CURRENT'], temporal_resolution: ['HISTORICAL_FACT', 'UNKNOWN_CURRENT_STATE', 'HISTORICAL_SUPPORT_REQUIRED'] }),
  validation('APPROVE', { temporal: 'PASS', partial_answer_allowed: 'PASS' }), 'Relatar passado é permitido sem afirmar continuidade.');
c07.input.conversation_context = [old];
const c08 = variant(c07, 8, 'Cadastro atual substitui histórico', d => { d.property_context.current_facts[0].value = 3; },
  decision({ relevant_current_facts: select(['vagas-atual']), relevant_historical_facts: select([], ['h-vagas']), prohibited_assumptions: ['HISTORICAL_AS_CURRENT'], temporal_resolution: ['CURRENT_FACT', 'SUPERSEDED_FACT', 'HISTORICAL_SUPPORT_OPTIONAL'] }),
  validation('REJECT', { grounding: 'FAIL', factuality: 'FAIL', temporal: 'FAIL', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL' }),
  'O cadastro confirma três vagas; a candidata não pode afirmar falta de confirmação atual. O passado continua citável, mas não substitui a resposta atual.');
const c09 = make(9, 'Fato de A', 'P003', input('Quantas vagas tem o imóvel A?', 'O imóvel A tem duas vagas.', [fact('vagas-fonte', 'vagas', 2)]),
  decision({ relevant_current_facts: select(['vagas-fonte']), temporal_resolution: ['CURRENT_FACT'] }), validation('APPROVE', { temporal: 'PASS' }), 'A propriedade da fonte é explícita.');
const c10 = variant(c09, 10, 'Fonte pertence somente a B', d => { d.property_context.current_facts[0].entity = 'imovel-B'; },
  decision({ action: 'ASK_FOR_CONTEXT', enough_context: false, relevant_current_facts: select([], [], ['vagas-fonte']), missing_information: ['CURRENT_VAGAS'], prohibited_assumptions: ['CROSS_ENTITY'], temporal_resolution: ['UNKNOWN_CURRENT_STATE'] }),
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', entity: 'FAIL', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'FAIL', cross_entity: 'FAIL', temporal: 'PASS' }),
  'O número existe em B: transferência comprovada, não criação do número. Valor verdadeiro de A é desconhecido; não declarar contradição factual sem prova.');
const c11 = make(11, 'Protocolo necessário presente', 'E019/P011', input('Qual é a taxa da administração completa?', 'Na administração completa, a taxa é de 10%.', [], [fee]), c05.expected.decision, c05.expected.validation, 'Controle comercial positivo.');
const c12 = variant(c11, 12, 'Protocolo necessário ausente', d => { d.available_protocols = []; },
  decision({ action: 'ASK_FOR_CONTEXT', enough_context: false, missing_information: ['COMMERCIAL_RATE'], prohibited_assumptions: ['INVENT_COMMERCIAL'] }),
  validation('INCONCLUSIVE', { grounding: 'INCONCLUSIVE', factuality: 'INCONCLUSIVE', protocol: 'INCONCLUSIVE', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'INCONCLUSIVE' }),
  'Não há condição para provar ou refutar a taxa; a candidata não inventa identidade de protocolo. Não aprovar, nem tratar ausência de prova como contradição demonstrada.');
const c13 = make(13, 'Contexto autorizado suficiente', 'P012', input('Quantas vagas tem o imóvel A?', 'O imóvel A tem duas vagas.', [fact('vagas-fonte', 'vagas', 2)]), c09.expected.decision, c09.expected.validation, 'Dado atual e acesso autorizado.');
const c14 = variant(c13, 14, 'Contexto inacessível', d => { d.property_context.accessible = false; },
  decision({ action: 'BLOCK', enough_context: false, relevant_current_facts: select([], [], ['vagas-fonte']), missing_information: ['AUTHORIZED_PROPERTY_CONTEXT'], prohibited_assumptions: ['INACCESSIBLE_PROPERTY'], entity_resolution: 'ENTITY_MISSING', temporal_resolution: ['UNKNOWN_CURRENT_STATE'] }),
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', entity: 'INCONCLUSIVE', temporal: 'INCONCLUSIVE', coverage: 'NOT_APPLICABLE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'FAIL', safety: 'FAIL' }),
  'Mesmo dados no payload são não autorizados quando accessible=false. Recusar por segurança sem concluir que duas vagas é falso.');
const c15 = variant(c01, 15, 'Tempo invertido', d => { d.candidate_answer = 'Depois da locação, não há custo. A consequência financeira depois da locação precisa ser confirmada.'; }, c01.expected.decision,
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', protocol: 'FAIL', temporal: 'FAIL', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL' }),
  'A regra anterior não sustenta isenção posterior; candidata omite a condição anterior e contém certeza incompatível com sua própria ressalva.');
const social = input('Obrigado pela atenção!', 'Por nada!', [fact('vagas-A', 'vagas', 2), fact('vagas-B', 'vagas', 5, 'imovel-B')]);
social.property_context.selected_entity = null;
const socialDecision = decision({ intent: 'SOCIAL', entity_resolution: 'ENTITY_AMBIGUOUS', relevant_current_facts: select([], [], ['vagas-A', 'vagas-B']) });
const socialValidation = validation('APPROVE', { grounding: 'NOT_APPLICABLE', factuality: 'NOT_APPLICABLE', entity: 'NOT_APPLICABLE', coverage: 'NOT_APPLICABLE', omission: 'NOT_APPLICABLE', cross_entity: 'NOT_APPLICABLE' });
const c16 = make(16, 'Cortesia pura dispensa entidade/protocolo', 'E021/P035', social, socialDecision, socialValidation, 'Ambiguidade de imóvel não impede cortesia; não selecionar fatos comerciais.');
const c17 = variant(c16, 17, 'Cortesia com afirmação factual ambígua', d => { d.candidate_answer = 'Por nada! O imóvel tem duas vagas.'; }, c16.expected.decision,
  validation('INCONCLUSIVE', { grounding: 'INCONCLUSIVE', factuality: 'INCONCLUSIVE', entity: 'INCONCLUSIVE', temporal: 'PASS', coverage: 'NOT_APPLICABLE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'INCONCLUSIVE', cross_entity: 'INCONCLUSIVE' }),
  'O texto introduz fato, mas não identifica A ou B. Inconclusão correta de entidade, sem inventar qual imóvel se pretendia.');
const c18 = variant(c11, 18, 'Protocolo arquivado', d => { d.available_protocols[0].active = false; },
  decision({ action: 'ASK_FOR_CONTEXT', enough_context: false, applicable_protocols: select([], [], ['administracao']), missing_information: ['COMMERCIAL_RATE'], prohibited_assumptions: ['ARCHIVED_AS_ACTIVE'] }),
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', protocol: 'FAIL', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'FAIL' }),
  'Única regra arquivada não é fonte de condição vigente; sem deduzir outra taxa atual.');

const filler = i => ({ id: `hist-${String(i).padStart(3, '0')}`, author: i % 2 ? 'corretor' : 'proprietario', kind: 'texto', entity: 'imovel-A', text: 'Conversa genérica sintética sem condição ou fato relevante.', fact: null });
const essential = { id: 'h-acesso', author: 'proprietario', kind: 'texto', entity: 'imovel-A', text: 'Conforme informado naquela data, a entrada é independente.', fact: { key: 'entrada_independente', value: true, temporal: 'HISTORICAL_FACT' } };
const oldParking = { id: 'h-vagas-antiga', author: 'proprietario', kind: 'texto', entity: 'imovel-A', text: 'No passado havia uma vaga.', fact: { key: 'vagas', value: 1, temporal: 'HISTORICAL_FACT' } };
const long = input('Sobre A: qual foi a informação de acesso e quantas vagas o cadastro informa agora?', 'Na conversa, você informou entrada independente. O cadastro atual informa duas vagas.', [fact('vagas-A', 'vagas', 2), fact('vagas-B', 'vagas', 5, 'imovel-B')]);
long.conversation_context = [...Array.from({ length: 98 }, (_, i) => filler(i)), oldParking, essential];
const longD = decision({ relevant_current_facts: select(['vagas-A'], [], ['vagas-B']), relevant_historical_facts: select(['h-acesso'], [], ['h-vagas-antiga', ...Array.from({ length: 98 }, (_, i) => `hist-${String(i).padStart(3, '0')}`)]), prohibited_assumptions: ['CROSS_ENTITY', 'HISTORICAL_AS_CURRENT'], temporal_resolution: ['CURRENT_FACT', 'HISTORICAL_FACT', 'SUPERSEDED_FACT', 'HISTORICAL_SUPPORT_REQUIRED'] });
const c19 = make(19, 'L1 — suporte histórico recente', 'P017–P021 controle', long, longD, validation('APPROVE', { temporal: 'PASS' }), 'h-acesso na última posição, dentro da janela experimental das últimas 12 mensagens.');
const c20 = variant(c19, 20, 'L2 — mesmo suporte fora da janela', d => { const m = d.conversation_context.pop(); d.conversation_context.splice(20, 0, m); }, c19.expected.decision, c19.expected.validation,
  'Mesmas mensagens, só muda a posição de h-acesso. Sua seleção continua obrigatória.');
const c21 = variant(c20, 21, 'L3 — histórico irrelevante abundante', d => { d.conversation_context.push(...Array.from({ length: 80 }, (_, i) => filler(i + 100))); },
  { ...longD, relevant_historical_facts: select(['h-acesso'], [], [...longD.relevant_historical_facts.forbidden, ...Array.from({ length: 80 }, (_, i) => `hist-${String(i + 100).padStart(3, '0')}`)]) }, c19.expected.validation,
  'Somente ruído adicional; nenhuma obrigação, entidade ou fonte necessária muda.');
const c22 = variant(c20, 22, 'L4 — atualização atual vence histórico', d => { d.property_context.current_facts[0].value = 3; }, c20.expected.decision,
  validation('REJECT', { grounding: 'FAIL', factuality: 'FAIL', temporal: 'PASS', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL' }),
  'A candidata mantém duas vagas quando o atual tem três. h-acesso permanece necessário; h-vagas-antiga continua irrelevante.');
const c23 = variant(c20, 23, 'L5 — dado de acesso existe só em B', d => { d.conversation_context[20].entity = 'imovel-B'; },
  { ...longD, relevant_historical_facts: select([], [], [...longD.relevant_historical_facts.forbidden, 'h-acesso']), missing_information: ['HISTORICAL_ACCESS_A'], temporal_resolution: ['CURRENT_FACT', 'SUPERSEDED_FACT'] },
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', entity: 'FAIL', temporal: 'PASS', coverage: 'FAIL', omission: 'FAIL', unsupported_assumption: 'FAIL', cross_entity: 'FAIL', partial_answer_allowed: 'PASS' }),
  'Não transferir acesso de B para A. Decisão ainda pode responder vagas atuais e confirmar só a lacuna.');
const c24 = variant(c20, 24, 'L6 — mídia e vazios misturados', d => {
  d.conversation_context = d.conversation_context.map((m, i) => m.fact || i % 4 > 1 ? m : { ...m, kind: i % 4 === 0 ? 'midia' : 'vazia', text: i % 4 === 0 ? '[mídia sintética sem conteúdo]' : '' });
}, c20.expected.decision, c20.expected.validation,
  'Só a representação do ruído muda. Mídia/vazios não removem a pergunta atual ou h-acesso.');
export const matrix = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, c24];

function derived(id, base, title, mutate, d, v, notes) {
  const c = variant(base, 99, title, mutate, d, v, notes);
  c.case_id = id; c.reference = 'Mutante V2 / Q0'; return c;
}
const x01 = derived('V2-X01', c02, 'Obrigação comercial sem fonte', d => { d.candidate_answer += ' Também é obrigatório contratar seguro de 50 reais.'; }, c02.expected.decision,
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', protocol: 'FAIL', temporal: 'PASS', unsupported_assumption: 'FAIL', partial_answer_allowed: 'PASS' }),
  'Obrigações comerciais são afirmações e exigem fonte; não inventar regra para melhorar cobertura.');
const x02 = derived('V2-X02', c20, 'Histórico conflitante adicional irrelevante', d => { d.conversation_context.push({ ...copy(oldParking), id: 'h-conflito', text: 'Em uma data passada havia nove vagas.', fact: { key: 'vagas', value: 9, temporal: 'HISTORICAL_FACT' } }); },
  { ...longD, relevant_historical_facts: select(['h-acesso'], [], [...longD.relevant_historical_facts.forbidden, 'h-conflito']) }, c20.expected.validation,
  'Controle de robustez: ruído conflitante não deve alterar fato atual nem provocar rejeição conservadora.');
const x03 = derived('V2-X03', c11, 'Protocolos de mesmo título conflitantes', d => { d.available_protocols.push({ ...copy(fee), id: 'administracao-duplicada', content: 'Na administração completa, a taxa é de 20%.' }); },
  decision({ action: 'ASK_FOR_CONTEXT', enough_context: false, applicable_protocols: select([], [], ['administracao', 'administracao-duplicada']), missing_information: ['UNAMBIGUOUS_PROTOCOL'], prohibited_assumptions: ['ARBITRARY_PROTOCOL_SELECTION'] }),
  validation('INCONCLUSIVE', { grounding: 'INCONCLUSIVE', factuality: 'INCONCLUSIVE', protocol: 'INCONCLUSIVE', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'INCONCLUSIVE' }),
  'Ambas as regras são atuais e da mesma autoridade; nenhuma precedência autorizada. Não escolher pela ordem.');
const x04 = derived('V2-X04', c11, 'Protocolo de outra entidade', d => { d.available_protocols[0].entity = 'imovel-B'; },
  decision({ action: 'ASK_FOR_CONTEXT', enough_context: false, applicable_protocols: select([], [], ['administracao']), missing_information: ['COMMERCIAL_RATE'], prohibited_assumptions: ['CROSS_ENTITY'] }),
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', protocol: 'FAIL', entity: 'FAIL', cross_entity: 'FAIL', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'FAIL' }),
  'Regra restrita a B não define taxa de A, mesmo que o título coincida.');
const x05 = derived('V2-X05', c12, 'Identidade de protocolo inventada', d => { d.candidate_answer = 'Conforme o protocolo P-inventado, a taxa de administração é de 10%.'; }, c12.expected.decision,
  validation('REJECT', { grounding: 'FAIL', factuality: 'INCONCLUSIVE', protocol: 'FAIL', coverage: 'INCONCLUSIVE', omission: 'NOT_APPLICABLE', unsupported_assumption: 'FAIL' }),
  'Diferente da taxa desconhecida, a atribuição a protocolo inexistente no catálogo é uma violação verificável.');
const x06 = derived('V2-X06', c20, 'Fato antigo confirmado novamente no cadastro atual', d => { d.property_context.current_facts.push(fact('acesso-confirmado', 'entrada_independente', true)); },
  { ...longD, relevant_current_facts: select(['vagas-A'], ['acesso-confirmado'], ['vagas-B']) }, c20.expected.validation,
  'Controle positivo adicional: o acesso antigo e o atual coincidem porque existe confirmação explícita, não por ausência de notícia de mudança. A pergunta sobre o relato anterior mantém h-acesso obrigatório.');
export const additionalMutantCases = [x01, x02, x03, x04, x05];
export const continuityCases = [x06];
export const allCases = [...matrix, ...additionalMutantCases, ...continuityCases];
export const pairs = [
  ['P1', 'V2-01', 'V2-02', '/current_message', 'Pergunta integral versus parcial'],
  ['P2', 'V2-02', 'V2-03', '/candidate_answer', 'Parcial válida versus invenção'],
  ['P3', 'V2-07', 'V2-08', '/property_context/current_facts/0/value', 'Histórico válido versus superado'],
  ['P4', 'V2-09', 'V2-10', '/property_context/current_facts/0/entity', 'Propriedade da fonte A versus B'],
  ['P5', 'V2-11', 'V2-12', '/available_protocols', 'Protocolo presente versus ausente'],
  ['P6', 'V2-13', 'V2-14', '/property_context/accessible', 'Contexto autorizado versus inacessível'],
  ['P7', 'V2-01', 'V2-15', '/candidate_answer', 'Antes versus depois'],
  ['P8', 'V2-16', 'V2-17', '/candidate_answer', 'Cortesia versus afirmação factual'],
  ['P9', 'V2-02', 'V2-04', '/candidate_answer', 'Parte comprovada removida'],
  ['P10', 'V2-05', 'V2-06', '/candidate_answer', 'Taxa correta versus substituída'],
  ['P11', 'V2-11', 'V2-18', '/available_protocols/0/active', 'Protocolo ativo versus arquivado'],
  ['L1-L2', 'V2-19', 'V2-20', '/conversation_context', 'Reposicionar somente h-acesso'],
  ['L2-L3', 'V2-20', 'V2-21', '/conversation_context', 'Adicionar somente ruído'],
  ['L2-L4', 'V2-20', 'V2-22', '/property_context/current_facts/0/value', 'Atualizar somente vagas atuais'],
  ['L2-L5', 'V2-20', 'V2-23', '/conversation_context/20/entity', 'Trocar somente entidade do acesso'],
  ['L2-L6', 'V2-20', 'V2-24', '/conversation_context', 'Transformar somente ruído em mídia/vazio'],
  ['X1', 'V2-02', 'V2-X01', '/candidate_answer', 'Acrescentar obrigação sem fonte'],
  ['X2', 'V2-20', 'V2-X02', '/conversation_context', 'Adicionar somente histórico conflitante'],
  ['X3', 'V2-11', 'V2-X03', '/available_protocols', 'Adicionar somente duplicata conflitante'],
  ['X4', 'V2-11', 'V2-X04', '/available_protocols/0/entity', 'Restringir protocolo a B'],
  ['X5', 'V2-12', 'V2-X05', '/candidate_answer', 'Inventar identidade de protocolo'],
  ['X6', 'V2-20', 'V2-X06', '/property_context/current_facts', 'Adicionar confirmação atual de fato histórico'],
].map(([id, control, variant, attribute, purpose]) => ({ id, control, variant, attribute, purpose }));
export const mutants = [
  ['M01', 'M01', 'P4', 'Trocar entidade'], ['M02', 'M04', 'P7', 'Trocar tempo'],
  ['M03', 'M05', 'P10', 'Inventar taxa'], ['M04', 'M02 (extensão)', 'P5', 'Remover protocolo'],
  ['M05', 'M06', 'X1', 'Inserir obrigação sem fonte'], ['M06', 'M03', 'P9', 'Remover fato necessário'],
  ['M07', 'M09 (controle)', 'X2', 'Adicionar histórico conflitante sem sobrepor atual'],
  ['M08', 'M07', 'P2', 'Transformar ressalva em certeza integral'],
  ['M09', 'P009', 'X3', 'Duplicar protocolo conflitante'], ['M10', 'M01/P003', 'X4', 'Protocolo de outra entidade'],
  ['M11', 'M02', 'X5', 'Protocolo inventado'],
].map(([id, q0_reference, pair_id, mutation]) => ({ id, q0_reference, pair_id, mutation }));
// Catálogo de cobertura; são referências locais e nunca entram nos requests.
export const protocolVariants = {
  protocol_required_and_present: 'V2-11', protocol_required_but_missing: 'V2-12', protocol_not_required: 'V2-16',
  protocol_archived: 'V2-18', protocol_duplicate: 'V2-X03', protocol_wrong_entity: 'V2-X04', protocol_invented: 'V2-X05',
};
export const historyContinuityControl = 'V2-X06';
// Continuidade antiga só é permitida como relato atribuído, nunca presumida como estado atual.
