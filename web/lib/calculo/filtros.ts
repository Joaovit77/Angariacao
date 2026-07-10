/* ================================================================
   FILTROS DO PIPELINE (parte pura)
   Port literal de filteredImoveisEnhanced / matchesPipelineColFilters /
   pipelineColDistinct / pipelineUniqueSorted do app.js original.
   No app antigo essas funções liam os globals pipelineFilters,
   pipelineViewMode e pipelineColFilters; aqui recebem tudo por
   parâmetro (mesma lógica, forma pura).
   ================================================================ */
import type { Imovel } from "../tipos";

export interface FiltrosPipeline {
  search: string;
  tipo: string;
  bairro: string;
  status: string;
  responsavel: string;
  cidade: string;
}

export type PipelineViewMode = "kanban" | "lista";

export type PipelineCol = "bairro" | "tipo" | "origem" | "status" | "captador";

/** Arrays vazios = coluna sem filtro; valores marcados combinam em OR
    dentro da coluna, e colunas diferentes combinam em AND. */
export type PipelineColFilters = Record<PipelineCol, string[]>;

export function filtrosPipelineVazios(): FiltrosPipeline {
  return { search: "", tipo: "", bairro: "", status: "", responsavel: "", cidade: "" };
}

export function pipelineColFiltersVazios(): PipelineColFilters {
  return { bairro: [], tipo: [], origem: [], status: [], captador: [] };
}

// Cada coluna filtrável -> campo no imóvel e rótulo do cabeçalho.
export const PIPELINE_COL_ACCESSOR: Record<PipelineCol, (i: Imovel) => string | null | undefined> = {
  bairro: (i) => i.bairro,
  tipo: (i) => i.tipo,
  origem: (i) => i.origemImovel,
  status: (i) => i.status,
  captador: (i) => i.responsavel,
};
export const PIPELINE_COL_LABEL: Record<PipelineCol, string> = { bairro: "Bairro", tipo: "Tipo", origem: "Origem", status: "Status", captador: "Captador" };
export const PIPELINE_COL_EMPTY = "(vazio)"; // rótulo exibido para valores em branco (mapeado ao "" real)

export function filtrarImoveis(
  imoveis: Imovel[],
  filters: FiltrosPipeline,
  viewMode: PipelineViewMode,
  colFilters: PipelineColFilters,
): Imovel[] {
  const s = (filters.search || "").toLowerCase().trim();
  return imoveis.filter((i) => {
    if (filters.tipo && i.tipo !== filters.tipo) return false;
    if (filters.bairro && i.bairro !== filters.bairro) return false;
    if (filters.status && i.status !== filters.status) return false;
    if (filters.responsavel && i.responsavel !== filters.responsavel) return false;
    if (filters.cidade && i.cidade !== filters.cidade) return false;
    // Filtros de coluna (estilo Explorer) só atuam na Lista — no Kanban são
    // ignorados, para não alterar o comportamento existente do quadro.
    if (viewMode === "lista" && !matchesPipelineColFilters(i, colFilters)) return false;
    const haystack = [
      i.codigo, i.proprietarioNome, i.endereco, i.bairro, i.cidade,
      i.proprietarioTelefone, i.tipo,
    ].join(" ").toLowerCase();
    if (s && !haystack.includes(s)) return false;
    return true;
  });
}

// AND entre colunas, OR dentro de cada coluna. Coluna sem valores marcados não
// filtra nada.
export function matchesPipelineColFilters(i: Imovel, colFilters: PipelineColFilters): boolean {
  for (const col of Object.keys(colFilters) as PipelineCol[]) {
    const selecionados = colFilters[col];
    if (!selecionados.length) continue;
    const valor = (PIPELINE_COL_ACCESSOR[col](i) || "").trim();
    if (!selecionados.includes(valor)) return false;
  }
  return true;
}

// Valores distintos de uma coluna (ordem estável pt-BR). Vazio vira "" — a
// checklist o exibe como "(vazio)".
export function pipelineColDistinct(imoveis: Imovel[], col: PipelineCol): string[] {
  const accessor = PIPELINE_COL_ACCESSOR[col];
  const valores = imoveis.map((i) => (accessor(i) || "").trim());
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface PipelineColSort {
  key: PipelineCol | null;
  dir: "asc" | "desc" | null;
}

// Ordena a Lista: por coluna quando há sort ativo; senão, o padrão (mais
// recentes primeiro por data de cadastro). Port de sortPipelineLista().
export function ordenarPipelineLista(imoveis: Imovel[], colSort: PipelineColSort): Imovel[] {
  const arr = imoveis.slice();
  if (colSort.key && PIPELINE_COL_ACCESSOR[colSort.key]) {
    const accessor = PIPELINE_COL_ACCESSOR[colSort.key];
    const fator = colSort.dir === "desc" ? -1 : 1;
    return arr.sort((a, b) => fator * (accessor(a) || "").localeCompare(accessor(b) || "", "pt-BR"));
  }
  return arr.sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
}

export function pipelineUniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
