/** Limites que já faziam parte do contrato do rascunho legado. */
export const MAX_TEXTO_RASCUNHO = 600;
export const MAX_PROTOCOLOS = 40;
export const MAX_PROTOCOLO_CHARS = 600;

/** Limites do fluxo especializado de decisão, geração e validação.
 *  A mensagem atual vai em bloco separado; portanto entram no máximo
 *  12 mensagens anteriores + a atual do proprietário. */
export const MAX_MENSAGENS_ATENDIMENTO = 12;
export const MAX_MENSAGENS_ANTIGAS_RELEVANTES = 4;
export const MAX_PROTOCOLOS_APLICAVEIS = 5;

export interface ProtocoloPrompt {
  titulo: string;
  conteudo: string;
}

export interface ConversaAnterior {
  anteriores?: Array<string | MensagemAnteriorAtendimento>;
  antigasRelevantes?: MensagemAnteriorAtendimento[];
  enviada?: { rotulo?: string | null; texto?: string | null } | null;
}

export interface MensagemAnteriorAtendimento {
  id?: string;
  autor: "proprietario" | "corretor";
  texto: string;
  data?: string;
}

export interface ContextoAtendimento {
  proprietario: string;
  fatosImovel: string[];
  estagio: string;
}

export interface DecisaoAtendimento {
  intencao: string;
  objecao: string;
  estadoConversacional:
    | "abertura"
    | "entendimento"
    | "avaliando-interesse"
    | "negociacao"
    | "aguardando"
    | "encerramento"
    | "outro";
  contextoRelevante: string;
  informacoesJaExplicadas: string[];
  acaoEsperada: "responder" | "perguntar" | "aguardar" | "encerrar";
  proximoPassoPermitido: string;
  acoesProibidas: Array<
    | "apresentar-imobiliaria"
    | "explicar-condicoes"
    | "perguntar-exclusividade"
    | "marcar-visita"
    | "pedir-fotos"
    | "pedir-autorizacao"
    | "cadastrar-imovel"
    | "insistir"
    | "avancar-etapa"
  >;
  protocolosAplicaveis: string[];
  mensagensEvidencia: string[];
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
        "Títulos, exatamente como aparecem nas informações comerciais autorizadas, dos fatos oficiais em que esta resposta se apoiou. Nunca inclua regras de conduta. Lista vazia se a resposta não usou informação comercial.",
    },
  },
  required: ["mensagem", "protocolosUsados"],
  additionalProperties: false,
} as const;

export const ESQUEMA_DECISAO_ATENDIMENTO = {
  type: "object",
  properties: {
    intencao: { type: "string" },
    objecao: { type: "string" },
    estadoConversacional: {
      type: "string",
      enum: ["abertura", "entendimento", "avaliando-interesse", "negociacao", "aguardando", "encerramento", "outro"],
    },
    contextoRelevante: { type: "string" },
    informacoesJaExplicadas: { type: "array", items: { type: "string" }, maxItems: 8 },
    acaoEsperada: { type: "string", enum: ["responder", "perguntar", "aguardar", "encerrar"] },
    proximoPassoPermitido: { type: "string" },
    acoesProibidas: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "apresentar-imobiliaria", "explicar-condicoes", "perguntar-exclusividade", "marcar-visita",
          "pedir-fotos", "pedir-autorizacao", "cadastrar-imovel", "insistir", "avancar-etapa",
        ],
      },
      maxItems: 9,
    },
    protocolosAplicaveis: {
      type: "array",
      items: { type: "string" },
      maxItems: MAX_PROTOCOLOS_APLICAVEIS,
    },
    informacoesFaltantes: { type: "array", items: { type: "string" } },
    mensagensEvidencia: { type: "array", items: { type: "string" }, maxItems: 8 },
    nivelConfianca: { type: "string", enum: ["alta", "media", "baixa"] },
    precisaIntervencaoHumana: { type: "boolean" },
    podeResponderComSeguranca: { type: "boolean" },
  },
  required: [
    "intencao",
    "objecao",
    "estadoConversacional",
    "contextoRelevante",
    "informacoesJaExplicadas",
    "acaoEsperada",
    "proximoPassoPermitido",
    "acoesProibidas",
    "protocolosAplicaveis",
    "informacoesFaltantes",
    "mensagensEvidencia",
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
