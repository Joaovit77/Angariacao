import type { Imovel } from "../tipos";

export type OrdemKanban = "funil" | "mais-usados" | "personalizada";

/** Completa e higieniza uma ordem salva: descarta status antigos/duplicados e
    acrescenta no fim qualquer etapa criada depois que a preferência foi salva. */
export function normalizarOrdemKanban(statuses: readonly string[], ordem: readonly string[]): string[] {
  const validos = new Set(statuses);
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const status of ordem) {
    if (validos.has(status) && !vistos.has(status)) {
      vistos.add(status);
      resultado.push(status);
    }
  }
  for (const status of statuses) {
    if (!vistos.has(status)) resultado.push(status);
  }
  return resultado;
}

export function ordenarStatusKanban(
  statuses: readonly string[],
  imoveis: readonly Pick<Imovel, "status">[],
  modo: OrdemKanban,
  personalizada: readonly string[],
): string[] {
  if (modo === "personalizada") return normalizarOrdemKanban(statuses, personalizada);
  if (modo === "funil") return [...statuses];

  const contagem = new Map<string, number>();
  for (const imovel of imoveis) contagem.set(imovel.status, (contagem.get(imovel.status) || 0) + 1);
  // Sort estável: empates continuam na ordem natural do funil.
  return [...statuses].sort((a, b) => (contagem.get(b) || 0) - (contagem.get(a) || 0));
}

export function moverStatusKanban(ordem: readonly string[], origem: string, destino: string): string[] {
  if (origem === destino || !ordem.includes(origem) || !ordem.includes(destino)) return [...ordem];
  const proxima = ordem.filter((status) => status !== origem);
  proxima.splice(proxima.indexOf(destino), 0, origem);
  return proxima;
}

export function deslocarStatusKanban(
  ordem: readonly string[],
  status: string,
  direcao: -1 | 1,
): string[] {
  const indice = ordem.indexOf(status);
  const destino = indice + direcao;
  if (indice < 0 || destino < 0 || destino >= ordem.length) return [...ordem];
  const proxima = [...ordem];
  [proxima[indice], proxima[destino]] = [proxima[destino], proxima[indice]];
  return proxima;
}
