// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const contexto = vi.hoisted(() => ({
  pathname: "/admin/diagnostico-vivareal",
  replace: vi.fn(),
  store: { carregado: false, ehAdmin: true, operaCarteira: false, cargoUsuarioId: "admin-teste" },
}));
const Vazio = vi.hoisted(() => () => null);

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
vi.mock("@/lib/bootPerformance", () => ({ registrarPrimeiroRenderBoot: vi.fn() }));
vi.mock("@/components/painel/BarraLateral", () => ({ default: Vazio }));
vi.mock("@/components/painel/Topbar", () => ({ default: Vazio }));
vi.mock("@/components/painel/EsqueletoPainel", () => ({ default: () => <span>Carregando carteira</span> }));
vi.mock("@/components/painel/NavAngariacao", () => ({ default: Vazio }));
vi.mock("@/components/painel/ferramentasAngariacao", () => ({ ferramentaAtiva: () => false }));
vi.mock("@/components/painel/Celebracao", () => ({ default: Vazio }));
vi.mock("@/components/painel/IndicadorFollowUp", () => ({ default: Vazio }));
vi.mock("@/components/painel/SincronizacaoRespostas", () => ({ default: Vazio }));
vi.mock("@/components/central/MonitorRadarAngariacao", () => ({ default: Vazio }));
vi.mock("@/components/modais/ModalOverlay", () => ({ default: Vazio }));
vi.mock("@/components/RodapeApp", () => ({ default: Vazio }));
vi.mock("@/components/assistente/Assistente", () => ({ default: Vazio }));
vi.mock("@/components/legal/PortaoTermos", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/assistente/AssistenteProvider", () => ({ AssistenteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import PainelLayout from "@/app/(painel)/layout";

describe("acesso temporário ao diagnóstico por admin sem carteira", () => {
  beforeEach(() => {
    contexto.pathname = "/admin/diagnostico-vivareal";
    contexto.replace.mockClear();
    contexto.store.carregado = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });

  it("mostra a subrota admin sem carregar carteira nem redirecionar", () => {
    render(<PainelLayout><span>Página diagnóstica</span></PainelLayout>);
    expect(screen.getByText("Página diagnóstica")).toBeTruthy();
    expect(screen.queryByText("Carregando carteira")).toBeNull();
    expect(contexto.replace).not.toHaveBeenCalledWith("/admin");
  });

  it("continua bloqueando uma rota da carteira para admin sem carteira", () => {
    contexto.pathname = "/pipeline";
    render(<PainelLayout><span>Pipeline</span></PainelLayout>);
    expect(contexto.replace).toHaveBeenCalledWith("/admin");
    expect(screen.queryByText("Pipeline")).toBeNull();
  });
});
