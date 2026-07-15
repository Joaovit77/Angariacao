/* ================================================================
   DESEMPENHO POR CANAL DE CAPTAÇÃO — parte pura
   Feature nova da pós-migração (sem oráculo do app antigo).

   Cruza a carteira por ORIGEM do imóvel para responder "qual canal
   de prospecção rende mais?". Base: só os imóveis que efetivamente
   chegaram à etapa "Angariado" (foiAngariado) — captação concluída,
   não contato em andamento. Para cada origem: quantos foram
   angariados, quantos já locaram, o aproveitamento (locados ÷
   angariados) e o tempo médio da angariação à locação.

   Puro: consome só tipos + helpers do motor (foiAngariado /
   tempoAteLocacao), sem React/Next/Supabase/store.
   ================================================================ */
import type { Imovel } from "../tipos";
import { foiAngariado, tempoAteLocacao } from "./motor";

/** Rótulo de origem quando o imóvel não registra o canal. */
export const ORIGEM_NAO_INFORMADA = "Não informado";

export interface CanalDesempenho {
  origem: string;
  /** Imóveis do canal que chegaram à etapa Angariado. Sempre ≥ 1 por construção. */
  angariados: number;
  /** Dos angariados, quantos já estão Locado. */
  locados: number;
  /** Aproveitamento: locados ÷ angariados, em % (0–100). */
  conversao: number;
  /** Média de dias da angariação à locação; null se o canal ainda não locou. */
  tempoMedio: number | null;
}

export function desempenhoPorCanal(imoveis: Imovel[]): CanalDesempenho[] {
  // Agrupa por origem apenas os imóveis efetivamente angariados.
  const porOrigem = new Map<string, Imovel[]>();
  for (const i of imoveis) {
    if (!foiAngariado(i)) continue;
    const origem = (i.origemImovel && i.origemImovel.trim()) || ORIGEM_NAO_INFORMADA;
    const lista = porOrigem.get(origem);
    if (lista) lista.push(i);
    else porOrigem.set(origem, [i]);
  }

  const linhas: CanalDesempenho[] = [];
  for (const [origem, lista] of porOrigem) {
    const locadosLista = lista.filter((i) => i.status === "Locado");
    const tempos = locadosLista.map(tempoAteLocacao).filter((t): t is number => t != null && t >= 0);
    linhas.push({
      origem,
      angariados: lista.length,
      locados: locadosLista.length,
      conversao: (locadosLista.length / lista.length) * 100,
      tempoMedio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
    });
  }

  // Do canal que mais angariou para o que menos angariou; empate pelo maior
  // número de locados e, por fim, ordem alfabética da origem (estável).
  return linhas.sort(
    (a, b) => b.angariados - a.angariados || b.locados - a.locados || a.origem.localeCompare(b.origem),
  );
}
