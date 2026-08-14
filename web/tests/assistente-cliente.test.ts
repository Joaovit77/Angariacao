import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/persistencia/supabase";
import { perguntarAoAssistente } from "@/lib/assistente/cliente";
import type { PedidoAssistente } from "@/lib/assistente/tipos";

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: vi.fn() }));

const pedido: PedidoAssistente = { mensagem: "Teste", contexto: { rota: "/", pagina: "Inicio", superficie: "pagina" }, historico: [] };

function sessao(valor: { access_token: string } | null = { access_token: "token" }) {
  vi.mocked(getSupabase).mockReturnValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: valor } }) } } as never);
}

describe("cliente do assistente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessao();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("encerra por timeout com mensagem amigavel", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Abortado", "AbortError")), { once: true });
    })));
    await expect(perguntarAoAssistente(pedido, { timeoutMs: 5 })).resolves.toMatchObject({ ok: false, codigo: "timeout" });
  });

  it("cancela uma requisicao sem transformar em timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const resultado = await perguntarAoAssistente(pedido, { signal: controller.signal, timeoutMs: 100 });
    expect(resultado).toMatchObject({ ok: false, codigo: "cancelado" });
  });

  it("distingue sessao expirada sem chamar a API", async () => {
    sessao(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const resultado = await perguntarAoAssistente(pedido, { timeoutMs: 100 });
    expect(resultado).toMatchObject({ ok: false, codigo: "nao_autenticado" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distingue permissao negada, erro interno e rede", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 403 })));
    await expect(perguntarAoAssistente(pedido)).resolves.toMatchObject({ ok: false, codigo: "sem_permissao" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 500 })));
    await expect(perguntarAoAssistente(pedido)).resolves.toMatchObject({ ok: false, codigo: "falha_api" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("network")));
    await expect(perguntarAoAssistente(pedido)).resolves.toMatchObject({ ok: false, codigo: "falha_rede" });
  });
});
