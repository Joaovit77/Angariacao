import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const estadoCache = vi.hoisted(() => ({ dados: new Map<string, unknown>(), antesLeitura: () => {} }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: ({ namespace }: { namespace: string }) => ({
  get: async (k: string) => { estadoCache.antesLeitura(); return estadoCache.dados.get(`${namespace}:${k}`) ?? null; },
  set: async (k: string, v: unknown) => { estadoCache.dados.set(`${namespace}:${k}`, v); },
}) }));
import { buscarColetaPaginadaRadar } from "@/lib/servidor/paginacaoRadar";
import { avaliarCoberturaRadar } from "@/lib/servidor/coberturaRadar";
import { criarOrcamentoRadar } from "@/lib/servidor/orcamentoRadar";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { RESERVA_PROCESSAMENTO_CENTRAL_MS } from "@/lib/servidor/fallbackHttpChaves";
import { TIMEOUT_FIRECRAWL_FETCH_MS } from "@/lib/servidor/firecrawlCentralAngariacao";
import { paginaRadar } from "./fixtures/paginacaoRadar";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
const filtros: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" };
const base = urlDaPesquisa(filtros);
let agoraMs: number, deadline: number, total: number;
let duracoes: number[], duracaoHttp: number, falhas: Set<number>;
let envios: Array<{ paga: boolean; pagina: number; restante: number }>;
const restanteMs = () => deadline - performance.now();
const id = (n: number) => String(910000 + n);
function html(pagina: number) { return paginaRadar(filtros, pagina, [id(pagina)], total, pagina < total); }
async function executar() {
  const c = await buscarColetaPaginadaRadar(filtros, { restanteMs });
  return { ...c, cobertura: avaliarCoberturaRadar(c.aquisicao, filtros, base, c.anuncios) };
}
beforeEach(() => {
  estadoCache.dados.clear(); estadoCache.antesLeitura = () => {};
  agoraMs = 0; deadline = 120_000; total = 3; duracoes = []; duracaoHttp = 5_000; falhas = new Set(); envios = [];
  vi.spyOn(performance, "now").mockImplementation(() => agoraMs);
  vi.stubEnv("FIRECRAWL_API_KEY", "fixture-sem-rede-real");
  vi.stubEnv("RADAR_MAX_PAGINAS_RODADA", "10"); vi.stubEnv("RADAR_MAX_CHAMADAS_PAGAS_RODADA", "10");
  vi.stubGlobal("fetch", vi.fn(async (destino: string, init?: RequestInit) => {
    const paga = destino === "https://api.firecrawl.dev/v2/scrape";
    const url = paga ? JSON.parse(String(init?.body)).url : destino;
    const pagina = Number(new URL(url).searchParams.get("pg") || 1);
    envios.push({ paga, pagina, restante: restanteMs() });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    agoraMs += paga ? (duracoes[pagina - 1] ?? 5_800) : duracaoHttp;
    if (paga && falhas.has(pagina)) return new Response("Falha simulada", { status: 503 });
    return paga ? Response.json({ success: true, data: { rawHtml: html(pagina), metadata: { statusCode: 200, sourceURL: url, url } } })
      : Object.defineProperties(new Response(html(pagina).replaceAll('<a href="https://www.chavesnamao.com.br/imovel/', '<a href="/imovel/')), { url: { value: url }, redirected: { value: false } });
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Radar — orçamento temporal por fase (A–H)", () => {
  it("A: prazo único de 120s, P1/P2 rápidas permitem iniciar e concluir P3", async () => {
    duracoes = [5_800, 5_500, 6_000];
    const c = await executar();
    expect(envios.map(e => e.pagina)).toEqual([1, 2, 3]);
    expect(envios[2].restante).toBe(108_700);
    expect(c.resumo).toMatchObject({ paginasLidas: 3, motivoTermino: "fim_comprovado" });
    expect(c.cobertura.cobertura).toBe("completa");
    expect(restanteMs()).toBe(102_700);
  });
  it("B: 100s bastam para Firecrawl + finalização sem reservar fallback antecipado", async () => {
    agoraMs = 20_000; total = 1;
    expect((await executar()).resumo.motivoTermino).toBe("fim_comprovado");
    expect(envios).toEqual([{ paga: true, pagina: 1, restante: 100_000 }]);
  });
  it("C: Firecrawl falha deixando 35s; fallback não inicia e base parcial é preservada", async () => {
    total = 2; duracoes = [25_000, 60_000]; falhas.add(2);
    const c = await executar();
    expect(envios).toEqual([{ paga: true, pagina: 1, restante: 120_000 }, { paga: true, pagina: 2, restante: 95_000 }]);
    expect(c.resumo).toMatchObject({ paginasLidas: 1, motivoTermino: "limite_tempo" });
    expect(c.anuncios.map(a => a.idExterno)).toEqual([id(1)]);
    expect(c.cobertura.cobertura).toBe("parcial"); expect(restanteMs()).toBe(35_000);
  });
  it("D/F: falha com 59s restantes permite fallback de 15s e conserva 44s de finalização", async () => {
    total = 2; duracoes = [1_000, 60_000]; duracaoHttp = 15_000; falhas.add(2);
    const c = await executar();
    expect(envios).toEqual([{ paga: true, pagina: 1, restante: 120_000 }, { paga: true, pagina: 2, restante: 119_000 }, { paga: false, pagina: 2, restante: 59_000 }]);
    expect(c.resumo.motivoTermino).toBe("fim_comprovado"); expect(c.cobertura.cobertura).toBe("completa");
    expect(restanteMs()).toBe(44_000); expect(c.orcamento.chamadasPagas).toBe(2);
  });
  it("C: falha já na primeira página sem tempo para fallback retorna limite seguro sem inventar coleta", async () => {
    agoraMs = 25_000; total = 1; duracoes = [60_000]; falhas.add(1);
    const c = await executar();
    expect(c.resumo).toMatchObject({ paginasLidas: 0, motivoTermino: "limite_tempo" });
    expect(envios).toEqual([{ paga: true, pagina: 1, restante: 95_000 }]);
    expect(c.anuncios).toEqual([]); expect(c.cobertura.cobertura).not.toBe("completa");
    expect(restanteMs()).toBe(35_000);
  });
  it("F: fallback com 50s exatos preserva 35s após o timeout HTTP inteiro", async () => {
    total = 2; duracoes = [10_000, 60_000]; falhas.add(2); duracaoHttp = 15_000;
    const c = await executar();
    expect(envios.at(-1)).toEqual({ paga: false, pagina: 2, restante: 50_000 });
    expect(c.resumo.motivoTermino).toBe("fim_comprovado"); expect(restanteMs()).toBe(35_000);
  });
  it("o fallback reconfere o tempo imediatamente antes do envio após preparar sua aquisição", async () => {
    total = 2; duracoes = [10_000, 60_000]; falhas.add(2);
    const c = await buscarColetaPaginadaRadar(filtros, { restanteMs,
      registrarOrigem: (origem) => { if (origem === "http_direto") agoraMs += 1_000; } });
    expect(c.resumo.motivoTermino).toBe("limite_tempo");
    expect(envios).toEqual([{ paga: true, pagina: 1, restante: 120_000 }, { paga: true, pagina: 2, restante: 110_000 }]);
    expect(restanteMs()).toBe(49_000); expect(c.anuncios).toHaveLength(1);
  });
  it.each([94_999, 35_000, 0, -1, NaN, Infinity])("E: restante %s não permite iniciar página nem consumir chamada", async (restante) => {
    const c = await buscarColetaPaginadaRadar(filtros, { restanteMs: () => restante });
    expect(c.resumo).toMatchObject({ paginasLidas: 0, motivoTermino: "limite_tempo" });
    expect(c.orcamento).toMatchObject({ paginasConsultadas: 0, chamadasPagas: 0 }); expect(envios).toEqual([]);
  });
  it("F: 95s exatos permitem Firecrawl completo de 60s e preservam os 35s existentes", async () => {
    agoraMs = 25_000; total = 1; duracoes = [60_000];
    expect((await executar()).resumo.motivoTermino).toBe("fim_comprovado");
    expect(RESERVA_PROCESSAMENTO_CENTRAL_MS).toBe(35_000);
    expect(TIMEOUT_FIRECRAWL_FETCH_MS).toBe(60_000); expect(restanteMs()).toBe(35_000);
  });
  it("tempo gasto no cache é descontado antes do envio Firecrawl, sem reiniciar prazo", async () => {
    agoraMs = 20_000; total = 1;
    estadoCache.antesLeitura = () => { agoraMs += 3_000; };
    const c = await executar();
    expect(c.resumo.motivoTermino).toBe("limite_tempo");
    expect(c.orcamento.chamadasPagas).toBe(0); expect(envios).toEqual([]);
    expect(restanteMs()).toBeGreaterThanOrEqual(35_000);
  });
  it("G/H: páginas rápidas respeitam 10/10; continuação mantém coverage parcial", async () => {
    total = 11; duracoes = Array(11).fill(100);
    const c = await executar();
    expect(envios).toHaveLength(10); expect(c.orcamento).toEqual({ paginasConsultadas: 10, chamadasPagas: 10, limitePaginas: 10, limiteChamadasPagas: 10 });
    expect(c.resumo.motivoTermino).toBe("limite_paginas"); expect(c.cobertura.cobertura).toBe("parcial");
  });
  it("G: limite pago independente continua valendo na tentativa posterior", async () => {
    const c = await buscarColetaPaginadaRadar(filtros, { restanteMs, orcamento: criarOrcamentoRadar({ maxPaginas: 10, maxChamadasPagas: 1 }) });
    expect(c.resumo.motivoTermino).toBe("limite_chamadas_pagas");
    expect(envios).toHaveLength(1); expect(c.orcamento.chamadasPagas).toBe(1);
  });
});
