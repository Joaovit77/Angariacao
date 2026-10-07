import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePipelineUi } from "@/lib/uiPipeline";

beforeEach(() => usePipelineUi.setState(usePipelineUi.getInitialState(), true));

describe("estado compartilhado de finalidade", () => {
  it.each(["locacao", "venda", "locacao_venda", "nao_informado"])("preserva %s nos três modos", (finalidade) => {
    usePipelineUi.getState().setFiltro("finalidade", finalidade);
    for (const modo of ["kanban", "lista", "retirados", "kanban"] as const) {
      usePipelineUi.getState().setViewMode(modo);
      expect(usePipelineUi.getState().filters.finalidade).toBe(finalidade);
    }
  });
  it("Todas limpa somente a finalidade, inclusive após migrar filtros de coluna", () => {
    const ui = usePipelineUi.getState();
    ui.setViewMode("kanban");
    for (const [campo, valor] of Object.entries({ finalidade: "venda", cidade: "Curitiba", search: "José", responsavel: "Ana", status: "Publicado", tipo: "Casa", bairro: "Centro" })) ui.setFiltro(campo as keyof typeof ui.filters, valor);
    ui.setViewMode("lista");
    const antes = usePipelineUi.getState();
    ui.setFiltro("finalidade", "");
    expect(usePipelineUi.getState().filters).toEqual({ ...antes.filters, finalidade: "" });
    expect(usePipelineUi.getState().colFilters).toEqual(antes.colFilters);
  });
  it.each(["aplicarBusca", "aplicarFiltroColuna"] as const)("%s reinicia finalidade com os demais filtros", (atalho) => {
    const ui = usePipelineUi.getState();
    ui.setFiltro("finalidade", "venda"); ui.setFiltro("cidade", "Curitiba");
    ui.toggleColValue("status", "Publicado"); ui.abrirDrawer("vender");
    if (atalho === "aplicarBusca") ui.aplicarBusca("IV-V"); else ui.aplicarFiltroColuna("status", "Angariado");
    const depois = usePipelineUi.getState();
    expect(depois.filters.finalidade).toBe(""); expect(depois.filters.cidade).toBe("");
    expect(depois.filters.search).toBe(atalho === "aplicarBusca" ? "IV-V" : "");
    expect(depois.colFilters.status).toEqual(atalho === "aplicarBusca" ? [] : ["Angariado"]);
    expect(depois.viewMode).toBe("lista"); expect(depois.drawerImovelId).toBeNull();
  });
  it("uma nova carga do módulo nasce sem finalidade, sem persistência paralela", async () => {
    usePipelineUi.getState().setFiltro("finalidade", "venda");
    vi.resetModules();
    const { usePipelineUi: recarregado } = await import("@/lib/uiPipeline");
    expect(recarregado.getState().filters.finalidade).toBe("");
    expect(recarregado.getState().viewMode).toBe("lista");
  });
});
