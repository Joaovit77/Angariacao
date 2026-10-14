import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "cheerio";
import { anuncioAdmitidoRecorteRadar, capacidadeAquisicaoRadar } from "@/lib/calculo/aquisicaoRadar";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: () => ({ get: async () => null, set: async () => {} }) }));
import { extrairAnunciosFirecrawl, buscarComFirecrawlAoVivo } from "@/lib/servidor/firecrawlCentralAngariacao";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";

export const recortes = ["zap", "viva-real", "chaves-na-mao"].flatMap(portal => ["casa", "apartamento"].map(tipoRecorte => ({
  portal, tipoRecorte, finalidade: "venda", cidade: "Londrina", estado: "PR",
} as FiltrosCentralAngariacao)));
const fixture = (f: FiltrosCentralAngariacao) => readFileSync(new URL(`./fixtures/radar-venda-b1/${f.portal}-${f.tipoRecorte}.html`, import.meta.url), "utf8");
const manifestos = JSON.parse(readFileSync(new URL("./fixtures/radar-venda-b1/manifesto.json", import.meta.url), "utf8")) as Array<{ arquivo: string; id: string; preco: number; origem: string }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Variações deliberadas de JSON-LD externo.
type No = Record<string, any>;
function alterar(html: string, fn: (no: No, $: ReturnType<typeof load>) => void): string {
  const $ = load(html), script = $('script[type="application/ld+json"]').first();
  const ld = JSON.parse(script.text());
  const no = Array.isArray(ld) ? ld.find((n: No) => n["@type"] === "Product") : ld.offers.itemListElement[0];
  fn(no, $); script.text(JSON.stringify(ld)); return $.html();
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("B1 — seis recortes comprovados por capturas B2.6-A", () => {
  for (const f of recortes) describe(`${f.portal}/${f.tipoRecorte}`, () => {
    const html = fixture(f), chaves = f.portal === "chaves-na-mao";
    const fonte = manifestos.find(m => m.arquivo === `${f.portal}-${f.tipoRecorte}.html`)!;
    const extrair = (h = html) => extrairAnunciosFirecrawl(h, f);
    it("observa Venda, identidade individual, tipo e preço total; builder usa a URL comprovada", () => {
      expect(capacidadeAquisicaoRadar(f as never).suportado).toBe(true);
      expect(urlDaPesquisa(f)).toBe(fonte.origem);
      expect(extrair()).toHaveLength(1);
      expect(extrair()[0]).toMatchObject({ idExterno: fonte.id, preco: fonte.preco, finalidade: "venda", finalidadeObservada: "venda",
        tipoDeclarado: f.tipoRecorte === "casa" ? "Casa" : "Apartamento", cidade: "Londrina", estado: "PR" });
      expect(extrair()[0].publicadoEm).toBeUndefined();
      if (f.tipoRecorte === "apartamento") expect(extrair()[0].valorCondominio).toBe(f.portal === "zap" ? 900 : 600);
    });
    const negativos: Array<[string, (no: No, $: ReturnType<typeof load>) => void]> = [
      ["finalidade ausente", no => { delete (chaves ? no : no.offers).potentialAction; }],
      ["Locação não é Venda", no => { if (chaves) no.potentialAction = "https://schema.org/RentAction"; else no.offers.potentialAction["@type"] = "RentAction"; }],
      ["link individual ausente", (_, $) => { $("a").attr("href", fonte.origem); }],
      ["ID divergente", no => { if (chaves) no.itemOffered["@id"] = no.url.replace(fonte.id, "999999999"); else no["@id"] = "999999999"; }],
      ["URL da Offer divergente", no => { (chaves ? no : no.offers).url = (chaves ? no.url : no.offers.url).replace(fonte.id, "999999999"); }],
      ["tipo do card divergente", (_, $) => { $("h2").text(f.tipoRecorte === "casa" ? "Apartamento à venda" : "Casa à venda"); }],
      ["tipo estruturado divergente", no => { no.name = f.tipoRecorte === "casa" ? "Apartamento para comprar" : "Casa para comprar"; }],
      ["preço da Offer divergente", no => { (chaves ? no : no.offers).price = 1234; }],
      ["preço principal divergente", (_, $) => { $(chaves ? 'p[aria-label="Preço"] b' : '[data-cy="rp-cardProperty-price-txt"] p').first().text("R$ 1.234"); }],
      ["preço acessório não substitui total", (_, $) => { $(chaves ? 'p[aria-label="Preço"] b' : '[data-cy="rp-cardProperty-price-txt"] p').first().text("Condomínio R$ 600"); }],
      ["preço por m² não é preço total", (_, $) => { $(chaves ? 'p[aria-label="Preço"] b' : '[data-cy="rp-cardProperty-price-txt"] p').first().append("/m²"); }],
      ["moeda diferente", no => { (chaves ? no : no.offers).priceCurrency = "USD"; }],
      ["a partir de não é unidade", (_, $) => { $("h2").text("Casa à venda a partir de R$ 200.000"); }],
      ["empreendimento agrupado", (_, $) => { $("a").attr("href", "https://www.chavesnamao.com.br/lancamento/condominio/id-123/"); }],
      ["comercial contraditório", no => { no.name = "Loja comercial à venda"; }],
      ["título de Locação contraditório", (_, $) => { $("h2").text(`${f.tipoRecorte === "casa" ? "Casa" : "Apartamento"} para alugar`); }],
      ["Sobrado não vira Casa", (_, $) => { $("h2").text("Sobrado à venda"); }],
      ["direitos não são preço integral", (_, $) => { $("h2").append(" — venda de direitos"); }],
    ];
    if (!chaves) negativos.push(
      ["target divergente", no => { no.offers.potentialAction.target = fonte.origem; }],
      ["PriceSpecification divergente", no => { no.offers.potentialAction.priceSpecification.price = 1234; }],
      ["PriceSpecification acessória", no => { no.offers.potentialAction.priceSpecification.name = "IPTU"; }],
      ["PriceSpecification em moeda diferente", no => { no.offers.potentialAction.priceSpecification.priceCurrency = "USD"; }],
    );
    else negativos.push(["itemOffered contraditório", no => { no.itemOffered["@type"] = "CommercialBuilding"; }]);
    it.each(negativos)("rejeita %s", (_, fn) => expect(extrair(alterar(html, fn))).toEqual([]));
    if (!chaves) it("House/Apartment contradiz o Product do mesmo ID", () => {
      const $ = load(html), script = $('script[type="application/ld+json"]');
      const ld = JSON.parse(script.text());
      ld.find((n: No) => n["@type"] === "House" || n["@type"] === "Apartment").name = "Sobrado para comprar";
      script.text(JSON.stringify(ld)); expect(extrair($.html())).toEqual([]);
    });
    it("objeto estruturado conflitante é rejeitado", () => {
      const $ = load(html), ld = JSON.parse($('script[type="application/ld+json"]').text());
      const no = chaves ? ld.offers.itemListElement[0] : ld[0];
      const outro = structuredClone(no); (chaves ? outro : outro.offers).price = 1;
      if (chaves) ld.offers.itemListElement.push(outro); else ld.push(outro);
      $('script[type="application/ld+json"]').text(JSON.stringify(ld)); expect(extrair($.html())).toEqual([]);
    });
    it("objeto duplicado idêntico deduplica o mesmo item", () => {
      const $ = load(html), ld = JSON.parse($('script[type="application/ld+json"]').text());
      if (chaves) ld.offers.itemListElement.push(structuredClone(ld.offers.itemListElement[0])); else ld.push(structuredClone(ld[0]));
      $('script[type="application/ld+json"]').text(JSON.stringify(ld)); expect(extrair($.html())).toHaveLength(1);
    });
    it("transporte controlado passa pelo parser e jamais pela rede real", async () => {
      vi.stubEnv("FIRECRAWL_API_KEY", "fixture");
      const transporte = vi.fn(async () => Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: 200 } } }));
      vi.stubGlobal("fetch", transporte);
      expect(await buscarComFirecrawlAoVivo(f, fonte.origem)).toMatchObject([{ finalidadeObservada: "venda", preco: fonte.preco }]);
      expect(transporte).toHaveBeenCalledOnce();
    });
    it.each([undefined, "locacao", "venda"] as const)("finalidade solicitada não fabrica observada (%s)", async observada => {
      const anuncio = { ...extrair()[0], finalidadeObservada: observada };
      const valido = observada === "venda";
      expect(anuncioAdmitidoRecorteRadar(anuncio, f)).toBe(valido);
      const rpc = vi.fn(async () => ({ data: [{ id: "oferta", criado: true, precisa_embedding: false }], error: null }));
      const from = vi.fn(() => ({ update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }));
      expect(await salvarComparaveisMercado({ rpc, from } as never, "dono", [anuncio], f)).toBe(valido ? 1 : 0);
      expect(rpc).toHaveBeenCalledTimes(valido ? 1 : 0);
      if (valido) expect(rpc.mock.calls[0]).toMatchObject(["registrar_comparavel_mercado", { p_dados: { finalidade: "venda", finalidade_observada: "venda", valor_anunciado: fonte.preco } }]);
    });
  });
  it.each(["olx", "wimoveis"] as const)("%s exige contrato individual B2 em ambos os recortes", portal => {
    for (const tipoRecorte of ["casa", "apartamento"] as const) {
      const f = { portal, tipoRecorte, finalidade: "venda" as const, cidade: "Londrina", estado: "PR" };
      expect(capacidadeAquisicaoRadar(f).suportado).toBe(true);
      expect(extrairAnunciosFirecrawl("", f)).toEqual([]);
    }
  });
});
