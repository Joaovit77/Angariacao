/** Linhas do B1. Estes tipos não são entrada HTTP nem substituem validação/decodificação no B2. */
import type { EstadoVenda, EventoVenda, MotivoPerdaVenda, OrigemComercialVenda } from "../vendas/tipos";

/** Transportes PostgreSQL podem retornar numeric/bigint como texto. Não fazer Number() sem validar. */
export type NumericPersistidoVenda = string | number;
export type VersaoPersistidaVenda = string | number;
/** Texto de saída do PostgreSQL; a normalização para UTC canônico pertence ao adaptador futuro. */
export type InstantePersistidoVenda = string;

export interface LinhaReferenciaImovelVenda {
  readonly id: string;
  readonly user_id: string;
  readonly imovel_id: string | null;
  readonly imovel_id_original: string;
  readonly codigo: string | null;
  readonly referencia: string | null;
  readonly endereco: string | null;
  readonly unidade: string | null;
  readonly bloco: string | null;
  readonly capturado_em: InstantePersistidoVenda;
}
export interface LinhaOportunidadeVenda {
  readonly id: string;
  readonly user_id: string;
  readonly contato_id: string;
  readonly estado: EstadoVenda;
  readonly versao: VersaoPersistidaVenda;
  readonly imovel_modo: "referencia" | "manual" | null;
  readonly imovel_referencia_id: string | null;
  readonly manual_endereco: string | null;
  readonly manual_referencia: string | null;
  readonly manual_unidade: string | null;
  readonly manual_bloco: string | null;
  readonly manual_descricao_curta: string | null;
  readonly origem_tipo: OrigemComercialVenda["tipo"] | null;
  readonly origem_descricao: string | null;
  readonly valor_negocio_previsto: NumericPersistidoVenda | null;
  readonly valor_negocio_fechado: NumericPersistidoVenda | null;
  readonly receita_prevista: NumericPersistidoVenda | null;
  readonly criado_por: string;
  readonly responsavel_usuario_id: string;
  readonly encerramento_tipo: "ganho" | "perda" | null;
  readonly data_fato: string | null;
  readonly confirmacao_explicita: boolean | null;
  readonly registro_formalizacao: string | null;
  readonly motivo_perda: MotivoPerdaVenda | null;
  readonly justificativa_perda: string | null;
  readonly encerrado_em: InstantePersistidoVenda | null;
  readonly created_at: InstantePersistidoVenda;
  readonly updated_at: InstantePersistidoVenda;
  readonly arquivado_em: InstantePersistidoVenda | null;
}
export interface LinhaEventoVenda {
  readonly id: string;
  readonly user_id: string;
  readonly oportunidade_id: string;
  readonly tipo: EventoVenda["tipo"];
  readonly ator_usuario_id: string;
  readonly registrado_em: InstantePersistidoVenda;
  readonly data_fato: string | null;
  readonly versao: VersaoPersistidaVenda;
  /** B1 garante objeto JSON; contrato fechado por tipo e construção pertencem ao B2. */
  readonly payload: unknown;
  readonly chave_idempotencia: string;
}
export type OperacaoComandoVenda = "criar" | "transicionar" | "alterar_imovel" | "alterar_valores" | "arquivar";
/** Contrato interno do servidor. Sem cliente, consulta ou serialização de recibos no B1. */
export interface LinhaComandoVenda {
  readonly id: string;
  readonly user_id: string;
  readonly chave_idempotencia: string;
  readonly operacao: OperacaoComandoVenda;
  readonly fingerprint: string;
  readonly oportunidade_id: string;
  readonly evento_id: string | null;
  /** B2 definirá/validará a resposta contratada; o CHECK atual exige objeto JSON. */
  readonly resposta: unknown;
  readonly created_at: InstantePersistidoVenda;
  readonly concluido_em: InstantePersistidoVenda;
}
