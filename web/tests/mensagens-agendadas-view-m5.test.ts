/** @vitest-environment jsdom */
/* M5 — a lista de mensagens agendadas renderiza a explicação operacional
   no lugar do status técnico e do código cru de erro. */
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MensagemAgendada } from "@/lib/mensagensAgendadas";

const mocks = vi.hoisted(() => ({
  itens: [] as unknown[],
  abrirModal: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (selecionar: (estado: unknown) => unknown) => selecionar({
    imoveis: [
      { id: "im-1", codigo: "LD-200" },
      { id: "im-2", codigo: "LD-201" },
      { id: "im-3", codigo: "LD-202" },
    ],
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (selecionar: (estado: unknown) => unknown) => selecionar({ abrirModal: mocks.abrirModal }),
}));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/useMensagensAgendadas", () => ({
  useMensagensAgendadas: () => ({ itens: mocks.itens, carregando: false, erro: "", recarregar: vi.fn() }),
}));

import MensagensAgendadasView from "@/components/mensagens/MensagensAgendadasView";

function mensagem(extra: Partial<MensagemAgendada>): MensagemAgendada {
  return {
    id: "m", userId: "u1", imovelId: "im-1", tipo: "verificacao-disponibilidade", agendaId: null,
    nomeProprietario: "Maria", telefone: "43 99999-2525", mensagem: "Olá, Maria!",
    dataEnvio: "2026-09-22T11:00:00.000Z", status: "agendada", enviadoEm: null, erro: null,
    cancelamentoMotivo: null, cancelamentoOrigem: null, canceladaEm: null, imoveisConsultados: null,
    consolidadaEmMensagemId: null, reservadaParaMensagemId: null, reagendadaEm: null, reagendamentoMotivo: null,
    dataEnvioOriginal: null, ...extra,
  };
}

afterEach(() => { cleanup(); mocks.itens = []; });

describe("MensagensAgendadasView (M5)", () => {
  it("12. não exibe o código técnico cru de erro; mostra o significado operacional", () => {
    mocks.itens = [
      mensagem({ id: "e1", status: "erro", erro: "consolidacao-resultado-incerto", reservadaParaMensagemId: "x" }),
      mensagem({ id: "e2", status: "erro", erro: "evolution-http-503" }),
      mensagem({ id: "e3", status: "erro", erro: "processamento-interrompido" }),
    ];
    render(createElement(MensagensAgendadasView));
    const html = document.body.textContent || "";
    for (const codigo of ["consolidacao-resultado-incerto", "evolution-http-503", "processamento-interrompido"]) {
      expect(html).not.toContain(codigo);
      expect(document.querySelector(`[title="${codigo}"]`)).toBeNull();
    }
    expect(screen.getAllByText("Envio não confirmado")).toHaveLength(2);
    expect(screen.getByText("Falha no envio")).toBeTruthy();
    expect(screen.getByText("Não foi possível confirmar se a mensagem foi enviada. Confira o histórico do imóvel antes de realizar novo contato.")).toBeTruthy();
    expect(screen.getByText("Falha ao enviar a mensagem.")).toBeTruthy();
  });

  it("13. absorvida aparece como 'Incluída em outra mensagem', não como 'Cancelada'", () => {
    mocks.itens = [mensagem({
      id: "a1", status: "cancelada", cancelamentoMotivo: "contato-consolidado", cancelamentoOrigem: "worker",
      canceladaEm: "2026-09-22T11:00:45.000Z", consolidadaEmMensagemId: "m-ancora",
    })];
    render(createElement(MensagensAgendadasView));
    expect(screen.getByText("Incluída em outra mensagem")).toBeTruthy();
    expect(screen.queryByText("Cancelada")).toBeNull();
    expect(screen.getByText("Incluída em outra mensagem enviada ao proprietário em 22/09/2026.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("m-ancora");
    // Sem ações de escrita: absorvida não tem Editar/Cancelar, só Visualizar.
    expect(screen.queryByText("Editar")).toBeNull();
    expect(screen.queryByText("Cancelar")).toBeNull();
    expect(screen.getByText("Visualizar")).toBeTruthy();
  });

  it("14. âncora consolidada mostra a quantidade de imóveis (com os códigos carregados, sem UUID)", () => {
    mocks.itens = [mensagem({ id: "an", status: "enviada", enviadoEm: "2026-09-22T11:00:45.000Z", imoveisConsultados: ["im-1", "im-2", "im-3"] })];
    render(createElement(MensagensAgendadasView));
    expect(screen.getByText("Enviada")).toBeTruthy();
    expect(screen.getByText("Perguntou pela disponibilidade de 3 imóveis (LD-200, LD-201, LD-202).")).toBeTruthy();
    expect(document.body.textContent).not.toContain("im-2");
  });

  it("15. reprogramada informa as datas quando os campos existem, e continua editável/cancelável como agendada", () => {
    mocks.itens = [mensagem({
      id: "r1", dataEnvio: "2026-10-31T11:00:00.000Z", dataEnvioOriginal: "2026-09-22T11:00:00.000Z",
      reagendadaEm: "2026-09-22T11:00:05.000Z", reagendamentoMotivo: "disponibilidade-confirmada",
    })];
    render(createElement(MensagensAgendadasView));
    expect(screen.getByText("Agendada")).toBeTruthy();
    expect(screen.getByText("Reprogramada de 22/09/2026 para 31/10/2026 após confirmação de disponibilidade.")).toBeTruthy();
    expect(screen.getByText("Editar")).toBeTruthy();
    expect(screen.getByText("Cancelar")).toBeTruthy();
  });

  it("mensagem livre legada: só o status, sem semântica de disponibilidade e sem esconder a linha", () => {
    mocks.itens = [mensagem({ id: "l1", tipo: "livre", mensagem: "Passando para confirmar se o seu imóvel continua disponível" })];
    render(createElement(MensagensAgendadasView));
    expect(screen.getByText("Agendada")).toBeTruthy();
    expect(document.querySelectorAll(".mensagem-explicacao")).toHaveLength(0);
    expect(screen.getByText("Maria")).toBeTruthy();
  });
});
