import { ESTADOS_VENDA, type EstadoVenda } from "./tipos";

/** Matriz explícita: não há avanço implícito, salto, retorno ou reabertura no V1. */
export const TRANSICOES_VENDA: Readonly<Record<EstadoVenda, readonly EstadoVenda[]>> = {
  nova: ["em_atendimento", "perdida"],
  em_atendimento: ["em_negociacao", "perdida"],
  em_negociacao: ["ganha", "perdida"],
  ganha: [],
  perdida: [],
};

export function ehEstadoVenda(valor: unknown): valor is EstadoVenda {
  return typeof valor === "string" && (ESTADOS_VENDA as readonly string[]).includes(valor);
}

export function ehEstadoTerminalVenda(estado: EstadoVenda): estado is "ganha" | "perdida" {
  return estado === "ganha" || estado === "perdida";
}

/** Consulta apenas a matriz. Pré-condições comerciais são validadas na operação. */
export function podeTransicionarVenda(anterior: unknown, destino: unknown): boolean {
  return ehEstadoVenda(anterior) && ehEstadoVenda(destino)
    && TRANSICOES_VENDA[anterior].includes(destino);
}
