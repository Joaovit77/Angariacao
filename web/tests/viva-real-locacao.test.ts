import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "cheerio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anuncioAdmitidoRecorteRadar, capacidadeContratoExplicitoRadar } from "@/lib/calculo/aquisicaoRadar";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";

const mocks = vi.hoisted(() => ({ cache: vi.fn(), rpc: vi.fn(), launch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: mocks.cache }));
vi.mock("playwright-core", () => ({ chromium: { launch: mocks.launch } }));
import { buscarComFirecrawl, extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";
import { buscarComNavegador } from "@/lib/servidor/scraperCentralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";

const fixture = (tipo: string) => readFileSync(resolve(`tests/fixtures/viva-real-locacao/${tipo}.html`), "utf8");
const cliente = { rpc: mocks.rpc, from: () => ({ update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }) };
const alterar = (html: string, fn: (dom: ReturnType<typeof load>) => void) => { const $ = load(html); fn($); return $.html(); };
type ProdutoTeste = { name: string; url: string; '@id': string; offers: { price: number; url: string; potentialAction: { '@type': string; target: string; priceSpecification: { '@type': string; price: number | string; priceCurrency: string } } } };
const alterarProdutos = (html: string, fn: (p: ProdutoTeste) => void) => alterar(html, ($) => {
  $('script[type="application/ld+json"]').each((_, s) => { const p = JSON.parse($(s).html()!); fn(p); $(s).html(JSON.stringify(p)); });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{ id: "comparavel-local", precisa_embedding: false }], error: null });
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("ALLOW_REAL_OPENAI", "0");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Rede externa proibida neste teste"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

for (const tipoRecorte of ["casa", "apartamento"] as const) {
  const filtros: FiltrosCentralAngariacao = { portal: "viva-real", finalidade: "locacao", tipoRecorte, cidade: "Londrina", estado: "PR" };
  const html = fixture(tipoRecorte);
  const ids = tipoRecorte === "casa" ? ["2885106983", "2914340884"] : ["2915392891", "2906969852"];
  const precos = tipoRecorte === "casa" ? [4000, 9000] : [5300, 2200];
  const declarado = tipoRecorte === "casa" ? "Casa" : "Apartamento";
  const extrair = (pagina = html) => extrairAnunciosFirecrawl(pagina, filtros);

  describe(`Viva Real ${declarado}: contrato real minimizado`, () => {
    it("suporta somente o recorte comprovado e produz a URL oficial de aluguel", () => {
      expect(capacidadeContratoExplicitoRadar(filtros).suportado).toBe(true);
      expect(urlDaPesquisa(filtros)).toBe(`https://www.vivareal.com.br/aluguel/parana/londrina/${tipoRecorte}_residencial/`);
    });
    it("extrai identidade forte, tipo próprio, aluguel, imagem e características", () => {
      const a = extrair();
      expect(a.map(x => x.idExterno)).toEqual(ids);
      expect(a.map(x => x.preco)).toEqual(precos);
      expect(a[0]).toMatchObject({ finalidade: "locacao", tipoRecorte, tipoDeclarado: declarado, cidade: "Londrina", estado: "PR", quartos: 3, banheiros: 2, vagas: tipoRecorte === "casa" ? 3 : 2, areaM2: tipoRecorte === "casa" ? 190 : 95 });
      expect(a.every(x => x.imagem?.startsWith("https://resizedimgs.vivareal.com/"))).toBe(true);
      expect(a[0].bairro).toBe(tipoRecorte === "casa" ? "Bancários" : "Gleba Fazenda Palhano");
      expect(a[0].publicadoEm ?? null).toBeNull();
    });
    it("condomínio/IPTU e valor promocional antes do aluguel não alteram PriceSpecification", () => {
      const pagina = alterar(html, ($) => {
        $('[data-cy="rp-cardProperty-price-txt"]').prepend("<p>Condomínio R$ 700 · IPTU R$ 130 · Taxa R$ 80 · Promoção R$ 1</p>");
      });
      expect(extrair(pagina).map(a => a.preco)).toEqual(precos);
      if (tipoRecorte === "apartamento") expect(extrair(pagina)[0].valorCondominio).toBe(500);
      expect(extrair(pagina)[0].valorIptu).toBe(130);
    });
    it.each(["ausente", "divergente", "moeda", "estrutura", "string", "zero"])("aluguel %s fica nulo e não vira comparável", async (caso) => {
      const pagina = alterarProdutos(html, (p) => {
        const spec = p.offers.potentialAction.priceSpecification;
        if (caso === "ausente") Reflect.deleteProperty(p.offers.potentialAction, "priceSpecification");
        if (caso === "divergente") spec.price = 1;
        if (caso === "moeda") spec.priceCurrency = "USD";
        if (caso === "estrutura") spec["@type"] = "PropertyValue";
        if (caso === "string") spec.price = "R$ 500";
        if (caso === "zero") spec.price = p.offers.price = 0;
      });
      const anuncios = extrair(pagina);
      expect(anuncios).toHaveLength(2); expect(anuncios.every(a => a.preco === null)).toBe(true);
      expect(extrairAnunciosFirecrawl(pagina, { ...filtros, valorMin: 1 })).toEqual([]);
      expect(extrairAnunciosFirecrawl(pagina, { ...filtros, valorMax: 99999 })).toEqual([]);
      expect(await salvarComparaveisMercado(cliente as never, "dono", anuncios, filtros)).toBe(0);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(["BuyAction", "ausente", "target", "offer", "produto", "@id"])("contrato de locação/identidade inválido (%s) é recusado", (caso) => {
      const pagina = alterarProdutos(html, (p) => {
        if (caso === "BuyAction") p.offers.potentialAction["@type"] = "BuyAction";
        if (caso === "ausente") Reflect.deleteProperty(p.offers, "potentialAction");
        if (caso === "target") p.offers.potentialAction.target = p.url.replace(/-id-\d+/, "-id-9999999999");
        if (caso === "offer") p.offers.url = "https://outro.invalid/imovel/casa-id-1/";
        if (caso === "produto") p.url = p.url.replace(/-id-\d+/, "-id-9999999999");
        if (caso === "@id") p["@id"] = "9999999999";
      });
      expect(extrair(pagina)).toEqual([]);
    });
    it.each(["Imóvel", "Sobrado", "Casa de Condomínio", "Kitnet", "Studio", "Loft", tipoRecorte === "casa" ? "Apartamento" : "Casa"])("não transforma %s no tipo solicitado", (tipo) => {
      const pagina = alterarProdutos(alterar(html, ($) => { $("a > h2").text(`${tipo} para alugar`); }), p => { p.name = `${tipo} para alugar`; });
      expect(extrairAnunciosFirecrawl(pagina, { ...filtros, tipo: declarado })).toEqual([]);
    });
    it("tipo ausente no card ou no Product não é preenchido pelo outro nem pelo filtro", () => {
      expect(extrair(alterar(html, ($) => { $("a > h2").text("Imóvel para alugar"); }))).toEqual([]);
      expect(extrair(alterarProdutos(html, p => { p.name = "Imóvel para alugar"; }))).toEqual([]);
    });
    it("sem ID ou sem link individual descarta mesmo havendo Product", () => {
      for (const href of ["https://www.vivareal.com.br/aluguel/parana/londrina/#", "https://www.vivareal.com.br/imovel/casa-id-sem-codigo/", "https://www.vivareal.com.br/imovel/casa-sem-id/"]) {
        expect(extrair(alterar(html, ($) => { $("a").attr("href", href); }))).toEqual([]);
      }
      expect(extrair(fixture("agrupados") + alterar(html, ($) => { $("a").remove(); }))).toEqual([]);
    });
    it("JSON inválido, Product duplicado ou divergente não usa associação posicional", () => {
      expect(extrair(alterar(html, ($) => { $("script").text("{invalido"); }))).toEqual([]);
      expect(extrair(alterar(html, ($) => { $("body").append($("script").clone()); }))).toEqual([]);
      const reverso = alterar(html, ($) => { const scripts = $("script").toArray().reverse(); $("script").remove(); $("body").append(scripts); });
      expect(extrair(reverso)).toEqual(extrair());
    });
    it("duplicatas de card e parâmetros de rastreamento conservam a identidade", () => {
      const duplicado = alterar(html, ($) => { const a = $("a").first().clone(); a.attr("href", a.attr("href") + "?source=teste#foto"); $("body").prepend(a); });
      expect(extrair(duplicado).map(a => a.idExterno)).toEqual(ids);
    });
    it("finalização/persistência preservam o contrato e recusam injeção incompatível", async () => {
      const anuncios = extrair();
      const final = await finalizarColetaCentralAngariacao(cliente as never, "dono", anuncios, filtros);
      expect(final.erroComparaveis).toBeNull(); expect(final.comparaveisSalvos).toBe(2);
      for (const [i, a] of anuncios.entries()) {
        expect(mocks.rpc.mock.calls[i][1].p_dados).toMatchObject({ user_id: "dono", id_externo: ids[i], finalidade: "locacao", valor_anunciado: precos[i], dados_originais: { tipoRecorte, tipoDeclarado: declarado, imagem: a.imagem, evidenciaLocacaoVivaReal: a.evidenciaLocacaoVivaReal } });
      }
      mocks.rpc.mockClear();
      const [a] = anuncios;
      const injetados = [ { ...a, idExterno: "viva-real-0-sem-id" }, { ...a, tipoDeclarado: null }, { ...a, tipoDeclarado: tipoRecorte === "casa" ? "Apartamento" : "Casa" }, { ...a, finalidade: "venda" as const }, { ...a, evidenciaLocacaoVivaReal: undefined }, { ...a, preco: 700 } ];
      for (const item of injetados) expect(anuncioAdmitidoRecorteRadar(item, filtros)).toBe(false);
      expect((await finalizarColetaCentralAngariacao(cliente as never, "dono", injetados, filtros)).anuncios).toEqual([]);
      expect(await salvarComparaveisMercado(cliente as never, "dono", injetados, filtros)).toBe(0);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("navegador alternativo compartilha o parser completo sem transporte real", async () => {
      vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", process.execPath);
      const content = vi.fn().mockResolvedValue(html), close = vi.fn().mockResolvedValue(undefined);
      const page = { setDefaultTimeout: vi.fn(), addInitScript: vi.fn(), route: vi.fn(), goto: vi.fn().mockResolvedValue({ status: () => 200 }), content, locator: vi.fn().mockReturnValue({ first: () => ({ waitFor: vi.fn() }) }) };
      mocks.launch.mockResolvedValue({ newContext: async () => ({ newPage: async () => page }), close });
      expect(await buscarComNavegador(filtros, urlDaPesquisa(filtros))).toEqual(extrair());
      expect(content).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
    });
    it.each([{ finalidade: "venda" as const }, { cidade: "Curitiba" }, { estado: "SP" }, { cidade: "" }, { bairro: "Centro" }])("bloqueia recorte não comprovado antes de cache, transporte e RPC: %j", async (delta) => {
      const f = { ...filtros, ...delta };
      expect(() => urlDaPesquisa(f)).toThrow();
      await expect(buscarComFirecrawl(f, "https://exemplo.invalid")).rejects.toThrow();
      await expect(salvarComparaveisMercado(cliente as never, "dono", [], f)).rejects.toThrow();
      expect(mocks.cache).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
}
