// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolucaoCidadePadrao } from "@/lib/configuracaoUsuario";

const cenario = vi.hoisted(() => ({
  userId: "conta-a",
  resolucao: {
    origem: "configurada",
    cidade: "Londrina",
    uf: "PR",
  } as ResolucaoCidadePadrao,
  carregar: vi.fn(),
  criar: vi.fn(),
  alternar: vi.fn(),
  excluir: vi.fn(),
  salvarPadrao: vi.fn(),
  toast: vi.fn(),
  sequencia: [] as string[],
  proximoId: 1,
}));

vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: cenario.userId } }),
}));
vi.mock("@/lib/useCidadePadraoDaConta", () => ({
  useCidadePadraoDaConta: () => cenario.resolucao,
}));
vi.mock("@/lib/persistencia/mercadosMonitorados", () => ({
  carregarMercadosMonitorados: () => cenario.carregar(),
  criarMercadoMonitorado: (...argumentos: unknown[]) => cenario.criar(...argumentos),
  definirMercadoMonitoradoAtivo: (...argumentos: unknown[]) => cenario.alternar(...argumentos),
  excluirMercadoMonitorado: (...argumentos: unknown[]) => cenario.excluir(...argumentos),
}));
vi.mock("@/lib/persistencia/cidadePadrao", () => ({
  salvarCidadePadraoDaConta: (...argumentos: unknown[]) => cenario.salvarPadrao(...argumentos),
}));
vi.mock("@/lib/toast", () => ({
  toast: (...argumentos: unknown[]) => cenario.toast(...argumentos),
}));

import MercadosMonitorados from "@/components/configuracoes/MercadosMonitorados";

const INFERIDA: ResolucaoCidadePadrao = {
  origem: "inferida",
  cidade: "Maringá",
  uf: "PR",
};

function mercado(cidade: string, estado = "PR", id = `mercado-${cenario.proximoId++}`) {
  return {
    id,
    cidade,
    estado,
    cidadeChave: cidade.toLocaleLowerCase("pt-BR"),
    finalidade: "locacao" as const,
    segmento: "residencial" as const,
    ativo: true,
    frequenciaDias: 30,
    proximaExecucaoEm: null,
    ultimaTentativaEm: null,
    ultimoSucessoEm: null,
    falhasConsecutivas: 0,
    ultimoErroCodigo: null,
    createdAt: "2026-09-21T12:00:00.000Z",
    updatedAt: "2026-09-21T12:00:00.000Z",
  };
}

function campoCidade() {
  return screen.getByLabelText("Cidade") as HTMLInputElement;
}

function campoUf() {
  return screen.getByLabelText("UF") as HTMLSelectElement;
}

function opcaoPadrao() {
  return screen.getByRole("checkbox", {
    name: "Usar esta cidade como padrão nos cadastros",
  }) as HTMLInputElement;
}

async function aguardarFormulario(cidade: string, uf = "PR") {
  await waitFor(() => expect(campoCidade().value).toBe(cidade));
  expect(campoUf().value).toBe(uf);
}

beforeEach(() => {
  vi.clearAllMocks();
  cenario.userId = "conta-a";
  cenario.resolucao = { origem: "configurada", cidade: "Londrina", uf: "PR" };
  cenario.sequencia = [];
  cenario.proximoId = 1;
  cenario.carregar.mockResolvedValue([]);
  cenario.criar.mockImplementation(async (entrada: { cidade: string; estado: string }) => {
    cenario.sequencia.push("mercado");
    return mercado(entrada.cidade.trim(), entrada.estado);
  });
  cenario.salvarPadrao.mockImplementation(async (
    _userId: string,
    cidade: string,
    uf: string,
  ) => {
    cenario.sequencia.push("padrao");
    return { origem: "configurada", cidade: cidade.trim(), uf } as const;
  });
  cenario.excluir.mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cidade padrão em Mercados Monitorados", () => {
  it("não persiste preferência ao adicionar mercado sem marcar a opção", async () => {
    cenario.resolucao = INFERIDA;
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Maringá");
    expect(opcaoPadrao().checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.criar).toHaveBeenCalledOnce());
    expect(cenario.salvarPadrao).not.toHaveBeenCalled();
  });

  it("persiste a cidade somente depois que o mercado foi salvo com sucesso", async () => {
    cenario.resolucao = INFERIDA;
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Maringá");

    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.salvarPadrao).toHaveBeenCalledWith(
      "conta-a",
      "Maringá",
      "PR",
    ));
    expect(cenario.sequencia).toEqual(["mercado", "padrao"]);
    await waitFor(() => expect(opcaoPadrao().checked).toBe(true));
  });

  it("troca Londrina por Cambé e mantém apenas a preferência mais recente", async () => {
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Londrina");
    expect(opcaoPadrao().checked).toBe(true);

    fireEvent.change(campoCidade(), { target: { value: "Cambé" } });
    expect(opcaoPadrao().checked).toBe(false);
    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.salvarPadrao).toHaveBeenLastCalledWith(
      "conta-a",
      "Cambé",
      "PR",
    ));
    await aguardarFormulario("Cambé");
    expect(opcaoPadrao().checked).toBe(true);
  });

  it("mantém múltiplos mercados sem transformar o último em uma segunda preferência", async () => {
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Londrina");

    fireEvent.change(campoCidade(), { target: { value: "Cambé" } });
    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));
    await waitFor(() => expect(cenario.salvarPadrao).toHaveBeenCalledOnce());
    await aguardarFormulario("Cambé");

    fireEvent.change(campoCidade(), { target: { value: "Ibiporã" } });
    expect(opcaoPadrao().checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.criar).toHaveBeenCalledTimes(2));
    expect(cenario.salvarPadrao).toHaveBeenCalledOnce();
    await aguardarFormulario("Cambé");
  });

  it("reflete a preferência atual e desmarca quando a cidade diverge", async () => {
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Londrina");
    expect(opcaoPadrao().checked).toBe(true);

    fireEvent.change(campoCidade(), { target: { value: "Cambé" } });
    expect(opcaoPadrao().checked).toBe(false);
  });

  it("converte origem inferida em configurada somente por ação explícita", async () => {
    cenario.resolucao = INFERIDA;
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Maringá");
    expect(opcaoPadrao().checked).toBe(false);

    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.salvarPadrao).toHaveBeenCalledOnce());
    expect(opcaoPadrao().checked).toBe(true);
  });

  it("não altera a preferência quando a criação do mercado falha", async () => {
    cenario.resolucao = INFERIDA;
    cenario.criar.mockRejectedValueOnce(new Error("Falha ao criar mercado."));
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Maringá");

    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.toast).toHaveBeenCalledWith(
      "Falha ao criar mercado.",
      "error",
    ));
    expect(cenario.salvarPadrao).not.toHaveBeenCalled();
  });

  it("envia somente o user_id da conta autenticada para a fronteira do C1", async () => {
    cenario.userId = "conta-b";
    cenario.resolucao = INFERIDA;
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Maringá");

    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await waitFor(() => expect(cenario.salvarPadrao).toHaveBeenCalledWith(
      "conta-b",
      "Maringá",
      "PR",
    ));
    expect(cenario.salvarPadrao).not.toHaveBeenCalledWith(
      "conta-a",
      expect.anything(),
      expect.anything(),
    );
  });

  it("excluir o mercado padrão não apaga nem regrava a preferência", async () => {
    cenario.carregar.mockResolvedValue([mercado("Londrina", "PR", "mercado-padrao")]);
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Londrina");
    await screen.findByText("Londrina / PR");

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(cenario.excluir).toHaveBeenCalledWith("mercado-padrao"));
    expect(cenario.salvarPadrao).not.toHaveBeenCalled();
    expect(campoCidade().value).toBe("Londrina");
    expect(opcaoPadrao().checked).toBe(true);
  });

  it("mantém o mercado criado e informa quando apenas a preferência falha", async () => {
    cenario.resolucao = INFERIDA;
    cenario.salvarPadrao.mockRejectedValueOnce(new Error("Configuração indisponível."));
    render(createElement(MercadosMonitorados));
    await aguardarFormulario("Maringá");

    fireEvent.click(opcaoPadrao());
    fireEvent.click(screen.getByRole("button", { name: "Adicionar mercado" }));

    await screen.findByText("Maringá / PR");
    await waitFor(() => expect(cenario.toast).toHaveBeenCalledWith(
      "Mercado configurado, mas a cidade padrão não foi alterada. Configuração indisponível.",
      "error",
    ));
    expect(opcaoPadrao().checked).toBe(false);
  });
});
