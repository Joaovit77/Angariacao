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
      i.proprietarioTelefone, i.tipo, i.unidade, i.bloco, i.edificio,
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

// Colunas ordenáveis: as filtráveis + "codigo" (que não é filtro, só ordena).
export type PipelineSortKey = PipelineCol | "codigo";

export const PIPELINE_SORT_ACCESSOR: Record<PipelineSortKey, (i: Imovel) => string | null | undefined> = {
  ...PIPELINE_COL_ACCESSOR,
  codigo: (i) => i.codigo,
};

export interface PipelineColSort {
  key: PipelineSortKey | null;
  dir: "asc" | "desc" | null;
}

// Comparação "natural": trata os trechos de dígitos como número, então
// LD-100 vem DEPOIS de LD-99 (na ordem alfabética pura viria logo após
// LD-10, como se o código fosse "10"). Vale para qualquer coluna — códigos,
// bairros e nomes numerados sofrem do mesmo problema.
function compararNatural(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

// Ordena a Lista: por coluna quando há sort ativo; senão, o padrão (mais
// recentes primeiro por data de cadastro). Port de sortPipelineLista().
export function ordenarPipelineLista(imoveis: Imovel[], colSort: PipelineColSort): Imovel[] {
  const arr = imoveis.slice();
  if (colSort.key && PIPELINE_SORT_ACCESSOR[colSort.key]) {
    const accessor = PIPELINE_SORT_ACCESSOR[colSort.key];
    const fator = colSort.dir === "desc" ? -1 : 1;
    return arr.sort((a, b) => fator * compararNatural(accessor(a) || "", accessor(b) || ""));
  }
  return arr.sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
}

export function pipelineUniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
