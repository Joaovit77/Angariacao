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

const fixture = (tipo: string) => readFileSync(resolve(`tests/fixtures/olx-locacao/${tipo}.html`), "utf8");
const cliente = { rpc: mocks.rpc, from: () => ({ update: () => ({ eq: () => ({ in: async () => ({ error: null }) }) }) }) };
const alterar = (html: string, fn: (dom: ReturnType<typeof load>) => void) => { const $ = load(html); fn($); return $.html(); };
type Estado = { listId: number; subject: string; url: string; price: string; priceValue: string; oldPrice?: string; priceReductionBadge?: boolean; category: string; categoryName: string; locationDetails: { municipality: string; uf: string }; properties: { name: string; value: string }[] };
const alterarEstado = (html: string, fn: (a: Estado) => void) => alterar(html, ($) => {
  $("script").each((_, s) => {
    const chunk = JSON.parse($(s).html()!.slice("self.__next_f.push(".length, -1));
    const valor = JSON.parse(chunk[1].slice(chunk[1].indexOf(":") + 1));
    valor[3].ads.forEach(fn);
    $(s).html(`self.__next_f.push(${JSON.stringify([1, "2f:" + JSON.stringify(valor) + "\n"])})`);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{ id: "comparavel-local", precisa_embedding: false }], error: null });
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("ALLOW_REAL_OPENAI", "0");
  vi.stubGlobal("fetch", vi.fn(() => { throw Error("Rede externa proibida neste teste"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

for (const tipoRecorte of ["casa", "apartamento"] as const) {
  const filtros: FiltrosCentralAngariacao = { portal: "olx", finalidade: "locacao", tipoRecorte, cidade: "Londrina", estado: "PR" };
  const html = fixture(tipoRecorte);
  const ids = tipoRecorte === "casa" ? ["1543235091", "1543232111"] : ["1543291298", "1543247963"];
  const precos = tipoRecorte === "casa" ? [3490, 1200] : [3900, 1290];
  const declarado = tipoRecorte === "casa" ? "Casa" : "Apartamento";
  const extrair = (pagina = html) => extrairAnunciosFirecrawl(pagina, filtros);
  describe(`OLX ${declarado}: contrato real minimizado`, () => {
    it("suporta exclusivamente o recorte comprovado e usa URL distinta sem parâmetros", () => {
      expect(capacidadeContratoExplicitoRadar(filtros).suportado).toBe(true);
      expect(urlDaPesquisa(filtros)).toBe(`https://www.olx.com.br/imoveis/aluguel/${tipoRecorte === "casa" ? "casas" : "apartamentos"}/estado-pr/regiao-de-londrina/londrina`);
      expect(urlDaPesquisa({ ...filtros, valorMin: 500, valorMax: 5000 })).toBe(urlDaPesquisa(filtros));
    });
    it("extrai ID nativo, aluguel, tipo próprio, imagem, localização e características", () => {
      const a = extrair();
      expect(a.map(x => x.idExterno)).toEqual(ids); expect(a.map(x => x.preco)).toEqual(precos);
      expect(a[0]).toMatchObject({ finalidade: "locacao", tipoRecorte, tipoDeclarado: declarado, cidade: "Londrina", estado: "PR", quartos: tipoRecorte === "casa" ? 2 : 3, banheiros: tipoRecorte === "casa" ? 3 : 2, vagas: 1, areaM2: tipoRecorte === "casa" ? 93 : 96 });
      expect(a.every(x => x.imagem?.startsWith("https://img.olx.com.br/"))).toBe(true);
      expect(a.every(x => !!x.bairro)).toBe(true);
    });
    it("despesas antes do aluguel não são fonte de preço", () => {
      const pagina = alterar(html, $ => { $("section").prepend('<p>Condomínio R$ 700 · IPTU R$ 130 · Taxa R$ 80 · Promoção R$ 1</p>'); });
      expect(extrair(pagina).map(a => a.preco)).toEqual(precos);
      if (tipoRecorte === "apartamento") expect(extrair(pagina)[0].valorCondominio).toBe(720);
      const despesas = alterarEstado(html, a => { a.properties = a.properties.filter(p => p.name !== "iptu"); a.properties.push({ name: "iptu", value: "R$ 130" }); });
      expect(extrair(despesas)[0].valorIptu).toBe(130);
      expect(extrair(despesas).map(a => a.preco)).toEqual(precos);
    });
    it.each(["ausente", "divergente", "moeda", "zero", "promoção", "múltiplos"])("preço %s fica nulo e não vai a comparáveis", async caso => {
      let pagina = alterarEstado(html, a => {
        if (caso === "ausente") Reflect.deleteProperty(a, "price");
        if (caso === "divergente") a.priceValue = "R$ 1";
        if (caso === "moeda") a.price = "US$ 100";
        if (caso === "zero") a.price = a.priceValue = "R$ 0";
        if (caso === "promoção") a.oldPrice = "R$ 9.000";
      });
      if (caso === "múltiplos") pagina = alterar(pagina, $ => { $(".olx-adcard__price").append(" R$ 1"); });
      const anuncios = extrair(pagina); expect(anuncios).toHaveLength(2); expect(anuncios.every(a => a.preco === null)).toBe(true);
      expect(extrairAnunciosFirecrawl(pagina, { ...filtros, valorMin: 1 })).toEqual([]);
      expect(extrairAnunciosFirecrawl(pagina, { ...filtros, valorMax: 99999 })).toEqual([]);
      expect(await salvarComparaveisMercado(cliente as never, "dono", anuncios, filtros)).toBe(0); expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it.each(["listId", "url", "sem estado", "duplicado"])("identidade %s inválida não usa posição", caso => {
      let pagina = alterarEstado(html, a => { if (caso === "listId") a.listId = 9999999999; if (caso === "url") a.url = a.url.replace(/-\d+$/, "-9999999999"); });
      if (caso === "sem estado") pagina = alterar(pagina, $ => { $("script").remove(); });
      if (caso === "duplicado") pagina = alterar(pagina, $ => { $("body").append($("script").clone()); });
      expect(extrair(pagina)).toEqual([]);
    });
    it.each(["Venda - casa", "Venda - apartamento", "", "Aluguel - casa em condominio fechado"])("finalidade/tipo %s não se torna o filtro solicitado", contrato => {
      const pagina = alterarEstado(html, a => { a.properties.find(p => p.name === "real_estate_type")!.value = contrato; });
      expect(extrair(pagina)).toEqual([]);
    });
    it.each(["category", "real_estate_type", "re_types"])("tipo próprio ausente (%s) não é fabricado", nome => {
      expect(extrair(alterarEstado(html, a => { a.properties = a.properties.filter(p => p.name !== nome); }))).toEqual([]);
    });
    it("Casa não admite Apartamento e Apartamento não admite Casa, inclusive em página mista", () => {
      expect(extrair(fixture(tipoRecorte === "casa" ? "apartamento" : "casa"))).toEqual([]);
      expect(extrair(html + fixture(tipoRecorte === "casa" ? "apartamento" : "casa")).map(a => a.idExterno)).toEqual(ids);
      expect(extrair(fixture("divergentes")).map(a => a.idExterno)).toEqual(tipoRecorte === "casa" ? [] : ["1543291298"]);
    });
    it.each(["Sobrado", "Casa de Condomínio", "Kitnet", "Conjugado", "Studio", "Loft", "Casa à venda"])("título %s contradiz ou restringe o contrato próprio", titulo => {
      const pagina = alterarEstado(alterar(html, $ => { $('a[data-testid="adcard-link"]').attr("title", titulo).find("h2").text(titulo); }), a => { a.subject = titulo; });
      expect(extrair(pagina)).toEqual([]);
    });
    it("link agrupado, sem ID ou vários links individuais no mesmo card são recusados", () => {
      expect(extrair(fixture("sem-identidade"))).toEqual([]);
      expect(extrair(alterar(html, $ => { $('a[data-testid="adcard-link"]').remove(); }))).toEqual([]);
      expect(extrair(alterar(html, $ => { $("section").each((_, s) => { $(s).append($(s).find("a").clone()); }); }))).toEqual([]);
    });
    it("JSON inválido/JS executável não fornece identidade nem preço", () => {
      expect(extrair(alterar(html, $ => { $("script").html('self.__next_f.push([1, "{inválido"]); fetch("https://externo.invalid")'); }))).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });
    it("ordem do estado não associa anúncios por posição; chunks divididos continuam válidos", () => {
      const pagina = alterar(html, $ => { const s = $("script").first(), chunk = JSON.parse(s.html()!.slice(19, -1)); const wire=chunk[1]; const data=JSON.parse(wire.slice(wire.indexOf(":")+1)); data[3].ads.reverse(); const novo="2f:"+JSON.stringify(data)+"\n"; const corte=Math.floor(novo.length/2); s.html(`self.__next_f.push(${JSON.stringify([1,novo.slice(0,corte)])})`); $("body").append(`<script>self.__next_f.push(${JSON.stringify([1,novo.slice(corte)])})</script>`); });
      expect(extrair(pagina)).toEqual(extrair());
    });
    it("duplicatas de card e parâmetros de rastreamento mantêm a identidade estável", () => {
      const pagina = alterar(html, $ => { $("body").append($("section").first().clone()); $('a[data-testid="adcard-link"]').attr("href", (_, u) => u + "?source=teste#foto"); });
      expect(extrair(pagina).map(a => a.idExterno)).toEqual(ids);
    });
    it.each([{municipality:"Curitiba",uf:"PR"},{municipality:"Londrina",uf:"SP"},{municipality:"",uf:""}])("geografia própria %j não usa o filtro solicitado", local => {
      expect(extrair(alterarEstado(html, a => { a.locationDetails=local; }))).toEqual([]);
    });
    it("finalização/persistência guardam evidência e recusam injeção incompatível", async () => {
      const anuncios=extrair(); const final=await finalizarColetaCentralAngariacao(cliente as never,"dono",anuncios,filtros);
      expect(final.erroComparaveis).toBeNull(); expect(final.comparaveisSalvos).toBe(2);
      for(const [i,a] of anuncios.entries()) expect(mocks.rpc.mock.calls[i][1].p_dados).toMatchObject({user_id:"dono",id_externo:ids[i],finalidade:"locacao",valor_anunciado:precos[i],dados_originais:{tipoRecorte,tipoDeclarado:declarado,imagem:a.imagem,evidenciaLocacaoOlx:a.evidenciaLocacaoOlx}});
      mocks.rpc.mockClear(); const [a]=anuncios;
      const injetados=[{...a,idExterno:"olx-0-sem-id"},{...a,tipoDeclarado:null},{...a,tipoDeclarado:tipoRecorte==="casa"?"Apartamento":"Casa"},{...a,finalidade:"venda" as const},{...a,evidenciaLocacaoOlx:undefined},{...a,preco:700},{...a,url:a.url.replace(/-\d+$/,"-9999999999")}];
      for(const item of injetados) expect(anuncioAdmitidoRecorteRadar(item,filtros)).toBe(false);
      expect((await finalizarColetaCentralAngariacao(cliente as never,"dono",injetados,filtros)).anuncios).toEqual([]);
      expect(await salvarComparaveisMercado(cliente as never,"dono",injetados,filtros)).toBe(0); expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("reobservação preserva a chave de upsert e não cria outro comparável", async () => {
      const banco=new Map<string,unknown>();
      mocks.rpc.mockImplementation(async (_nome, {p_dados}) => { const chave=`${p_dados.user_id}:${p_dados.portal}:${p_dados.id_externo}`; banco.set(chave,p_dados); return {data:[{id:chave,precisa_embedding:false}],error:null}; });
      await salvarComparaveisMercado(cliente as never,"dono",extrair(),filtros);
      await salvarComparaveisMercado(cliente as never,"dono",extrair(),filtros);
      expect(banco.size).toBe(2); expect([...banco.keys()].map(k=>k.split(":").at(-1))).toEqual(ids);
      expect(mocks.rpc).toHaveBeenCalledTimes(4);
    });
    it("navegador alternativo compartilha o parser sem transporte real", async () => {
      vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",process.execPath);
      const content=vi.fn().mockResolvedValue(html),close=vi.fn().mockResolvedValue(undefined);
      const page={setDefaultTimeout:vi.fn(),addInitScript:vi.fn(),route:vi.fn(),goto:vi.fn().mockResolvedValue({status:()=>200}),content,locator:vi.fn().mockReturnValue({first:()=>({waitFor:vi.fn()})})};
      mocks.launch.mockResolvedValue({newContext:async()=>({newPage:async()=>page}),close});
      expect(await buscarComNavegador(filtros,urlDaPesquisa(filtros))).toEqual(extrair()); expect(content).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();expect(fetch).not.toHaveBeenCalled();
    });
    it.each([{finalidade:"venda" as const,cidade:"Curitiba"},{cidade:"Curitiba"},{estado:"SP"},{cidade:""},{bairro:"Centro"},{somenteProprietario:true}])("bloqueia recorte não comprovado antes de qualquer efeito: %j",async delta=>{
      const f={...filtros,...delta}; expect(()=>urlDaPesquisa(f)).toThrow();
      await expect(buscarComFirecrawl(f,"https://exemplo.invalid")).rejects.toThrow(); await expect(salvarComparaveisMercado(cliente as never,"dono",[],f)).rejects.toThrow();
      expect(mocks.cache).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
    });
  });
}
it("promoção real permanece sem aluguel confiável e fora dos comparáveis",()=>{
  const a=extrairAnunciosFirecrawl(fixture("preco-ambiguo"),{portal:"olx",finalidade:"locacao",tipoRecorte:"apartamento",cidade:"Londrina",estado:"PR"});
  expect(a).toHaveLength(1); expect(a[0].preco).toBeNull();
});
