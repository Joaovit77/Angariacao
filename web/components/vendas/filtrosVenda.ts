/* Filtro e ordem da lista de Vendas, só no navegador e só sobre o que a sessão já leu.
   A busca por nome é recorte visual da lista: nunca identifica nem deduplica pessoas. */
import type { OportunidadeListadaVenda } from "@/lib/persistencia/vendasLeitura";
import { ESTADOS_VENDA, type EstadoVenda } from "@/lib/vendas/tipos";
import { detalheImovelVenda, rotuloInteressadoVenda, tituloImovelVenda } from "./rotulosVenda";

export type FiltroEtapaVenda = "todas" | "abertas" | EstadoVenda;
export const FILTROS_ETAPA_VENDA: readonly FiltroEtapaVenda[] = ["todas", "abertas", ...ESTADOS_VENDA];

export interface FiltrosVenda {
  readonly busca: string;
  readonly etapa: FiltroEtapaVenda;
  readonly mostrarArquivadas: boolean;
}
export const FILTROS_INICIAIS_VENDA: FiltrosVenda = { busca: "", etapa: "todas", mostrarArquivadas: false };

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Mais recente primeiro (`updated_at`), desempate estável pelo id. */
export function ordenarOportunidadesVenda(itens: readonly OportunidadeListadaVenda[]): OportunidadeListadaVenda[] {
  return [...itens].sort((a, b) => {
    const pa = a.oportunidade.atualizadoEm, pb = b.oportunidade.atualizadoEm;
    if (pa !== pb) return pa < pb ? 1 : -1;
    return a.oportunidade.id < b.oportunidade.id ? 1 : a.oportunidade.id > b.oportunidade.id ? -1 : 0;
  });
}

export function filtrarOportunidadesVenda(itens: readonly OportunidadeListadaVenda[], filtros: FiltrosVenda): OportunidadeListadaVenda[] {
  const busca = normalizar(filtros.busca);
  return ordenarOportunidadesVenda(itens).filter(({ oportunidade, interessadoNome, imovel }) => {
    if (!filtros.mostrarArquivadas && oportunidade.arquivadaEm !== null) return false;
    if (filtros.etapa === "abertas" && (oportunidade.estado === "ganha" || oportunidade.estado === "perdida")) return false;
    if (filtros.etapa !== "todas" && filtros.etapa !== "abertas" && oportunidade.estado !== filtros.etapa) return false;
    if (!busca) return true;
    const alvo = [rotuloInteressadoVenda(interessadoNome), tituloImovelVenda(imovel), detalheImovelVenda(imovel)].join(" ");
    return normalizar(alvo).includes(busca);
  });
}
