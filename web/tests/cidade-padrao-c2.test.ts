// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  aplicarCidadePadraoInicial,
  type ResolucaoCidadePadrao,
} from "@/lib/configuracaoUsuario";

const cenario = vi.hoisted(() => ({
  resolucao: {
    origem: "configurada",
    cidade: "Londrina",
    uf: "PR",
  } as ResolucaoCidadePadrao,
  carregarMercados: vi.fn(),
  criarMercado: vi.fn(),
  definirEndereco: vi.fn(),
  enderecoSelecionado: {
    endereco: "Rua Espanha, 100",
    bairro: "Centro",
    cidade: "Cambé",
    estado: "PR",
    cep: "86181-000",
  },
}));

vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: "usuario-1" } }),
}));
vi.mock("@/lib/useCidadePadraoDaConta", () => ({
  useCidadePadraoDaConta: () => cenario.resolucao,
}));
vi.mock("@/lib/persistencia/mercadosMonitorados", () => ({
  carregarMercadosMonitorados: () => cenario.carregarMercados(),
  criarMercadoMonitorado: (...argumentos: unknown[]) => cenario.criarMercado(...argumentos),
  definirMercadoMonitoradoAtivo: vi.fn(),
  excluirMercadoMonitorado: vi.fn(),
}));
vi.mock("@/lib/useProspeccao", () => ({
  useProspeccao: (seletor: (estado: { definirEndereco: typeof cenario.definirEndereco; salvando: boolean }) => unknown) =>
    seletor({ definirEndereco: cenario.definirEndereco, salvando: false }),
}));
vi.mock("@/components/formularios/EnderecoAutocompleteViaCep", () => ({
  default: ({ onSelecionar }: { onSelecionar: (endereco: typeof cenario.enderecoSelecionado) => void }) =>
    createElement("button", {
      type: "button",
      onClick: () => onSelecionar(cenario.enderecoSelecionado),
    }, "Selecionar endereço de Cambé"),
}));

import MercadosMonitorados from "@/components/configuracoes/MercadosMonitorados";
import FormularioEnderecoIdentificado from "@/components/prospeccao/FormularioEnderecoIdentificado";

const SEM_DEFAULT: ResolucaoCidadePadrao = { origem: "nenhuma", cidade: null, uf: null };
const INFERIDA: ResolucaoCidadePadrao = { origem: "inferida", cidade: "Maringá", uf: "PR" };

function identificado(cidade: string | null = null, estado: string | null = null) {
  return {
    id: "identificado-1",
    logradouro: null,
    numero: null,
    unidade: null,
    bloco: null,
    edificio: null,
    bairro: null,
    cidade,
    estado,
    cep: null,
    pontoReferencia: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  cenario.resolucao = { origem: "configurada", cidade: "Londrina", uf: "PR" };
  cenario.carregarMercados.mockResolvedValue([]);
  cenario.criarMercado.mockImplementation(async (entrada) => ({
    id: "mercado-1",
    ...entrada,
    cidadeChave: String(entrada.cidade).toLocaleLowerCase("pt-BR"),
    ativo: true,
    frequenciaDias: 30,
    proximaExecucaoEm: null,
    ultimaTentativaEm: null,
    ultimoSucessoEm: null,
    falhasConsecutivas: 0,
    ultimoErroCodigo: null,
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  }));
});
afterEach(cleanup);

describe("C2 — regra compartilhada de preenchimento inicial", () => {
  it.each([
    [{ origem: "configurada", cidade: "Londrina", uf: "PR" } as const],
    [{ origem: "inferida", cidade: "Maringá", uf: "PR" } as const],
  ])("preenche o par vazio com resolução $origem", (resolucao) => {
    expect(aplicarCidadePadraoInicial({ cidade: "", estado: "" }, resolucao))
      .toEqual({ cidade: resolucao.cidade, estado: resolucao.uf });
  });

  it("mantém vazio quando a origem é nenhuma", () => {
    const vazio = { cidade: "", estado: "" };
    expect(aplicarCidadePadraoInicial(vazio, SEM_DEFAULT)).toBe(vazio);
  });

  it.each([
    [{ cidade: "Cambé", estado: "PR" }, "entidade existente"],
    [{ cidade: "Ibiporã", estado: "PR" }, "prefill explícito"],
    [{ cidade: "Cambé", estado: "" }, "somente cidade"],
    [{ cidade: "", estado: "SC" }, "somente UF"],
  ])("não sobrescreve $1", (atual) => {
    expect(aplicarCidadePadraoInicial(atual, cenario.resolucao)).toBe(atual);
  });

  it("não aplica resposta tardia quando o usuário já protegeu o par", () => {
    const digitado = { cidade: "", estado: "" };
    expect(aplicarCidadePadraoInicial(digitado, INFERIDA, true)).toBe(digitado);
  });

  it("reaplica no estado realmente novo sem restringir a cidade escolhida antes", () => {
    const outraCidade = { cidade: "Cambé", estado: "PR" };
    expect(aplicarCidadePadraoInicial(outraCidade, cenario.resolucao)).toBe(outraCidade);
    expect(aplicarCidadePadraoInicial({ cidade: "", estado: "" }, cenario.resolucao))
      .toEqual({ cidade: "Londrina", estado: "PR" });
  });
});

describe("C2 — integração comportamental", () => {
  it("sugere a cidade no novo mercado, permite trocar e reaplica após adicionar", async () => {
    render(createElement(MercadosMonitorados));
    const campoCidade = screen.getByLabelText("Cidade") as HTMLInputElement;
    const campoUf = screen.getByLabelText("UF") as HTMLSelectElement;
    await waitFor(() => expect(campoCidade.value).toBe("Londrina"));
    expect(campoUf.value).toBe("PR");

    fireEvent.change(campoCidade, { target: { value: "Cambé" } });
    fireEvent.change(campoUf, { target: { value: "PR" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.criarMercado).toHaveBeenCalledWith({
      cidade: "Cambé",
      estado: "PR",
      finalidade: "locacao",
      segmento: "residencial",
    }));
    await waitFor(() => expect(campoCidade.value).toBe("Londrina"));
    expect(campoUf.value).toBe("PR");
  });

  it("preserva cidade da entidade e deixa o endereço selecionado vencer o default", async () => {
    const { rerender } = render(createElement(FormularioEnderecoIdentificado, {
      identificado: identificado("Ibiporã", "PR"),
    }));
    expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Ibiporã");

    rerender(createElement(FormularioEnderecoIdentificado, {
      key: "novo",
      identificado: identificado(),
    }));
    await waitFor(() => expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Londrina"));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar endereço de Cambé" }));
    expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Cambé");
    expect((screen.getByLabelText("Estado") as HTMLInputElement).value).toBe("PR");
  });

  it("não repõe o default depois que a cidade foi alterada manualmente", async () => {
    const { rerender } = render(createElement(MercadosMonitorados));
    const campoCidade = screen.getByLabelText("Cidade") as HTMLInputElement;
    await waitFor(() => expect(campoCidade.value).toBe("Londrina"));
    fireEvent.change(campoCidade, { target: { value: "Ibiporã" } });

    cenario.resolucao = INFERIDA;
    rerender(createElement(MercadosMonitorados));
    expect(campoCidade.value).toBe("Ibiporã");
  });
});

describe("C2 — integração estrutural dos pontos auditados", () => {
  const formularios = [
    "../components/avaliacao/AvaliacaoRapidaView.tsx",
    "../components/modais/ModalImovel.tsx",
    "../components/modais/ModalPreCadastro.tsx",
    "../components/modais/ModalAvistamento.tsx",
    "../components/prospeccao/FormularioEnderecoIdentificado.tsx",
    "../components/central/CentralAngariacaoView.tsx",
    "../components/configuracoes/MercadosMonitorados.tsx",
  ];

  it.each(formularios)("%s consome a fronteira compartilhada do C1", (arquivo) => {
    const fonte = readFileSync(new URL(arquivo, import.meta.url), "utf8");
    expect(fonte).toContain("useCidadePadraoDaConta");
    expect(fonte).toContain("aplicarCidadePadraoInicial");
    expect(fonte).not.toContain("resolverCidadePadrao(");
    expect(fonte).not.toContain("carregarCidadePadraoDaConta(");
  });

  it("o Avistamento não volta a inferir pela última passagem", () => {
    const fonte = readFileSync(resolve("components/modais/ModalAvistamento.tsx"), "utf8");
    expect(fonte).not.toContain("useProspeccao.getState().itens[0]");
  });
});
