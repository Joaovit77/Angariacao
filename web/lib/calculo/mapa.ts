/* ================================================================
   CATEGORIAS DO MAPA — parte pura
   Em qual balde de cor cada imóvel cai no mapa, e a legenda que
   descreve esses baldes. Fonte única: o pino (MapaLeaflet) e a
   legenda/filtro (MapaView) leem daqui, então nunca divergem.

   Puro: consome só tipos + constantes + o motor (foiAngariado),
   sem React/Next/Leaflet/store.
   ================================================================ */
import { STATUS_TERMINAL_NEGATIVE } from "../constantes";
import type { Imovel } from "../tipos";
import { captacaoGanha } from "./motor";

export type CategoriaMapa = "locado" | "angariado" | "andamento" | "sem-sucesso";

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

/**
 * O balde do imóvel, decidido pelo DESFECHO ATUAL, não pelo histórico.
 *
 * A ordem importa: Locado e as saídas negativas ganham de "angariado" de
 * propósito. Um imóvel foi angariado e depois perdido conta como "tentado, sem
 * sucesso" — é o estado final que vale, igual à cor por status que já existia.
 * Sobra para "angariado" o que foi captado e segue na carteira sem locar
 * (Angariado, Autorização assinada, Publicado). "andamento" é o pipeline antes
 * da captação.
 *
 * Quem decide se a captação foi ganha é `captacaoGanha`, e não `foiAngariado`:
 * o imóvel cuja autorização o Sistema Principal marcou como assinada pode não
 * ter a etapa "Angariado" no histórico daqui, e pintá-lo de "em andamento"
 * diria no mapa que ainda estamos atrás de um proprietário que já assinou.
 */
export function categoriaMapa(i: Imovel): CategoriaMapa {
  if (i.status === "Locado") return "locado";
  if (TERMINAIS.includes(i.status)) return "sem-sucesso";
  if (captacaoGanha(i)) return "angariado";
  return "andamento";
}

export interface CategoriaMapaInfo {
  id: CategoriaMapa;
  label: string;
  cor: string;
}

/** Ordem e cores da legenda (funil: conseguiu → captou → tentando → falhou).
    O azul do "angariado" é distinto de propósito do verde do "locado" e do
    âmbar do "andamento", para os quatro baldes se separarem no olho. */
export const CATEGORIAS_MAPA: CategoriaMapaInfo[] = [
  { id: "locado", label: "Locado (conseguiu)", cor: "#5fb896" },
  { id: "angariado", label: "Angariado", cor: "#6f9bd8" },
  { id: "andamento", label: "Em andamento", cor: "#e0b458" },
  { id: "sem-sucesso", label: "Tentado, sem sucesso", cor: "#d97878" },
];

const COR_POR_CATEGORIA: Record<CategoriaMapa, string> = Object.fromEntries(
  CATEGORIAS_MAPA.map((c) => [c.id, c.cor]),
) as Record<CategoriaMapa, string>;

/** Cor do pino do imóvel — a mesma da sua categoria na legenda. */
export function corDaCategoria(i: Imovel): string {
  return COR_POR_CATEGORIA[categoriaMapa(i)];
}
