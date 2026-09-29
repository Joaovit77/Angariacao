// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* LD-163: o modal não agenda mensagem livre vinculada a imóvel Perdido,
   Locado ou retirado. Bloqueia de verdade (nada é gravado), sem "forçar". */

const cenario = vi.hoisted(() => ({
  imoveis: [] as Array<Record<string, unknown>>,
  insert: vi.fn(),
  update: vi.fn(),
  linhaEditada: null as Record<string, unknown> | null,
  toast: vi.fn(),
  fechar: vi.fn(),
}));

vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: "u1" } }),
}));
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: { fecharModal: () => void }) => unknown) => seletor({ fecharModal: cenario.fechar }),
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (seletor: (estado: { imoveis: unknown[] }) => unknown) => seletor({ imoveis: cenario.imoveis }),
}));
vi.mock("@/lib/toast", () => ({ toast: cenario.toast }));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({
    from: () => {
      const cadeia = {
        select: () => cadeia,
        eq: () => cadeia,
        maybeSingle: () => Promise.resolve({ data: cenario.linhaEditada, error: null }),
        insert: (valores: unknown) => { cenario.insert(valores); return Promise.resolve({ error: null }); },
        update: (valores: unknown) => { cenario.update(valores); return cadeia; },
        then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
      };
      return cadeia;
    },
  }),
}));

import ModalMensagemAgendada from "@/components/modais/ModalMensagemAgendada";

function imovel(status: string, retirado = false) {
  return {
    id: "i1", codigo: "LD-1", endereco: "Rua A, 1", status, retirado,
    proprietarioNome: "Ana", proprietarioTelefone: "43999999999",
  };
}

function abrir(props: Record<string, unknown> = {}) {
  render(createElement(ModalMensagemAgendada, {
    imovelIdRelacionado: "i1", mensagemInicial: "Olá", dataInicial: "2099-01-10", ...props,
  }));
}

function agendar() {
  fireEvent.click(screen.getByRole("button", { name: "Agendar envio" }));
}

describe("ModalMensagemAgendada: imóvel inativo bloqueia mensagem livre vinculada", () => {
  beforeEach(() => {
    cenario.insert.mockReset();
    cenario.update.mockReset();
    cenario.toast.mockReset();
    cenario.fechar.mockReset();
    cenario.linhaEditada = null;
  });
  afterEach(() => cleanup());

  it.each([
    ["Perdido", imovel("Perdido")],
    ["Locado", imovel("Locado")],
    ["retirado", imovel("Publicado", true)],
  ])("%s: não grava, avisa e mantém o modal aberto", async (_, alvo) => {
    cenario.imoveis = [alvo];
    abrir();

    expect(screen.getByRole("alert").textContent).toMatch(/não está ativo/);
    agendar();

    await waitFor(() => expect(cenario.toast).toHaveBeenCalledWith(expect.stringMatching(/não está ativo/), "error"));
    expect(cenario.insert).not.toHaveBeenCalled();
    expect(cenario.fechar).not.toHaveBeenCalled();
  });

  it.each([["Publicado"], ["Em negociação"], ["Pausado"]])("%s: agenda a livre normalmente", async (status) => {
    cenario.imoveis = [imovel(status)];
    abrir();

    expect(screen.queryByRole("alert")).toBeNull();
    agendar();

    await waitFor(() => expect(cenario.insert).toHaveBeenCalledOnce());
    expect(cenario.insert.mock.calls[0][0]).toMatchObject({ imovel_id: "i1", tipo: "livre", status: "agendada" });
    expect(cenario.fechar).toHaveBeenCalledOnce();
  });

  it("destinatário manual (sem imóvel) não é afetado", async () => {
    cenario.imoveis = [imovel("Perdido")];
    render(createElement(ModalMensagemAgendada, { mensagemInicial: "Olá", dataInicial: "2099-01-10" }));
    fireEvent.click(screen.getByRole("button", { name: "Preencher manualmente" }));
    const [nome, telefone] = [screen.getByPlaceholderText("Ex.: João da Silva"), screen.getByPlaceholderText("(43) 99999-9999")];
    fireEvent.change(nome, { target: { value: "Bia" } });
    fireEvent.change(telefone, { target: { value: "43988887777" } });
    agendar();

    await waitFor(() => expect(cenario.insert).toHaveBeenCalledOnce());
    expect(cenario.insert.mock.calls[0][0]).toMatchObject({ imovel_id: null, tipo: "livre" });
  });

  it("editar uma livre cujo imóvel virou Perdido também é bloqueado", async () => {
    cenario.imoveis = [imovel("Perdido")];
    cenario.linhaEditada = {
      id: "m1", user_id: "u1", imovel_id: "i1", nome_proprietario: "Ana", telefone: "43999999999",
      mensagem: "Olá", data_envio: "2099-01-10T11:00:00Z", status: "agendada", tipo: "livre",
    };
    render(createElement(ModalMensagemAgendada, { id: "m1" }));

    await screen.findByRole("alert");
    agendar();

    await waitFor(() => expect(cenario.toast).toHaveBeenCalledWith(expect.stringMatching(/não está ativo/), "error"));
    expect(cenario.update).not.toHaveBeenCalled();
  });
});
