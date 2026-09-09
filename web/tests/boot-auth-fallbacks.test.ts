import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/persistencia/supabase";
import { iaDisponivelParaUsuario } from "@/lib/ia";
import { meuCargo } from "@/lib/admin";

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: vi.fn() }));

const getSupabaseMock = vi.mocked(getSupabase);

function sessao(accessToken: string | null) {
  getSupabaseMock.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: accessToken ? { access_token: accessToken } : null },
      }),
    },
  } as never);
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fallbacks secundarios do boot", () => {
  it("sessao expirada nao chama as APIs e conserva os defaults seguros", async () => {
    sessao(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(meuCargo()).resolves.toEqual({ admin: false, operaCarteira: true });
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distingue nao-admin de admin sem enfraquecer a resposta neutra", async () => {
    sessao("token-de-teste");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ admin: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ admin: true, operaCarteira: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(meuCargo()).resolves.toEqual({ admin: false, operaCarteira: true });
    await expect(meuCargo()).resolves.toEqual({ admin: true, operaCarteira: false });
  });

  it("falha parcial de admin nao bloqueia o painel", async () => {
    sessao("token-de-teste");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rota indisponivel")));

    await expect(meuCargo()).resolves.toEqual({ admin: false, operaCarteira: true });
  });

  it("IA permitida, negada ou indisponivel permanece secundaria", async () => {
    sessao("token-de-teste");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ configurado: true, permitido: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ configurado: true, permitido: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(iaDisponivelParaUsuario()).resolves.toBe(true);
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);
  });
});
