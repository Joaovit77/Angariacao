import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const armazenamentos = vi.hoisted(() => new Map<string, Map<string, unknown>>());
const gravarCache = vi.hoisted(() => vi.fn());
vi.mock("@vercel/functions", () => ({
  getCache: ({ namespace }: { namespace: string }) => ({
    get: async (chave: string) => armazenamentos.get(namespace)?.get(chave) ?? null,
    set: async (chave: string, valor: unknown, opcoes: unknown) => {
      gravarCache(namespace, chave, opcoes);
      if (!armazenamentos.has(namespace)) armazenamentos.set(namespace, new Map());
      armazenamentos.get(namespace)!.set(chave, valor);
    },
  }),
}));
vi.mock("cheerio", async (importOriginal) => {
  const real = await importOriginal<typeof import("cheerio")>();
  return {
    ...real,
    load: (html: string, ...args: Parameters<typeof real.load> extends [unknown, ...infer Rest] ? Rest : never) => {
      if (html.includes("FORCAR_EXCECAO_PARSER")) throw new Error("erro externo cru");
      return real.load(html, ...args);
    },
  };
});

import { buscarComFallbackHttpChaves, interpretarHttpChaves } from "@/lib/servidor/fallbackHttpChaves";
import { urlAbsolutaDoCardChaves } from "@/lib/calculo/urlChavesHttp";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { chaveCanonicaConsultaPortal } from "@/lib/servidor/planejadorColetaMercados";
import { criarObservadorRadar } from "@/lib/servidor/observabilidadeRadar";
import type { EventoConsultaFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";

const filtros = { portal: "chaves-na-mao" as const, cidade: "Londrina", estado: "PR" };
const href = "/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/";
const card = (cidade = "Londrina", url = href) => `<a href="${url}">
  <h2>Casa para alugar no Centro</h2><p>Rua Exemplo</p>
  <p>Centro, ${cidade}/PR</p><p>R$ 2.500</p>
</a>`;
const falhaFirecrawl = () => new Response("indisponível", { status: 503 });
const sucessoFirecrawl = (html: string) => Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: 200 } } });
const cacheHttp = () => armazenamentos.get("central-chaves-http-html-v1") ?? new Map();

describe("fallback HTTP restrito do Chaves", () => {
  beforeEach(() => {
    armazenamentos.clear();
    gravarCache.mockClear();
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-sintetica");
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("Firecrawl bem-sucedido permanece primário e não chama HTTP", async () => {
    const requisicao = vi.fn(async () => sucessoFirecrawl(card()));
    vi.stubGlobal("fetch", requisicao);
    const anuncios = await buscarComFallbackHttpChaves(filtros, urlDaPesquisa(filtros));
    expect(anuncios).toHaveLength(1);
    expect(anuncios[0].url).toBe(href); // Firecrawl não recebe normalização nova.
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheHttp().size).toBe(0);
  });

  it("URL de pesquisa não canônica nunca aciona HTTP direto", async () => {
    const requisicao = vi.fn(async () => falhaFirecrawl());
    vi.stubGlobal("fetch", requisicao);
    await expect(buscarComFallbackHttpChaves(filtros, "https://externo.test/imoveis-para-alugar/pr-londrina/"))
      .rejects.toMatchObject({ codigo: "firecrawl_http_falhou" });
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheHttp().size).toBe(0);
  });
  it("falha Firecrawl usa HTML HTTP positivo, normaliza URL e preserva o ID", async () => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response(card(), { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    const eventos: EventoConsultaFirecrawl[] = [];
    const anuncios = await buscarComFallbackHttpChaves(filtros, urlDaPesquisa(filtros), undefined, undefined,
      (evento) => eventos.push(evento));
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(anuncios).toHaveLength(1);
    expect(anuncios[0]).toMatchObject({
      idExterno: "35106344", url: `https://www.chavesnamao.com.br${href}`,
      cidade: "Londrina", estado: "PR", anunciante: "incerto",
    });
    expect(anuncios[0].publicadoEm ?? null).toBeNull();
    expect(eventos.map((evento) => [evento.fase, evento.aquisicao])).toEqual([
      ["caminho_escolhido", "firecrawl"], ["fetch_iniciado", "firecrawl"],
      ["resposta_recebida", "firecrawl"], ["falha", "firecrawl"],
      ["fallback", "http_direto"], ["caminho_escolhido", "http_direto"],
      ["fetch_iniciado", "http_direto"], ["resposta_recebida", "http_direto"],
      ["resultado_interpretado", "http_direto"],
    ]);
    expect(gravarCache).toHaveBeenCalledWith("central-chaves-http-html-v1", expect.any(String),
      expect.objectContaining({ ttl: 1200 }));
    expect(cacheHttp().size).toBe(1);
    expect(JSON.stringify(eventos)).not.toMatch(/<a|https:\/\/www\.chavesnamao|indisponível/);
  });

  it("cache HTTP positivo é reutilizado sem nova aquisição", async () => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response(card(), { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    const url = urlDaPesquisa(filtros);
    const primeiro = await buscarComFallbackHttpChaves(filtros, url);
    const eventos: EventoConsultaFirecrawl[] = [];
    const segundo = await buscarComFallbackHttpChaves(filtros, url, undefined, undefined, (evento) => eventos.push(evento));
    expect(segundo).toEqual(primeiro);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(eventos.map((evento) => evento.fase)).toEqual(["cache_hit", "resultado_interpretado"]);
  });

  it.each([403, 429, 500])("HTTP %i falha explicitamente e não entra no cache", async (status) => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response("bloqueio", { status }));
    vi.stubGlobal("fetch", requisicao);
    await expect(buscarComFallbackHttpChaves(filtros, urlDaPesquisa(filtros)))
      .rejects.toMatchObject({ codigo: "http_status_falhou", statusHttp: status });
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(cacheHttp().size).toBe(0);
  });

  it.each([
    ["timeout", new DOMException("segredo externo", "TimeoutError"), "http_timeout"],
    ["transporte", new Error("segredo externo"), "http_transporte_falhou"],
  ])("%s falha com código fechado e sem cache", async (_nome, erro, codigo) => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl()).mockRejectedValueOnce(erro);
    vi.stubGlobal("fetch", requisicao);
    const eventos: EventoConsultaFirecrawl[] = [];
    await expect(buscarComFallbackHttpChaves(filtros, urlDaPesquisa(filtros), undefined, undefined,
      (evento) => eventos.push(evento))).rejects.toMatchObject({ codigo });
    expect(cacheHttp().size).toBe(0);
    expect(JSON.stringify(eventos)).not.toContain("segredo externo");
    if (codigo === "http_timeout") {
      expect(eventos.filter((evento) => evento.aquisicao === "http_direto").map((evento) => evento.fase))
        .toEqual(["fallback", "caminho_escolhido", "fetch_iniciado", "falha"]);
    }
  });

  it.each([
    ["estrutura desconhecida", "<html><main>Estrutura nova</main></html>"],
    ["parser retorna zero", "<html><main>Nenhum card reconhecido</main></html>"],
    ["após cidade/UF não resta anúncio", card("Cambé")],
    ["URL insegura não é aceita", card("Londrina", "/imovel/casa/id-35106344/?externo=1")],
  ])("%s é indeterminado, nunca sucesso vazio ou cache", async (_nome, html) => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    await expect(buscarComFallbackHttpChaves(filtros, urlDaPesquisa(filtros)))
      .rejects.toMatchObject({ codigo: "http_resultado_indeterminado" });
    expect(cacheHttp().size).toBe(0);
  });

  it("exceção do parser HTTP falha sem cache e sem erro externo cru", async () => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response("FORCAR_EXCECAO_PARSER", { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    const erro = await buscarComFallbackHttpChaves(filtros, urlDaPesquisa(filtros)).catch((e) => e);
    expect(erro).toMatchObject({ codigo: "http_parser_falhou" });
    expect(erro.message).not.toContain("erro externo cru");
    expect(cacheHttp().size).toBe(0);
  });

  it("filtro somente proprietário não promove anunciante incerto", async () => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response(card(), { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    await expect(buscarComFallbackHttpChaves({ ...filtros, somenteProprietario: true }, urlDaPesquisa(filtros)))
      .rejects.toMatchObject({ codigo: "http_resultado_indeterminado" });
    expect(cacheHttp().size).toBe(0);
  });

  it.each(["olx", "viva-real", "wimoveis"] as const)("%s nunca recebe fallback HTTP", async (portal) => {
    const requisicao = vi.fn(async () => falhaFirecrawl());
    vi.stubGlobal("fetch", requisicao);
    const f = { portal, cidade: "Londrina", estado: "PR" };
    await expect(buscarComFallbackHttpChaves(f, urlDaPesquisa(f), undefined, undefined, undefined,
      () => 0)).rejects.toMatchObject({ codigo: "firecrawl_http_falhou" });
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheHttp().size).toBe(0);
  });

  it("cache Firecrawl existente prevalece sobre cache HTTP e evita nova aquisição", async () => {
    const requisicao = vi.fn().mockResolvedValueOnce(falhaFirecrawl())
      .mockResolvedValueOnce(new Response(card(), { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    const url = urlDaPesquisa(filtros);
    await buscarComFallbackHttpChaves(filtros, url);
    const chave = chaveCanonicaConsultaPortal(filtros.portal, url);
    const htmlFirecrawl = card().replace("Casa para alugar no Centro", "Resultado do cache Firecrawl");
    armazenamentos.set("central-firecrawl-html-v2", new Map([
      [chave, gzipSync(htmlFirecrawl).toString("base64")],
    ]));
    const resultado = await buscarComFallbackHttpChaves(filtros, url, undefined, undefined, undefined, () => 0);
    expect(resultado[0].titulo).toBe("Resultado do cache Firecrawl");
    expect(resultado[0].url).toBe(href);
    expect(requisicao).toHaveBeenCalledTimes(2);
  });

  it("cache HTTP com estrutura inválida não vira sucesso", async () => {
    const url = urlDaPesquisa(filtros);
    const chave = chaveCanonicaConsultaPortal(filtros.portal, url);
    armazenamentos.set("central-chaves-http-html-v1", new Map([
      [chave, gzipSync("<html>estrutura desconhecida</html>").toString("base64")],
    ]));
    const requisicao = vi.fn(async () => sucessoFirecrawl(card()));
    vi.stubGlobal("fetch", requisicao);
    const resultado = await buscarComFallbackHttpChaves(filtros, url);
    expect(resultado).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("cache HTTP surgido após falha Firecrawl não dispensa tempo de finalização", async () => {
    const url = urlDaPesquisa(filtros);
    const chave = chaveCanonicaConsultaPortal(filtros.portal, url);
    const requisicao = vi.fn(async () => {
      armazenamentos.set("central-chaves-http-html-v1", new Map([
        [chave, gzipSync(card()).toString("base64")],
      ]));
      return falhaFirecrawl();
    });
    vi.stubGlobal("fetch", requisicao);

    await expect(buscarComFallbackHttpChaves(filtros, url, undefined, undefined, undefined,
      () => 34_999)).rejects.toMatchObject({ codigo: "http_orcamento_insuficiente" });

    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheHttp().size).toBe(1);
  });

  it("cache HTTP surgido após falha Firecrawl aceita exatamente 35 s sem nova aquisição", async () => {
    const url = urlDaPesquisa(filtros);
    const chave = chaveCanonicaConsultaPortal(filtros.portal, url);
    const requisicao = vi.fn(async () => {
      armazenamentos.set("central-chaves-http-html-v1", new Map([
        [chave, gzipSync(card()).toString("base64")],
      ]));
      return falhaFirecrawl();
    });
    vi.stubGlobal("fetch", requisicao);
    const eventos: EventoConsultaFirecrawl[] = [];

    const anuncios = await buscarComFallbackHttpChaves(filtros, url, undefined, undefined,
      (evento) => eventos.push(evento), () => 35_000);

    expect(anuncios).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledOnce();
    expect(eventos.at(-2)).toMatchObject({ fase: "cache_hit", aquisicao: "cache" });
    expect(eventos.at(-1)).toMatchObject({ fase: "resultado_interpretado", aquisicao: "cache" });
    expect(eventos.some((evento) => evento.fase === "fetch_iniciado" && evento.aquisicao === "http_direto"))
      .toBe(false);
  });

  it("cache surgido durante single-flight respeita o orçamento de cada consumidor", async () => {
    let liberarFirecrawl!: (resposta: Response) => void;
    const requisicao = vi.fn(() => new Promise<Response>((resolve) => { liberarFirecrawl = resolve; }));
    vi.stubGlobal("fetch", requisicao);
    const url = urlDaPesquisa(filtros);
    const chave = chaveCanonicaConsultaPortal(filtros.portal, url);
    const primeiro = criarObservadorRadar({
      execucaoId: "dbda497e-d0b2-45ca-935b-01f48a2d2c21", iniciador: "cron", portal: filtros.portal,
    });
    const segundo = criarObservadorRadar({
      execucaoId: "dbda497e-d0b2-45ca-935b-01f48a2d2c22", iniciador: "pesquisar", portal: filtros.portal,
    });
    const a = buscarComFallbackHttpChaves(filtros, url, undefined, undefined, primeiro.observar, () => 35_000);
    const b = buscarComFallbackHttpChaves(filtros, url, undefined, undefined, segundo.observar, () => 34_999);
    await vi.waitFor(() => expect(segundo.resumo().reutilizacao).toBe("single_flight"));
    armazenamentos.set("central-chaves-http-html-v1", new Map([
      [chave, gzipSync(card()).toString("base64")],
    ]));
    liberarFirecrawl(falhaFirecrawl());

    const [resultadoA, resultadoB] = await Promise.allSettled([a, b]);
    expect(resultadoA).toMatchObject({ status: "fulfilled", value: [expect.objectContaining({ idExterno: "35106344" })] });
    expect(resultadoB).toMatchObject({ status: "rejected", reason: { codigo: "http_orcamento_insuficiente" } });
    expect(requisicao).toHaveBeenCalledOnce();
    expect(segundo.resumo()).toMatchObject({ reutilizacao: "single_flight", chamada_propria_iniciada: false });
    expect(segundo.resumo().fases.some((fase) => fase.fase === "fetch_iniciado" && fase.aquisicao === "http_direto"))
      .toBe(false);
  });

  it("duas execuções compartilham uma chamada Firecrawl e uma HTTP com crédito correto", async () => {
    let liberarFirecrawl!: (r: Response) => void;
    let liberarHttp!: (r: Response) => void;
    const requisicao = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { liberarFirecrawl = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { liberarHttp = resolve; }))
      .mockImplementation(async () => new Response(card(), { status: 200 }));
    vi.stubGlobal("fetch", requisicao);
    const produtor = criarObservadorRadar({ execucaoId: "dbda497e-d0b2-45ca-935b-01f48a2d2c11", iniciador: "cron", portal: filtros.portal });
    const consumidor = criarObservadorRadar({ execucaoId: "dbda497e-d0b2-45ca-935b-01f48a2d2c12", iniciador: "pesquisar", portal: filtros.portal });
    const url = urlDaPesquisa(filtros);
    const a = buscarComFallbackHttpChaves(filtros, url, undefined, undefined, produtor.observar, () => 50_000);
    const b = buscarComFallbackHttpChaves(filtros, url, undefined, undefined, consumidor.observar, () => 120_000);
    await vi.waitFor(() => expect(requisicao).toHaveBeenCalledOnce());
    liberarFirecrawl(falhaFirecrawl());
    await vi.waitFor(() => expect(requisicao).toHaveBeenCalledTimes(2));
    liberarHttp(new Response(card(), { status: 200 }));
    const [resultadoA, resultadoB] = await Promise.all([a, b]);
    expect(resultadoA).toEqual(resultadoB);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(produtor.resumo()).toMatchObject({ aquisicao: "http_direto", chamada_propria_iniciada: true });
    expect(consumidor.resumo()).toMatchObject({ aquisicao: "http_direto", reutilizacao: "single_flight", chamada_propria_iniciada: false });
    expect(produtor.resumo().coleta_id).toBe(consumidor.resumo().coleta_id);
    expect(produtor.resumo().execucao_id).not.toBe(consumidor.resumo().execucao_id);
    expect(consumidor.resumo().fases.some((fase) => fase.fase === "fetch_iniciado" && fase.aquisicao === "http_direto")).toBe(false);
  });
});

describe("URL estrita do card HTTP do Chaves", () => {
  it("normaliza a rota observada sem alterar o ID externo", () => {
    expect(urlAbsolutaDoCardChaves(href, "35106344")).toBe(`https://www.chavesnamao.com.br${href}`);
    expect(interpretarHttpChaves(card(), filtros)[0].idExterno).toBe("35106344");
  });

  it.each([
    "javascript:alert(1)", "data:text/html,ruim", "//www.chavesnamao.com.br/imovel/x/id-35106344/",
    "https://externo.test/imovel/x/id-35106344/", "https://www.chavesnamao.com.br/imovel/x/id-35106344/",
    "/outra-rota/id-35106344/", "/imovel/x/id-123/", "/imovel/../x/id-35106344/",
    "/imovel/x/id-35106344/?externo=1", "/imovel/x/id-35106344/%2e%2e",
  ])("rejeita endereço não comprovado: %s", (valor) => {
    expect(urlAbsolutaDoCardChaves(valor, "35106344")).toBeNull();
  });

  it("rejeita ID diferente e ID posicional", () => {
    expect(urlAbsolutaDoCardChaves(href, "99999999")).toBeNull();
    expect(urlAbsolutaDoCardChaves(href, "chaves-na-mao-0-fallback")).toBeNull();
  });
});
