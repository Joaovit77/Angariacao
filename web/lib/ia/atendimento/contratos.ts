/** Limites que já faziam parte do contrato do rascunho legado. */
export const MAX_TEXTO_RASCUNHO = 600;
export const MAX_PROTOCOLOS = 40;
export const MAX_PROTOCOLO_CHARS = 600;

/** Limites do fluxo especializado de decisão, geração e validação. */
export const MAX_MENSAGENS_ATENDIMENTO = 12;
export const MAX_PROTOCOLOS_APLICAVEIS = 5;

export interface ProtocoloPrompt {
  titulo: string;
  conteudo: string;
}

export interface ConversaAnterior {
  anteriores?: string[];
  enviada?: { rotulo?: string | null; texto?: string | null } | null;
}

export interface ContextoAtendimento {
  proprietario: string;
  fatosImovel: string[];
  estagio: string;
}

export interface DecisaoAtendimento {
  intencao: string;
  contextoRelevante: string;
  protocolosAplicaveis: string[];
  informacoesFaltantes: string[];
  nivelConfianca: "alta" | "media" | "baixa";
  precisaIntervencaoHumana: boolean;
  podeResponderComSeguranca: boolean;
}

export interface ValidacaoAtendimento {
  aprovada: boolean;
  respondeAMensagem: boolean;
  coerenteComHistorico: boolean;
  semProtocoloDesnecessario: boolean;
  somenteFatosComFonte: boolean;
  semDesvioDeAssunto: boolean;
  informacaoSuficienteParaEstaResposta: boolean;
  seguraParaSugerir: boolean;
}

export const ESQUEMA_RASCUNHO = {
  type: "object",
  properties: {
    mensagem: {
      type: "string",
      description:
        "A resposta pronta para o corretor enviar ao proprietário no WhatsApp, em português do Brasil.",
    },
    protocolosUsados: {
      type: "array",
      items: { type: "string" },
      description:
        "Títulos, exatamente como aparecem na lista de regras da imobiliária, dos itens em que esta resposta se apoiou. Lista vazia se a resposta não usou nenhum.",
    },
  },
  required: ["mensagem", "protocolosUsados"],
  additionalProperties: false,
} as const;

export const ESQUEMA_DECISAO_ATENDIMENTO = {
  type: "object",
  properties: {
    intencao: { type: "string" },
    contextoRelevante: { type: "string" },
    protocolosAplicaveis: {
      type: "array",
      items: { type: "string" },
      maxItems: MAX_PROTOCOLOS_APLICAVEIS,
    },
    informacoesFaltantes: { type: "array", items: { type: "string" } },
    nivelConfianca: { type: "string", enum: ["alta", "media", "baixa"] },
    precisaIntervencaoHumana: { type: "boolean" },
    podeResponderComSeguranca: { type: "boolean" },
  },
  required: [
    "intencao",
    "contextoRelevante",
    "protocolosAplicaveis",
    "informacoesFaltantes",
    "nivelConfianca",
    "precisaIntervencaoHumana",
    "podeResponderComSeguranca",
  ],
  additionalProperties: false,
} as const;

export const ESQUEMA_GERACAO_ATENDIMENTO = {
  type: "object",
  properties: {
    mensagem: { type: "string" },
    protocolosUsados: { type: "array", items: { type: "string" } },
  },
  required: ["mensagem", "protocolosUsados"],
  additionalProperties: false,
} as const;

export const ESQUEMA_VALIDACAO_ATENDIMENTO = {
  type: "object",
  properties: {
    aprovada: { type: "boolean" },
    respondeAMensagem: { type: "boolean" },
    coerenteComHistorico: { type: "boolean" },
    semProtocoloDesnecessario: { type: "boolean" },
    somenteFatosComFonte: { type: "boolean" },
    semDesvioDeAssunto: { type: "boolean" },
    informacaoSuficienteParaEstaResposta: { type: "boolean" },
    seguraParaSugerir: { type: "boolean" },
  },
  required: [
    "aprovada",
    "respondeAMensagem",
    "coerenteComHistorico",
    "semProtocoloDesnecessario",
    "somenteFatosComFonte",
    "semDesvioDeAssunto",
    "informacaoSuficienteParaEstaResposta",
    "seguraParaSugerir",
  ],
  additionalProperties: false,
} as const;
