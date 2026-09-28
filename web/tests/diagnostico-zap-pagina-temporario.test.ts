// @vitest-environment jsdom
// R4.2f (temporário): a página não executa nada ao abrir e só faz um POST
// após o clique; o layout a mostra para admin sem carteira. Sai junto com o harness.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, Fragment, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const contexto = vi.hoisted(() => ({
  pathname: "/admin/diagnostico-zap",
  replace: vi.fn(),
  store: { carregado: false, ehAdmin: true, operaCarteira: false, cargoUsuarioId: "admin-teste" },
  getSession: vi.fn(),
}));
const Vazio = vi.hoisted(() => () => null);
const Filhos = vi.hoisted(() => function Filhos({ children }: { children: ReactNode }) {
  return createElement(Fragment, null, children);
});

vi.mock("next/navigation", () => ({
  usePathname: () => contexto.pathname,
  useRouter: () => ({ replace: contexto.replace }),
}));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: "admin-teste" } }),
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (selecionar: (s: typeof contexto.store) => unknown) => selecionar(contexto.store),
}));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: contexto.getSession } }),
}));
vi.mock("@/lib/bootPerformance", () => ({ registrarPrimeiroRenderBoot: vi.fn() }));
vi.mock("@/components/painel/BarraLateral", () => ({ default: Vazio }));
vi.mock("@/components/painel/Topbar", () => ({ default: Vazio }));
vi.mock("@/components/painel/EsqueletoPainel", () => ({ default: () => createElement("span", null, "Carregando carteira") }));
vi.mock("@/components/painel/NavAngariacao", () => ({ default: Vazio }));
vi.mock("@/components/painel/ferramentasAngariacao", () => ({ ferramentaAtiva: () => false }));
vi.mock("@/components/painel/Celebracao", () => ({ default: Vazio }));
vi.mock("@/components/painel/IndicadorFollowUp", () => ({ default: Vazio }));
vi.mock("@/components/painel/SincronizacaoRespostas", () => ({ default: Vazio }));
vi.mock("@/components/central/MonitorRadarAngariacao", () => ({ default: Vazio }));
vi.mock("@/components/modais/ModalOverlay", () => ({ default: Vazio }));
vi.mock("@/components/RodapeApp", () => ({ default: Vazio }));
vi.mock("@/components/assistente/Assistente", () => ({ default: Vazio }));
vi.mock("@/components/legal/PortaoTermos", () => ({ default: Filhos }));
vi.mock("@/components/assistente/AssistenteProvider", () => ({ AssistenteProvider: Filhos }));

import DiagnosticoZap from "@/app/(painel)/admin/diagnostico-zap/page";
import PainelLayout from "@/app/(painel)/layout";

const fetchMock = vi.fn<typeof fetch>();

describe("página temporária do diagnóstico do ZAP", () => {
  beforeEach(() => {
    contexto.pathname = "/admin/diagnostico-zap";
    contexto.replace.mockClear();
    contexto.store.carregado = false;
    contexto.store.ehAdmin = true;
    contexto.getSession.mockResolvedValue({ data: { session: { access_token: "token-teste" } } });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("M. abrir a página não faz chamada nenhuma", async () => {
    render(createElement(DiagnosticoZap));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByText(/Diagnóstico temporário/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Executar uma vez" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(contexto.getSession).not.toHaveBeenCalled();
  });

  it("um clique faz um único POST sem corpo; cliques repetidos não disparam outro", async () => {
    let liberar!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolver) => { liberar = resolver; }));
    render(createElement(DiagnosticoZap));
    const botao = screen.getByRole("button", { name: "Executar uma vez" }) as HTMLButtonElement;
    await act(async () => { fireEvent.click(botao); });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(botao.disabled).toBe(true);
    await act(async () => { fireEvent.click(botao); fireEvent.click(botao); });
    const [destino, opcoes] = fetchMock.mock.calls[0];
    expect(destino).toBe("/api/admin/diagnostico-zap");
    expect(opcoes?.method).toBe("POST");
    expect(opcoes?.body).toBeUndefined();
    await act(async () => { liberar(Response.json({ ok: true, estrutura: { cardsCandidatos: 2 } })); });
    await vi.waitFor(() => expect(screen.getByText(/cardsCandidatos/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("não mostra nada a quem não é admin", () => {
    contexto.store.ehAdmin = false;
    const { container } = render(createElement(DiagnosticoZap));
    expect(container.textContent).toBe("");
    expect(contexto.replace).toHaveBeenCalledWith("/home");
  });

  it("o layout mostra a subrota a admin sem carteira, sem esperar a carteira nem redirecionar", () => {
    render(createElement(PainelLayout, null, createElement("span", null, "Página diagnóstica")));
    expect(screen.getByText("Página diagnóstica")).toBeTruthy();
    expect(screen.queryByText("Carregando carteira")).toBeNull();
    expect(contexto.replace).not.toHaveBeenCalledWith("/admin");
  });

  it("o layout continua mandando admin sem carteira de volta ao /admin fora das exceções", () => {
    contexto.pathname = "/pipeline";
    render(createElement(PainelLayout, null, createElement("span", null, "Pipeline")));
    expect(contexto.replace).toHaveBeenCalledWith("/admin");
    expect(screen.queryByText("Pipeline")).toBeNull();
  });
});
