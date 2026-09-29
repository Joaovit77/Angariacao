// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MenuUsuario from "@/components/painel/MenuUsuario";

const signOut = vi.fn<(opcoes?: { scope: string }) => Promise<{ error: null }>>(async () => ({ error: null }));
const push = vi.fn();

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ({ auth: { signOut } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: "u1", email: "corretor@teste.com" } }),
  rotuloUsuario: () => "Corretor",
}));

afterEach(() => {
  cleanup();
  signOut.mockClear();
});

describe("Sair da conta", () => {
  it("20. o menu do usuário encerra só a sessão deste aparelho", async () => {
    render(createElement(MenuUsuario));

    fireEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    fireEvent.click(screen.getByRole("button", { name: /Sair/ }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    // O redirect é do SessaoProvider/layout, não do botão.
    expect(push).not.toHaveBeenCalled();
  });
});
