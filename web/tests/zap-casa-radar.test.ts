import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "cheerio";
import { capacidadeFuncionalZap } from "@/lib/calculo/centralAngariacao";
import { capacidadeContratoExplicitoRadar } from "@/lib/calculo/aquisicaoRadar";
import { extrairZap } from "@/lib/servidor/parserZap";
import { urlDaPesquisa, URL_ZAP_LONDRINA_APARTAMENTOS, URL_ZAP_LONDRINA_CASAS } from "@/lib/servidor/centralAngariacao";
import { apartamentoReal, casaReal, sobradoReal, variarJsonLd, agrupadoSemLink, idIncompativel, precoAusente, precoDivergente, tipoAusente } from "./fixtures/zap-r6-casa";

const mocks = vi.hoisted(() => ({ cache: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: mocks.cache }));
import { buscarComFirecrawl, extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";

const casa = { portal: "zap" as const, cidade: "Londrina", estado: "PR", finalidade: "locacao" as const, tipoRecorte: "casa" as const };
const apto = { ...casa, tipoRecorte: "apartamento" as const };
const extrair = (html: string, filtros = casa) => extrairZap(load(html), filtros, 50);

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw Error("Transporte não autorizado neste teste"); })); });
afterEach(() => vi.unstubAllGlobals());

describe("ZAP Casa: builder e capacidade explícitos", () => {
  it("usa exatamente a URL comprovada e mantém Apartamento intacto", () => {
    expect(urlDaPesquisa(casa)).toBe("https://www.zapimoveis.com.br/aluguel/casas/pr+londrina/?onde=%2CParan%C3%A1%2CLondrina%2C%2C%2C%2C%2Ccity%2CBR%3EParana%3ENULL%3ELondrina%2C-23.319731%2C-51.166201%2C&tipos=casa_residencial");
    expect(urlDaPesquisa(apto)).toBe(URL_ZAP_LONDRINA_APARTAMENTOS);
    expect(URL_ZAP_LONDRINA_CASAS).not.toBe(URL_ZAP_LONDRINA_APARTAMENTOS);
    expect(capacidadeContratoExplicitoRadar(casa).suportado).toBe(true);
  });
  it("não amplia a exceção legada", () => {
    expect(capacidadeFuncionalZap({ cidade: "Londrina", estado: "PR", tipo: "Casa" }).suportado).toBe(false);
    expect(capacidadeFuncionalZap({ cidade: "Londrina", estado: "PR", tipo: "Apartamento" }).suportado).toBe(true);
  });
  it.each([
    { ...casa, finalidade: "venda" as const }, { ...apto, finalidade: "venda" as const },
    { ...casa, bairro: "Centro" }, { ...casa, cidade: "Curitiba" }, { ...casa, estado: "SP" },
  ])("bloqueia $finalidade/$tipoRecorte/$cidade/$estado/$bairro antes de cache/transporte/escrita", async (filtros) => {
    expect(capacidadeContratoExplicitoRadar(filtros).suportado).toBe(false);
    expect(() => urlDaPesquisa(filtros)).toThrow();
    await expect(buscarComFirecrawl(filtros, URL_ZAP_LONDRINA_CASAS)).rejects.toThrow();
    await expect(salvarComparaveisMercado({ rpc: mocks.rpc } as never, "sintético", [], filtros)).rejects.toThrow();
    expect(mocks.cache).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("ZAP: fixtures reais Casa, Sobrado e controle Apartamento", () => {
  it("Casa preserva ID, aluguel RentAction, tipo, campos e imagem", () => {
    const [a] = extrairAnunciosFirecrawl(casaReal, casa);
    expect(a).toMatchObject({ idExterno: "2890706278", finalidade: "locacao", tipoRecorte: "casa", tipoDeclarado: "Casa", preco: 12000, cidade: "Londrina", estado: "PR", endereco: "Rua Cruzeiro do Sul", areaM2: 320, quartos: 4, banheiros: 6, vagas: 4, publicadoEm: null });
    expect(a.imagem).toMatch(/^https:\/\/resizedimgs.zapimoveis.com.br\//);
  });
  it("Sobrado não vira Casa ao normalizar duas vezes", () => {
    const [a] = extrairAnunciosFirecrawl(sobradoReal, { ...casa, tipo: "Casa" });
    expect(a).toMatchObject({ idExterno: "2916079017", tipoDeclarado: "Sobrado", tipo: "Sobrado", preco: 2600, quartos: 2, areaM2: 120 });
  });
  it("Apartamento continua com ID, tipo, preço e imagem observados", () => {
    const [a] = extrairAnunciosFirecrawl(apartamentoReal, apto);
    expect(a).toMatchObject({ idExterno: "2891958776", tipoDeclarado: "Apartamento", finalidade: "locacao", tipoRecorte: "apartamento" });
    expect(a.preco).toBe(2300);
    expect(a.imagem).toMatch(/^https:/);
  });
  it("House enriquece somente seu ID mesmo com objetos e cards fora de ordem", () => {
    const html = casaReal + sobradoReal;
    const $ = load(html); const scripts = $('script[type="application/ld+json"]').toArray().reverse();
    $('script').remove(); for (const script of scripts) $('body').append(script);
    // Força área e quartos a dependerem exclusivamente do House correspondente.
    const variado = variarJsonLd($.html(), (obj) => { if (obj["@type"] === "Product") { delete obj.floorSize; delete obj.numberOfBedrooms; } });
    const dom = load(variado); dom('[data-cy="rp-cardProperty-propertyArea-txt"], [data-cy="rp-cardProperty-bedroomQuantity-txt"]').remove();
    expect(extrair(dom.html()).map(a => [a.idExterno, a.areaM2, a.quartos])).toEqual([["2890706278", 320, 4], ["2916079017", 120, 2]]);
  });
  it("não associa House de outro ID ao Product ou card", () => {
    const html = variarJsonLd(casaReal, obj => { if (obj["@type"] === "House") { obj.url = obj.url.replace("2890706278", "9999999999"); obj["@id"] = "9999999999"; obj.address.addressRegion = "SP"; } });
    expect(extrair(html)[0].estado).toBe("PR");
  });
  it.each([idIncompativel,
    variarJsonLd(casaReal, o => { if (o.offers) o.offers.url = o.url.replace("2890706278", "9999999999"); }),
    variarJsonLd(casaReal, o => { if (o.offers) o.offers.potentialAction.target = o.url.replace("2890706278", "9999999999"); }),
    variarJsonLd(casaReal, o => { if (o["@type"] === "Product") o["@id"] = "9999999999"; }),
  ])("identidade incompatível descarta anúncio, sem adivinhar", html => expect(extrair(html)).toEqual([]));
  it("House duplicado é ambíguo e descarta", () => {
    const $ = load(casaReal); $('body').append($('script').last().clone()); expect(extrair($.html())).toEqual([]);
  });
  it.each([precoAusente, precoDivergente])("Offer não substitui RentAction ausente/divergente", html => expect(extrair(html)[0].preco).toBeNull());
  it("ausência de tipo não herda recorte nem transforma House em Casa", () => {
    const legado = extrairZap(load(tipoAusente), { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" }, 50);
    expect(legado[0].tipoDeclarado).toBeNull();
    expect(extrair(tipoAusente)).toEqual([]);
  });
  it.each(["Casa de Condomínio", "Kitnet", "Studio", "Apartamento"])("Casa não admite automaticamente %s", tipo => {
    const html = variarJsonLd(casaReal, obj => { obj.name = tipo + " para alugar"; });
    expect(extrair(html)).toEqual([]);
  });
  it("Kitnet em Apartment não é promovida a Apartamento", () => {
    const html = variarJsonLd(apartamentoReal, obj => { obj.name = "Kitnet para alugar"; });
    expect(extrairAnunciosFirecrawl(html, apto)).toEqual([]);
  });
  it("tipo solicitado não sobrescreve observação divergente", () => {
    const [a] = extrairZap(load(apartamentoReal), { ...casa, finalidade: undefined, tipoRecorte: undefined, tipo: "Casa" }, 50);
    expect(a.tipoDeclarado).toBe("Apartamento");
    expect(extrair(apartamentoReal)).toEqual([]);
  });
  it("agrupado sem link individual não gera ID nem anúncio", () => expect(extrair(agrupadoSemLink)).toEqual([]));
  it("não preenche endereço/UF ausentes com o filtro", () => {
    const html = variarJsonLd(casaReal, obj => { delete obj.address; });
    const $ = load(html); $('[data-cy="rp-cardProperty-street-txt"]').remove();
    expect(extrair($.html())[0]).toMatchObject({ endereco: null, estado: null });
  });
  it("House pode fornecer imagem quando o card e Product não a publicam", () => {
    const html = variarJsonLd(casaReal, obj => { if (obj["@type"] === "Product") delete obj.image; });
    const $ = load(html); $('img').remove(); expect(extrair($.html())[0].imagem).toMatch(/^https:/);
  });
});
