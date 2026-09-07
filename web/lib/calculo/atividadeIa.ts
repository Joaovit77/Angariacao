import { timestampDeIso } from "@/lib/datas";

export type IconeAtividadeIa =
  | "analise"
  | "atendimento"
  | "contexto"
  | "imoveis"
  | "resposta"
  | "whatsapp";

export type NoExecucaoIa =
  | "contexto"
  | "crm"
  | "protocolos"
  | "imoveis"
  | "atendimento"
  | "analise"
  | "ferramentas"
  | "leads"
  | "validacoes"
  | "whatsapp"
  | "resposta";

export type CategoriaEtapaIa =
  | "solicitacao"
  | "processamento"
  | "consulta"
  | "regra"
  | "validacao"
  | "acao"
  | "resultado";

export type EstadoEtapaIa = "concluido" | "aguardando" | "bloqueado" | "erro";

export interface LinhaUsoIa {
  id: string | number;
  tipo: string;
  criado_em: string;
}

export interface LinhaEventoExecucaoIa {
  id: string | number;
  evento: string;
  detalhe: string | null;
  criado_em: string;
}

export interface EtapaAtividadeIa {
  id: string;
  no: NoExecucaoIa;
  categoria: CategoriaEtapaIa;
  titulo: string;
  detalhe: string;
  estado: EstadoEtapaIa;
}

export interface AtividadeIa {
  id: string;
  tipo: string;
  titulo: string;
  resumo: string;
  etapas: EtapaAtividadeIa[];
  percurso: NoExecucaoIa[];
  concluidaEm: string;
  icone: IconeAtividadeIa;
  detalhesObservados: boolean;
  estado: EstadoEtapaIa;
}

interface ApresentacaoAtividade {
  titulo: string;
  pedido: string;
  interpretacao: string;
  icone: IconeAtividadeIa;
}

interface MetadadosSeguros {
  operacao: string;
  protocolosConsiderados: string[];
  protocolosAplicados: string[];
  ferramentasChamadas: string[];
  entidadesUtilizadas: string[];
  blocosContexto: string[];
  fontesContexto: string[];
  fontesDeDados: string[];
  validacoesAplicadas: string[];
  resultado: "sugerido" | "respondido" | "bloqueado" | "erro";
  motivo: string;
}

const APRESENTACOES: Record<string, ApresentacaoAtividade> = {
  "assistente-chat": {
    titulo: "Conversa com o Assistente",
    pedido: "Uma solicitação foi enviada ao Assistente.",
    interpretacao: "Responder à solicitação usando apenas recursos autorizados.",
    icone: "atendimento",
  },
  "rascunhar-resposta": {
    titulo: "Resposta ao proprietário preparada",
    pedido: "Foi solicitado um rascunho para uma conversa com proprietário.",
    interpretacao: "Preparar uma resposta contextual para revisão.",
    icone: "resposta",
  },
  "sugerir-roteiros": {
    titulo: "Roteiros de abordagem sugeridos",
    pedido: "Foi solicitada uma sugestão de abordagem.",
    interpretacao: "Organizar estratégias adequadas ao cenário informado.",
    icone: "atendimento",
  },
  "extrair-anuncio": {
    titulo: "Anúncio analisado",
    pedido: "Foi solicitada a leitura de um anúncio.",
    interpretacao: "Identificar dados observáveis do imóvel no texto recebido.",
    icone: "imoveis",
  },
  "gerar-anuncio": {
    titulo: "Anúncio do imóvel gerado",
    pedido: "Foi solicitada a criação de um anúncio.",
    interpretacao: "Preparar o anúncio com as informações disponíveis do imóvel.",
    icone: "imoveis",
  },
  "abordagem-anuncio": {
    titulo: "Abordagem do proprietário preparada",
    pedido: "Foi solicitada uma mensagem de abordagem.",
    interpretacao: "Preparar uma mensagem a partir do anúncio informado.",
    icone: "atendimento",
  },
  "analisar-abordagens": {
    titulo: "Desempenho das abordagens analisado",
    pedido: "Foi solicitada uma análise das abordagens.",
    interpretacao: "Comparar os resultados disponíveis e resumir os padrões.",
    icone: "analise",
  },
  "analisar-dashboard": {
    titulo: "Indicadores do Dashboard analisados",
    pedido: "Foi solicitada uma análise do Dashboard.",
    interpretacao: "Ler os indicadores disponíveis e produzir um resumo.",
    icone: "analise",
  },
  "analisar-mapa": {
    titulo: "Mapa analisado pela IA",
    pedido: "Foi solicitada uma análise do mapa.",
    interpretacao: "Ler a região e os imóveis presentes no recorte informado.",
    icone: "analise",
  },
  "resumo-dia": {
    titulo: "Resumo do dia preparado",
    pedido: "Foi solicitado um resumo do dia.",
    interpretacao: "Organizar as prioridades observáveis da carteira.",
    icone: "contexto",
  },
  "explicar-foco": {
    titulo: "Prioridades do dia explicadas",
    pedido: "Foi solicitada uma explicação das prioridades.",
    interpretacao: "Explicar os critérios já calculados para o foco do dia.",
    icone: "analise",
  },
  "classificar-resposta": {
    titulo: "Resposta do proprietário analisada",
    pedido: "Uma resposta recebida foi enviada para classificação.",
    interpretacao: "Classificar a resposta com as opções permitidas.",
    icone: "whatsapp",
  },
  transcricao: {
    titulo: "Áudio do WhatsApp transcrito",
    pedido: "Um áudio recebido foi enviado para transcrição.",
    interpretacao: "Converter o áudio em texto.",
    icone: "whatsapp",
  },
  "embedding-imovel": {
    titulo: "Imóvel preparado para comparação",
    pedido: "Um imóvel foi enviado para preparação de comparação.",
    interpretacao: "Organizar características do imóvel para comparação.",
    icone: "imoveis",
  },
  "embedding-consulta-avaliacao": {
    titulo: "Busca semântica da Avaliação realizada",
    pedido: "Foi solicitada uma busca semântica para apoiar a Avaliação.",
    interpretacao: "Comparar semanticamente os dados disponíveis para a Avaliação.",
    icone: "analise",
  },
  "embedding-comparavel-mercado": {
    titulo: "Comparável preparado para busca semântica",
    pedido: "Um comparável de mercado foi enviado para preparação semântica.",
    interpretacao: "Organizar as características observadas para futuras comparações.",
    icone: "imoveis",
  },
  agendar_visita: {
    titulo: "Agendamento de visita",
    pedido: "Foi solicitada uma ação de agendamento de visita.",
    interpretacao: "Preparar ou executar o agendamento conforme a confirmação do usuário.",
    icone: "atendimento",
  },
  criar_compromisso: {
    titulo: "Compromisso na Agenda",
    pedido: "Foi solicitada a criação de um compromisso na Agenda.",
    interpretacao: "Preparar ou criar o compromisso conforme a confirmação do usuário.",
    icone: "atendimento",
  },
  alterar_status_sem_resposta_em_lote: {
    titulo: "Mudança para Sem resposta",
    pedido: "Foi solicitada a mudança de imóveis elegíveis para Sem resposta.",
    interpretacao: "Preparar ou executar a mudança conforme a confirmação do usuário.",
    icone: "imoveis",
  },
  registrar_tentativa: {
    titulo: "Tentativa de contato",
    pedido: "Foi solicitado o registro de uma tentativa de contato.",
    interpretacao: "Preparar ou registrar a tentativa conforme a confirmação do usuário.",
    icone: "atendimento",
  },
  criar_followup: {
    titulo: "Criação de follow-up",
    pedido: "Foi solicitada a criação de um follow-up interno.",
    interpretacao: "Criar o follow-up interno conforme a política de autonomia.",
    icone: "atendimento",
  },
  reagendar_followup: {
    titulo: "Reagendamento de follow-up",
    pedido: "Foi solicitado o reagendamento de um follow-up interno.",
    interpretacao: "Reagendar o follow-up interno conforme a política de autonomia.",
    icone: "atendimento",
  },
  concluir_followup: {
    titulo: "Conclusão de follow-up",
    pedido: "Foi solicitada a conclusão de um follow-up interno.",
    interpretacao: "Concluir o follow-up interno conforme a política de autonomia.",
    icone: "atendimento",
  },
};

const APRESENTACAO_GENERICA: ApresentacaoAtividade = {
  titulo: "Interação com a IA",
  pedido: "Uma solicitação foi enviada à IA.",
  interpretacao: "Executar a operação solicitada dentro dos limites do Angario.",
  icone: "analise",
};

const EVENTOS_EXECUCAO = new Set([
  "ia-atendimento-bloqueado",
  "ia-atendimento-sugerido",
  "ia-assistente-respondido",
  "ia-assistente-acao-preparada",
  "ia-assistente-acao-executada",
  "ia-assistente-acao-cancelada",
  "ia-assistente-acao-bloqueada",
  "ia-falhou",
]);

const ROTULOS_FERRAMENTAS: Record<string, { titulo: string; no: NoExecucaoIa }> = {
  buscar_imoveis: { titulo: "Consultou imóveis", no: "imoveis" },
  contar_imoveis: { titulo: "Consultou a carteira", no: "crm" },
  contar_angariacoes: { titulo: "Consultou as angariações", no: "crm" },
  buscar_marcos_imoveis: { titulo: "Consultou marcos dos imóveis", no: "imoveis" },
  consultar_imovel: { titulo: "Consultou um imóvel", no: "imoveis" },
  consultar_entidade_atual: { titulo: "Consultou o item aberto", no: "contexto" },
  buscar_agenda: { titulo: "Consultou a agenda", no: "contexto" },
  consultar_mensagens_agendadas: { titulo: "Consultou mensagens agendadas", no: "atendimento" },
  buscar_followups: { titulo: "Consultou os follow-ups", no: "leads" },
  buscar_conversas_respondidas: { titulo: "Consultou conversas respondidas", no: "whatsapp" },
  buscar_estagnados: { titulo: "Consultou imóveis sem avanço", no: "imoveis" },
  consultar_foco_do_dia: { titulo: "Consultou o foco do dia", no: "analise" },
  obter_metricas: { titulo: "Consultou indicadores", no: "analise" },
  consultar_protocolos_comerciais: { titulo: "Consultou Protocolos", no: "protocolos" },
};

const ROTULOS_FERRAMENTAS_ACAO: Record<string, {
  titulo: string;
  estado: EstadoEtapaIa;
}> = {
  preparar_agendamento_visita: { titulo: "Preparou um agendamento de visita", estado: "aguardando" },
  preparar_criacao_compromisso: { titulo: "Preparou um compromisso", estado: "aguardando" },
  abrir_revisao_followup_lote: { titulo: "Preparou a revisão de follow-ups", estado: "aguardando" },
  preparar_rascunho_resposta: { titulo: "Preparou um rascunho para revisão", estado: "aguardando" },
  preparar_alteracao_status_sem_resposta: { titulo: "Preparou mudança para Sem resposta", estado: "aguardando" },
  registrar_tentativa_contato: { titulo: "Preparou o registro de uma tentativa de contato", estado: "aguardando" },
  criar_followup: { titulo: "Criou um follow-up", estado: "concluido" },
  reagendar_followup: { titulo: "Reagendou um follow-up", estado: "concluido" },
  concluir_followup: { titulo: "Concluiu um follow-up", estado: "concluido" },
};

const ROTULOS_FONTES: Record<string, {
  titulo: string;
  no: NoExecucaoIa;
  categoria?: CategoriaEtapaIa;
}> = {
  protocolos: { titulo: "Consultou Protocolos", no: "protocolos", categoria: "regra" },
  imoveis: { titulo: "Consultou dados do imóvel", no: "imoveis" },
  status_history: { titulo: "Consultou o histórico de status", no: "crm" },
  tentativas: { titulo: "Consultou tentativas de contato", no: "atendimento" },
  "imoveis.status+status_history+notas+tentativas": { titulo: "Consultou o contexto do Pipeline", no: "crm" },
  "notas-whatsapp": { titulo: "Consultou a conversa do WhatsApp", no: "whatsapp" },
  user_config: { titulo: "Consultou preferências de comunicação", no: "contexto" },
  agenda: { titulo: "Agenda consultada", no: "contexto" },
  assistente_acoes: { titulo: "Consultou a ação preparada", no: "ferramentas" },
};

const ROTULOS_CONTEXTO: Record<string, {
  titulo: string;
  no: NoExecucaoIa;
  categoria: CategoriaEtapaIa;
  bloco: string;
}> = {
  imoveis: { titulo: "Contexto do imóvel carregado", no: "imoveis", categoria: "consulta", bloco: "imovel" },
  "imoveis.status+status_history+notas+tentativas": {
    titulo: "Pipeline consultado",
    no: "crm",
    categoria: "consulta",
    bloco: "pipeline",
  },
  agenda: { titulo: "Agenda consultada", no: "contexto", categoria: "consulta", bloco: "agenda" },
  protocolos: { titulo: "Protocolos considerados", no: "protocolos", categoria: "regra", bloco: "protocolos" },
};

interface TitulosAcao {
  preparada: string;
  executada: string;
  cancelada: string;
  bloqueada: string;
}

const TITULOS_ACOES: Record<string, TitulosAcao> = {
  agendar_visita: {
    preparada: "Visita preparada para confirmação",
    executada: "Visita agendada pelo Assistente",
    cancelada: "Agendamento de visita cancelado",
    bloqueada: "Agendamento de visita não executado",
  },
  criar_compromisso: {
    preparada: "Compromisso preparado para confirmação",
    executada: "Compromisso criado pelo Assistente",
    cancelada: "Criação de compromisso cancelada",
    bloqueada: "Compromisso não criado",
  },
  alterar_status_sem_resposta_em_lote: {
    preparada: "Mudança para Sem resposta preparada",
    executada: "Status alterado para Sem resposta pelo Assistente",
    cancelada: "Mudança para Sem resposta cancelada",
    bloqueada: "Mudança para Sem resposta não executada",
  },
  registrar_tentativa: {
    preparada: "Tentativa de contato preparada",
    executada: "Tentativa de contato registrada pelo Assistente",
    cancelada: "Registro da tentativa de contato cancelado",
    bloqueada: "Tentativa de contato não registrada",
  },
  criar_followup: {
    preparada: "Criação de follow-up preparada",
    executada: "Follow-up criado pelo Assistente",
    cancelada: "Criação de follow-up cancelada",
    bloqueada: "Follow-up não criado",
  },
  reagendar_followup: {
    preparada: "Reagendamento de follow-up preparado",
    executada: "Follow-up reagendado pelo Assistente",
    cancelada: "Reagendamento de follow-up cancelado",
    bloqueada: "Follow-up não reagendado",
  },
  concluir_followup: {
    preparada: "Conclusão de follow-up preparada",
    executada: "Follow-up concluído pelo Assistente",
    cancelada: "Conclusão de follow-up cancelada",
    bloqueada: "Follow-up não concluído",
  },
};

const TITULOS_CAPACIDADES_INDISPONIVEIS: Record<string, string> = {
  consultar_mercado: "Consulta de mercado não disponível",
  enviar_mensagem_externa: "Envio direto de mensagem não disponível",
  excluir_imovel: "Exclusão de imóvel não disponível",
  editar_dado_sensivel: "Alteração de dados sensíveis não disponível",
  alterar_status_arbitrario: "Mudança livre de status não disponível",
};

const TITULOS_FALHAS_IA: Record<string, string> = {
  "sugerir-roteiros": "Sugestão de roteiros não concluída",
  "analisar-abordagens": "Análise das abordagens não concluída",
  "analisar-dashboard": "Análise do Dashboard não concluída",
  "analisar-mapa": "Análise do mapa não concluída",
  "resumo-dia": "Resumo do dia não concluído",
  "explicar-foco": "Explicação das prioridades não concluída",
  "extrair-anuncio": "Análise do anúncio não concluída",
  "rascunhar-resposta": "Preparação da resposta não concluída",
  "gerar-anuncio": "Geração do anúncio não concluída",
  "abordagem-anuncio": "Preparação da abordagem não concluída",
};

const FALHAS_IA_SEGURAS = new Set([
  "nao-configurado", "sem-permissao", "sessao-expirada", "requisicao-invalida",
  "sem-dados", "intervencao-humana", "historico-insuficiente", "contexto-incompleto",
  "baixa-confianca", "geracao-reprovada", "protocolo-inadequado",
  "falha-carregamento-contexto", "falha-modelo", "limite-excedido", "falha-ia",
]);

function strings(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((item): item is string => typeof item === "string" && item.trim() !== ""))];
}

function lerMetadados(detalhe: string | null): MetadadosSeguros | null {
  if (!detalhe) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(detalhe);
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== "object") return null;
  const raiz = bruto as Record<string, unknown>;
  const candidato = raiz.execucao && typeof raiz.execucao === "object"
    ? raiz.execucao as Record<string, unknown>
    : raiz;
  const resultado = candidato.resultado;
  if (
    typeof candidato.operacao !== "string" ||
    !["sugerido", "respondido", "bloqueado", "erro"].includes(String(resultado))
  ) return null;
  return {
    operacao: normalizarTipoAtividadeIa(candidato.operacao),
    protocolosConsiderados: strings(candidato.protocolosConsiderados),
    protocolosAplicados: strings(candidato.protocolosAplicados),
    ferramentasChamadas: strings(candidato.ferramentasChamadas),
    entidadesUtilizadas: strings(candidato.entidadesUtilizadas),
    blocosContexto: strings(candidato.blocosContexto),
    fontesContexto: strings(candidato.fontesContexto),
    fontesDeDados: strings(candidato.fontesDeDados),
    validacoesAplicadas: strings(candidato.validacoesAplicadas),
    resultado: resultado as MetadadosSeguros["resultado"],
    motivo: typeof candidato.motivo === "string" ? candidato.motivo : "",
  };
}

function lerFalhaIaLegada(detalhe: string | null): MetadadosSeguros | null {
  const partes = detalhe?.match(/^([a-z0-9-]+): ([a-z0-9-]+)$/);
  if (!partes || !TITULOS_FALHAS_IA[partes[1]] || !FALHAS_IA_SEGURAS.has(partes[2])) return null;
  return {
    operacao: partes[1],
    protocolosConsiderados: [],
    protocolosAplicados: [],
    ferramentasChamadas: [],
    entidadesUtilizadas: [],
    blocosContexto: [],
    fontesContexto: [],
    fontesDeDados: [],
    validacoesAplicadas: [],
    resultado: "erro",
    motivo: partes[2],
  };
}

function capacidadeIndisponivel(motivo: string): { titulo: string } | null {
  const prefixo = "capacidade-indisponivel:";
  if (!motivo.startsWith(prefixo)) return null;
  const capacidade = motivo.slice(prefixo.length);
  return {
    titulo: TITULOS_CAPACIDADES_INDISPONIVEIS[capacidade]
      ?? "Capacidade solicitada não disponível",
  };
}

function apresentacao(tipo: string): ApresentacaoAtividade {
  return APRESENTACOES[tipo] ?? APRESENTACAO_GENERICA;
}

function estadoDoResultado(resultado: MetadadosSeguros["resultado"]): EstadoEtapaIa {
  if (resultado === "erro") return "erro";
  if (resultado === "bloqueado") return "bloqueado";
  return "concluido";
}

function percursoDasEtapas(etapas: EtapaAtividadeIa[]): NoExecucaoIa[] {
  const vistos = new Set<NoExecucaoIa>();
  return etapas.flatMap((item) => {
    if (vistos.has(item.no)) return [];
    vistos.add(item.no);
    return [item.no];
  });
}

function etapa(
  etapas: EtapaAtividadeIa[],
  no: NoExecucaoIa,
  categoria: CategoriaEtapaIa,
  titulo: string,
  detalhe: string,
  estado: EstadoEtapaIa = "concluido",
): void {
  etapas.push({ id: `etapa-${etapas.length + 1}`, no, categoria, titulo, detalhe, estado });
}

function atividadeBasica(linha: LinhaUsoIa): AtividadeIa {
  const tipo = normalizarTipoAtividadeIa(linha.tipo);
  const dados = apresentacao(tipo);
  const tipoSeguro = APRESENTACOES[tipo] ? tipo : "interacao-ia";
  const etapas: EtapaAtividadeIa[] = [];
  etapa(etapas, "contexto", "solicitacao", "Solicitação recebida", dados.pedido);
  etapa(etapas, "analise", "processamento", "Operação identificada", dados.interpretacao);
  etapa(
    etapas,
    "resposta",
    "resultado",
    "Processamento concluído",
    "Esta chamada foi registrada, mas o histórico disponível não informa quais fontes ou validações ela percorreu.",
  );
  return {
    id: `ia-${linha.id}`,
    tipo: tipoSeguro,
    titulo: dados.titulo,
    resumo: "Execução real com percurso detalhado indisponível.",
    etapas,
    percurso: percursoDasEtapas(etapas),
    concluidaEm: linha.criado_em,
    icone: dados.icone,
    detalhesObservados: false,
    estado: "concluido",
  };
}

function detalheDeQuantidade(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function etapaDeContexto(
  etapas: EtapaAtividadeIa[],
  fonte: string,
  blocosContexto: Set<string>,
): void {
  const dados = ROTULOS_CONTEXTO[fonte];
  if (!dados) return;
  etapa(
    etapas,
    dados.no,
    dados.categoria,
    dados.titulo,
    blocosContexto.has(dados.bloco)
      ? "A fonte e o bloco de contexto foram registrados como carregados nesta execução."
      : "A fonte de contexto foi registrada como carregada nesta execução.",
  );
}

function etapaDeFonte(
  etapas: EtapaAtividadeIa[],
  fonte: string,
  eventoDeAcao: boolean,
): void {
  if (fonte.startsWith("ferramenta:")) {
    etapaDeFerramenta(etapas, fonte.slice("ferramenta:".length));
    return;
  }
  const dados = ROTULOS_FONTES[fonte];
  if (!dados) return;
  if (fonte === "agenda" && eventoDeAcao) {
    etapa(
      etapas,
      "contexto",
      "acao",
      "Agenda identificada como destino da operação",
      "O evento de ação registra a Agenda como destino; isso não foi tratado como uma consulta.",
    );
    return;
  }
  etapa(
    etapas,
    dados.no,
    dados.categoria ?? "consulta",
    dados.titulo,
    "Fonte consultada nesta execução.",
  );
}

function etapaDeFerramenta(etapas: EtapaAtividadeIa[], ferramenta: string): void {
  const acao = ROTULOS_FERRAMENTAS_ACAO[ferramenta];
  if (acao) {
    etapa(
      etapas,
      "ferramentas",
      "acao",
      acao.titulo,
      acao.estado === "aguardando"
        ? "A ferramenta somente preparou a ação e ainda depende de confirmação."
        : "A ferramenta registrou a execução de uma ação interna autorizada.",
      acao.estado,
    );
    return;
  }
  const dados = ROTULOS_FERRAMENTAS[ferramenta];
  if (dados) {
    etapa(etapas, dados.no, "consulta", dados.titulo, "Ferramenta de leitura chamada nesta execução.");
    return;
  }
  etapa(
    etapas,
    "ferramentas",
    "processamento",
    "Ferramenta autorizada utilizada",
    "O evento não traz informação suficiente para classificá-la como consulta ou ação.",
  );
}

function tituloDoResultado(evento: string, estado: EstadoEtapaIa): string {
  if (evento === "ia-assistente-acao-preparada") return "Aguardando confirmação";
  if (evento === "ia-assistente-acao-executada") return "Ação confirmada e executada";
  if (evento === "ia-assistente-acao-cancelada") return "Ação cancelada";
  if (estado === "bloqueado") return "Execução interrompida com segurança";
  if (estado === "erro") return "Execução não concluída";
  return "Resultado entregue";
}

function tituloDaAcao(evento: string, operacao: string): string {
  const titulos = TITULOS_ACOES[operacao];
  if (evento === "ia-assistente-acao-preparada") {
    return titulos?.preparada ?? "Ação preparada para confirmação";
  }
  if (evento === "ia-assistente-acao-executada") {
    return titulos?.executada ?? "Ação executada pelo Assistente";
  }
  if (evento === "ia-assistente-acao-cancelada") {
    return titulos?.cancelada ?? "Ação do Assistente cancelada";
  }
  return titulos?.bloqueada ?? "Ação do Assistente não executada";
}

function atividadeDoEvento(linha: LinhaEventoExecucaoIa): AtividadeIa | null {
  if (!EVENTOS_EXECUCAO.has(linha.evento)) return null;
  const metadados = linha.evento === "ia-falhou"
    ? lerFalhaIaLegada(linha.detalhe)
    : lerMetadados(linha.detalhe);
  if (!metadados) return null;
  const dados = apresentacao(metadados.operacao);
  const eventoDeAcao = linha.evento.startsWith("ia-assistente-acao-");
  const capacidadeBloqueada = capacidadeIndisponivel(metadados.motivo);
  const estado = linha.evento === "ia-assistente-acao-preparada"
    ? "aguardando"
    : capacidadeBloqueada
      ? "bloqueado"
      : estadoDoResultado(metadados.resultado);
  const etapas: EtapaAtividadeIa[] = [];

  const pedido = linha.evento === "ia-assistente-acao-executada"
    ? "O usuário confirmou uma ação preparada anteriormente."
    : linha.evento === "ia-assistente-acao-cancelada"
      ? "O usuário cancelou uma ação preparada anteriormente."
      : dados.pedido;
  etapa(etapas, "contexto", "solicitacao", "Solicitação recebida", pedido);
  etapa(etapas, "analise", "processamento", "Operação identificada", dados.interpretacao);

  const ferramentasRegistradas = new Set(metadados.ferramentasChamadas);
  const fontesContexto = new Set(metadados.fontesContexto);
  const blocosContexto = new Set(metadados.blocosContexto);
  for (const fonte of fontesContexto) {
    etapaDeContexto(etapas, fonte, blocosContexto);
  }
  for (const fonte of metadados.fontesDeDados) {
    if (fontesContexto.has(fonte)) continue;
    if (fonte.startsWith("ferramenta:") && ferramentasRegistradas.has(fonte.slice(11))) continue;
    etapaDeFonte(etapas, fonte, eventoDeAcao);
  }
  for (const ferramenta of metadados.ferramentasChamadas) etapaDeFerramenta(etapas, ferramenta);

  if (
    metadados.protocolosConsiderados.length > 0
    && !fontesContexto.has("protocolos")
    && !metadados.fontesDeDados.includes("protocolos")
  ) {
    etapa(
      etapas,
      "protocolos",
      "regra",
      "Protocolos considerados",
      detalheDeQuantidade(
        metadados.protocolosConsiderados.length,
        "protocolo considerado",
        "protocolos considerados",
      ),
    );
  }

  if (metadados.protocolosAplicados.length > 0) {
    etapa(
      etapas,
      "protocolos",
      "regra",
      "Aplicou Protocolos",
      detalheDeQuantidade(metadados.protocolosAplicados.length, "protocolo relacionado", "protocolos relacionados"),
    );
  }
  if (metadados.validacoesAplicadas.length > 0) {
    etapa(
      etapas,
      "validacoes",
      "validacao",
      "Validou a execução",
      detalheDeQuantidade(metadados.validacoesAplicadas.length, "verificação aplicada", "verificações aplicadas"),
      estado === "erro" ? "erro" : estado === "bloqueado" ? "bloqueado" : "concluido",
    );
  }

  if (eventoDeAcao) {
    const detalheAcao = linha.evento === "ia-assistente-acao-preparada"
      ? "A ação foi somente proposta e depende da confirmação do usuário."
      : linha.evento === "ia-assistente-acao-executada"
        ? "A ferramenta foi executada depois da confirmação do usuário."
        : "Nenhuma alteração adicional foi executada.";
    etapa(etapas, "ferramentas", "acao", tituloDoResultado(linha.evento, estado), detalheAcao, estado);
  } else {
    etapa(
      etapas,
      estado === "bloqueado" || estado === "erro" ? "validacoes" : "resposta",
      "resultado",
      tituloDoResultado(linha.evento, estado),
      capacidadeBloqueada
        ? "A capacidade solicitada não está disponível no Assistente."
        : estado === "bloqueado"
          ? "Uma validação impediu a entrega de conteúdo sem segurança suficiente."
          : estado === "erro"
          ? "O sistema registrou a falha sem apresentar uma resposta como concluída."
          : "A execução chegou a uma entrega para o usuário.",
      estado,
    );
  }

  const titulo = eventoDeAcao
    ? tituloDaAcao(linha.evento, metadados.operacao)
    : linha.evento === "ia-falhou"
      ? TITULOS_FALHAS_IA[metadados.operacao]
      : capacidadeBloqueada?.titulo ?? dados.titulo;
  const tipoSeguro = APRESENTACOES[metadados.operacao]
    ? metadados.operacao
    : eventoDeAcao ? "acao-assistente" : "interacao-ia";

  return {
    id: `evento-ia-${linha.id}`,
    tipo: tipoSeguro,
    titulo,
    resumo: estado === "aguardando"
      ? "Ação proposta; nenhuma alteração foi executada sem confirmação."
      : `${etapas.filter((item) => item.categoria === "consulta").length} consulta(s), ${metadados.validacoesAplicadas.length} validação(ões).`,
    etapas,
    percurso: percursoDasEtapas(etapas),
    concluidaEm: linha.criado_em,
    icone: eventoDeAcao && !APRESENTACOES[metadados.operacao] ? "atendimento" : dados.icone,
    detalhesObservados: true,
    estado,
  };
}

/** Une as etapas técnicas que pertencem a uma mesma solicitação do usuário. */
export function normalizarTipoAtividadeIa(tipo: string): string {
  const limpo = tipo.trim().toLowerCase();
  if (limpo.startsWith("rascunhar-resposta-")) return "rascunhar-resposta";
  return limpo;
}

function consolidarUso(linhas: LinhaUsoIa[]): LinhaUsoIa[] {
  const ordenadas = [...linhas]
    .filter((linha) => linha.tipo.trim() && timestampDeIso(linha.criado_em) !== null)
    .sort((a, b) => (timestampDeIso(b.criado_em) ?? 0) - (timestampDeIso(a.criado_em) ?? 0));
  const ultimaPorTipo = new Map<string, number>();
  return ordenadas.filter((linha) => {
    const tipo = normalizarTipoAtividadeIa(linha.tipo);
    const data = timestampDeIso(linha.criado_em) ?? 0;
    const ultima = ultimaPorTipo.get(tipo);
    if (ultima !== undefined && Math.abs(ultima - data) <= 60_000) return false;
    ultimaPorTipo.set(tipo, data);
    return true;
  });
}

/**
 * Converte registros reais em uma projeção de produto. O conteúdo bruto de
 * `detalhe`, IDs, prompt, resposta, modelo e tokens nunca sai desta função.
 */
export function criarAtividadesIa(
  linhas: LinhaUsoIa[],
  limite = 8,
  eventos: LinhaEventoExecucaoIa[] = [],
): AtividadeIa[] {
  if (limite <= 0) return [];
  const basicas = consolidarUso(linhas).map(atividadeBasica);
  const detalhadas = eventos
    .filter((linha) => timestampDeIso(linha.criado_em) !== null)
    .map(atividadeDoEvento)
    .filter((atividade): atividade is AtividadeIa => atividade !== null);

  const usadas = new Set<string>();
  for (const detalhada of detalhadas) {
    const dataEvento = timestampDeIso(detalhada.concluidaEm) ?? 0;
    const candidata = basicas.find((basica) => {
      if (usadas.has(basica.id) || basica.tipo !== detalhada.tipo) return false;
      const dataUso = timestampDeIso(basica.concluidaEm) ?? 0;
      return Math.abs(dataEvento - dataUso) <= 5 * 60_000;
    });
    if (candidata) usadas.add(candidata.id);
  }

  return [...detalhadas, ...basicas.filter((atividade) => !usadas.has(atividade.id))]
    .sort((a, b) => (timestampDeIso(b.concluidaEm) ?? 0) - (timestampDeIso(a.concluidaEm) ?? 0))
    .slice(0, Math.max(0, limite));
}
