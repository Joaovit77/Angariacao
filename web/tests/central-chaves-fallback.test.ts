import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  buscarComNavegador: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
  registrarEvento: vi.fn(),
  falharFinalizacao: false,
  aoFinalizar: null as (() => void) | null,
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
        ? (mocks.aoFinalizar?.(), Promise.reject(new Error("erro de persistência simulado")))
        : real.finalizarColetaCentralAngariacao(...args),
  };
});

import { FirecrawlIndisponivel, TIMEOUT_FIRECRAWL_FETCH_MS } from "@/lib/servidor/firecrawlCentralAngariacao";
import { RESERVA_PROCESSAMENTO_CENTRAL_MS, TIMEOUT_HTTP_CHAVES_MS } from "@/lib/servidor/fallbackHttpChaves";
import { POST, maxDuration } from "@/app/api/central-angariacao/buscar/route";

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
    mocks.aoFinalizar = null;
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

  it("reserva aquisição HTTP, processamento e folga após o timeout máximo do Firecrawl", () => {
    expect(maxDuration * 1000 - TIMEOUT_FIRECRAWL_FETCH_MS - TIMEOUT_HTTP_CHAVES_MS
      - RESERVA_PROCESSAMENTO_CENTRAL_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("Firecrawl rápido e bem-sucedido conserva o caminho normal sem HTTP", async () => {
    mocks.buscarComFirecrawl.mockResolvedValue([{ idExterno: "35106344", portal: "chaves-na-mao",
      titulo: "Casa em Londrina", cidade: "Londrina", estado: "PR",
      url: "/imovel/casa/id-35106344/", anunciante: "incerto" }]);
    const buscarHttp = vi.fn();
    vi.stubGlobal("fetch", buscarHttp);
    const corpo = await (await POST(requisicao())).json();
    expect(corpo).toMatchObject({ ok: true, anuncios: [expect.objectContaining({
      url: "/imovel/casa/id-35106344/", idExterno: "35106344",
    })] });
    expect(buscarHttp).not.toHaveBeenCalled();
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledOnce();
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

  it("falha Firecrawl próxima do limite reservado ainda permite a janela completa do HTTP", async () => {
    let agora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => agora);
    mocks.buscarComFirecrawl.mockImplementation(async () => {
      agora = maxDuration * 1000 - TIMEOUT_HTTP_CHAVES_MS - RESERVA_PROCESSAMENTO_CENTRAL_MS;
      throw new FirecrawlIndisponivel("falha sintética", "firecrawl_timeout");
    });
    const buscarHttp = vi.fn(async () => new Response(htmlContrato, { status: 200 }));
    vi.stubGlobal("fetch", buscarHttp);
    const corpo = await (await POST(requisicao())).json();
    expect(corpo.ok).toBe(true);
    expect(buscarHttp).toHaveBeenCalledOnce();
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledOnce();
  });

  it("orçamento insuficiente falha antes de iniciar HTTP, sem sucesso falso nem cache", async () => {
    let agora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => agora);
    mocks.buscarComFirecrawl.mockImplementation(async (_f, _u, _o, _d, observar) => {
      agora = maxDuration * 1000 - TIMEOUT_HTTP_CHAVES_MS - RESERVA_PROCESSAMENTO_CENTRAL_MS + 1;
      observar?.({ fase: "caminho_escolhido", aquisicao: "firecrawl",
        coletaId: "b3993188-5f42-4c15-9df9-3b0416d27e5f" });
      observar?.({ fase: "fetch_iniciado", aquisicao: "firecrawl",
        coletaId: "b3993188-5f42-4c15-9df9-3b0416d27e5f" });
      observar?.({ fase: "falha", aquisicao: "firecrawl", codigo: "firecrawl_timeout",
        coletaId: "b3993188-5f42-4c15-9df9-3b0416d27e5f" });
      throw new FirecrawlIndisponivel("falha sintética", "firecrawl_timeout");
    });
    const buscarHttp = vi.fn();
    vi.stubGlobal("fetch", buscarHttp);
    const corpo = await (await POST(requisicao())).json();
    expect(corpo).toMatchObject({ ok: false, anuncios: [] });
    expect(buscarHttp).not.toHaveBeenCalled();
    expect(mocks.cache.size).toBe(0);
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
    const evento = mocks.registrarEvento.mock.calls.find(([entrada]) => entrada.evento === "central-busca-falhou")?.[0];
    const detalhe = JSON.parse(evento.detalhe);
    expect(detalhe).toMatchObject({ aquisicao: "firecrawl", chamada_propria_iniciada: true,
      resposta_recebida: null, resultado_interpretado: null });
    expect(detalhe.fases.at(-1)).toMatchObject({ fase: "falha", codigo: "http_orcamento_insuficiente" });
    expect(detalhe.fases.some((fase: { fase: string; aquisicao: string }) =>
      fase.fase === "fetch_iniciado" && fase.aquisicao === "http_direto")).toBe(false);
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

  it("orçamento esgotado depois da coleta não provoca nova aquisição na finalização", async () => {
    let agora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => agora);
    mocks.falharFinalizacao = true;
    mocks.aoFinalizar = () => { agora = maxDuration * 1000 + 1; };
    const buscarHttp = vi.fn(async () => new Response(htmlContrato, { status: 200 }));
    vi.stubGlobal("fetch", buscarHttp);

    const corpo = await (await POST(requisicao())).json();

    expect(corpo).toMatchObject({ ok: false, anuncios: [] });
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(buscarHttp).toHaveBeenCalledOnce();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
  });
});
