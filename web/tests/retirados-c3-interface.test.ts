// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RelatoriosView from "@/components/relatorios/RelatoriosView";
import { MOTIVOS_RETIRADA } from "@/lib/constantes";
import { useAppStore } from "@/lib/store";
import type { Imovel } from "@/lib/tipos";

const banco = vi.hoisted(() => ({ acesso: vi.fn() }));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => {
    banco.acesso();
    throw new Error("O relatório não pode acessar ou escrever no banco.");
  },
}));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ usuario: { user_metadata: { name: "Conta de teste" } } }),
  rotuloUsuario: () => "Conta de teste",
}));

const carteira: Imovel[] = [
  { id: "1", codigo: "LD-2", referenciaCrm: "CRM-2", endereco: "Rua José; 2", tipo: "Casa", status: "Publicado", retirado: true, retiradoEm: "2026-10-01", retiradoMotivo: "vendido", retiradoObservacao: null },
  { id: "2", codigo: "LD-10", referenciaCrm: "CRM-10", endereco: "Rua B", tipo: "Apartamento", status: "Angariado", retirado: true, retiradoEm: "2026-10-03", retiradoMotivo: "locado-proprietario", retiradoObservacao: 'Avisou; "ontem"\r\nConfirmou hoje' },
  { id: "3", codigo: "LEG-1", endereco: "Rua do legado", status: "Locado", retirado: true, retiradoEm: null, retiradoMotivo: null, retiradoObservacao: null },
  { id: "4", codigo: "ATIVO", endereco: "Rua ativa", status: "Publicado", retirado: false, statusHistory: [{ status: "Angariado", date: "2026-10-01" }] },
  { id: "5", codigo: "REATIVADO", endereco: "Rua reativada", status: "Publicado", retirado: false, notas: [{ id: "r", data: "2026-10-01", texto: "Retirado da carteira. Motivo: Vendido." }] },
];
let blobs: Blob[];
let nomes: string[];
const transporte = vi.fn();

function abrirRetirados() {
  render(createElement(RelatoriosView));
  fireEvent.click(screen.getByRole("button", { name: "Retirados" }));
}
function total(rotulo: string): string | null | undefined {
  return screen.getByText(rotulo).parentElement?.querySelector(".report-stat-value")?.textContent;
}
function codigos(): string[] {
  return within(screen.getByRole("table", { name: "Imóveis atualmente retirados" }))
    .getAllByRole("row").slice(1).map((linha) => within(linha).getAllByRole("cell")[0].textContent!);
}
function lerBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsText(blob);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  banco.acesso.mockClear();
  transporte.mockClear();
  blobs = [];
  nomes = [];
  const OriginalURL = URL;
  vi.stubGlobal("URL", class extends OriginalURL {
    static createObjectURL(blob: Blob) { blobs.push(blob); return "blob:c3"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("fetch", transporte);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    nomes.push(this.download);
  });
  useAppStore.getState().limparEstado();
  useAppStore.setState({ imoveis: structuredClone(carteira), carregado: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useAppStore.getState().limparEstado();
});

describe("C3: interface de leitura", () => {
  it("acrescenta a quarta aba e preserva Mensal como modo inicial", () => {
    render(createElement(RelatoriosView));
    for (const nome of ["Mensal", "Semanal", "Completo", "Retirados"]) expect(screen.getByRole("button", { name: nome })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Relatório Mensal" })).toBeTruthy();
    expect(screen.queryByLabelText("Motivo da retirada")).toBeNull();
    expect(screen.getByRole("button", { name: "Exportar imóveis (CSV)" })).toBeTruthy();
  });

  it("Retirados começa com Todos/Todos os períodos e inclui legados sem impor status", () => {
    abrirRetirados();
    expect((screen.getByLabelText("Motivo da retirada") as HTMLSelectElement).value).toBe("todos");
    expect((screen.getByLabelText("Período de retirada") as HTMLSelectElement).value).toBe("todos");
    expect(screen.queryByLabelText("Data inicial")).toBeNull();
    expect(codigos()).toEqual(["LD-10", "LD-2", "LEG-1"]);
    expect(total("Total filtrado")).toBe("3");
    expect(total("Sem data informada")).toBe("1");
    expect(screen.getByText("Publicado")).toBeTruthy();
    expect(screen.getByText("Locado")).toBeTruthy();
    const legado = screen.getByText("LEG-1").closest("tr")!;
    expect(within(legado).getAllByRole("cell").slice(5).map((celula) => celula.textContent)).toEqual(["Não informado", "Não informado", "Não informado"]);
    expect(screen.queryByText("ATIVO")).toBeNull();
    expect(screen.queryByText("REATIVADO")).toBeNull();
  });

  it("seletor de motivo reusa os sete motivos oficiais e oferece Não informado", () => {
    abrirRetirados();
    const opcoes = within(screen.getByLabelText("Motivo da retirada")).getAllByRole("option");
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual(["Todos", ...MOTIVOS_RETIRADA.map((m) => m.rotulo), "Não informado"]);
    fireEvent.change(screen.getByLabelText("Motivo da retirada"), { target: { value: "nao-informado" } });
    expect(codigos()).toEqual(["LEG-1"]);
    expect(total("Total filtrado")).toBe("1");
    expect(total("Sem data informada")).toBe("1");
  });

  it("motivo AND intervalo inclusivo atualizam contadores, tabela e cabeçalho impresso", () => {
    abrirRetirados();
    fireEvent.change(screen.getByLabelText("Motivo da retirada"), { target: { value: "vendido" } });
    fireEvent.change(screen.getByLabelText("Período de retirada"), { target: { value: "intervalo" } });
    expect(screen.getByRole("alert").textContent).toContain("Informe a data inicial");
    expect((screen.getByRole("button", { name: "Exportar retirados (CSV)" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-03" } });
    expect(codigos()).toEqual(["LD-2"]);
    expect(total("Total filtrado")).toBe("1");
    expect(total("Sem data informada")).toBe("0");
    expect(screen.getByText("01/10/2026 a 03/10/2026 (inclusive)")).toBeTruthy();
    expect(within(screen.getByLabelText("Distribuição dos imóveis retirados por motivo")).getByText("Vendido")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Data não informada e Limpar filtros não escrevem nem alteram a carteira", () => {
    const antes = structuredClone(useAppStore.getState().imoveis);
    abrirRetirados();
    fireEvent.change(screen.getByLabelText("Período de retirada"), { target: { value: "nao-informada" } });
    expect(codigos()).toEqual(["LEG-1"]);
    fireEvent.change(screen.getByLabelText("Motivo da retirada"), { target: { value: "vendido" } });
    expect(screen.queryByRole("table", { name: "Imóveis atualmente retirados" })).toBeNull();
    expect(total("Total filtrado")).toBe("0");
    expect(total("Sem data informada")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(codigos()).toEqual(["LD-10", "LD-2", "LEG-1"]);
    expect(useAppStore.getState().imoveis).toEqual(antes);
    expect(banco.acesso).not.toHaveBeenCalled();
    expect(transporte).not.toHaveBeenCalled();
  });

  it("reativação no estado carregado remove a linha e nova retirada mostra só os dados atuais", () => {
    abrirRetirados();
    act(() => useAppStore.getState().setImoveis(carteira.map((i) => i.id === "3" ? { ...i, retirado: false } : i)));
    expect(codigos()).toEqual(["LD-10", "LD-2"]);
    act(() => useAppStore.getState().setImoveis(carteira.map((i) => i.id === "3" ? { ...i, retirado: true, retiradoEm: "2026-10-03", retiradoMotivo: "desistiu" } : i)));
    const linha = screen.getByText("LEG-1").closest("tr")!;
    expect(within(linha).getByText("03/10/2026")).toBeTruthy();
    expect(within(linha).getByText("Desistiu de alugar")).toBeTruthy();
  });

  it("exporta exatamente a tabela filtrada e não modifica dados ou CSVs antigos", async () => {
    render(createElement(RelatoriosView));
    fireEvent.click(screen.getByRole("button", { name: "Exportar imóveis (CSV)" }));
    const antigo = await lerBlob(blobs[0]);
    fireEvent.click(screen.getByRole("button", { name: "Retirados" }));
    fireEvent.change(screen.getByLabelText("Motivo da retirada"), { target: { value: "locado-proprietario" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar retirados (CSV)" }));
    const csv = await lerBlob(blobs[1]);
    expect(nomes[1]).toBe("imoveis-atualmente-retirados-2026-10-03.csv");
    expect(csv).toContain('LD-10;CRM-10;Rua B;Apartamento;Angariado;03/10/2026;Locado pelo proprietário;"Avisou; ""ontem""\r\nConfirmou hoje"');
    expect(csv).not.toContain("LEG-1");
    expect(csv).not.toContain("LD-2;");
    fireEvent.click(screen.getByRole("button", { name: "Mensal" }));
    fireEvent.click(screen.getByRole("button", { name: "Exportar imóveis (CSV)" }));
    expect(await lerBlob(blobs[2])).toBe(antigo);
    expect(useAppStore.getState().imoveis).toEqual(carteira);
    expect(banco.acesso).not.toHaveBeenCalled();
    expect(transporte).not.toHaveBeenCalled();
  });

  it("impressão usa window.print e o mesmo documento com filtros e descrição do recorte", () => {
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    abrirRetirados();
    fireEvent.click(screen.getByRole("button", { name: "Imprimir / salvar PDF" }));
    expect(imprimir).toHaveBeenCalledOnce();
    expect(document.querySelector("#report-doc .rr-doc .report-print-header")?.textContent).toContain("Imóveis atualmente retirados");
    expect(document.querySelector("#report-doc .rr-filtros-aplicados")?.textContent).toContain("Todos os períodos");
    expect(screen.getByText(/Não representa o histórico de todas as retiradas/)).toBeTruthy();
    expect(screen.getByText('Avisou; "ontem" Confirmou hoje')).toBeTruthy();
    expect(banco.acesso).not.toHaveBeenCalled();
    expect(transporte).not.toHaveBeenCalled();
  });

  it("Mensal, Semanal e Completo continuam disponíveis após usar filtros do C3", () => {
    abrirRetirados();
    fireEvent.change(screen.getByLabelText("Motivo da retirada"), { target: { value: "vendido" } });
    for (const [modo, titulo] of [["Semanal", "Relatório Semanal"], ["Completo", "Relatório Completo"], ["Mensal", "Relatório Mensal"]]) {
      fireEvent.click(screen.getByRole("button", { name: modo }));
      expect(screen.getByRole("heading", { name: titulo })).toBeTruthy();
      expect(screen.queryByLabelText("Motivo da retirada")).toBeNull();
      expect(screen.getByRole("button", { name: "Exportar imóveis (CSV)" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Exportar canais (CSV)" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Exportar abordagens (CSV)" })).toBeTruthy();
    }
  });
});
