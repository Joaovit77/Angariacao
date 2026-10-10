// @vitest-environment jsdom
import { createElement as h, StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Assistente from "@/components/assistente/Assistente";
import AssistenteView from "@/components/assistente/AssistenteView";
import { AssistenteProvider } from "@/components/assistente/AssistenteProvider";
import ModalOverlay from "@/components/modais/ModalOverlay";
import VendasView from "@/components/vendas/VendasView";
import { CHAVE_ASSISTENTE_FLUTUANTE, definirAssistenteFlutuanteAtivo } from "@/lib/assistente/preferenciaFlutuante";
import { perguntarAoAssistente } from "@/lib/assistente/cliente";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { useRegistrarSuperficieBloqueante, useSuperficiesBloqueantes } from "@/lib/superficiesBloqueantes";
import { bancoSinteticoB1 } from "./fixtures/vendasB34bB1";

const ref = vi.hoisted(() => ({ banco: null as unknown as ReturnType<typeof bancoSinteticoB1> }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ref.banco.cliente }));
vi.mock("next/navigation", () => ({ usePathname: () => "/vendas" }));
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ usuario: null }) }));
vi.mock("@/lib/assistente/cliente", () => ({
  perguntarAoAssistente: vi.fn(), prepararAcaoAssistente: vi.fn(),
  confirmarAcaoDoAssistente: vi.fn(), cancelarAcaoDoAssistente: vi.fn(), executarAnaliseAprofundada: vi.fn(),
}));

function Cenario({ preferencia = false }: { preferencia?: boolean }) {
  return h(AssistenteProvider, null,
    h(VendasView),
    h("button", { onClick: () => useUiModal.getState().abrirModal("meta") }, "Abrir metas"),
    preferencia ? h(AssistenteView) : null,
    h(ModalOverlay), h(Assistente));
}
function Registro({ ativa = true }: { ativa?: boolean }) {
  useRegistrarSuperficieBloqueante(ativa);
  return null;
}
const acionador = () => document.querySelector(".assistente-acionador-global");
const painel = () => screen.queryByRole("complementary", { name: "Assistente de IA" });
function esperarSuspensao() {
  expect(acionador()).toBeNull();
  expect(painel()).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Pergunta ao Assistente" })).toBeNull();
}
async function abrirVendas() {
  const abertura = screen.getByRole("button", { name: "Nova oportunidade" });
  abertura.focus(); fireEvent.click(abertura);
  await screen.findByText("Ana Sintética");
  return abertura;
}
function abrirPainel() { fireEvent.click(screen.getByRole("button", { name: "Abrir assistente" })); }

beforeEach(() => {
  ref.banco = bancoSinteticoB1();
  localStorage.clear(); sessionStorage.clear();
  definirAssistenteFlutuanteAtivo(true);
  useAppStore.getState().limparEstado();
  useAppStore.getState().setIaDisponivel(true);
  useUiModal.getState().fecharModal();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste teste"); }));
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  expect(useSuperficiesBloqueantes.getState().registros.size).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(ref.banco.estado.chamadas).toHaveLength(0);
  useUiModal.getState().fecharModal();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe("UX-ASSIST-1: suspensão sem desativar a funcionalidade", () => {
  it.each([true, false])("matriz de preferência %s com modal global aberto e fechado", (ativa) => {
    definirAssistenteFlutuanteAtivo(ativa);
    render(h(Cenario));
    expect(!!acionador()).toBe(ativa);
    act(() => useUiModal.getState().abrirModal("meta"));
    expect(screen.getByText(/Metas de/)).toBeTruthy();
    esperarSuspensao();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(!!acionador()).toBe(ativa);
    expect(localStorage.getItem(CHAVE_ASSISTENTE_FLUTUANTE)).toBe(ativa ? "1" : "0");
  });

  it.each(["Cancelar", "Escape", "Fechar criação de oportunidade"])("Vendas suspende painel/acionador e restaura ao fechar por %s", async (fechar) => {
    render(h(Cenario)); abrirPainel();
    fireEvent.change(screen.getByRole("textbox", { name: "Pergunta ao Assistente" }), { target: { value: "Rascunho preservado" } });
    const posicao = acionador()?.getAttribute("style");
    const abertura = await abrirVendas();
    esperarSuspensao();
    expect(document.body.style.overflow).toBe("hidden");
    const primeiro = screen.getByRole("button", { name: "Fechar criação de oportunidade" });
    const ultimo = screen.getByRole("button", { name: "Criar oportunidade" });
    expect(document.activeElement).toBe(primeiro);
    ultimo.focus(); fireEvent.keyDown(ultimo, { key: "Tab" });
    expect(document.activeElement).toBe(primeiro);
    fireEvent.keyDown(primeiro, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
    if (fechar === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: fechar }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(acionador()?.getAttribute("style")).toBe(posicao);
    expect(painel()).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Pergunta ao Assistente" })).toHaveProperty("value", "Rascunho preservado");
    expect(document.activeElement).toBe(abertura);
    expect(document.body.style.overflow).toBe("");
  });

  it("preferência OFF continua respeitada depois de Vendas fechar; reativação usa o controle existente", async () => {
    render(h(Cenario, { preferencia: true }));
    fireEvent.click(screen.getByRole("button", { name: "Desativado" }));
    await abrirVendas();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(acionador()).toBeNull(); expect(painel()).toBeNull();
    expect(localStorage.getItem(CHAVE_ASSISTENTE_FLUTUANTE)).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Ativado" }));
    expect(acionador()).toBeTruthy();
    expect(localStorage.getItem(CHAVE_ASSISTENTE_FLUTUANTE)).toBe("1");
  });

  it("consulta em andamento não é cancelada pela suspensão e resposta/conversa reaparecem", async () => {
    let concluir!: (valor: Awaited<ReturnType<typeof perguntarAoAssistente>>) => void;
    vi.mocked(perguntarAoAssistente).mockReturnValueOnce(new Promise((resolve) => { concluir = resolve; }));
    render(h(Cenario)); abrirPainel();
    fireEvent.change(screen.getByRole("textbox", { name: "Pergunta ao Assistente" }), { target: { value: "Consulta sintética" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pergunta" }));
    const sinal = vi.mocked(perguntarAoAssistente).mock.calls[0][1]?.signal;
    expect(screen.getByText("Consultando dados com segurança…")).toBeTruthy();
    await abrirVendas(); esperarSuspensao();
    expect(sinal?.aborted).toBe(false);
    await act(async () => concluir({ ok: true, modelo: "sintetico", mensagem: { id: "resposta-sintetica", papel: "assistente", texto: "Resultado preservado" } }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Consulta sintética")).toBeTruthy();
    expect(screen.getByText("Resultado preservado")).toBeTruthy();
    expect(sinal?.aborted).toBe(false);
    expect(perguntarAoAssistente).toHaveBeenCalledTimes(1);
  });

  it("dois registros: saída de A não libera B; liberação repetida é idempotente", () => {
    render(h(Cenario));
    let sairA!: () => void, sairB!: () => void;
    act(() => { sairA = useSuperficiesBloqueantes.getState().registrar(); sairB = useSuperficiesBloqueantes.getState().registrar(); });
    esperarSuspensao();
    act(() => sairA()); esperarSuspensao();
    act(() => sairA()); esperarSuspensao();
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(1);
    act(() => sairB()); expect(acionador()).toBeTruthy();
  });

  it("ModalOverlay e Vendas coexistem: fechar o global não libera a criação", async () => {
    render(h(Cenario)); await abrirVendas();
    act(() => useUiModal.getState().abrirModal("meta"));
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(2);
    act(() => useUiModal.getState().fecharModal());
    esperarSuspensao();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(acionador()).toBeTruthy();
  });

  it("Strict Mode, troca de modal e desmontagem não deixam bloqueios órfãos", async () => {
    const tela = render(h(StrictMode, null, h(Cenario)));
    await abrirVendas();
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(1);
    act(() => useUiModal.getState().abrirModal("meta"));
    act(() => useUiModal.getState().abrirModal("meta"));
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(2);
    tela.unmount();
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(0);
    useUiModal.getState().fecharModal();
    render(h(Cenario)); expect(acionador()).toBeTruthy();
  });

  it("registro condicional acompanha abertura/fechamento sem acumular tokens", () => {
    const tela = render(h(StrictMode, null, h(Registro, { ativa: false })));
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(0);
    tela.rerender(h(StrictMode, null, h(Registro, { ativa: true })));
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(1);
    tela.rerender(h(StrictMode, null, h(Registro, { ativa: false })));
    expect(useSuperficiesBloqueantes.getState().registros.size).toBe(0);
  });

  it("carrega a posição salva mesmo quando monta com bloqueio já ativo", () => {
    localStorage.setItem("angariacao:assistente:posicao-acionador", JSON.stringify({ x: 120, y: 130 }));
    const liberar = useSuperficiesBloqueantes.getState().registrar();
    render(h(Cenario)); esperarSuspensao();
    act(() => liberar());
    expect((acionador() as HTMLElement).style.left).toBe("120px");
    expect((acionador() as HTMLElement).style.top).toBe("130px");
    act(() => useUiModal.getState().abrirModal("meta")); esperarSuspensao();
    act(() => useUiModal.getState().fecharModal());
    expect((acionador() as HTMLElement).style.left).toBe("120px");
    expect((acionador() as HTMLElement).style.top).toBe("130px");
  });

  it.each(["0", "1", null])("remontagem mantém preferência %s e não persiste suspensão", (valor) => {
    if (valor === null) localStorage.removeItem(CHAVE_ASSISTENTE_FLUTUANTE);
    else localStorage.setItem(CHAVE_ASSISTENTE_FLUTUANTE, valor);
    const tela = render(h(Cenario));
    act(() => useUiModal.getState().abrirModal("meta")); esperarSuspensao();
    tela.unmount(); useUiModal.getState().fecharModal();
    render(h(Cenario));
    expect(!!acionador()).toBe(valor !== "0");
    expect(localStorage.getItem(CHAVE_ASSISTENTE_FLUTUANTE)).toBe(valor);
    expect(Object.keys(localStorage).filter((chave) => /bloque|superficie/.test(chave))).toEqual([]);
  });

  it("fechar o X do Assistente continua sendo fechamento temporário", () => {
    render(h(Cenario)); abrirPainel();
    fireEvent.click(screen.getByRole("button", { name: /^Fechar Assistente$/ }));
    expect(painel()).toBeNull(); expect(acionador()).toBeTruthy();
    expect(localStorage.getItem(CHAVE_ASSISTENTE_FLUTUANTE)).toBe("1");
  });
});
