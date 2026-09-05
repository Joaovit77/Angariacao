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
export const MAX_EVIDENCIAS_ATENDIMENTO = 16;
export const MAX_AFIRMACOES_ATENDIMENTO = 12;

export const TEMPORALIDADES_ATENDIMENTO = [
  "atual",
  "historica",
  "antes-de-evento",
  "depois-de-evento",
  "atemporal",
  "desconhecida",
] as const;
export type TemporalidadeAtendimento = (typeof TEMPORALIDADES_ATENDIMENTO)[number];

export type OrigemFonteEvidenciaAtendimento =
  | "protocolo"
  | "dado-estruturado-imovel"
  | "mensagem-recebida"
  | "mensagem-enviada"
  | "historico"
  | "estado-operacional-atual";

export type AutoridadeFonteEvidenciaAtendimento =
  | "protocolo-ativo"
  | "dado-estruturado-atual"
  | "fala-atual-atribuida"
  | "fala-historica-atribuida"
  | "fallback-legado";

/** Fonte material já carregada pelo fluxo. Não é criada pelo modelo. */
export interface FonteEvidenciaAtendimento {
  id: string;
  origem: OrigemFonteEvidenciaAtendimento;
  autoridade: AutoridadeFonteEvidenciaAtendimento;
  referencia: string;
  conteudo: string;
  temporalidadeBase: "atual" | "historica" | "desconhecida";
}

/** Fato reconhecido na decisão e ligado a uma fonte real do catálogo. */
export interface EvidenciaAtendimento {
  id: string;
  fonteId: string;
  fato: string;
  temporalidade: TemporalidadeAtendimento;
  /** Vazio quando a temporalidade não é relativa a um evento. */
  evento: string;
}

export interface LacunaAtendimento {
  id: string;
  descricao: string;
  temporalidade: TemporalidadeAtendimento;
  /** Vazio quando a temporalidade não é relativa a um evento. */
  evento: string;
}

export interface AfirmacaoAtendimento {
  descricao: string;
  tipo: "fato" | "incerteza" | "negacao-de-extrapolacao";
  evidencias: string[];
  lacunas: string[];
  temporalidade: TemporalidadeAtendimento;
  /** Deve copiar exatamente o evento da evidência ou lacuna usada. */
  evento: string;
}

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
  evidencias: EvidenciaAtendimento[];
  informacoesFaltantes: LacunaAtendimento[];
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
export interface ValidacaoAtendimento {
  problemas: ProblemaValidacaoAtendimento[];
  /** Leitura independente do auditor sobre o que o texto realmente afirma. */
  afirmacoesAuditadas: AfirmacaoAtendimento[];
}
export interface GeracaoAtendimento {
  mensagem: string;
  protocolosUsados: string[];
  afirmacoes: AfirmacaoAtendimento[];
}

const TEMPORALIDADES_RELATIVAS_ATENDIMENTO = ["antes-de-evento", "depois-de-evento"] as const;
const TEMPORALIDADES_NAO_RELATIVAS_ATENDIMENTO = [
  "atual", "historica", "atemporal", "desconhecida",
] as const;
const ESQUEMA_TEXTO_NAO_VAZIO_ATENDIMENTO = {
  type: "string",
  pattern: "^[\\s\\S]*\\S[\\s\\S]*$",
} as const;

function esquemaComEscopoTemporalAtendimento<
  const Propriedades extends Readonly<Record<string, object>>,
  const Obrigatorios extends readonly string[],
>(
  propriedades: Propriedades,
  obrigatorios: Obrigatorios,
) {
  const objeto = <
    const Temporalidades extends readonly string[],
    const Evento extends object,
  >(
    temporalidades: Temporalidades,
    evento: Evento,
  ) => ({
    type: "object" as const,
    properties: {
      ...propriedades,
      temporalidade: { type: "string" as const, enum: temporalidades },
      evento,
    },
    required: obrigatorios,
    additionalProperties: false as const,
  });
  return {
    anyOf: [
      objeto(TEMPORALIDADES_RELATIVAS_ATENDIMENTO, ESQUEMA_TEXTO_NAO_VAZIO_ATENDIMENTO),
      objeto(TEMPORALIDADES_NAO_RELATIVAS_ATENDIMENTO, { type: "string" as const, enum: [""] as const }),
    ],
  } as const;
}

const ESQUEMA_EVIDENCIA_ATENDIMENTO = esquemaComEscopoTemporalAtendimento(
  {
    id: { type: "string", pattern: "^evidencia_[1-9][0-9]*$" },
    fonteId: { type: "string", pattern: "^fonte_[1-9][0-9]*$" },
    fato: ESQUEMA_TEXTO_NAO_VAZIO_ATENDIMENTO,
  },
  ["id", "fonteId", "fato", "temporalidade", "evento"],
);

const ESQUEMA_LACUNA_ATENDIMENTO = esquemaComEscopoTemporalAtendimento(
  {
    id: { type: "string", pattern: "^lacuna_[1-9][0-9]*$" },
    descricao: ESQUEMA_TEXTO_NAO_VAZIO_ATENDIMENTO,
  },
  ["id", "descricao", "temporalidade", "evento"],
);

const ESQUEMA_AFIRMACAO_ATENDIMENTO = esquemaComEscopoTemporalAtendimento(
  {
    descricao: ESQUEMA_TEXTO_NAO_VAZIO_ATENDIMENTO,
    tipo: {
      type: "string",
      enum: ["fato", "incerteza", "negacao-de-extrapolacao"],
    },
    evidencias: {
      type: "array",
      items: { type: "string", pattern: "^evidencia_[1-9][0-9]*$" },
      maxItems: MAX_EVIDENCIAS_ATENDIMENTO,
    },
    lacunas: {
      type: "array",
      items: { type: "string", pattern: "^lacuna_[1-9][0-9]*$" },
      maxItems: 8,
    },
  },
  ["descricao", "tipo", "evidencias", "lacunas", "temporalidade", "evento"],
);

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
    evidencias: {
      type: "array",
      items: ESQUEMA_EVIDENCIA_ATENDIMENTO,
      maxItems: MAX_EVIDENCIAS_ATENDIMENTO,
    },
    informacoesFaltantes: {
      type: "array",
      items: ESQUEMA_LACUNA_ATENDIMENTO,
      maxItems: 8,
    },
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
    "evidencias",
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
    afirmacoes: {
      type: "array",
      description:
        "Afirmações factuais ou temporais presentes no texto. Não inclua saudações ou cortesia. Cada fato referencia evidências existentes; incerteza e negação de extrapolação referenciam lacunas existentes.",
      items: ESQUEMA_AFIRMACAO_ATENDIMENTO,
      maxItems: MAX_AFIRMACOES_ATENDIMENTO,
    },
  },
  required: ["mensagem", "protocolosUsados", "afirmacoes"],
  additionalProperties: false,
} as const;

export const ESQUEMA_VALIDACAO_ATENDIMENTO = {
  type: "object",
  properties: {
    problemas: {
      type: "array",
      description: "Códigos de todas as violações identificadas. Lista vazia somente quando a resposta usa a parte relevante comprovada e cada afirmação respeita a temporalidade da fonte. Omissão ou esclarecimento evasivo apesar de fatos úteis: omissao-parte-comprovada. Histórico convertido em continuidade ou estado presente sem evidência: informacao-sem-fonte (cobranca-sem-fonte se financeiro). Retomar fato relevante não é apresentacao-repetida. Relato qualificado do passado com confirmação do presente é permitido.",
      items: { type: "string", enum: PROBLEMAS_VALIDACAO_ATENDIMENTO },
      maxItems: PROBLEMAS_VALIDACAO_ATENDIMENTO.length,
    },
    afirmacoesAuditadas: {
      type: "array",
      description:
        "Afirmações factuais ou temporais que o texto realmente faz, extraídas de forma independente. Não copie cegamente afirmacoes da geração. Cada item deve apontar para evidências ou lacunas existentes e refletir o tempo/evento expresso no texto.",
      items: ESQUEMA_AFIRMACAO_ATENDIMENTO,
      maxItems: MAX_AFIRMACOES_ATENDIMENTO,
    },
  },
  required: ["problemas", "afirmacoesAuditadas"],
  additionalProperties: false,
} as const;
