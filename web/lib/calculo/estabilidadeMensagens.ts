import type { ConversaImovel } from "./conversas";
import type { Imovel } from "../tipos";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "../persistencia/mapeadores";

export type LinhaParcialImovel = Partial<DbImovelRow> & Pick<DbImovelRow, "id">;

export function deveAplicarVersaoRealtime(ultima?: string, recebida?: string): boolean {
  if (!ultima || !recebida) return true;
  const ultimaEmMs = Date.parse(ultima);
  const recebidaEmMs = Date.parse(recebida);
  return Number.isFinite(ultimaEmMs) && Number.isFinite(recebidaEmMs)
    ? recebidaEmMs >= ultimaEmMs
    : recebida >= ultima;
}

/**
 * Reconcilia um evento de Realtime pela identidade canônica do imóvel.
 *
 * Postgres Changes normalmente entrega a linha inteira, mas pode omitir
 * colunas grandes quando o payload excede o limite do serviço. Ausência de
 * coluna significa "não veio neste snapshot", não "apague o valor".
 */
export function reconciliarImovelRealtime(
  anterior: Imovel,
  linha: LinhaParcialImovel,
  userId: string,
): Imovel {
  const base = toDbImovel(anterior, userId);
  return fromDbImovel({ ...base, ...linha } as DbImovelRow);
}

/** Um evento sem retrato anterior só é seguro quando traz os históricos que
 * fazem a linha existir na Central de Mensagens. Caso contrário o chamador
 * deve reler o imóvel por id, em vez de criar uma entidade incompleta. */
export function linhaRealtimeSuficiente(linha: Partial<DbImovelRow>): linha is DbImovelRow {
  return (
    typeof linha.id === "string" &&
    typeof linha.user_id === "string" &&
    typeof linha.endereco === "string" &&
    typeof linha.status === "string" &&
    Object.hasOwn(linha, "notas") &&
    Object.hasOwn(linha, "tentativas") &&
    Object.hasOwn(linha, "status_history")
  );
}

/**
 * Mantém a conversa escolhida enquanto o imóvel ainda existe no estado.
 * O fallback para a primeira conversa só é permitido após remoção real.
 */
export function conversaSelecionadaEstavel(
  conversas: ConversaImovel[],
  visiveis: ConversaImovel[],
  selecionadaId: string | null,
  ultimaSelecionada: ConversaImovel | null,
  imoveis: Imovel[],
): ConversaImovel | null {
  if (selecionadaId) {
    const atual = conversas.find((conversa) => conversa.imovel.id === selecionadaId);
    if (atual) return atual;
    if (
      ultimaSelecionada?.imovel.id === selecionadaId &&
      imoveis.some((imovel) => imovel.id === selecionadaId)
    ) {
      return ultimaSelecionada;
    }
  }
  return visiveis[0] || null;
}
