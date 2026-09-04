import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erroExternoSintetico } from "./fixtures/erroExterno";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  buscarComNavegador: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({
  salvarComparaveisMercado: mocks.salvarComparaveisMercado,
}));
vi.mock("@/lib/servidor/firecrawlCentralAngariacao", () => ({
  buscarComFirecrawl: mocks.buscarComFirecrawl,
  FirecrawlIndisponivel: class FirecrawlIndisponivel extends Error {},
}));
vi.mock("@/lib/servidor/scraperCentralAngariacao", () => ({
  buscarComNavegador: mocks.buscarComNavegador,
  NavegadorIndisponivel: class NavegadorIndisponivel extends Error {},
}));

import { POST } from "@/app/api/central-angariacao/buscar/route";

describe("persistência da busca da Central", () => {
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "usuario-central" } },
        error: null,
      }),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
    mocks.createClient.mockReturnValue(supabase);
    mocks.salvarComparaveisMercado.mockResolvedValue(1);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("continua retornando a coleta e alimentando comparáveis pela finalização compartilhada", async () => {
    mocks.buscarComFirecrawl.mockResolvedValue([
      {
        idExterno: "novo-1",
        portal: "olx",
        titulo: "Apartamento com 2 quartos e 70 m²",
        preco: 2200,
        cidade: "Londrina",
        url: "https://www.olx.com.br/imovel/novo-1",
        anunciante: "incerto",
      },
      {
        idExterno: "fora-1",
        portal: "olx",
        titulo: "Apartamento em outra cidade",
        preco: 1900,
        cidade: "Cambé",
        url: "https://www.olx.com.br/imovel/fora-1",
        anunciante: "incerto",
      },
    ]);

    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-valido",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        portal: "olx",
        cidade: "Londrina",
        estado: "PR",
        tipo: "Apartamento",
      }),
    }));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toMatchObject({
      ok: true,
      anuncios: [
        expect.objectContaining({
          idExterno: "novo-1",
          areaM2: 70,
          quartos: 2,
        }),
      ],
    });
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledWith(
      supabase,
      "usuario-central",
      [expect.objectContaining({ idExterno: "novo-1", areaM2: 70 })],
      expect.objectContaining({ portal: "olx", cidade: "Londrina" }),
    );
  });

  it("preserva os resultados e avisa quando somente a base histórica falha", async () => {
    mocks.buscarComFirecrawl.mockResolvedValue([{
      idExterno: "novo-2",
      portal: "olx",
      titulo: "Casa para alugar",
      preco: 1800,
      cidade: "Londrina",
      url: "https://www.olx.com.br/imovel/novo-2",
      anunciante: "incerto",
    }]);
    mocks.salvarComparaveisMercado.mockRejectedValue(erroExternoSintetico());

    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-valido",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    const corpo = await resposta.json();

    expect(corpo.ok).toBe(true);
    expect(corpo.anuncios).toHaveLength(1);
    expect(corpo.aviso).toContain("não foi possível atualizar a base histórica");
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[central-angariacao] falha ao atualizar a base de comparáveis",
      { provider: "supabase", operation: "persistir_comparaveis", error_code: "comparable_persistence_failed", status: 403 },
    );
  });

  it("mantém degradação do Firecrawl sem despejar erro inesperado", async () => {
    vi.stubEnv("VERCEL", "1");
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.buscarComFirecrawl.mockRejectedValueOnce(erroExternoSintetico());
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect(await resposta.json()).toMatchObject({ ok: false, anuncios: [] });
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    expect(log.mock.calls[0][1]).toEqual({ provider: "firecrawl", operation: "coletar", error_code: "collection_failed", status: 403 });
  });
});
