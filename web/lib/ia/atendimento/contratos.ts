/** Limites que já faziam parte do contrato do rascunho legado. */
export const MAX_TEXTO_RASCUNHO = 600;
export const MAX_PROTOCOLOS = 40;
export const MAX_PROTOCOLO_CHARS = 4000;
export const MAX_MENSAGEM_CONTEXTO = 2400;

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
  mensagensOmitidas?: number;
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

export const PROBLEMAS_VALIDACAO_ATENDIMENTO = [
  "informacao-sem-fonte", "cobranca-sem-fonte", "contradicao-protocolo",
  "entidade-sem-fonte", "omissao-parte-comprovada", "desvio-de-assunto",
  "protocolo-inadequado", "acao-incompativel", "perfil-incompativel",
  "resposta-longa", "apresentacao-repetida", "intervencao-humana",
] as const;
export type ProblemaValidacaoAtendimento = (typeof PROBLEMAS_VALIDACAO_ATENDIMENTO)[number];
export interface ValidacaoAtendimento { problemas: ProblemaValidacaoAtendimento[] }
export interface GeracaoAtendimento { mensagem: string; protocolosUsados: string[] }

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
    problemas: {
      type: "array",
      items: { type: "string", enum: PROBLEMAS_VALIDACAO_ATENDIMENTO },
      maxItems: PROBLEMAS_VALIDACAO_ATENDIMENTO.length,
    },
  },
  required: ["problemas"],
  additionalProperties: false,
} as const;
