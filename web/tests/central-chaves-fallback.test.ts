import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  buscarComNavegador: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
  registrarEvento: vi.fn(),
  falharFinalizacao: false,
  cache: new Map<string, Map<string, unknown>>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({
  salvarComparaveisMercado: mocks.salvarComparaveisMercado,
}));
vi.mock("@vercel/functions", () => ({
  getCache: ({ namespace }: { namespace: string }) => ({
    get: async (chave: string) => mocks.cache.get(namespace)?.get(chave) ?? null,
    set: async (chave: string, valor: unknown) => {
      if (!mocks.cache.has(namespace)) mocks.cache.set(namespace, new Map());
      mocks.cache.get(namespace)!.set(chave, valor);
    },
  }),
}));
vi.mock("@/lib/servidor/firecrawlCentralAngariacao", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/servidor/firecrawlCentralAngariacao")>(),
  buscarComFirecrawl: mocks.buscarComFirecrawl,
}));
vi.mock("@/lib/servidor/scraperCentralAngariacao", () => ({
  buscarComNavegador: mocks.buscarComNavegador,
  NavegadorIndisponivel: class NavegadorIndisponivel extends Error {},
}));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/servidor/finalizacaoCentralAngariacao")>();
  return {
    ...real,
    finalizarColetaCentralAngariacao: (...args: Parameters<typeof real.finalizarColetaCentralAngariacao>) =>
      mocks.falharFinalizacao
        ? Promise.reject(new Error("erro de persistência simulado"))
        : real.finalizarColetaCentralAngariacao(...args),
  };
});

import { FirecrawlIndisponivel } from "@/lib/servidor/firecrawlCentralAngariacao";
import { POST } from "@/app/api/central-angariacao/buscar/route";

const htmlContrato = `<a href="/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/">
  <h2>Casa para alugar no Centro</h2><p>Rua Exemplo</p>
  <p>Centro, Londrina/PR</p><p>R$ 2.500</p>
</a>`;
const requisicao = () => new Request("http://localhost/api/central-angariacao/buscar", {
  method: "POST",
  headers: { Authorization: "Bearer token-sintetico", "Content-Type": "application/json" },
  body: JSON.stringify({ portal: "chaves-na-mao", cidade: "Londrina", estado: "PR" }),
});

describe("fronteira Central do fallback Chaves", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.clear();
    mocks.falharFinalizacao = false;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-sintetica");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-sintetica");
    vi.stubEnv("VERCEL", "1");
    mocks.createClient.mockReturnValue({ auth: { getUser: async () => ({
      data: { user: { id: "usuario-central" } }, error: null,
    }) } });
    mocks.salvarComparaveisMercado.mockResolvedValue(1);
    mocks.buscarComFirecrawl.mockRejectedValue(new FirecrawlIndisponivel("falha sintética", "firecrawl_429"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("HTTP Chaves positivo finaliza pela mesma fronteira sem acionar Playwright", async () => {
    const buscarHttp = vi.fn(async () => new Response(htmlContrato, { status: 200 }));
    vi.stubGlobal("fetch", buscarHttp);
    const resposta = await POST(requisicao());
    const corpo = await resposta.json();
    expect(corpo).toMatchObject({ ok: true, anuncios: [expect.objectContaining({
      idExterno: "35106344", anunciante: "incerto",
      url: "https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/",
    })] });
    expect(buscarHttp).toHaveBeenCalledOnce();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledOnce();
    const evento = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-ok")?.[0];
    expect(JSON.parse(evento.detalhe)).toMatchObject({ aquisicao: "http_direto", resultado_interpretado: true });
  });

  it("erro de finalização após HTTP positivo não inicia outra aquisição", async () => {
    mocks.falharFinalizacao = true;
    const buscarHttp = vi.fn(async () => new Response(htmlContrato, { status: 200 }));
    vi.stubGlobal("fetch", buscarHttp);
    const corpo = await (await POST(requisicao())).json();
    expect(corpo).toMatchObject({ ok: false, anuncios: [] });
    expect(buscarHttp).toHaveBeenCalledOnce();
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    const evento = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-falhou")?.[0];
    expect(JSON.parse(evento.detalhe).fases.at(-1)).toMatchObject({ fase: "falha", codigo: "falha_interna" });
  });
});
