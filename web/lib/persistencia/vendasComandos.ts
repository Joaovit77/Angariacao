import type { EventoVenda, ImovelTratadoVenda, MotivoPerdaVenda, OportunidadeVenda, OrigemComercialVenda } from "../vendas/tipos";
import type { CriarComandoInteressadoVenda, ResolucaoInteressadoVenda } from "./vendasInteressado";

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
/** Forma B2: o payload continua exatamente o mesmo (e o fingerprint também). */
export interface CriarComandoLegadoVenda {
  readonly chaveIdempotencia: string; readonly contatoId: string; readonly interessado?: never;
  readonly imovelTratado?: ImovelTratadoVenda | null; readonly origem?: OrigemComercialVenda | null;
  readonly valorNegocioPrevisto?: number | null; readonly receitaPrevista?: number | null;
}
/** Exatamente uma forma: `contatoId` (B2) ou `interessado` (B3). Nada converte uma na outra. */
export type CriarComandoVenda = CriarComandoLegadoVenda | CriarComandoInteressadoVenda;
/** Leitura do B3.2. Fica fora de PORTAS_VENDAS, que são só as sete operações que gravam. */
export const PORTA_RESOLVER_INTERESSADO_VENDA = "vendas_resolver_interessado" as const;
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
  // B3.2: identificação do interessado no criar.
  "nome-invalido","telefone-invalido","contato-fundido","contato-anonimizado",
  "telefone-ja-cadastrado","telefone-em-revisao","interessado-ambiguo","interessado-indisponivel",
  "resposta-invalida","transporte-indisponivel",
] as const;
export type CodigoErroVenda = typeof CODIGOS_ERRO_VENDA[number];
export const MOTIVOS_ERRO_VENDA = ["confirmacao-obrigatoria","formalizacao-obrigatoria","motivo-perda-invalido","justificativa-obrigatoria"] as const;
export type MotivoErroVenda = typeof MOTIVOS_ERRO_VENDA[number];
export interface ErroOperacaoVenda { readonly codigo: CodigoErroVenda; readonly motivo: MotivoErroVenda | null }
export type ResultadoOperacaoVenda = RespostaOperacaoVenda | { readonly ok: false; readonly erro: ErroOperacaoVenda };
/** `encontrado` é só um candidato: quem chama decide, e cria pelo modo existente se o usuário confirmar. */
export type ResultadoResolucaoInteressadoVenda =
  | { readonly ok: true; readonly resolucao: ResolucaoInteressadoVenda }
  | { readonly ok: false; readonly erro: ErroOperacaoVenda };
