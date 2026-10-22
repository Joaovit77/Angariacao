import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: ({ namespace }: { namespace: string }) => ({
  get: async (k: string) => cache.get(`${namespace}:${k}`) ?? null,
  set: async (k: string, v: unknown) => { cache.set(`${namespace}:${k}`, v); },
}) }));
import { buscarColetaPaginadaRadar } from "@/lib/servidor/paginacaoRadar";
import { avaliarCoberturaRadar } from "@/lib/servidor/coberturaRadar";
import { criarOrcamentoRadar } from "@/lib/servidor/orcamentoRadar";
import { urlUniversoRadar } from "@/lib/servidor/universoRadar";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { paginaRadar } from "./fixtures/paginacaoRadar";
const f: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR", bairro: "Jardim Tókio" };
const base = urlUniversoRadar(f)!;
const urlPagina = (n: number) => n === 1 ? base : `${base}?pg=${n}`;
const ids = (inicio: number, n: number) => Array.from({ length: n }, (_, i) => String(inicio + i));
const paginas = new Map<number, { html: string; efetiva?: string; status?: number; semEfetiva?: boolean }>();
let fetchLocal: ReturnType<typeof vi.fn>;
function pagina(n: number, itens: string[], total: number, proxima: boolean) {
  // Reproduz a divergência material observada nos HTML reais, sem copiar contatos/HTML público.
  return paginaRadar(f, n, itens, total, proxima).replace(`"url":"${urlPagina(n)}"`, `"url":"${base}"`);
}
async function coletar(maxPaginas = 10) {
  const c = await buscarColetaPaginadaRadar(f, { restanteMs: () => 300_000,
    orcamento: criarOrcamentoRadar({ maxPaginas, maxChamadasPagas: 10 }) });
  return { ...c, cobertura: avaliarCoberturaRadar(c.aquisicao, f, base, c.anuncios) };
}
beforeEach(() => {
  cache.clear(); paginas.clear(); vi.stubEnv("FIRECRAWL_API_KEY", "fixture-sem-api-real");
  fetchLocal = vi.fn(async (destino: string, init?: RequestInit) => {
    expect(destino).toBe("https://api.firecrawl.dev/v2/scrape");
    const solicitada = JSON.parse(String(init?.body)).url;
    const n = Number(new URL(solicitada).searchParams.get("pg") || 1), p = paginas.get(n);
    if (!p) return new Response("Página não configurada no teste", { status: 503 });
    return Response.json({ success: true, data: { rawHtml: p.html, metadata: { statusCode: p.status ?? 200,
      sourceURL: solicitada, ...(p.semEfetiva ? {} : { url: p.efetiva ?? solicitada }) } } });
  });
  vi.stubGlobal("fetch", fetchLocal);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Chaves — contrato combinado de identidade ordinal (A–H)", () => {
  it("A: P2 com documento/canonical base, transporte próprio e IDs novos é admitida", async () => {
    paginas.set(1, { html: pagina(1, ["810001"], 3, true) });
    paginas.set(2, { html: pagina(2, ["810002"], 3, true) });
    const c = await coletar(2);
    expect(c.resumo).toMatchObject({ paginasLidas: 2, motivoTermino: "limite_paginas" });
    expect(c.resumo).toMatchObject({ avisosEvidencia: [{ pagina: 2, codigo: "portal_document_url_not_pagination_aware" }] });
    expect(c.cobertura.cobertura).toBe("parcial");
    expect(c.anuncios).toHaveLength(2);
  });
  it("B: resposta com IDs integralmente repetidos fecha o gate e interrompe a progressão", async () => {
    paginas.set(1, { html: pagina(1, ["810001"], 3, true) });
    paginas.set(2, { html: pagina(2, ["810001"], 3, true) });
    const c = await coletar();
    expect(c.resumo.motivoTermino).toBe("evidencia_inconsistente");
    expect(c.cobertura.cobertura).not.toBe("completa"); expect(fetchLocal).toHaveBeenCalledTimes(2);
    expect(c.anuncios.length).toBeGreaterThan(0);
  });
  it("C: URL efetiva de volta à base rejeita P2 apesar de IDs diferentes", async () => {
    paginas.set(1, { html: pagina(1, ["810001"], 2, true) });
    paginas.set(2, { html: pagina(2, ["810002"], 2, false), efetiva: base });
    const c = await coletar();
    expect(c.resumo.motivoTermino).toBe("evidencia_inconsistente");
    expect(c.cobertura.cobertura).not.toBe("completa"); expect(c.anuncios).toHaveLength(2);
  });
  it.each([[2, 2], [3, 2]])("H: navegação publicada P%s→P%s é loop e não admite a página", async (atual, destino) => {
    for (let n = 1; n <= atual; n++) paginas.set(n, { html: pagina(n, [String(840000 + n)], 4, true) });
    paginas.set(atual, { html: pagina(atual, [String(840000 + atual)], 4, true)
      .replace(`rel="next" href="${urlPagina(atual + 1)}"`, `rel="next" href="${urlPagina(destino)}"`) });
    const c = await coletar();
    expect(c.resumo).toMatchObject({ paginasLidas: atual, motivoTermino: "evidencia_inconsistente" });
    expect(c.cobertura.cobertura).not.toBe("completa");
    expect(c.anuncios).toHaveLength(atual);
    expect(fetchLocal).toHaveBeenCalledTimes(atual);
    expect(fetchLocal.mock.calls.map(([, init]) => JSON.parse(String(init.body)).url))
      .toEqual(Array.from({ length: atual }, (_, i) => urlPagina(i + 1)));
  });
  it("D/G: P1→P2→P3 sequenciais, total estável e fim coerente permitem cobertura completa", async () => {
    for (let n = 1; n <= 3; n++) paginas.set(n, { html: pagina(n, [String(810000 + n)], 3, n < 3) });
    const c = await coletar();
    expect(c.resumo).toMatchObject({ paginasLidas: 3, motivoTermino: "fim_comprovado" });
    expect(c.cobertura).toMatchObject({ cobertura: "completa", total: 3 });
    expect(fetchLocal.mock.calls.map(([, init]) => JSON.parse(String(init.body)).url)).toEqual([base, urlPagina(2), urlPagina(3)]);
  });
  it("E: 30/33 sem fim continua parcial no teto e não inventa a página final", async () => {
    paginas.set(1, { html: pagina(1, ids(820000, 15), 33, true) });
    paginas.set(2, { html: pagina(2, ids(820015, 15), 33, false) });
    const c = await coletar(2);
    expect(c.resumo).toMatchObject({ paginasLidas: 2, resultadosColetados: 30, totalDeclarado: 33, motivoTermino: "limite_paginas" });
    expect(c.cobertura.cobertura).toBe("parcial"); expect(fetchLocal).toHaveBeenCalledTimes(2);
  });
  it("D: total ainda não reconciliado permite tentar P3 quando P2 não publica next", async () => {
    paginas.set(1, { html: pagina(1, ids(830000, 15), 33, true) });
    paginas.set(2, { html: pagina(2, ids(830015, 15), 33, false) });
    paginas.set(3, { html: pagina(3, ids(830030, 3), 33, false) });
    const c = await coletar();
    expect(c.resumo).toMatchObject({ paginasLidas: 3, resultadosColetados: 33, motivoTermino: "fim_comprovado" });
    expect(c.cobertura.cobertura).toBe("completa");
  });
  it("F: total atingido com continuação publicada não comprova fim", async () => {
    paginas.set(1, { html: pagina(1, ["810001"], 2, true) });
    paginas.set(2, { html: pagina(2, ["810002"], 2, true) });
    const c = await coletar(2);
    expect(c.resumo.motivoTermino).toBe("limite_paginas"); expect(c.cobertura.cobertura).toBe("parcial");
  });
  it.each(["olx", "viva-real", "zap", "wimoveis"] as const)("H: %s não herda o contrato de coverage do Chaves", (portal) => {
    const outro = { ...f, portal } as FiltrosCentralAngariacao;
    expect(avaliarCoberturaRadar({ id: "local", em: "2026-10-21T19:51:12Z", origem: "firecrawl", html: pagina(1, ["810001"], 1, false), confiavel: true }, outro, base, []).cobertura).toBe("desconhecida");
  });
  it("patrocinado repetido é permitido quando a página também acrescenta identidade", async () => {
    paginas.set(1, { html: pagina(1, ["810001", "810002"], 3, true) });
    paginas.set(2, { html: pagina(2, ["810001", "810003"], 3, false) });
    expect((await coletar()).cobertura).toMatchObject({ cobertura: "completa", total: 3 });
  });
  it("sem URL efetiva informada pelo transporte não há prova ordinal de P2", async () => {
    paginas.set(1, { html: pagina(1, ["810001"], 2, true) });
    paginas.set(2, { html: pagina(2, ["810002"], 2, false), semEfetiva: true });
    expect((await coletar()).resumo.motivoTermino).toBe("evidencia_inconsistente");
  });
  it("canonical de outro bairro continua materialmente conflitante", async () => {
    paginas.set(1, { html: pagina(1, ["810001"], 2, true) });
    paginas.set(2, { html: pagina(2, ["810002"], 2, false).replace(`<link rel="canonical" href="${base}">`, `<link rel="canonical" href="${base}outro/">`) });
    expect((await coletar()).cobertura.cobertura).not.toBe("completa");
  });
});
