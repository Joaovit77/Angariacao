import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/* R5: o cron de mercados usa a aquisição real (dependência padrão) e nunca
   ganha segunda tentativa: 503 em todas as consultas = 1 chamada cada. */

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({
  getCache: () => ({ get: async () => null, set: async () => {} }),
}));
const salvar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/servidor/comparaveisMercado", () => ({ salvarComparaveisMercado: salvar }));

import { executarColetaMercados, type MercadoReclamado } from "@/lib/servidor/coletaMercadosMonitorados";

const mercado: MercadoReclamado = {
  id: "mercado-1", user_id: "owner-do-claim", cidade: "Londrina", estado: "PR",
  finalidade: "locacao", segmento: "residencial", lease_token: "token-privado",
};

describe("R5: mercados sem retry imediato, pela aquisição real", () => {
  beforeEach(() => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-sintetica");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("503 transitório em todas as consultas: exatamente 1 Firecrawl por consulta", async () => {
    const requisicao = vi.fn(async () => new Response("indisponível", { status: 503 }));
    vi.stubGlobal("fetch", requisicao);
    const rpc = vi.fn(async (nome: string) => ({ data: nome === "claim_mercados_monitorados" ? [mercado] : true, error: null }));

    const { mercados } = await executarColetaMercados({
      supabase: { rpc } as unknown as SupabaseClient,
      consultarSaldo: async () => 10,
      registrar: () => {},
    });

    expect(mercados[0].consultasExecutadas).toBe(4);
    expect(requisicao).toHaveBeenCalledTimes(mercados[0].consultasExecutadas);
    expect(mercados[0].falhasPorPortal.every((falha) => falha.codigo === "firecrawl_http_falhou")).toBe(true);
    expect(salvar).not.toHaveBeenCalled();
  });
});
