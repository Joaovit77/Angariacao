// Dados inteiramente sintéticos. Oráculos definidos antes de qualquer inferência.
export const dimensions = ['grounding', 'factuality', 'protocol', 'temporal', 'entity', 'extrapolation', 'invented_information', 'important_omission'];
const protocol = (id, content) => ({ id, active: true, content });
const fact = (id, content, entity = 'imovel-A', temporal = 'atual') => ({ id, content, entity, temporal });
const rates = [protocol('administracao', 'Na administração completa, a taxa é de 10%.')];
const before = [protocol('exclusividade', 'Antes da locação, não há exclusividade e é permitido anunciar com outras imobiliárias.'), protocol('custo', 'Não há custo antes da locação. Consequências depois da locação não estão definidas nesta regra.')];
function make(id, category, reference, message, facts, protocols, candidate, action, verdict, failed = [], extra = {}) {
  return {
    case_id: id, version: 1, source: 'SYNTHETIC', category, reference,
    task: 'Decidir sobre a solicitação e avaliar separadamente a candidata; sem gerar mensagem final ou executar ação.',
    current_message: message, conversation_context: [],
    property_context: { selected_entity: 'imovel-A', accessible: true, facts },
    available_protocols: protocols, candidate_answer: candidate,
    ...extra,
    expected_product_outcome: {
      action, verdict,
      dimensions: Object.fromEntries(dimensions.map(d => [d, failed.includes(d) ? 'FAIL' : 'PASS'])),
    },
  };
}
const longHistory = Array.from({ length: 100 }, (_, i) => ({
  id: `nota-${String(i + 1).padStart(3, '0')}`, sequence: i + 1,
  timestamp: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
  author: i % 2 ? 'corretor' : 'proprietario',
  kind: i >= 90 ? 'vazia' : i >= 80 ? 'midia' : 'texto',
  text: i >= 90 ? '' : i >= 80 ? '[mídia sintética sem conteúdo]' : i === 20 ? 'O imóvel A tem entrada independente; isso é relevante para uso do acesso.' : i === 79 ? 'Naquela época o imóvel A tinha uma vaga; relato histórico.' : 'Conversa genérica sintética sem nova condição comercial.',
}));
export const cases = [
  make('JEV-S0-01', 'factual simples', 'E001', 'Qual é a taxa na administração completa?', [], rates, 'Na administração completa, a taxa é de 10%.', 'RESPOND', 'APPROVE'),
  make('JEV-S0-02', 'parcial', 'E002/P014', 'Posso anunciar com outras imobiliárias? Há custo antes da locação? E se outra imobiliária alugar?', [], before, 'Antes da locação, pode anunciar com outras imobiliárias, sem exclusividade e sem custo. Vou confirmar a consequência financeira caso outra imobiliária conclua a locação.', 'RESPOND', 'APPROVE'),
  make('JEV-S0-03', 'social', 'E021', 'Obrigado pela atenção!', [], [], 'Por nada!', 'RESPOND', 'APPROVE'),
  make('JEV-S0-04', 'protocolo aplicável', 'E019', 'Preciso dar exclusividade antes da locação?', [], before.slice(0, 1), 'Antes da locação, não exigimos exclusividade e você pode anunciar com outras imobiliárias.', 'RESPOND', 'APPROVE'),
  make('JEV-S0-05', 'protocolo ausente', 'E020/P001', 'Qual é a taxa de vistoria?', [], [], 'Pelo protocolo Vistoria Premium, a vistoria custa 300 reais.', 'ASK_FOR_CONTEXT', 'REJECT', ['grounding', 'factuality', 'protocol', 'invented_information']),
  make('JEV-S0-06', 'informação inventada', 'E009/P002', 'Qual é a taxa na administração completa?', [], rates, 'A taxa é de 15% e há uma multa obrigatória de 500 reais.', 'RESPOND', 'REJECT', ['grounding', 'factuality', 'protocol', 'invented_information']),
  make('JEV-S0-07', 'temporalidade', 'E010/E024', 'Qual foi a última informação sobre a reforma e o que falta confirmar?', [], [], 'O imóvel continua em reforma hoje; vou confirmar a previsão de término.', 'RESPOND', 'REJECT', ['grounding', 'temporal', 'extrapolation', 'invented_information', 'important_omission'], {
    conversation_context: [{ id: 'antiga-reforma', author: 'proprietario', timestamp: '2026-01-01T10:00:00Z', text: 'O imóvel estava em reforma naquela data.' }],
  }),
  make('JEV-S0-08', 'entidade incorreta', 'P003', 'Quantas vagas tem o imóvel A?', [fact('vagas-A', 'O imóvel A tem duas vagas.'), fact('vagas-B', 'O imóvel B tem cinco vagas.', 'imovel-B')], [], 'O imóvel A tem cinco vagas.', 'RESPOND', 'REJECT', ['grounding', 'factuality', 'entity', 'important_omission']),
  make('JEV-S0-09', 'contexto incompleto', 'P012', 'Qual é a metragem do imóvel selecionado?', [], [], 'O imóvel selecionado tem 90 metros quadrados.', 'BLOCK', 'REJECT', ['grounding', 'factuality', 'invented_information'], {
    property_context: { selected_entity: 'imovel-A', accessible: false, facts: [] },
  }),
  make('JEV-S0-10', 'conversa longa sintética', 'controle positivo P017–P021; lacuna LD-156', 'Sobre o imóvel A: a entrada é independente, quantas vagas há agora e preciso de exclusividade antes da locação?', [fact('vagas-A', 'O imóvel A tem duas vagas atualmente.'), fact('vagas-B', 'O imóvel B tem cinco vagas.', 'imovel-B')], before.slice(0, 1), 'Conforme informado na conversa, o imóvel A tem entrada independente. O cadastro atual informa duas vagas. Antes da locação, não exigimos exclusividade.', 'RESPOND', 'APPROVE', [], {
    conversation_context: [...longHistory, { id: 'saida-101', sequence: 101, author: 'corretor', timestamp: '2026-01-02T10:00:00Z', text: 'Seguimos tratando do imóvel A; o cadastro atual substitui a informação antiga sobre vagas.' }],
  }),
];
