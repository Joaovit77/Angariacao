import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: ({namespace}: {namespace:string}) => ({ get: async (k: string) => cache.get(`${namespace}:${k}`) ?? null,
  set: async (k: string, v: unknown) => { cache.set(`${namespace}:${k}`,v); } }) }));
import { buscarComFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { buscarColetaPaginadaRadar } from "@/lib/servidor/paginacaoRadar";
import { criarOrcamentoRadar, limitesRodadaRadar } from "@/lib/servidor/orcamentoRadar";
import { avaliarCoberturaRadar, lerEvidenciaPaginaRadar } from "@/lib/servidor/coberturaRadar";
import { urlUniversoRadar } from "@/lib/servidor/universoRadar";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { paginaRadar } from "./fixtures/paginacaoRadar";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
const f: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" };
const base = urlDaPesquisa(f);
const paginas = new Map<number, string>();
let buscar: ReturnType<typeof vi.fn>;
let chamadas: string[];
const restanteMs = () => 300_000;
function cobertura(coleta: Awaited<ReturnType<typeof buscarColetaPaginadaRadar>>, filtros = f) {
  return avaliarCoberturaRadar(coleta.aquisicao, filtros, urlDaPesquisa(filtros), coleta.anuncios);
}
beforeEach(() => {
  cache.clear(); paginas.clear(); chamadas = [];
  vi.stubEnv("FIRECRAWL_API_KEY", "fixture-sem-api-real");
  vi.stubEnv("RADAR_MAX_PAGINAS_RODADA", "10"); vi.stubEnv("RADAR_MAX_CHAMADAS_PAGAS_RODADA", "10");
  buscar = vi.fn(async (destino: string, init?: RequestInit) => {
    const paga = destino === "https://api.firecrawl.dev/v2/scrape";
    const url = paga ? JSON.parse(String(init?.body)).url : destino;
    chamadas.push(url);
    const html = paginas.get(Number(new URL(url).searchParams.get("pg") || 1));
    return paga ? new Response(JSON.stringify({ success: !!html, data: { rawHtml: html, metadata: { statusCode: html ? 200 : 503, sourceURL: url, url } } }), { status: html ? 200 : 503 })
      : Object.defineProperties(new Response(html || "falha local", { status: html ? 200 : 503 }), {
        url: { value: url }, redirected: { value: false },
      });
  });
  vi.stubGlobal("fetch", buscar);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Radar — paginação operacional e cobertura comprovada", () => {
  it.each([["casa","locacao"],["apartamento","locacao"],["casa","venda"],["apartamento","venda"]] as const)("%s/%s percorre páginas reais do transporte e termina antes do teto", async (tipoRecorte, finalidade) => {
    const filtros = { ...f, tipoRecorte, finalidade };
    paginas.set(1,paginaRadar(filtros,1,["100001"],2,true)); paginas.set(2,paginaRadar(filtros,2,["100002"],2,false));
    const coleta = await buscarColetaPaginadaRadar(filtros,{ restanteMs });
    expect(coleta.resumo).toEqual({ paginasLidas: 2, resultadosColetados: 2, totalDeclarado: 2, motivoTermino: "fim_comprovado",
      populacao: { raw_count: 2, qualified_count: 2, out_of_scope_count: 0, indeterminate_count: 0, declared_total: 2 } });
    expect(cobertura(coleta,filtros)).toMatchObject({ cobertura: "completa", total: 2 });
    expect(buscar).toHaveBeenCalledTimes(2);
  });
  it("página 10 com próxima página fica parcial e nunca consulta a página 11", async () => {
    for (let i=1;i<=11;i++) paginas.set(i,paginaRadar(f,i,[String(100000+i)],11,i<11));
    const coleta = await buscarColetaPaginadaRadar(f,{ restanteMs });
    expect(coleta.resumo).toMatchObject({ paginasLidas: 10, resultadosColetados: 10, totalDeclarado: 11, motivoTermino: "limite_paginas" });
    expect(cobertura(coleta)).toMatchObject({ cobertura: "parcial" });
    expect(buscar).toHaveBeenCalledTimes(10);
    expect(chamadas).not.toContain(base+"?pg=11");
  });
  it("fim comprovado exatamente na página 10 pode ser integral", async () => {
    for (let i=1;i<=10;i++) paginas.set(i,paginaRadar(f,i,[String(100000+i)],10,i<10));
    expect(cobertura(await buscarColetaPaginadaRadar(f,{ restanteMs }))).toMatchObject({ cobertura: "completa" });
  });
  it("união de mais de 50 ofertas não é cortada no total da rodada", async () => {
    const ids = Array.from({length:60},(_,i)=>String(100000+i));
    paginas.set(1,paginaRadar(f,1,ids.slice(0,50),60,true)); paginas.set(2,paginaRadar(f,2,ids.slice(50),60,false));
    const coleta = await buscarColetaPaginadaRadar(f,{ restanteMs });
    expect(coleta.anuncios).toHaveLength(60); expect(cobertura(coleta)).toMatchObject({ cobertura: "completa",total:60 });
  });
  it("limite de chamadas pagas é independente do limite de páginas", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],2,true)); paginas.set(2,paginaRadar(f,2,["100002"],2,false));
    const orcamento = criarOrcamentoRadar({maxPaginas:10,maxChamadasPagas:1});
    const coleta = await buscarColetaPaginadaRadar(f,{ restanteMs, orcamento });
    expect(coleta.resumo).toMatchObject({ paginasLidas:1,motivoTermino:"limite_chamadas_pagas" });
    expect(cobertura(coleta).cobertura).toBe("parcial"); expect(buscar).toHaveBeenCalledOnce();
  });
  it("tentativa paga falhada conta no teto mesmo quando o fallback HTTP funciona", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],2,true).replace('<a href="https://www.chavesnamao.com.br/imovel/','<a href="/imovel/'));
    const transporte = buscar.getMockImplementation()! as (destino: string, init?: RequestInit) => Promise<Response>;
    buscar.mockImplementation(async (destino: string, init?: RequestInit) => destino.includes("api.firecrawl.dev")
      ? new Response("falha controlada",{status:503}) : transporte(destino,init));
    const orcamento=criarOrcamentoRadar({maxPaginas:10,maxChamadasPagas:1});
    const coleta=await buscarColetaPaginadaRadar(f,{restanteMs,orcamento});
    expect(coleta.resumo).toMatchObject({paginasLidas:1,motivoTermino:"limite_chamadas_pagas"});
    expect(orcamento.resumo().chamadasPagas).toBe(1);
    expect(buscar.mock.calls.filter(([u])=>String(u).includes("api.firecrawl.dev"))).toHaveLength(1);
    expect(cobertura(coleta).cobertura).toBe("parcial");
  });
  it("fallback HTTP continua funcionando na página adicional autorizada", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],2,true));
    paginas.set(2,paginaRadar(f,2,["100002"],2,false).replace('<a href="https://www.chavesnamao.com.br/imovel/','<a href="/imovel/'));
    const transporte = buscar.getMockImplementation()! as (destino: string, init?: RequestInit) => Promise<Response>;
    buscar.mockImplementation(async (destino: string, init?: RequestInit) => {
      if(destino.includes("api.firecrawl.dev") && JSON.parse(String(init?.body)).url.endsWith("?pg=2")) return new Response("falha controlada",{status:503});
      return transporte(destino,init);
    });
    const orcamento=criarOrcamentoRadar();
    const coleta=await buscarColetaPaginadaRadar(f,{restanteMs,orcamento});
    expect(cobertura(coleta).cobertura).toBe("completa");
    expect(orcamento.resumo().chamadasPagas).toBe(2); expect(buscar).toHaveBeenCalledTimes(3);
  });
  it("cache de páginas preserva ID/instante da aquisição e não consome nova chamada paga", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],2,true)); paginas.set(2,paginaRadar(f,2,["100002"],2,false));
    const a = await buscarColetaPaginadaRadar(f,{ restanteMs });
    const orcamento = criarOrcamentoRadar({maxPaginas:10,maxChamadasPagas:1});
    orcamento.reservarChamadaPaga();
    const b = await buscarColetaPaginadaRadar(f,{ restanteMs, orcamento });
    expect(b.aquisicao).toEqual(a.aquisicao); expect(cobertura(b).cobertura).toBe("completa"); expect(buscar).toHaveBeenCalledTimes(2);
  });
  it("duas buscas compartilham o teto da rodada, sem multiplicá-lo", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],1,false));
    const orcamento = criarOrcamentoRadar({maxPaginas:1,maxChamadasPagas:1});
    await buscarColetaPaginadaRadar(f,{ restanteMs,orcamento });
    const outra = await buscarColetaPaginadaRadar({...f,tipoRecorte:"apartamento"},{restanteMs,orcamento});
    expect(outra.resumo).toMatchObject({paginasLidas:0,motivoTermino:"limite_paginas"}); expect(buscar).toHaveBeenCalledOnce();
  });
  it("single-flight concorrente só reserva uma chamada paga por página", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],1,false));
    const orcamento = criarOrcamentoRadar({maxPaginas:1,maxChamadasPagas:1});
    const [a,b] = await Promise.all([buscarColetaPaginadaRadar(f,{restanteMs,orcamento}),buscarColetaPaginadaRadar(f,{restanteMs,orcamento})]);
    expect(a.aquisicao).toEqual(b.aquisicao); expect(orcamento.resumo().chamadasPagas).toBe(1); expect(buscar).toHaveBeenCalledOnce();
  });
  it("falha na página intermediária conserva evidência parcial e o motivo da parada", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],3,true));
    const coleta = await buscarColetaPaginadaRadar(f,{restanteMs});
    expect(coleta.resumo).toMatchObject({paginasLidas:1,motivoTermino:"falha_pagina"}); expect(cobertura(coleta).cobertura).toBe("parcial");
  });
  it("tempo restante insuficiente não inicia nova aquisição", async () => {
    const coleta = await buscarColetaPaginadaRadar(f,{restanteMs:()=>1000});
    expect(coleta.resumo).toMatchObject({paginasLidas:0,motivoTermino:"limite_tempo"}); expect(buscar).not.toHaveBeenCalled();
  });
  it.each(["total","repetida","sem_next","externa","salto","tipo","finalidade","cidade"])("%s divergente fecha o gate", async (falha) => {
    paginas.set(1,paginaRadar(f,1,["100001"],2,true));
    let segunda = paginaRadar(f,2,[falha==="repetida"?"100001":"100002"],falha==="total"?3:2,false);
    if (falha==="tipo") segunda=paginaRadar({...f,tipoRecorte:"apartamento"},2,["100002"],2,false);
    if (falha==="finalidade") segunda=paginaRadar({...f,finalidade:"venda"},2,["100002"],2,false);
    if (falha==="cidade") segunda=segunda.replaceAll("Londrina","Curitiba").replaceAll("pr-londrina","pr-curitiba");
    paginas.set(2,segunda);
    if (falha==="sem_next") { paginas.set(1,paginaRadar(f,1,["100001"],2,false)); paginas.delete(2); }
    if (falha==="externa") paginas.set(1,paginaRadar(f,1,["100001"],2,true).replace('rel="next" href="'+base+'?pg=2','rel="next" href="https://exemplo.invalid/?pg=2'));
    if (falha==="salto") paginas.set(1,paginaRadar(f,1,["100001"],2,true).replaceAll("pg=2","pg=3"));
    const coleta=await buscarColetaPaginadaRadar(f,{restanteMs});
    expect(cobertura(coleta).cobertura).toBe("parcial");
    expect(chamadas.every(u=>u.startsWith(base))).toBe(true);
  });
  it("navegação publicada como Página 2 sem rel next também é conferida", () => {
    expect(lerEvidenciaPaginaRadar(paginaRadar(f,1,["100001"],2,true).replace('rel="next" ',""),base,base)?.proxima).toBe(base+"?pg=2");
  });
  it("cache sem prova preserva anúncios adquiridos para consulta privada", async () => {
    paginas.set(1,paginaRadar(f,1,["100001"],2,true));
    await buscarComFirecrawl(f,base);
    const coleta=await buscarColetaPaginadaRadar(f,{restanteMs});
    expect(coleta.anuncios.map(a=>a.idExterno)).toEqual(["100001"]);
    expect(coleta.resumo).toMatchObject({paginasLidas:1,resultadosColetados:1,motivoTermino:"sem_proveniencia"});
    expect(cobertura(coleta).cobertura).not.toBe("completa"); expect(buscar).toHaveBeenCalledOnce();
  });
  it("limites são configuráveis e configuração inválida falha fechada", () => {
    expect(limitesRodadaRadar()).toEqual({maxPaginas:10,maxChamadasPagas:10});
    vi.stubEnv("RADAR_MAX_PAGINAS_RODADA","3"); expect(limitesRodadaRadar().maxPaginas).toBe(3);
    vi.stubEnv("RADAR_MAX_PAGINAS_RODADA","inválido"); expect(()=>limitesRodadaRadar()).toThrow("Limite");
  });
});


describe("Radar — rota canônica do universo de bairro", () => {
  const bairro={...f,bairro:"Jardim Tókio"};
  it.each(["outro_bairro","query_extra","listagem_outro_bairro"])("canonical %s na segunda página fecha o gate e conserva a base", async (falha) => {
    paginas.set(1,paginaRadar(bairro,1,["880001"],2,true));
    let html=paginaRadar(bairro,2,["880002"],2,false);
    const canonical=`<link rel="canonical" href="${urlUniversoRadar(bairro)}">`;
    html=falha==="listagem_outro_bairro" ? html.replace(`"url":"${urlUniversoRadar(bairro)}?pg=2"`,`"url":"${base}?pg=2"`)
      : html.replace(canonical,canonical.replace("jardim-tokio/",falha==="outro_bairro" ? "outro-bairro/" : "jardim-tokio/?extra=1"));
    paginas.set(2,html);
    const c=await buscarColetaPaginadaRadar(bairro,{restanteMs});
    expect(c.anuncios).toHaveLength(2);
    expect(avaliarCoberturaRadar(c.aquisicao,bairro,urlUniversoRadar(bairro),c.anuncios).cobertura).toBe("desconhecida");
  });
  it("listagem publicada na rota exata comprova bairro mesmo sem tag canonical opcional", async () => {
    paginas.set(1,paginaRadar(bairro,1,["880001"],1,false).replace(/<link rel="canonical"[^>]+>/,""));
    const c=await buscarColetaPaginadaRadar(bairro,{restanteMs});
    expect(avaliarCoberturaRadar(c.aquisicao,bairro,urlUniversoRadar(bairro),c.anuncios).cobertura).toBe("completa");
  });
  it("o teto de páginas do bairro mantém parcial mesmo com canonical correta", async () => {
    paginas.set(1,paginaRadar(bairro,1,["880001"],2,true));
    const c=await buscarColetaPaginadaRadar(bairro,{restanteMs,orcamento:criarOrcamentoRadar({maxPaginas:1,maxChamadasPagas:10})});
    expect(c.resumo).toMatchObject({paginasLidas:1,motivoTermino:"limite_paginas"});
    expect(c.anuncios).toHaveLength(1);
    expect(avaliarCoberturaRadar(c.aquisicao,bairro,urlUniversoRadar(bairro),c.anuncios).cobertura).toBe("parcial");
  });
  it.each([{finalidade:"venda"},{tipoRecorte:"apartamento"},{cidade:"Cambé"},{portal:"olx"}])("a rota publicada não se estende a outro contexto: %j", (contexto) => {
    expect(urlUniversoRadar({...bairro,...contexto} as FiltrosCentralAngariacao)).toBeNull();
  });
});
