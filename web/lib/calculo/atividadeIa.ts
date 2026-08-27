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
  agendar_visita: {
    titulo: "Agendamento de visita",
    pedido: "Foi solicitada uma ação de agendamento de visita.",
    interpretacao: "Preparar ou executar o agendamento conforme a confirmação do usuário.",
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
]);

const FERRAMENTAS_DE_ACAO = new Set([
  "preparar_agendamento_visita",
  "abrir_revisao_followup_lote",
  "preparar_rascunho_resposta",
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

const ROTULOS_FONTES: Record<string, { titulo: string; no: NoExecucaoIa }> = {
  protocolos: { titulo: "Consultou Protocolos", no: "protocolos" },
  imoveis: { titulo: "Consultou dados do imóvel", no: "imoveis" },
  "notas-whatsapp": { titulo: "Consultou a conversa do WhatsApp", no: "whatsapp" },
  user_config: { titulo: "Consultou preferências de comunicação", no: "contexto" },
  agenda: { titulo: "Consultou a agenda", no: "contexto" },
  assistente_acoes: { titulo: "Consultou a ação preparada", no: "ferramentas" },
};

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
    fontesDeDados: strings(candidato.fontesDeDados),
    validacoesAplicadas: strings(candidato.validacoesAplicadas),
    resultado: resultado as MetadadosSeguros["resultado"],
    motivo: typeof candidato.motivo === "string" ? candidato.motivo : "",
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

function etapaDeFonte(etapas: EtapaAtividadeIa[], fonte: string): void {
  if (fonte.startsWith("ferramenta:")) {
    etapaDeFerramenta(etapas, fonte.slice("ferramenta:".length));
    return;
  }
  const dados = ROTULOS_FONTES[fonte];
  if (!dados) return;
  etapa(etapas, dados.no, fonte === "protocolos" ? "regra" : "consulta", dados.titulo, "Fonte consultada nesta execução.");
}

function etapaDeFerramenta(etapas: EtapaAtividadeIa[], ferramenta: string): void {
  if (FERRAMENTAS_DE_ACAO.has(ferramenta)) {
    const titulo = ferramenta === "preparar_agendamento_visita"
      ? "Preparou um agendamento"
      : ferramenta === "abrir_revisao_followup_lote"
        ? "Preparou a revisão de follow-ups"
        : "Preparou um rascunho para revisão";
    etapa(etapas, "ferramentas", "acao", titulo, "A ferramenta preparou a ação; a alteração não foi tratada como consulta.", "aguardando");
    return;
  }
  const dados = ROTULOS_FERRAMENTAS[ferramenta] ?? { titulo: "Executou uma consulta autorizada", no: "ferramentas" as const };
  etapa(etapas, dados.no, "consulta", dados.titulo, "Ferramenta de leitura chamada nesta execução.");
}

function tituloDoResultado(evento: string, estado: EstadoEtapaIa): string {
  if (evento === "ia-assistente-acao-preparada") return "Aguardando confirmação";
  if (evento === "ia-assistente-acao-executada") return "Ação confirmada e executada";
  if (evento === "ia-assistente-acao-cancelada") return "Ação cancelada";
  if (estado === "bloqueado") return "Execução interrompida com segurança";
  if (estado === "erro") return "Execução não concluída";
  return "Resultado entregue";
}

function atividadeDoEvento(linha: LinhaEventoExecucaoIa): AtividadeIa | null {
  if (!EVENTOS_EXECUCAO.has(linha.evento)) return null;
  const metadados = lerMetadados(linha.detalhe);
  if (!metadados) return null;
  const dados = apresentacao(metadados.operacao);
  const estado = linha.evento === "ia-assistente-acao-preparada"
    ? "aguardando"
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
  for (const fonte of metadados.fontesDeDados) {
    if (fonte.startsWith("ferramenta:") && ferramentasRegistradas.has(fonte.slice(11))) continue;
    etapaDeFonte(etapas, fonte);
  }
  for (const ferramenta of metadados.ferramentasChamadas) etapaDeFerramenta(etapas, ferramenta);

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

  if (linha.evento.startsWith("ia-assistente-acao-")) {
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
      estado === "bloqueado"
        ? "Uma validação impediu a entrega de conteúdo sem segurança suficiente."
        : estado === "erro"
          ? "O sistema registrou a falha sem apresentar uma resposta como concluída."
          : "A execução chegou a uma entrega para o usuário.",
      estado,
    );
  }

  const titulo = linha.evento === "ia-assistente-acao-preparada"
    ? "Visita preparada para confirmação"
    : linha.evento === "ia-assistente-acao-executada"
      ? "Visita agendada pelo Assistente"
      : linha.evento === "ia-assistente-acao-cancelada"
        ? "Ação do Assistente cancelada"
        : linha.evento === "ia-assistente-acao-bloqueada"
          ? "Ação do Assistente não executada"
          : dados.titulo;

  return {
    id: `evento-ia-${linha.id}`,
    tipo: metadados.operacao,
    titulo,
    resumo: estado === "aguardando"
      ? "Ação proposta; nenhuma alteração foi executada sem confirmação."
      : `${etapas.filter((item) => item.categoria === "consulta").length} consulta(s), ${metadados.validacoesAplicadas.length} validação(ões).`,
    etapas,
    percurso: percursoDasEtapas(etapas),
    concluidaEm: linha.criado_em,
    icone: dados.icone,
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
