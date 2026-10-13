import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "cheerio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anuncioAdmitidoRecorteRadar, capacidadeContratoExplicitoRadar } from "@/lib/calculo/aquisicaoRadar";
import { comCaracteristicasDoAnuncio, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { CARD_46811835, CARD_43083373, LD_REAL } from "./fixtures/chavesFotosJsonLd";

const mocks = vi.hoisted(() => ({ cache: vi.fn(), rpc: vi.fn(), launch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: mocks.cache }));
vi.mock("playwright-core", () => ({ chromium: { launch: mocks.launch } }));
import { extrairAnunciosFirecrawl, buscarComFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { interpretarHttpChaves } from "@/lib/servidor/fallbackHttpChaves";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { buscarComNavegador } from "@/lib/servidor/scraperCentralAngariacao";

const fixture = (nome: string) => readFileSync(resolve("tests/fixtures/locacao-chaves-wimoveis", nome), "utf8");
const chaves = fixture("chaves-apartamento.html");
const wimoveis = fixture("wimoveis-casa.html");
const apto: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "apartamento", cidade: "Londrina", estado: "PR" };
const casa: FiltrosCentralAngariacao = { ...apto, portal: "wimoveis", tipoRecorte: "casa" };
const alterar = (html: string, fn: (dom: ReturnType<typeof load>) => void) => { const $ = load(html); fn($); return $.html(); };
const cliente = { rpc: mocks.rpc, from: () => ({ update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{ id: "comparavel-local", precisa_embedding: false }], error: null });
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("ALLOW_REAL_OPENAI", "0");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Rede externa proibida neste teste"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("R6.0c-B2.3: capacidade e URL somente para o mercado comprovado", () => {
  it.each([
    [apto, "https://www.chavesnamao.com.br/apartamentos-para-alugar/pr-londrina/"],
    [casa, "https://www.wimoveis.com.br/aluguel/casas/pr/londrina"],
  ] as const)("promove $0.portal/$0.tipoRecorte e preserva a URL oficial", (filtros, url) => {
    expect(capacidadeContratoExplicitoRadar(filtros).suportado).toBe(true);
    expect(urlDaPesquisa(filtros)).toBe(url);
  });
  for (const filtros of [apto, casa]) {
    it.each([
      { finalidade: "venda" as const, cidade: "Curitiba" }, { cidade: "Curitiba" }, { estado: "SP" },
      { tipoRecorte: "studio" as never }, { cidade: "" },
    ])(`${filtros.portal}: recorte não comprovado bloqueia cache/transporte/RPC`, async (delta) => {
      const bloqueado = { ...filtros, ...delta };
      expect(() => urlDaPesquisa(bloqueado)).toThrow();
      await expect(buscarComFirecrawl(bloqueado, "https://exemplo.invalid")).rejects.toThrow();
      await expect(salvarComparaveisMercado(cliente as never, "dono", [], bloqueado)).rejects.toThrow();
      expect(mocks.cache).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
});

describe("Chaves Apartamento: card e JSON-LD reais minimizados", () => {
  it("extrai ID /id-N/, aluguel, imagem e atributos acessíveis", () => {
    const anuncios = extrairAnunciosFirecrawl(chaves, apto);
    expect(anuncios).toHaveLength(3);
    expect(anuncios[0]).toMatchObject({ idExterno: "39216787", preco: 20000, finalidade: "locacao", tipoDeclarado: "Apartamento", cidade: "Londrina", estado: "PR", areaM2: 419, quartos: 4, banheiros: 6, vagas: 4 });
    expect(anuncios[1]).toMatchObject({ idExterno: "46290962", preco: 4200, areaM2: 86, quartos: 3, banheiros: 2, vagas: 2 });
    expect(anuncios[0].imagem).toContain("/39216787/");
    expect(anuncios[2].imagem).toContain("/33198275/");
    expect(anuncios[2].preco).toBe(5300);
  });
  it("fallback HTTP continua usando o mesmo parser sem chamada real", () => {
    expect(interpretarHttpChaves(chaves.replaceAll('href="https://www.chavesnamao.com.br/imovel/', 'href="/imovel/'), apto))
      .toEqual(extrairAnunciosFirecrawl(chaves, apto));
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["Imóvel para alugar", "Kitnet para alugar", "Studio para alugar", "Casa para alugar"])("tipo solicitado não transforma %s em Apartamento", (titulo) => {
    const html = alterar(chaves, ($) => { $("h2").text(titulo); $("a[title]").attr("title", titulo); });
    expect(extrairAnunciosFirecrawl(html, { ...apto, tipo: "Apartamento" })).toEqual([]);
  });
  it("preço de condomínio isolado e URL sem aluguel não viram aluguel", () => {
    expect(extrairAnunciosFirecrawl(alterar(chaves, ($) => { $('p[aria-label="Preço"] b').remove(); }), apto)).toEqual([]);
    expect(extrairAnunciosFirecrawl(chaves.replaceAll("-para-alugar-", "-sem-finalidade-"), apto)).toEqual([]);
  });
  it("ID posicional não entra mesmo quando o seletor ainda encontra o card", () => {
    expect(extrairAnunciosFirecrawl(chaves.replaceAll(/\/id-\d+\//g, "/id-sem-codigo/"), apto)).toEqual([]);
  });
  it("ordem dos cards não altera identidade nem associação de foto", () => {
    const invertido = alterar(chaves, ($) => { const cards = $("a[href]").toArray().reverse(); $("a[href]").remove(); $("body").append(cards); });
    const assinatura = (html: string) => extrairAnunciosFirecrawl(html, apto).map(a => [a.idExterno, a.preco, a.imagem]).sort();
    expect(assinatura(invertido)).toEqual(assinatura(chaves));
  });
});

describe("Wimoveis Casa: PROPERTY, data-id e RentAction reais", () => {
  it("usa data-id e preço atual do card ligado a RentAction; não extrai valor da descrição mista", () => {
    const anuncios = extrairAnunciosFirecrawl(wimoveis, casa);
    expect(anuncios).toHaveLength(2);
    expect(anuncios[0]).toMatchObject({ idExterno: "2944851742", preco: 8000, tipoDeclarado: "Casa", finalidade: "locacao", cidade: "Londrina", estado: "PR", areaM2: 155, quartos: 3, vagas: 2 });
    expect(anuncios[0].imagem).toContain("/29/44/85/17/42/");
    expect(anuncios[1]).toMatchObject({ idExterno: "2994586131", preco: 2100, tipoDeclarado: "Casa", quartos: 3, vagas: 2, estado: "PR" });
    expect(anuncios.some(a => a.idExterno === "3013053071")).toBe(false);
  });
  it("tipo legado Casa não prevalece sobre Apartamento observado", () => {
    const html = alterar(wimoveis, ($) => { $("img[alt]").attr("alt", "Apartamento para alugar"); });
    expect(extrairAnunciosFirecrawl(html, { ...casa, tipo: "Casa" })).toEqual([]);
  });
  it.each(["Imóvel para alugar", "Kitnet para alugar", "Studio para alugar"])("%s não recebe Casa do filtro", (titulo) => {
    expect(extrairAnunciosFirecrawl(alterar(wimoveis, ($) => { $("img[alt]").attr("alt", titulo); }), { ...casa, tipo: "Casa" })).toEqual([]);
  });
  it("sem data-id, com ID divergente ou sem RentAction não admite anúncio", () => {
    expect(extrairAnunciosFirecrawl(alterar(wimoveis, ($) => { $("[data-id]").removeAttr("data-id"); }), casa)).toEqual([]);
    expect(extrairAnunciosFirecrawl(alterar(wimoveis, ($) => { $("[data-to-posting]").attr("data-to-posting", "/propriedades/casa-9999999999.html"); }), casa)).toEqual([]);
    expect(extrairAnunciosFirecrawl(alterar(wimoveis, ($) => { $("script").remove(); }), casa)).toEqual([]);
  });
  it("ordem dos scripts não associa finalidade pela posição", () => {
    const html = alterar(wimoveis, ($) => { const ld = $("script").toArray().reverse(); $("script").remove(); $("body").append(ld); });
    expect(extrairAnunciosFirecrawl(html, casa)).toEqual(extrairAnunciosFirecrawl(wimoveis, casa));
  });
});

describe("persistência e defesa contra injeção após parsing", () => {
  for (const [html, filtros] of [[chaves, apto], [wimoveis, casa]] as const) {
    it(`${filtros.portal}: persiste finalidade e tipo observado sem perder identidade/imagem`, async () => {
      const anuncios = extrairAnunciosFirecrawl(html, filtros);
      const final = await finalizarColetaCentralAngariacao(cliente as never, "dono", anuncios, filtros);
      expect(final.erroComparaveis).toBeNull(); expect(final.comparaveisSalvos).toBe(anuncios.length);
      expect(mocks.rpc).toHaveBeenCalledTimes(anuncios.length);
      for (const [i, a] of final.anuncios.entries()) {
        const dados = mocks.rpc.mock.calls[i][1].p_dados;
        expect(dados).toMatchObject({ user_id: "dono", id_externo: a.idExterno, finalidade: "locacao", valor_anunciado: a.preco });
        expect(dados.dados_originais).toMatchObject({ tipoDeclarado: a.tipoDeclarado, imagem: a.imagem, tipoRecorte: filtros.tipoRecorte });
        expect(comCaracteristicasDoAnuncio(JSON.parse(JSON.stringify(a)), "tipo legado divergente").tipoDeclarado).toBe(a.tipoDeclarado);
      }
    });
    it(`${filtros.portal}: tipo divergente/nulo e fallback posicional são rejeitados antes de RPC`, async () => {
      const [a] = extrairAnunciosFirecrawl(html, filtros);
      const injetados = [
        { ...a, tipo: filtros.tipoRecorte === "casa" ? "Casa" : "Apartamento", tipoDeclarado: filtros.tipoRecorte === "casa" ? "Apartamento" : "Casa" },
        { ...a, tipoDeclarado: null }, { ...a, idExterno: `${a.portal}-0-sem-id` },
      ];
      for (const item of injetados) expect(anuncioAdmitidoRecorteRadar(item, filtros)).toBe(false);
      expect((await finalizarColetaCentralAngariacao(cliente as never, "dono", injetados, filtros)).anuncios).toEqual([]);
      expect(await salvarComparaveisMercado(cliente as never, "dono", injetados, filtros)).toBe(0);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
});

describe("controles dos recortes anteriores", () => {
  it("Chaves Casa preserva identidade, preço e foto JSON-LD", () => {
    const a = extrairAnunciosFirecrawl(CARD_46811835 + CARD_43083373 + LD_REAL, { ...apto, tipoRecorte: "casa" });
    expect(a.map(x => [x.idExterno, x.preco, x.tipoDeclarado])).toEqual([["46811835", 3200, "Casa"], ["43083373", 5700, "Casa"]]);
    expect(a.every(x => !!x.imagem)).toBe(true);
  });
  it("Wimoveis Apartamento mantém contrato sem exigir RentAction novo", () => {
    const html = '<div data-qa="posting PROPERTY" data-id="3018468881" data-to-posting="/propriedades/apartamento-3018468881.html"><div data-qa="POSTING_CARD_GALLERY"><img alt="Apartamento mobiliado para locação" src="https://img.wimoveis.com.br/a.jpg"></div><div data-qa="POSTING_CARD_PRICE">R$ 1.900</div><div data-qa="POSTING_CARD_FEATURES">2 quartos, 70 m²</div><div data-qa="POSTING_CARD_LOCATION">Londrina, Paraná</div></div>';
    expect(extrairAnunciosFirecrawl(html, { ...casa, tipoRecorte: "apartamento" })[0]).toMatchObject({ idExterno: "3018468881", preco: 1900, tipoDeclarado: "Apartamento", quartos: 2, areaM2: 70 });
  });
});

describe("navegador alternativo preserva os contratos novos sem rede", () => {
  for (const [html, filtros] of [[chaves, apto], [wimoveis, casa]] as const) {
    it(`${filtros.portal}: aplica o mesmo parser e encerra o navegador`, async () => {
      vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", process.execPath);
      const content = vi.fn().mockResolvedValue(html);
      const close = vi.fn().mockResolvedValue(undefined);
      const page = {
        setDefaultTimeout: vi.fn(), addInitScript: vi.fn(), route: vi.fn(),
        goto: vi.fn().mockResolvedValue({ status: () => 200 }), content,
        locator: vi.fn().mockReturnValue({ first: () => ({ waitFor: vi.fn().mockResolvedValue(undefined) }) }),
      };
      mocks.launch.mockResolvedValue({ newContext: async () => ({ newPage: async () => page }), close });
      expect(await buscarComNavegador(filtros, urlDaPesquisa(filtros))).toEqual(extrairAnunciosFirecrawl(html, filtros));
      expect(content).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
      content.mockResolvedValue(alterar(html, ($) => { $("h2").text("Imóvel para alugar"); $("a[title]").attr("title", "Imóvel para alugar"); $("img[alt]").attr("alt", "Apartamento para alugar"); if (filtros.portal === "chaves-na-mao") $("img[alt]").attr("alt", "Imóvel para alugar"); }));
      expect(await buscarComNavegador(filtros, urlDaPesquisa(filtros))).toEqual([]);
    });
  }
});
