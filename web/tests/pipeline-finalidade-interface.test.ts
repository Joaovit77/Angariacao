// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PipelineView from "@/components/pipeline/PipelineView";
import { useAppStore } from "@/lib/store";
import { usePipelineUi } from "@/lib/uiPipeline";
import { CARTEIRA_FINALIDADE, RETIRADOS_FINALIDADE } from "./fixtures/pipeline-finalidade";

vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ usuario: null }) }));
vi.mock("@/lib/mutacoes", () => ({ aplicarMudancaDeStatus: vi.fn(), excluirImovel: vi.fn(), salvarImovel: vi.fn() }));
vi.mock("@/components/pipeline/BotaoAbordagemAnuncio", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => createElement("a", { ...props, href }, children) }));

beforeEach(() => {
  usePipelineUi.setState(usePipelineUi.getInitialState(), true);
  useAppStore.setState({ imoveis: [...CARTEIRA_FINALIDADE, ...RETIRADOS_FINALIDADE], abordagens: [] });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const selecionar = (valor: string) => fireEvent.change(screen.getByRole("combobox", { name: "Finalidade" }), { target: { value: valor } });

describe("Finalidade no Pipeline real", () => {
  it.each(["lista", "kanban", "retirados"] as const)("select nativo com cinco opções em %s", (modo) => {
    usePipelineUi.getState().setViewMode(modo);
    render(createElement(PipelineView));
    const select = screen.getByRole("combobox", { name: "Finalidade" });
    expect(select.tagName).toBe("SELECT");
    expect(within(select).getAllByRole("option").map((o) => [o.getAttribute("value"), o.textContent])).toEqual([
      ["", "Todas"], ["locacao", "Locação"], ["venda", "Venda"], ["locacao_venda", "Locação e venda"], ["nao_informado", "Não informado"],
    ]);
  });
  it("texto completo na célula de endereço, sem criar coluna", () => {
    const { container } = render(createElement(PipelineView));
    const textos = [...container.querySelectorAll(".pipeline-finalidade-mobile")];
    expect(textos.map((s) => s.textContent?.trim())).toEqual(["Locação", "Venda", "Locação e venda", "Não informado", "Não informado"]);
    expect(container.querySelectorAll("thead th")).toHaveLength(14);
    for (const span of textos) { expect((span.parentElement as HTMLTableCellElement).cellIndex).toBe(2); expect(span.parentElement?.parentElement?.children).toHaveLength(14); }
  });
  it("Venda reduz Lista e Kanban e mantém denominador e preços IV-3A", () => {
    const { container } = render(createElement(PipelineView));
    selecionar("venda");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText("IV-V")).toBeDefined();
    expect(container.querySelector("#pipeline-result-count")?.textContent).toMatch(/1 de 5/);
    expect(container.querySelector("[data-valores-imovel]")?.textContent?.replace(/\u00a0/g, " ")).toBe("Venda R$ 450.000,55");
    fireEvent.click(screen.getByRole("button", { name: "Kanban" }));
    expect(container.querySelectorAll(".kanban-card")).toHaveLength(1);
    expect(container.querySelector(".kanban-col-count")?.textContent).toBe("1");
    expect((screen.getByRole("combobox", { name: "Finalidade" }) as HTMLSelectElement).value).toBe("venda");
    expect(container.querySelector(".kanban-card .pipeline-finalidade-mobile")).toBeNull();
  });
  it("Retirados aplica finalidade sem seleção para locação em lote", () => {
    const { container } = render(createElement(PipelineView));
    fireEvent.click(screen.getByRole("button", { name: /Retirados/ })); selecionar("venda");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(screen.getByText("R-IV-V")).toBeDefined();
    expect(container.querySelector("#pipeline-result-count")?.textContent).toMatch(/1 de 5/);
    expect(container.querySelector("tbody input[type=checkbox]")).toBeNull();
  });
  it("navegação interna desmonta/remonta sem perder filtro e Todas não apaga busca", () => {
    const primeiro = render(createElement(PipelineView)); selecionar("venda");
    fireEvent.change(screen.getByPlaceholderText(/Buscar por código/), { target: { value: "José" } });
    primeiro.unmount();
    const segundo = render(createElement(PipelineView));
    expect((screen.getByRole("combobox", { name: "Finalidade" }) as HTMLSelectElement).value).toBe("venda");
    selecionar("");
    expect((screen.getByPlaceholderText(/Buscar por código/) as HTMLInputElement).value).toBe("José");
    expect(segundo.container.querySelectorAll("tbody tr")).toHaveLength(1);
  });
  it("drawer legado permanece aberto quando o filtro passa a Venda", () => {
    const { container } = render(createElement(PipelineView));
    fireEvent.click(screen.getByText("IV-N")); selecionar("venda");
    const drawer = container.querySelector(".pipeline-drawer") as HTMLElement;
    expect(within(drawer).getByText("Não informado")).toBeDefined();
    expect(usePipelineUi.getState().drawerImovelId).toBe("nulo");
  });
  it("Não informado não modifica os objetos sem finalidade", () => {
    render(createElement(PipelineView)); selecionar("nao_informado");
    expect(screen.getByText("IV-N")).toBeDefined(); expect(screen.getByText("IV-U")).toBeDefined();
    expect(Object.hasOwn(useAppStore.getState().imoveis.find((i) => i.id === "ausente")!, "finalidade")).toBe(false);
    act(() => usePipelineUi.getState().setFiltro("finalidade", ""));
  });
});
