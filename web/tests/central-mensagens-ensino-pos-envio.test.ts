/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversaImovel } from "@/lib/calculo/conversas";

const mocks = vi.hoisted(() => ({
  abrirWhatsappRascunho: vi.fn(),
  enviarWhatsapp: vi.fn(),
  marcarRespostasLidas: vi.fn(),
  rascunharResposta: vi.fn(),
  recarregarEstado: vi.fn(),
  registrarFeedbackSugestaoIa: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/components/SessaoProvider", () => ({ rotuloUsuario: vi.fn(), useSessao: vi.fn() }));
vi.mock("@/components/Icone", () => ({ default: () => null }));
vi.mock("@/components/ia/EnsinarIa", () => ({
  default: () => "Deseja ensinar algo à IA com esta correção?",
}));
vi.mock("@/components/ia/FeedbackSugestaoIa", async () => {
  const { createElement } = await import("react");
  return { default: ({ aoSalvar }: { aoSalvar: (resultado: "aprovado" | "editado" | "rejeitado") => void }) =>
    createElement("div", { "data-testid": "feedback-sugestao" },
      createElement("button", { type: "button", onClick: () => aoSalvar("rejeitado") },
        "Rejeitar sugestão no teste")) };
});
vi.mock("@/lib/calculo/whatsapp", () => ({
  aplicarModeloUsuario: vi.fn(),
  linkWhatsapp: vi.fn(() => "https://wa.me/5500000000000"),
  mensagemFalhaEnvio: vi.fn(() => "Não foi possível enviar a mensagem."),
}));
vi.mock("@/lib/envioWhatsapp", () => ({ enviarWhatsapp: mocks.enviarWhatsapp }));
vi.mock("@/lib/feedbackSugestaoIa", () => ({ registrarFeedbackSugestaoIa: mocks.registrarFeedbackSugestaoIa }));
vi.mock("@/lib/ia", () => ({ rascunharResposta: mocks.rascunharResposta }));
vi.mock("@/lib/mutacoes", () => ({
  marcarRespostasLidas: mocks.marcarRespostasLidas,
  recarregarEstado: mocks.recarregarEstado,
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (selecionar: (estado: unknown) => unknown) => selecionar({
    config: { whatsappModelos: [] }, iaDisponivel: true,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (selecionar: (estado: unknown) => unknown) => selecionar({
    abrirWhatsappRascunho: mocks.abrirWhatsappRascunho,
  }),
}));
vi.mock("@/lib/useMensagensAgendadas", () => ({
  useMensagensAgendadas: vi.fn(() => ({ agendadas: [] })),
}));

import { Compositor } from "@/components/respostas/CentralMensagensView";

const CONVITE_ENSINO = "Deseja ensinar algo à IA com esta correção?";

function conversaSintetica(): ConversaImovel {
  const ultima = {
    id: "mensagem-1", texto: "Olá", data: "2026-09-06T10:00:00", dia: "2026-09-06",
    direcao: "recebida" as const, tipo: "conversation", soMidia: false, importada: false,
  };
  return {
    imovel: {
      id: "imovel-1", codigo: "IM-1", endereco: "Rua de teste, 1",
      proprietarioTelefone: "5500000000000",
      notas: [], status: "Novo", retirado: false,
    } as ConversaImovel["imovel"],
    mensagens: [ultima], ultima, naoLidas: 1, emAndamento: true, naoRespondida: true,
  };
}

async function renderizarComSugestao() {
  render(createElement(Compositor, { conversa: conversaSintetica() }));
  fireEvent.click(screen.getByRole("button", { name: "Sugerir com IA" }));
  await waitFor(() => expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value)
    .toBe("Mensagem original."));
}

describe("CentralMensagensView — ensino após feedback do envio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rascunharResposta.mockResolvedValue({
      ok: true, rascunho: "Mensagem original.", sugestaoId: "sugestao-1", protocolosUsados: [],
    });
    mocks.enviarWhatsapp.mockResolvedValue({ ok: true, historicoPersistido: true });
    mocks.marcarRespostasLidas.mockResolvedValue(undefined);
    mocks.recarregarEstado.mockResolvedValue(undefined);
    mocks.registrarFeedbackSugestaoIa.mockResolvedValue({ ok: true, resultado: "aprovado" });
  });
  afterEach(() => cleanup());

  it("preserva o resultado editado do pedido e mantém EnsinarIa após limpar a sugestão", async () => {
    await renderizarComSugestao();
    fireEvent.change(screen.getByLabelText("Mensagem"), {
      target: { value: "Mensagem revisada pelo usuário." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(mocks.registrarFeedbackSugestaoIa).toHaveBeenCalledWith({
      sugestaoId: "sugestao-1", resultado: "editado",
      textoFinal: "Mensagem revisada pelo usuário.",
    }));
    expect(await screen.findByText(CONVITE_ENSINO)).not.toBeNull();
    expect(screen.queryByTestId("feedback-sugestao")).toBeNull();
  });

  it("não oferece ensino quando o pedido do envio é aprovado", async () => {
    mocks.registrarFeedbackSugestaoIa.mockResolvedValue({ ok: true, resultado: "editado" });
    await renderizarComSugestao();
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(mocks.registrarFeedbackSugestaoIa).toHaveBeenCalledWith({
      sugestaoId: "sugestao-1", resultado: "aprovado",
    }));
    await waitFor(() => expect(screen.queryByTestId("feedback-sugestao")).toBeNull());
    expect(screen.queryByText(CONVITE_ENSINO)).toBeNull();
  });

  it("não oferece ensino ao rejeitar a sugestão", async () => {
    await renderizarComSugestao();
    fireEvent.click(screen.getByRole("button", { name: "Rejeitar sugestão no teste" }));
    expect(screen.queryByText(CONVITE_ENSINO)).toBeNull();
    expect(mocks.enviarWhatsapp).not.toHaveBeenCalled();
  });

  it("não oferece ensino quando a persistência do feedback falha", async () => {
    mocks.registrarFeedbackSugestaoIa.mockResolvedValue({
      ok: false, mensagem: "Falha sintética de feedback.",
    });
    await renderizarComSugestao();
    fireEvent.change(screen.getByLabelText("Mensagem"), {
      target: { value: "Mensagem revisada pelo usuário." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    expect(await screen.findByRole("button", { name: "Tentar salvar feedback" })).not.toBeNull();
    expect(screen.queryByText(CONVITE_ENSINO)).toBeNull();
  });

  it("não oferece ensino quando o envio falha", async () => {
    mocks.enviarWhatsapp.mockResolvedValue({ ok: false, falha: "falha-evolution" });
    await renderizarComSugestao();
    fireEvent.change(screen.getByLabelText("Mensagem"), {
      target: { value: "Mensagem revisada pelo usuário." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(mocks.enviarWhatsapp).toHaveBeenCalledOnce());
    expect(mocks.registrarFeedbackSugestaoIa).not.toHaveBeenCalled();
    expect(screen.queryByText(CONVITE_ENSINO)).toBeNull();
  });
});
