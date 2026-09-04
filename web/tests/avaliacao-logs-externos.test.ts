import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erroExternoSintetico } from "./fixtures/erroExterno";

const mocks = vi.hoisted(() => ({ cliente: vi.fn(), embedding: vi.fn(), estruturados: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.cliente }));
vi.mock("@/lib/servidor/embeddingsImoveis", () => ({ gerarEmbeddingsDeImoveis: mocks.embedding, modeloEmbeddingImoveis: () => "modelo-fixture" }));
vi.mock("@/lib/persistencia/comparaveisMercado", () => ({
  carregarComparaveisMercadoComCliente: mocks.estruturados,
  mapearComparaveisMercado: vi.fn(),
  mapearFatosHistoricosComparavelMercado: vi.fn(),
}));
import { POST } from "@/app/api/avaliacao/comparaveis/route";

describe("fallback da Avaliação com logs seguros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-ficticia");
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each(["embedding", "rpc"])("mantém retorno estruturado quando falha %s", async (etapa) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: erroExternoSintetico() });
    const cliente = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario-fixture" } }, error: null }) }, rpc };
    mocks.cliente.mockReturnValue(cliente);
    mocks.estruturados.mockResolvedValue([{ id: "comparavel-fixture" }]);
    if (etapa === "embedding") mocks.embedding.mockRejectedValueOnce(erroExternoSintetico());
    else mocks.embedding.mockResolvedValueOnce([[0.1, 0.2]]);
    const entrada = { finalidade: "locacao", cidade: "Londrina", estado: "PR", tipo: "Apartamento", areaM2: 70, quartos: 2 };
    const resposta = await POST(new Request("http://localhost/api/avaliacao/comparaveis", {
      method: "POST", headers: { Authorization: "Bearer sessao-fixture", "Content-Type": "application/json" }, body: JSON.stringify(entrada),
    }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ modo: "estruturado", comparaveis: [{ id: "comparavel-fixture" }] });
    expect(mocks.estruturados).toHaveBeenCalledExactlyOnceWith(cliente, "usuario-fixture", expect.objectContaining(entrada));
    expect(log.mock.calls[0][1]).toEqual(etapa === "embedding"
      ? { provider: "openai", operation: "embedding", error_code: "embedding_request_failed", status: 403 }
      : { provider: "supabase", operation: "buscar_comparaveis", error_code: "comparable_search_failed", status: 403 });
    if (etapa === "embedding") expect(rpc).not.toHaveBeenCalled();
    else expect(rpc).toHaveBeenCalledWith("buscar_comparaveis_mercado_hibridos", expect.objectContaining({ p_estado: "PR", p_cidade_chave: "londrina" }));
  });
});
