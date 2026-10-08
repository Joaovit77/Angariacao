// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModalLocacaoLote from "@/components/modais/ModalLocacaoLote";
import PipelineView from "@/components/pipeline/PipelineView";
import { MENSAGEM_FINALIDADE_VENDA_LOCACAO } from "@/lib/calculo/finalidadeOperacional";
import type { PoliticaRepasse, ResultadoPreviaRepasse } from "@/lib/repasses";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { usePipelineUi } from "@/lib/uiPipeline";
import { CARTEIRA_FINALIDADE } from "./fixtures/pipeline-finalidade";

/* Imóvel de venda, IV-4A: a tela acompanha a guarda do banco. Lista, Kanban
   e o modal de locação em lote reais, com a carteira sintética das quatro
   finalidades (mais o campo ausente). O banco é coberto em
   `imovel-venda-iv4a-banco.test.ts`; aqui a prévia é simulada. */

const toast = vi.hoisted(() => vi.fn());
const repasses = vi.hoisted(() => ({
  carregarPoliticasRepasse: vi.fn(),
  preverRepassesLocacao: vi.fn(),
  locarImoveisEmLote: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("@/lib/repasses", () => repasses);
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ usuario: { id: "usuario-iv4a" } }) }));
vi.mock("@/lib/mutacoes", () => ({
  aplicarMudancaDeStatus: vi.fn(), excluirImovel: vi.fn(), salvarImovel: vi.fn(), recarregarEstado: vi.fn(),
}));
vi.mock("@/components/pipeline/BotaoAbordagemAnuncio", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => createElement("a", { ...props, href }, children),
}));

const ID_POR_CODIGO: Record<string, string> = { "IV-L": "alugar", "IV-V": "vender", "IV-A": "ambos", "IV-N": "nulo", "IV-U": "ausente" };
const PERMITIDOS = ["IV-L", "IV-A", "IV-N", "IV-U"] as const;

const POLITICA: PoliticaRepasse = {
  id: "politica", nome: "Padrão", descricao: "", eventoOrigem: "locacao", regraPrimeiroVencimento: "mes_seguinte",
  diasVencimento: [10], tipoPrazo: "apos_primeiro_vencimento", quantidadeDias: 5, tipoContagem: "corridos",
  ajusteFimSemana: "manter", ajusteFeriado: "manter", ativo: true, padrao: true,
};
const previaOk = (id: string): ResultadoPreviaRepasse => ({
  ok: true,
  itens: [{ imovelId: id, rotulo: id, endereco: "", dataLocacao: "2026-10-08", diaVencimento: 10, primeiroVencimento: "2026-11-10", dataPrevista: "2026-11-15" }],
  erros: [],
});

beforeEach(() => {
  usePipelineUi.setState(usePipelineUi.getInitialState(), true);
  useUiModal.setState({ modal: null });
  useAppStore.setState({ imoveis: [...CARTEIRA_FINALIDADE], abordagens: [] });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  toast.mockReset();
  repasses.carregarPoliticasRepasse.mockReset().mockResolvedValue([POLITICA]);
  repasses.preverRepassesLocacao.mockReset();
  repasses.locarImoveisEmLote.mockReset().mockResolvedValue({ ok: true, itens: [], erros: [], totalImoveis: 1, totalRepasses: 1 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function marcar(codigo: string) {
  const linha = screen.getByText(codigo).closest("tr") as HTMLTableRowElement;
  fireEvent.click(linha.querySelector("input[type=checkbox]") as HTMLInputElement);
}

describe("IV-4A: Lista, botão Marcar como locado", () => {
  it("venda: não abre o fluxo de locação e explica por quê", () => {
    render(createElement(PipelineView));
    marcar("IV-V");
    fireEvent.click(screen.getByRole("button", { name: "Marcar como locado" }));
    expect(useUiModal.getState().modal).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toContain(MENSAGEM_FINALIDADE_VENDA_LOCACAO);
    expect(toast.mock.calls[0][1]).toBe("error");
  });

  it.each(PERMITIDOS)("%s (locação, locação e venda, null e ausente) continua abrindo o fluxo", (codigo) => {
    render(createElement(PipelineView));
    marcar(codigo);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como locado" }));
    expect(useUiModal.getState().modal).toEqual({ tipo: "locarEmLote", ids: [ID_POR_CODIGO[codigo]] });
    expect(toast).not.toHaveBeenCalled();
  });

  it("seleção mista com venda é barrada inteira; sem a venda, os demais seguem juntos", () => {
    render(createElement(PipelineView));
    for (const codigo of ["IV-L", "IV-V", "IV-A", "IV-N"]) marcar(codigo);
    fireEvent.click(screen.getByRole("button", { name: "Marcar como locado" }));
    expect(useUiModal.getState().modal).toBeNull();
    expect(toast.mock.calls[0][0]).toMatch(/Desmarque IV-V para continuar\.$/);

    marcar("IV-V");
    fireEvent.click(screen.getByRole("button", { name: "Marcar como locado" }));
    expect(useUiModal.getState().modal).toEqual({ tipo: "locarEmLote", ids: ["alugar", "ambos", "nulo"] });
  });
});

describe("IV-4A: Kanban, arrastar para Locado", () => {
  async function arrastarParaLocado(codigo: string) {
    usePipelineUi.getState().setViewMode("kanban");
    const { container } = render(createElement(PipelineView));
    const card = screen.getByText(codigo).closest(".kanban-card") as HTMLElement;
    const coluna = [...container.querySelectorAll<HTMLElement>(".kanban-col")]
      .find((col) => col.querySelector(".kanban-col-head")?.textContent?.includes("Locado")) as HTMLElement;
    const dataTransfer = { setData: vi.fn(), getData: () => ID_POR_CODIGO[codigo], effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(coluna, { dataTransfer });
    await act(async () => { fireEvent.drop(coluna, { dataTransfer }); });
  }

  it("venda não entra no fluxo Locado e recebe o aviso", async () => {
    await arrastarParaLocado("IV-V");
    expect(useUiModal.getState().modal).toBeNull();
    expect(toast).toHaveBeenCalledWith(MENSAGEM_FINALIDADE_VENDA_LOCACAO, "error");
  });

  it.each(PERMITIDOS)("%s continua abrindo o modal de locação ao soltar em Locado", async (codigo) => {
    await arrastarParaLocado(codigo);
    expect(useUiModal.getState().modal).toEqual({ tipo: "locarEmLote", ids: [ID_POR_CODIGO[codigo]] });
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("IV-4A: ModalLocacaoLote", () => {
  const botaoConfirmar = () => screen.getByRole("button", { name: "Confirmar locações" }) as HTMLButtonElement;

  it("venda: mostra o erro que o banco devolve na prévia e não confirma", async () => {
    repasses.preverRepassesLocacao.mockResolvedValue({
      ok: false, itens: [],
      erros: [{ imovelId: "vender", rotulo: "IV-V", codigo: "finalidade_venda", mensagem: MENSAGEM_FINALIDADE_VENDA_LOCACAO }],
    });
    render(createElement(ModalLocacaoLote, { imovelIds: ["vender"] }));
    await waitFor(() => expect(screen.getByText(new RegExp(MENSAGEM_FINALIDADE_VENDA_LOCACAO))).toBeDefined());
    expect(botaoConfirmar().disabled).toBe(true);
  });

  it("venda com uma prévia ok (antiga ou adulterada) continua sem confirmar", async () => {
    repasses.preverRepassesLocacao.mockResolvedValue(previaOk("vender"));
    render(createElement(ModalLocacaoLote, { imovelIds: ["vender"] }));
    await waitFor(() => expect(repasses.preverRepassesLocacao).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/serão marcados como locados/)).toBeDefined());
    expect(botaoConfirmar().disabled).toBe(true);
    fireEvent.click(botaoConfirmar());
    expect(repasses.locarImoveisEmLote).not.toHaveBeenCalled();
  });

  it.each(["alugar", "ambos", "nulo", "ausente"])("%s confirma como antes", async (id) => {
    repasses.preverRepassesLocacao.mockResolvedValue(previaOk(id));
    render(createElement(ModalLocacaoLote, { imovelIds: [id] }));
    await waitFor(() => expect(botaoConfirmar().disabled).toBe(false));
    await act(async () => { fireEvent.click(botaoConfirmar()); });
    expect(repasses.locarImoveisEmLote).toHaveBeenCalledTimes(1);
    expect(repasses.locarImoveisEmLote.mock.calls[0][2]).toEqual([expect.objectContaining({ imovelId: id })]);
  });
});
