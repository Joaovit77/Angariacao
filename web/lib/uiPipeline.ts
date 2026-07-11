/* ================================================================
   ESTADO DE UI DO PIPELINE
   No app antigo isto eram variáveis de módulo (pipelineFilters,
   pipelineViewMode, pipelineColFilters, pipelineColSort,
   openPipelineCol, pipelineDrawerImovelId) que sobreviviam à troca
   de view. Um store Zustand mantém exatamente essa semântica: sair
   do Pipeline e voltar preserva filtros, ordenação e modo.
   Nada disso vai ao Supabase — é só exibição.
   ================================================================ */
import { create } from "zustand";
import {
  filtrosPipelineVazios,
  pipelineColFiltersVazios,
  type FiltrosPipeline,
  type PipelineCol,
  type PipelineColFilters,
  type PipelineColSort,
  type PipelineSortKey,
  type PipelineViewMode,
} from "./calculo/filtros";

interface PosicaoMenu {
  top: number;
  left: number;
}

interface PipelineUi {
  filters: FiltrosPipeline;
  viewMode: PipelineViewMode;
  colFilters: PipelineColFilters;
  colSort: PipelineColSort;
  openCol: PipelineCol | null;
  menuPos: PosicaoMenu;
  drawerImovelId: string | null;

  setFiltro: (campo: keyof FiltrosPipeline, valor: string) => void;
  setViewMode: (mode: PipelineViewMode) => void;
  setColSort: (key: PipelineSortKey, dir: "asc" | "desc") => void;
  limparColSort: () => void;
  toggleColValue: (col: PipelineCol, valor: string) => void;
  colSelectAll: (col: PipelineCol, valores: string[]) => void;
  colClear: (col: PipelineCol) => void;
  abrirColMenu: (col: PipelineCol, pos: PosicaoMenu) => void;
  fecharColMenu: () => void;
  abrirDrawer: (id: string) => void;
  fecharDrawer: () => void;
  aplicarFiltroColuna: (col: PipelineCol, valor: string) => void;
  aplicarBusca: (termo: string) => void;
}

export const usePipelineUi = create<PipelineUi>((set, get) => ({
  filters: filtrosPipelineVazios(),
  viewMode: "lista",
  colFilters: pipelineColFiltersVazios(),
  colSort: { key: null, dir: null },
  openCol: null,
  menuPos: { top: 0, left: 0 },
  drawerImovelId: null,

  setFiltro: (campo, valor) => set((s) => ({ filters: { ...s.filters, [campo]: valor } })),

  // Ao entrar na Lista, os selects single-value do topo ficam ocultos; migramos
  // seus valores ativos para os arrays de coluna equivalentes, para nenhum filtro
  // ficar ativo e invisível. Cidade não tem coluna, então permanece no topo.
  setViewMode: (mode) => {
    const s = get();
    if (mode === s.viewMode) return;
    if (mode === "lista") {
      const mapa: Array<[keyof FiltrosPipeline, PipelineCol]> = [
        ["tipo", "tipo"],
        ["bairro", "bairro"],
        ["status", "status"],
        ["responsavel", "captador"],
      ];
      const filters = { ...s.filters };
      const colFilters: PipelineColFilters = {
        bairro: [...s.colFilters.bairro],
        tipo: [...s.colFilters.tipo],
        origem: [...s.colFilters.origem],
        status: [...s.colFilters.status],
        captador: [...s.colFilters.captador],
      };
      for (const [campo, col] of mapa) {
        const valor = (filters[campo] || "").trim();
        if (valor && !colFilters[col].includes(valor)) colFilters[col].push(valor);
        filters[campo] = "";
      }
      set({ filters, colFilters, viewMode: mode });
      return;
    }
    set({ viewMode: mode, openCol: null, drawerImovelId: null });
  },

  setColSort: (key, dir) => set({ colSort: { key, dir }, openCol: null }),
  limparColSort: () => set({ colSort: { key: null, dir: null } }),

  toggleColValue: (col, valor) =>
    set((s) => {
      const arr = s.colFilters[col];
      const proximo = arr.includes(valor) ? arr.filter((v) => v !== valor) : [...arr, valor];
      return { colFilters: { ...s.colFilters, [col]: proximo } };
    }),

  colSelectAll: (col, valores) =>
    set((s) => ({ colFilters: { ...s.colFilters, [col]: valores.slice() } })),

  colClear: (col) => set((s) => ({ colFilters: { ...s.colFilters, [col]: [] } })),

  abrirColMenu: (col, pos) => set({ openCol: col, menuPos: pos }),
  fecharColMenu: () => set({ openCol: null }),

  abrirDrawer: (id) => set({ drawerImovelId: id }),
  fecharDrawer: () => set({ drawerImovelId: null }),

  // Usado pelos Insights: zera todos os filtros e deixa ativo só um valor de uma
  // coluna, na Lista (onde os filtros de coluna aparecem no cabeçalho e podem ser
  // limpos). Entra direto no estado final, sem passar pela migração do setViewMode.
  aplicarFiltroColuna: (col, valor) =>
    set({
      filters: filtrosPipelineVazios(),
      colFilters: { ...pipelineColFiltersVazios(), [col]: [valor] },
      viewMode: "lista",
      colSort: { key: null, dir: null },
      openCol: null,
      drawerImovelId: null,
    }),

  // Também usado pelos Insights: zera tudo e busca por um termo livre (ex.: o
  // código de um imóvel específico), na Lista. A busca cobre código, endereço,
  // proprietário, bairro etc. (ver filtrarImoveis).
  aplicarBusca: (termo) =>
    set({
      filters: { ...filtrosPipelineVazios(), search: termo },
      colFilters: pipelineColFiltersVazios(),
      viewMode: "lista",
      colSort: { key: null, dir: null },
      openCol: null,
      drawerImovelId: null,
    }),
}));
