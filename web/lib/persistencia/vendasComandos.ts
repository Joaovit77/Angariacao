import type { EventoVenda, ImovelTratadoVenda, MotivoPerdaVenda, OportunidadeVenda, OrigemComercialVenda } from "../vendas/tipos";

export const PORTAS_VENDAS = {
  criar: "vendas_criar_oportunidade",
  transicionar: "vendas_transicionar_oportunidade",
  alterar_imovel: "vendas_alterar_imovel",
  alterar_valores: "vendas_alterar_valores",
  ganhar: "vendas_ganhar_oportunidade",
  perder: "vendas_perder_oportunidade",
  arquivar: "vendas_arquivar_oportunidade",
} as const;
export type PortaVenda = keyof typeof PORTAS_VENDAS;
export interface CabecalhoComandoVenda { readonly chaveIdempotencia: string; readonly oportunidadeId: string; readonly versaoEsperada: number }
export interface CriarComandoVenda {
  readonly chaveIdempotencia: string; readonly contatoId: string;
  readonly imovelTratado?: ImovelTratadoVenda | null; readonly origem?: OrigemComercialVenda | null;
  readonly valorNegocioPrevisto?: number | null; readonly receitaPrevista?: number | null;
}
export interface ComandosVenda {
  criar: CriarComandoVenda;
  transicionar: CabecalhoComandoVenda & { readonly destino: "em_atendimento" | "em_negociacao" };
  alterar_imovel: CabecalhoComandoVenda & { readonly imovelTratado: ImovelTratadoVenda | null };
  alterar_valores: CabecalhoComandoVenda & { readonly valorNegocioPrevisto: number | null; readonly receitaPrevista: number | null };
  ganhar: CabecalhoComandoVenda & { readonly confirmacaoExplicita: boolean; readonly dataFato: string; readonly registroFormalizacao: string; readonly valorNegocioFechado?: number | null };
  perder: CabecalhoComandoVenda & { readonly dataFato: string; readonly motivo: MotivoPerdaVenda; readonly justificativa?: string | null };
  arquivar: CabecalhoComandoVenda;
}
export type OportunidadePersistidaVenda = OportunidadeVenda & { readonly encerradoEm: string | null };
export type EventoPersistidoVenda = EventoVenda & {
  readonly id: string; readonly dataFato: string | null; readonly chaveIdempotencia: string; readonly versaoContrato: 1;
};
export interface RespostaOperacaoVenda {
  readonly contrato: "vendas-b2-v1"; readonly ok: true;
  readonly oportunidade: OportunidadePersistidaVenda; readonly evento: EventoPersistidoVenda | null; readonly noOp: boolean;
}
export const CODIGOS_ERRO_VENDA = [
  "nao-autenticado","nao-encontrado","versao-conflitante","chave-idempotencia-conflitante",
  "estrutura-invalida","versao-invalida","transicao-invalida","estado-terminal","oportunidade-arquivada",
  "contato-invalido","imovel-invalido","modo-imovel-invalido","imovel-obrigatorio","origem-invalida",
  "valor-invalido","valor-fechado-incompativel","data-invalida","data-futura","ganho-invalido","perda-invalida",
  "arquivamento-invalido","limite-versao","conflito-transitorio","dado-persistido-invalido","falha-interna",
  "resposta-invalida","transporte-indisponivel",
] as const;
export type CodigoErroVenda = typeof CODIGOS_ERRO_VENDA[number];
export const MOTIVOS_ERRO_VENDA = ["confirmacao-obrigatoria","formalizacao-obrigatoria","motivo-perda-invalido","justificativa-obrigatoria"] as const;
export type MotivoErroVenda = typeof MOTIVOS_ERRO_VENDA[number];
export interface ErroOperacaoVenda { readonly codigo: CodigoErroVenda; readonly motivo: MotivoErroVenda | null }
export type ResultadoOperacaoVenda = RespostaOperacaoVenda | { readonly ok: false; readonly erro: ErroOperacaoVenda };
