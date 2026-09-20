// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  imoveis: [] as Array<Record<string, unknown>>,
  fecharModal: vi.fn(),
  abrirModal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({
    estado: "auth",
    usuario: { id: "usuario-1", nome: "Corretor Teste" },
  }),
  captadorPadrao: () => "Corretor Teste",
  rotuloUsuario: (usuario: { nome?: string }) => usuario.nome || "Corretor",
}));
vi.mock("@/lib/useCidadePadraoDaConta", () => ({
  useCidadePadraoDaConta: () => ({
    origem: "configurada",
    cidade: "Londrina",
    uf: "PR",
  }),
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (seletor: (estado: Record<string, unknown>) => unknown) => seletor({
    imoveis: cenario.imoveis,
    config: {
      comissaoPercent: 100,
      origensExtras: [],
    },
    iaDisponivel: false,
  }),
}));
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: Record<string, unknown>) => unknown) => seletor({
    fecharModal: cenario.fecharModal,
    abrirModal: cenario.abrirModal,
  }),
}));

import AvaliacaoRapidaView from "@/components/avaliacao/AvaliacaoRapidaView";
import ModalImovel from "@/components/modais/ModalImovel";
import ModalPreCadastro from "@/components/modais/ModalPreCadastro";

function campoTexto(rotulo: string): HTMLInputElement {
  const label = screen.getByText(rotulo, { selector: "label" });
  const input = label.parentElement?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error("Campo não encontrado: " + rotulo);
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
  cenario.imoveis = [];
});
afterEach(cleanup);

describe("C2 — formulários de imóvel, pré-cadastro e avaliação", () => {
  it("ModalImovel aplica o default na criação e preserva a cidade da entidade na edição", async () => {
    render(createElement(ModalImovel, {}));
    await waitFor(() => expect(campoTexto("Cidade").value).toBe("Londrina"));
    expect(campoTexto("Estado / UF").value).toBe("PR");
    cleanup();

    cenario.imoveis = [{
      id: "imovel-cambe",
      codigo: "CB-1",
      endereco: "Rua França, 10",
      cidade: "Cambé",
      estado: "PR",
      tipo: "Casa",
      status: "Novo contato",
      statusHistory: [],
      notas: [],
      tentativas: [],
    }];
    render(createElement(ModalImovel, { id: "imovel-cambe" }));
    expect(campoTexto("Cidade").value).toBe("Cambé");
    expect(campoTexto("Estado / UF").value).toBe("PR");
  });

  it("ModalPreCadastro aplica o default vazio e preserva o prefill explícito", async () => {
    render(createElement(ModalPreCadastro, {}));
    await waitFor(() => expect(campoTexto("Cidade").value).toBe("Londrina"));
    expect(campoTexto("Estado / UF").value).toBe("PR");
    cleanup();

    render(createElement(ModalPreCadastro, {
      inicial: { cidade: "Ibiporã", estado: "PR", endereco: "Rua Um" },
    }));
    expect(campoTexto("Cidade").value).toBe("Ibiporã");
    expect(campoTexto("Estado / UF").value).toBe("PR");
  });

  it("AvaliacaoRapidaView aplica o default no formulário vazio e preserva imóvel de outra cidade", async () => {
    render(createElement(AvaliacaoRapidaView, {}));
    await waitFor(() => expect(campoTexto("Cidade").value).toBe("Londrina"));
    expect((screen.getByText("UF", { selector: "label" }).parentElement
      ?.querySelector("select") as HTMLSelectElement).value).toBe("PR");
    cleanup();

    cenario.imoveis = [{
      id: "imovel-ibipora",
      codigo: "IB-1",
      endereco: "Rua Dois, 20",
      bairro: "Centro",
      cidade: "Ibiporã",
      estado: "PR",
      tipo: "Apartamento",
      status: "Novo contato",
      statusHistory: [],
    }];
    render(createElement(AvaliacaoRapidaView, { imovelIdInicial: "imovel-ibipora" }));
    expect(campoTexto("Cidade").value).toBe("Ibiporã");
  });
});
