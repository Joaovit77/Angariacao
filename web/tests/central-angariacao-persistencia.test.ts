import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erroExternoSintetico } from "./fixtures/erroExterno";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  buscarComNavegador: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
  registrarEvento: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({
  salvarComparaveisMercado: mocks.salvarComparaveisMercado,
}));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
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
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "[central-angariacao] falha ao atualizar a base de comparáveis",
      { provider: "supabase", operation: "persistir_comparaveis", error_code: "comparable_persistence_failed", status: 403 },
    );
  });

  it("falha de finalização após aquisição não inicia navegador nem HTTP", async () => {
    vi.stubEnv("VERCEL", "");
    const requisicao = vi.fn();
    vi.stubGlobal("fetch", requisicao);
    mocks.buscarComFirecrawl.mockResolvedValue([null]);
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect((await resposta.json()).ok).toBe(false);
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    expect(requisicao).not.toHaveBeenCalled();
    const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-falhou")?.[0];
    expect(JSON.parse(log.detalhe).fases.at(-1)).toMatchObject({
      fase: "falha", codigo: "falha_interna",
    });
    vi.unstubAllGlobals();
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

  it.each(["monitor_navegador", "verificar_agora", "pesquisar"] as const)(
    "%s: identifica iniciador, ID do servidor e cache sem inferir chamada externa",
    async (iniciador) => {
      mocks.buscarComFirecrawl.mockImplementation(async (_f, _u, _origem, _diag, observar) => {
        observar({ fase: "cache_hit", aquisicao: "cache", coletaId: "48b73600-e868-46c6-a899-845b5487c2ca" });
        observar({ fase: "resultado_interpretado", aquisicao: "cache", coletaId: "48b73600-e868-46c6-a899-845b5487c2ca" });
        return [];
      });
      const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
        method: "POST",
        headers: { Authorization: "Bearer fixture", "Content-Type": "application/json", "x-angario-iniciador": iniciador },
        body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
      }));
      const corpo = await resposta.json();
      const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-ok")?.[0];
      const detalhe = JSON.parse(log.detalhe);
      expect(corpo.execucaoId).toMatch(/^[0-9a-f-]{36}$/);
      expect(detalhe).toMatchObject({
        execucao_id: corpo.execucaoId, iniciador, aquisicao: "cache", reutilizacao: "nenhuma",
        chamada_propria_iniciada: false, novos: iniciador === "pesquisar" ? "nao_aplicavel" : null,
      });
      expect(detalhe.fases.map((fase: { fase: string }) => fase.fase)).toEqual(["cache_hit", "resultado_interpretado"]);
    },
  );

  it("em Vercel, falha do Firecrawl registra falha sem fallback", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.buscarComFirecrawl.mockImplementation(async (_f, _u, _origem, _diag, observar) => {
      observar({ fase: "caminho_escolhido", aquisicao: "firecrawl" });
      observar({ fase: "fetch_iniciado", aquisicao: "firecrawl" });
      observar({ fase: "falha", aquisicao: "firecrawl", codigo: "firecrawl_timeout" });
      throw new Error("token privado");
    });
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect((await resposta.json()).ok).toBe(false);
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-falhou")?.[0];
    const detalhe = JSON.parse(log.detalhe);
    expect(detalhe.fases.map((fase: { fase: string }) => fase.fase)).toEqual([
      "caminho_escolhido", "fetch_iniciado", "falha",
    ]);
    expect(JSON.stringify(detalhe)).not.toContain("token privado");
  });

  it("fora da Vercel, Playwright local mantém o fallback quando recupera anúncios", async () => {
    vi.stubEnv("VERCEL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.buscarComFirecrawl.mockRejectedValue(new Error("coleta indisponível"));
    mocks.buscarComNavegador.mockImplementation(async (_f, _u, observar) => {
      observar("fetch_iniciado");
      observar("resposta_recebida", 200);
      return [{
        idExterno: "novo-playwright", portal: "olx", titulo: "Casa em Londrina",
        cidade: "Londrina", estado: "PR", preco: 1800,
        url: "https://www.olx.com.br/imovel/novo-playwright", anunciante: "incerto",
      }];
    });
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect((await resposta.json()).ok).toBe(true);
    expect(mocks.buscarComNavegador).toHaveBeenCalledOnce();
    const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-ok")?.[0];
    const detalhe = JSON.parse(log.detalhe);
    expect(detalhe.aquisicao).toBe("playwright");
    expect(detalhe.fases.map((fase: { fase: string }) => fase.fase)).toEqual([
      "fallback", "caminho_escolhido", "fetch_iniciado", "resposta_recebida", "resultado_interpretado",
    ]);
  });

  it("sem prova de HTTP direto, falha Firecrawl e Playwright local não vira sucesso vazio", async () => {
    vi.stubEnv("VERCEL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.buscarComFirecrawl.mockRejectedValue(new Error("coleta indisponível"));
    mocks.buscarComNavegador.mockRejectedValue(new Error("navegador indisponível"));
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect((await resposta.json()).ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
    const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-falhou")?.[0];
    const detalhe = JSON.parse(log.detalhe);
    expect(detalhe.fases.map((fase: { fase: string }) => fase.fase)).toEqual([
      "fallback", "caminho_escolhido", "falha",
    ]);
    vi.unstubAllGlobals();
  });

  it("fallback Playwright vazio após falha Firecrawl continua sendo falha", async () => {
    vi.stubEnv("VERCEL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.buscarComFirecrawl.mockRejectedValue(new Error("coleta indisponível"));
    mocks.buscarComNavegador.mockResolvedValue([]);
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect((await resposta.json()).ok).toBe(false);
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
    const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-falhou")?.[0];
    expect(JSON.parse(log.detalhe).fases.at(-1)).toMatchObject({
      fase: "falha", aquisicao: "playwright", codigo: "fallback_vazio",
    });
  });

  it("sem Firecrawl configurado, preserva HTTP direto após falha do navegador", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("VERCEL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.buscarComNavegador.mockRejectedValue(new Error("navegador indisponível"));
    const fetchFalso = vi.fn(async () => new Response("<html></html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
      method: "POST", headers: { Authorization: "Bearer fixture", "Content-Type": "application/json" },
      body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
    }));
    expect((await resposta.json()).ok).toBe(true);
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(fetchFalso).toHaveBeenCalledOnce();
    const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-ok")?.[0];
    expect(JSON.parse(log.detalhe).aquisicao).toBe("http_direto");
    vi.unstubAllGlobals();
  });
  it.each(["monitor_navegador", "verificar_agora", "pesquisar"] as const)(
    "%s: registra borda Firecrawl sem alterar resultado funcional",
    async (iniciador) => {
      mocks.buscarComFirecrawl.mockImplementation(async (_f, _u, _origem, _diag, observar) => {
        observar({ fase: "caminho_escolhido", aquisicao: "firecrawl" });
        observar({ fase: "fetch_iniciado", aquisicao: "firecrawl" });
        observar({ fase: "resposta_recebida", aquisicao: "firecrawl", statusHttp: 200 });
        observar({ fase: "resultado_interpretado", aquisicao: "firecrawl" });
        return [];
      });
      const resposta = await POST(new Request("http://localhost/api/central-angariacao/buscar", {
        method: "POST", headers: {
          Authorization: "Bearer fixture", "Content-Type": "application/json", "x-angario-iniciador": iniciador,
        },
        body: JSON.stringify({ portal: "olx", cidade: "Londrina", estado: "PR" }),
      }));
      const corpo = await resposta.json();
      const log = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-ok")?.[0];
      expect(JSON.parse(log.detalhe)).toMatchObject({
        execucao_id: corpo.execucaoId, aquisicao: "firecrawl", chamada_propria_iniciada: true,
        resposta_recebida: true, resultado_interpretado: true,
      });
      expect(corpo).toMatchObject({ ok: true, anuncios: [] });
    },
  );
});
