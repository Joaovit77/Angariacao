/** Contratos comerciais do V1-A. Identificadores e instantes vêm do chamador. */
export const ESTADOS_VENDA = [
  "nova", "em_atendimento", "em_negociacao", "ganha", "perdida",
] as const;
export type EstadoVenda = (typeof ESTADOS_VENDA)[number];
export type EstadoAbertoVenda = Exclude<EstadoVenda, "ganha" | "perdida">;
export type EstadoTerminalVenda = Extract<EstadoVenda, "ganha" | "perdida">;

export const MOTIVOS_PERDA_VENDA = [
  "desistencia_interessado", "condicoes_incompativeis", "imovel_indisponivel",
  "compra_outro_canal", "outro",
] as const;
export type MotivoPerdaVenda = (typeof MOTIVOS_PERDA_VENDA)[number];

export const ORIGENS_COMERCIAIS_VENDA = [
  "indicacao", "portal", "whatsapp", "telefone", "formulario",
  "atendimento_presencial", "outro",
] as const;
export interface OrigemComercialVenda {
  readonly tipo: (typeof ORIGENS_COMERCIAIS_VENDA)[number];
  readonly descricao?: string | null;
}

/** Um único modo de identificação. A referência não comprova existência ou disponibilidade. */
export type ImovelTratadoVenda =
  | { readonly modo: "referencia"; readonly imovelId: string }
  | {
      readonly modo: "manual";
      readonly endereco?: string | null;
      readonly referencia?: string | null;
      readonly unidade?: string | null;
      readonly bloco?: string | null;
      readonly descricaoCurta?: string | null;
    };

export interface ValoresVenda {
  readonly valorNegocioPrevisto: number | null;
  readonly valorNegocioFechado: number | null;
  readonly receitaPrevista: number | null;
}

export interface GanhoVenda {
  readonly tipo: "ganho";
  readonly confirmacaoExplicita: true;
  /** Dia civil do fato, AAAA-MM-DD; não é a data em que o registro foi digitado. */
  readonly dataFato: string;
  readonly registroFormalizacao: string;
}
export interface PerdaVenda {
  readonly tipo: "perda";
  readonly dataFato: string;
  readonly motivo: MotivoPerdaVenda;
  readonly justificativa: string | null;
}

interface BaseOportunidadeVenda {
  readonly id: string;
  readonly contatoId: string;
  readonly userId: string;
  readonly criadoPor: string;
  readonly responsavelUsuarioId: string;
  /** Versão do agregado; a persistência futura deverá comparar e gravar atomicamente. */
  readonly versao: number;
  readonly imovelTratado: ImovelTratadoVenda | null;
  readonly origem: OrigemComercialVenda | null;
  readonly valores: ValoresVenda;
  /** Instantes UTC canônicos, fornecidos externamente; o domínio não consulta relógio. */
  readonly criadoEm: string;
  readonly atualizadoEm: string;
  readonly arquivadaEm: string | null;
}
export type OportunidadeVenda = BaseOportunidadeVenda & (
  | { readonly estado: EstadoAbertoVenda; readonly encerramento: null }
  | { readonly estado: "ganha"; readonly encerramento: GanhoVenda }
  | { readonly estado: "perdida"; readonly encerramento: PerdaVenda }
);

export interface ContextoMudancaVenda {
  readonly atorUsuarioId: string;
  readonly versaoEsperada: number;
  readonly registradoEm: string;
}
export interface EntradaCriacaoVenda {
  readonly id: string;
  readonly contatoId: string;
  readonly userId: string;
  readonly imovelTratado?: ImovelTratadoVenda | null;
  readonly origem?: OrigemComercialVenda | null;
  readonly valorNegocioPrevisto?: number | null;
  readonly receitaPrevista?: number | null;
}
export interface EntradaGanhoVenda {
  readonly confirmacaoExplicita: boolean;
  readonly dataFato: string;
  readonly registroFormalizacao: string;
  readonly valorNegocioFechado?: number | null;
}
export interface EntradaPerdaVenda {
  readonly dataFato: string;
  readonly motivo: MotivoPerdaVenda;
  readonly justificativa?: string | null;
}
export type TransicaoVenda =
  | { readonly destino: EstadoAbertoVenda }
  | { readonly destino: "ganha"; readonly ganho: EntradaGanhoVenda }
  | { readonly destino: "perdida"; readonly perda: EntradaPerdaVenda };

interface BaseEventoVenda {
  readonly oportunidadeId: string;
  readonly userId: string;
  readonly atorUsuarioId: string;
  readonly registradoEm: string;
  readonly versao: number;
}
export type EventoVenda = BaseEventoVenda & (
  | {
      readonly tipo: "oportunidade_criada";
      readonly dados: {
        readonly contatoId: string;
        readonly imovelTratado: ImovelTratadoVenda | null;
        readonly origem: OrigemComercialVenda | null;
        readonly valores: ValoresVenda;
      };
    }
  | {
      readonly tipo: "etapa_alterada";
      readonly dados: { readonly anterior: EstadoAbertoVenda; readonly atual: EstadoAbertoVenda };
    }
  | {
      readonly tipo: "imovel_alterado";
      readonly dados: { readonly anterior: ImovelTratadoVenda | null; readonly atual: ImovelTratadoVenda | null };
    }
  | {
      readonly tipo: "valor_alterado";
      readonly dados: { readonly anterior: ValoresVenda; readonly atual: ValoresVenda };
    }
  | {
      readonly tipo: "oportunidade_ganha";
      readonly dados: { readonly anterior: EstadoAbertoVenda; readonly encerramento: GanhoVenda; readonly valorNegocioFechado: number | null };
    }
  | {
      readonly tipo: "oportunidade_perdida";
      readonly dados: { readonly anterior: EstadoAbertoVenda; readonly encerramento: PerdaVenda };
    }
  | {
      readonly tipo: "oportunidade_arquivada";
      readonly dados: { readonly estado: EstadoTerminalVenda };
    }
);

export const CODIGOS_ERRO_VENDA = [
  "estrutura-invalida", "identidade-obrigatoria", "contato-obrigatorio",
  "responsabilidade-invalida", "autoria-invalida", "estado-invalido",
  "transicao-invalida", "imovel-invalido", "imovel-obrigatorio",
  "confirmacao-obrigatoria", "formalizacao-obrigatoria", "data-invalida",
  "motivo-perda-obrigatorio", "motivo-perda-invalido", "justificativa-obrigatoria",
  "valor-invalido", "valor-fechado-incompativel", "origem-invalida",
  "versao-invalida", "versao-conflitante", "oportunidade-encerrada",
  "arquivamento-invalido", "oportunidade-arquivada", "encerramento-invalido",
] as const;
export type CodigoErroVenda = (typeof CODIGOS_ERRO_VENDA)[number];
export interface FalhaVenda { readonly ok: false; readonly codigo: CodigoErroVenda }
export type ValidacaoVenda = { readonly ok: true } | FalhaVenda;
export type ResultadoMudancaVenda =
  | { readonly ok: true; readonly oportunidade: OportunidadeVenda; readonly eventos: readonly EventoVenda[] }
  | FalhaVenda;
