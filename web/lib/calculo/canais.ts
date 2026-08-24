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
import { chaveNormalizada, valorMaisUsado } from "../normalizacao";
import { foiAngariado, foiLocado, tempoAteLocacao } from "./motor";

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
  // Agrupa por origem normalizada apenas os imóveis efetivamente angariados.
  // A grafia dominante vira o rótulo: "Marketplace" e " marketplace " não
  // podem dividir um mesmo portal em duas barras no Dashboard.
  const porOrigem = new Map<string, { grafias: string[]; imoveis: Imovel[] }>();
  for (const i of imoveis) {
    if (!foiAngariado(i)) continue;
    const origem = (i.origemImovel && i.origemImovel.trim()) || ORIGEM_NAO_INFORMADA;
    const chave = chaveNormalizada(origem);
    const grupo = porOrigem.get(chave);
    if (grupo) {
      grupo.grafias.push(origem);
      grupo.imoveis.push(i);
    } else {
      porOrigem.set(chave, { grafias: [origem], imoveis: [i] });
    }
  }

  const linhas: CanalDesempenho[] = [];
  for (const { grafias, imoveis: lista } of porOrigem.values()) {
    const locadosLista = lista.filter(foiLocado);
    const tempos = locadosLista.map(tempoAteLocacao).filter((t): t is number => t != null && t >= 0);
    linhas.push({
      origem: valorMaisUsado(grafias),
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
