import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { anuncioAdmitidoRecorteRadar, capacidadeAquisicaoRadar, MATRIZ_CAPACIDADE_RADAR } from "@/lib/calculo/aquisicaoRadar";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: () => ({ get: async () => null, set: async () => {} }) }));
import { extrairAnunciosFirecrawl, buscarComFirecrawlAoVivo } from "@/lib/servidor/firecrawlCentralAngariacao";
import { extrairOlxVenda, extrairWimoveisVenda } from "@/lib/servidor/parserVendaOlxWimoveis";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mutações adversariais deliberadas de dados externos.
type No = Record<string, any>;
const manifestos = JSON.parse(readFileSync(new URL("./fixtures/radar-venda-b2/manifesto.json", import.meta.url), "utf8")) as Array<{ arquivo: string; id: string; preco: number; origem: string; hashFixture: string }>;
const recortes = ["olx", "wimoveis"].flatMap(portal => ["casa", "apartamento"].map(tipoRecorte => ({ portal, tipoRecorte, finalidade: "venda", cidade: "Londrina", estado: "PR" } as FiltrosCentralAngariacao)));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

for (const f of recortes) describe(`B2 ${f.portal}/${f.tipoRecorte}`, () => {
  const olx = f.portal === "olx", fonte = manifestos.find(m => m.arquivo === `${f.portal}-${f.tipoRecorte}.html`)!;
  const html = readFileSync(new URL(`./fixtures/radar-venda-b2/${fonte.arquivo}`, import.meta.url), "utf8");
  const extrair = (h = html, filtros = f) => extrairAnunciosFirecrawl(h, filtros);
  function alterar(fn: (no: No, $: ReturnType<typeof load>, acao: No) => void): string {
    const $ = load(html), script = $("script").filter((_, e) => !$(e).attr("type")).first(), ld = $('script[type="application/ld+json"]').first();
    const raiz = olx ? JSON.parse(JSON.parse(script.text().match(/push\((.*)\);/)![1])[1].slice(2))
      : JSON.parse(script.text().replace(/^window\.__PRELOADED_STATE__ = /, "").replace(/;$/, ""));
    const no = olx ? raiz.ads[0] : raiz.listStore.listPostings[0], acoes = olx ? [] : JSON.parse(ld.text());
    fn(no, $, acoes[0]);
    script.text(olx ? `self.__next_f.push(${JSON.stringify([1, "1:" + JSON.stringify(raiz) + "\n"])});` : `window.__PRELOADED_STATE__ = ${JSON.stringify(raiz)};`);
    if (!olx) ld.text(JSON.stringify(acoes));
    return $.html();
  }
  const mudarTitulo = (no: No, $: ReturnType<typeof load>, titulo: string) => {
    if (olx) { no.subject = titulo; $('a[data-testid="adcard-link"]').attr("title", titulo).find("h2").text(titulo); }
    else { no.title = titulo; $("img[alt]").attr("alt", titulo); }
  };
  const finalidade = (no: No, valor: string) => {
    if (olx) no.properties.find((p: No) => p.name === "real_estate_type").value = valor;
    else no.priceOperationTypes[0].operationType = { name: valor, operationTypeId: valor === "Venda" ? "1" : "2" };
  };
  it("fixture preservada: identidade, finalidade observada, tipo, preço total e builder aprovado", () => {
    expect(createHash("sha256").update(html).digest("hex")).toBe(fonte.hashFixture);
    expect(capacidadeAquisicaoRadar(f as never).suportado).toBe(true);
    expect(urlDaPesquisa(f)).toBe(fonte.origem);
    expect(extrair()).toHaveLength(1);
    expect(extrair()[0]).toMatchObject({ idExterno: fonte.id, preco: fonte.preco, finalidade: "venda", finalidadeObservada: "venda", tipoDeclarado: f.tipoRecorte === "casa" ? "Casa" : "Apartamento", cidade: "Londrina", estado: "PR" });
    if (f.tipoRecorte === "apartamento") expect(extrair()[0].valorCondominio).toBe(olx ? 500 : 1300);
    expect(extrair()[0].publicadoEm).toBeUndefined();
  });
  const negativos: Array<[string, (no: No, $: ReturnType<typeof load>, acao: No) => void]> = [
    ["Venda não nasce do filtro", no => finalidade(no, "")],
    ["conflito de finalidade individual", no => finalidade(no, olx ? "Aluguel - apartamento padrão" : "Aluguel")],
    ["sem URL individual", (_, $) => { if (olx) $("a").attr("href", fonte.origem); else $("[data-to-posting]").attr("data-to-posting", fonte.origem); }],
    ["objeto com URL divergente", no => { no.url = fonte.origem; }],
    ["sem identidade nativa", no => { delete no[olx ? "listId" : "postingId"]; }],
    ["identidade divergente", no => { no[olx ? "listId" : "postingId"] = olx ? 999999999 : "999999999"; }],
    ["tipo solicitado não preenche observado", no => { if (olx) no.properties.find((p: No) => p.name === "category").value = ""; else no.realEstateType = {}; }],
    ["tipo observado diferente do pedido", (no, $) => mudarTitulo(no, $, f.tipoRecorte === "casa" ? "Apartamento à venda" : "Casa à venda")],
    ["sem preço seguro", no => { if (olx) delete no.price; else no.priceOperationTypes[0].prices = []; }],
    ["preço principal divergente", (_, $) => { $(olx ? ".olx-adcard__price" : '[data-qa="POSTING_CARD_PRICE"]').text("R$ 123"); }],
    ["preço principal ausente", (_, $) => { $(olx ? ".olx-adcard__price" : '[data-qa="POSTING_CARD_PRICE"]').remove(); }],
    ["preço em dois blocos ambíguos", (_, $) => { const p = $(olx ? ".olx-adcard__price" : '[data-qa="POSTING_CARD_PRICE"]'); p.after(p.clone()); }],
    ["preço principal não é condomínio/IPTU", (_, $) => { $(olx ? ".olx-adcard__price" : '[data-qa="POSTING_CARD_PRICE"]').prepend("Condomínio/IPTU "); }],
    ["a partir de não é preço individual", (no, $) => mudarTitulo(no, $, no[olx ? "subject" : "title"] + " a partir de")],
    ["preço antigo riscado", (_, $) => { $(olx ? ".olx-adcard__price" : '[data-qa="POSTING_CARD_PRICE"]').prepend("<del>R$ 999.000</del>"); }],
    ["identidade posicional não substitui anúncio", (no, $) => { no.position = 1; delete no[olx ? "listId" : "postingId"]; no.url = fonte.origem; if (olx) $("a").attr("href", fonte.origem); else $("[data-to-posting]").attr("data-to-posting", fonte.origem).removeAttr("data-id"); }],
  ];
  for (const termo of ["direitos", "entrada", "repasse", "parcela", "sinal", "financiamento", "promocional", "preço antigo"]) {
    negativos.push([`${termo} não vira preço total mesmo com três valores iguais`, (no, $) => mudarTitulo(no, $, no[olx ? "subject" : "title"] + " " + termo)]);
    negativos.push([`${termo} na descrição também é recusado`, (no, _, acao) => { if (olx) no.description = termo; else { no.descriptionNormalized = termo; no.action.object.description = termo; acao.object.description = termo; } }]);
  }
  for (const tipo of ["Sobrado", "Casa em condomínio", "Kitnet", "Studio", "Loft", "Flat"]) negativos.push([`${tipo} não é promovido`, (no, $) => mudarTitulo(no, $, tipo + " à venda")]);
  if (olx) negativos.push(
    ["grouped com identidade ainda é recusado", no => { no.grouped = true; }],
    ["grouped sem identidade individual", (no, $) => { no.grouped = true; delete no.listId; $("a").attr("href", fonte.origem); }],
    ["preço do estado discordante", no => { no.priceValue = "R$ 123"; }],
    ["oldPrice não vira preço integral", no => { no.oldPrice = "R$ 999.000"; }],
    ["badge promocional ambíguo", no => { no.priceReductionBadge = true; }],
    ["installments não vira preço integral", no => { no.installments = true; }],
    ["categoria ampla contradiz propriedades", no => { no.categoryName = "Comercial"; }],
    ["contrato de subtipo não aprovado", no => { no.properties.find((p: No) => p.name === "re_types").value = "Sobrado"; }],
    ["duas propriedades de finalidade são ambíguas", no => { no.properties.push(no.properties.find((p: No) => p.name === "real_estate_type")); }],
  );
  else negativos.push(
    ["DEVELOPMENT recusado", no => { no.postingType = "DEVELOPMENT"; }],
    ["unidades agrupadas recusadas", no => { no.units = [{ postingId: "123" }]; }],
    ["card DEVELOPMENT recusado", (_, $) => { $("[data-posting-type]").attr("data-posting-type", "DEVELOPMENT"); }],
    ["posting sem SellAction", no => { no.action.type = "RentAction"; }],
    ["JSON-LD sem SellAction", (_, __, acao) => { acao["@type"] = "RentAction"; }],
    ["JSON-LD com URL divergente", (_, __, acao) => { acao.object.url = fonte.origem; }],
    ["posting action com URL divergente", no => { no.action.object.url = fonte.origem; }],
    ["card com ID divergente", (_, $) => { $("[data-id]").attr("data-id", "999999999"); }],
    ["operação id diferente de Venda", no => { no.priceOperationTypes[0].operationType.operationTypeId = "2"; }],
    ["operações múltiplas ambíguas", no => { no.priceOperationTypes.push(no.priceOperationTypes[0]); }],
    ["moeda diferente", no => { no.priceOperationTypes[0].prices[0].currency = "USD"; }],
    ["currency id diferente", no => { no.priceOperationTypes[0].prices[0].currencyId = "1"; }],
    ["preço formatado divergente", no => { no.priceOperationTypes[0].prices[0].formattedAmount = "123"; }],
    ["prices múltiplos recusados", no => { no.priceOperationTypes[0].prices.push({ currency: "R$", currencyId: "3", amount: 600, formattedAmount: "600" }); }],
    ["condomínio não substitui preço ausente", no => { no.priceOperationTypes[0].prices = []; no.expenses = { amount: fonte.preco, currency: "R$" }; }],
    ["IPTU não substitui preço ausente", no => { no.priceOperationTypes[0].prices = []; no.iptu = { amount: fonte.preco, currency: "R$" }; }],
    ["promoção percentual não comprovada", no => { no.priceOperationTypes[0].lowPricePercentage = 10; }],
    ["tipo da ação contraditório", (_, __, acao) => { acao.object.type = "CommercialBuilding"; }],
  );
  it.each(negativos)("rejeita %s", (_, fn) => expect(extrair(alterar(fn))).toEqual([]));
  it("duplicação de cards não duplica oferta", () => {
    const $ = load(html), c = $(olx ? "section.olx-adcard" : "[data-to-posting]"); c.after(c.clone()); expect(extrair($.html())).toEqual([]);
  });
  it("Locação solicitada não admite as fixtures Venda", () => expect((olx ? extrairOlxVenda : extrairWimoveisVenda)(load(html), { ...f, finalidade: "locacao" }, 50)).toEqual([]));
  it("tipo solicitado independente do observado", () => expect(extrair(html, { ...f, tipoRecorte: f.tipoRecorte === "casa" ? "apartamento" : "casa" })).toEqual([]));
  it("transporte offline passa pelo parser público", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-sem-credito");
    const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: html } }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    expect(await buscarComFirecrawlAoVivo(f, fonte.origem)).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "locacao", "venda"] as const)("B0 recebe somente finalidade observada comprovada (%s)", async finalidadeObservada => {
    const anuncio = { ...extrair()[0], finalidadeObservada }, valido = finalidadeObservada === "venda";
    expect(anuncioAdmitidoRecorteRadar(anuncio, f)).toBe(valido);
    const rpc = vi.fn(async () => ({ data: [{ id: "oferta", criado: true, precisa_embedding: false }], error: null }));
    const from = vi.fn(() => ({ update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }));
    expect(await salvarComparaveisMercado({ rpc, from } as never, "dono", [anuncio], f)).toBe(valido ? 1 : 0);
    expect(rpc).toHaveBeenCalledTimes(valido ? 1 : 0);
    if (valido) expect(rpc.mock.calls[0]).toMatchObject(["registrar_comparavel_mercado", { p_dados: { finalidade: "venda", finalidade_observada: "venda", valor_anunciado: fonte.preco } }]);
  });
});
it("matriz final preserva Locação 10/10 e comprova Venda 10/10", () => {
  for (const portal of Object.values(MATRIZ_CAPACIDADE_RADAR)) for (const finalidade of ["locacao", "venda"] as const)
    expect(Object.values(portal[finalidade])).toEqual(["suportado", "suportado"]);
});
