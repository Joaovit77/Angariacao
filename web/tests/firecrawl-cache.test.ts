import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheFalso = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async (chave: string) => cacheFalso.get(chave) ?? null,
    set: async (chave: string, valor: unknown) => { cacheFalso.set(chave, valor); },
    delete: async (chave: string) => { cacheFalso.delete(chave); },
    expireTag: async () => {},
  }),
}));

import { buscarComFirecrawl, buscarComFirecrawlAoVivo, FirecrawlIndisponivel } from "@/lib/servidor/firecrawlCentralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import type { EventoConsultaFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { criarObservadorRadar } from "@/lib/servidor/observabilidadeRadar";

const htmlOlx = `<section class="olx-adcard">
  <a data-testid="adcard-link" title="Casa direto com proprietário" href="https://pr.olx.com.br/imoveis/casa-1525177784">Casa direto com proprietário</a>
  <span class="olx-adcard__price">R$ 2.500</span>
  <span class="olx-adcard__location">Londrina, Centro</span>
</section>`;

describe("economia de créditos do Firecrawl", () => {
  beforeEach(() => {
    cacheFalso.clear();
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("consulta o Firecrawl somente uma vez para filtros idênticos dentro do TTL", async () => {
    const requisicao = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { rawHtml: htmlOlx, metadata: { statusCode: 200 } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", requisicao);

    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR", somenteProprietario: true };
    const url = "https://www.olx.com.br/imoveis/estado-pr/regiao-de-londrina";
    const origens: string[] = [];
    const primeira = await buscarComFirecrawl(filtros, url, (origem) => origens.push(origem));
    const segunda = await buscarComFirecrawl(filtros, url, (origem) => origens.push(origem));

    expect(primeira).toHaveLength(1);
    expect(segunda).toEqual(primeira);
    expect(requisicao).toHaveBeenCalledTimes(1);
    expect(origens).toEqual(["firecrawl", "cache"]);
  });

  it("duas consultas simultâneas equivalentes usam uma chamada, mesmo com tipo ignorado pelo portal", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: htmlOlx } })));
    vi.stubGlobal("fetch", requisicao);
    const base = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const origens: string[] = [];
    const [a, b] = await Promise.all([
      buscarComFirecrawl({ ...base, tipo: "Apartamento" }, urlDaPesquisa(base), (o) => origens.push(o)),
      buscarComFirecrawl({ ...base, tipo: "Casa" }, urlDaPesquisa(base), (o) => origens.push(o)),
    ]);
    expect(requisicao).toHaveBeenCalledTimes(1);
    expect(origens.sort()).toEqual(["em_andamento", "firecrawl"]);
    // O conteúdo compartilhado é anterior aos filtros/dicas de cada consumidor.
    expect(a[0].tipo).toBe("Apartamento");
    expect(b[0].tipo).toBe("Casa");
  });

  it("filtro local de preço do Wimoveis não contamina cache compartilhado", async () => {
    const html = `<div data-qa="posting PROPERTY" data-id="123456" data-to-posting="/propriedades/apartamento-123456.html">
      <img alt="Apartamento 2 quartos"/><span data-qa="POSTING_CARD_PRICE">R$ 2.500</span>
      <span data-qa="POSTING_CARD_FEATURES">2 quartos 70 m²</span><span data-qa="POSTING_CARD_LOCATION">Londrina, Centro, Paraná</span></div>`;
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: html } })));
    vi.stubGlobal("fetch", requisicao);
    const base = { portal: "wimoveis" as const, cidade: "Londrina", estado: "PR" };
    expect(await buscarComFirecrawl({ ...base, valorMax: 1000 }, urlDaPesquisa(base))).toHaveLength(0);
    expect(await buscarComFirecrawl(base, urlDaPesquisa(base))).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledTimes(1);
  });

  it("o contrato pago continua básico, sem paginação/retry e com no máximo 50 resultados", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: htmlOlx.repeat(80) } })));
    vi.stubGlobal("fetch", requisicao);
    const base = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    expect(await buscarComFirecrawlAoVivo(base, urlDaPesquisa(base))).toHaveLength(50);
    const chamada = (requisicao.mock.calls as unknown[][])[0];
    const opcoes = chamada[1] as RequestInit;
    expect(JSON.parse(String(opcoes.body))).toMatchObject({ proxy: "basic", formats: ["rawHtml"], timeout: 55000, maxAge: 1200000 });
    expect(JSON.stringify(opcoes)).not.toMatch(/enhanced|stealth/);
    expect(requisicao).toHaveBeenCalledTimes(1);
  });

  it("429 não repete nem armazena erro com conteúdo sensível", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ error: "secret-url-token" }), { status: 429 }));
    vi.stubGlobal("fetch", requisicao);
    const base = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const eventos: EventoConsultaFirecrawl[] = [];
    await expect(buscarComFirecrawl(base, urlDaPesquisa(base), undefined, undefined,
      (evento) => eventos.push(evento))).rejects.toMatchObject({ codigo: "firecrawl_429" });
    expect(cacheFalso.size).toBe(0);
    expect(requisicao).toHaveBeenCalledTimes(1);
    expect(eventos.at(-1)).toMatchObject({ fase: "falha", aquisicao: "firecrawl", statusHttp: 429, codigo: "firecrawl_429" });
  });

  it("timeout possui código sanitizado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("token-remoto", "TimeoutError")));
    const base = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const erro = await buscarComFirecrawl(base, urlDaPesquisa(base)).catch((e) => e);
    expect(erro).toBeInstanceOf(FirecrawlIndisponivel);
    expect(erro.codigo).toBe("firecrawl_timeout");
    expect(erro.message).not.toContain("token-remoto");
  });

  it("observa chamada externa e depois cache sem segunda chamada", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: htmlOlx } })));
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const url = urlDaPesquisa(filtros);
    const primeira: EventoConsultaFirecrawl[] = [];
    const segunda: EventoConsultaFirecrawl[] = [];
    await buscarComFirecrawl(filtros, url, undefined, undefined, (evento) => primeira.push(evento));
    await buscarComFirecrawl(filtros, url, undefined, undefined, (evento) => segunda.push(evento));
    expect(primeira.map((evento) => evento.fase)).toEqual([
      "caminho_escolhido", "fetch_iniciado", "resposta_recebida", "resultado_interpretado",
    ]);
    expect(primeira.every((evento) => evento.aquisicao === "firecrawl")).toBe(true);
    expect(segunda.map((evento) => evento.fase)).toEqual(["cache_hit", "resultado_interpretado"]);
    expect(segunda.every((evento) => evento.aquisicao === "cache")).toBe(true);
    expect(primeira[0].coletaId).not.toBe(segunda[0].coletaId);
    expect(requisicao).toHaveBeenCalledTimes(1);
  });

  it("single-flight compartilha coleta e desfecho, sem iniciar segunda chamada", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    let liberar!: (resposta: Response) => void;
    const requisicao = vi.fn(() => new Promise<Response>((resolve) => { liberar = resolve; }));
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const url = urlDaPesquisa(filtros);
    const produtor: EventoConsultaFirecrawl[] = [];
    const consumidor: EventoConsultaFirecrawl[] = [];
    const produtorObs = criarObservadorRadar({
      execucaoId: "229ee00d-1fe9-44b6-9fa4-80702fef8327", iniciador: "cron", portal: "olx",
    });
    const consumidorObs = criarObservadorRadar({
      execucaoId: "229ee00d-1fe9-44b6-9fa4-80702fef8328", iniciador: "monitor_navegador", portal: "olx",
    });
    const primeira = buscarComFirecrawl(filtros, url, undefined, undefined, (evento) => {
      produtor.push(evento); produtorObs.observar(evento);
    });
    const segunda = buscarComFirecrawl(filtros, url, undefined, undefined, (evento) => {
      consumidor.push(evento); consumidorObs.observar(evento);
    });
    await vi.waitFor(() => expect(requisicao).toHaveBeenCalledOnce());
    liberar(new Response(JSON.stringify({ success: true, data: { rawHtml: htmlOlx } }), { status: 200 }));
    const resultados = await Promise.all([primeira, segunda]);
    expect(resultados[0]).toEqual(resultados[1]);
    expect(consumidor.map((evento) => evento.fase)).toEqual([
      "single_flight", "coleta_compartilhada_concluida", "resultado_interpretado",
    ]);
    expect(consumidor.some((evento) => evento.fase === "fetch_iniciado")).toBe(false);
    expect(produtor[0].coletaId).toBe(consumidor[0].coletaId);
    expect(consumidor[1]).toMatchObject({ aquisicao: "firecrawl", statusHttp: 200 });
    expect(produtorObs.resumo()).toMatchObject({
      reutilizacao: "nenhuma", aquisicao: "firecrawl", chamada_propria_iniciada: true,
      coleta_id: produtor[0].coletaId,
    });
    expect(consumidorObs.resumo()).toMatchObject({
      reutilizacao: "single_flight", aquisicao: "firecrawl", chamada_propria_iniciada: false,
      coleta_id: produtor[0].coletaId,
    });
    expect(produtorObs.resumo().execucao_id).not.toBe(consumidorObs.resumo().execucao_id);
    expect(requisicao).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("falha da nova telemetria não transforma cache em chamada externa", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: htmlOlx } })));
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const url = urlDaPesquisa(filtros);
    await buscarComFirecrawl(filtros, url);
    const resultado = await buscarComFirecrawl(filtros, url, undefined, undefined, () => {
      throw new Error("telemetria indisponível");
    });
    expect(resultado).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledOnce();
  });
  it.each([
    { nome: "exceção de transporte", resposta: () => Promise.reject(new Error("token externo")), codigo: "firecrawl_indisponivel", status: null },
    { nome: "HTTP 503", resposta: () => Promise.resolve(new Response("falha externa", { status: 503 })), codigo: "firecrawl_http_falhou", status: 503 },
    { nome: "envelope inválido", resposta: () => Promise.resolve(new Response("{", { status: 200 })), codigo: "firecrawl_resposta_invalida", status: 200 },
    { nome: "success falso", resposta: () => Promise.resolve(Response.json({ success: false, error: "segredo" })), codigo: "firecrawl_resposta_falhou", status: 200 },
    { nome: "HTML ausente", resposta: () => Promise.resolve(Response.json({ success: true, data: {} })), codigo: "firecrawl_html_invalido", status: 200 },
    { nome: "HTML em branco", resposta: () => Promise.resolve(Response.json({ success: true, data: { rawHtml: "  " } })), codigo: "firecrawl_html_invalido", status: 200 },
    { nome: "HTML de tipo errado", resposta: () => Promise.resolve(Response.json({ success: true, data: { rawHtml: 42 } })), codigo: "firecrawl_html_invalido", status: 200 },
  ])("$nome é falha classificada sem cache", async ({ resposta, codigo, status }) => {
    const requisicao = vi.fn(resposta);
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const eventos: EventoConsultaFirecrawl[] = [];
    await expect(buscarComFirecrawl(filtros, urlDaPesquisa(filtros), undefined, undefined,
      (evento) => eventos.push(evento))).rejects.toMatchObject({ codigo });
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheFalso.size).toBe(0);
    expect(eventos.at(-1)).toMatchObject({
      fase: "falha", aquisicao: "firecrawl", codigo,
      ...(status == null ? {} : { statusHttp: status }),
    });
    expect(JSON.stringify(eventos)).not.toMatch(/segredo|token externo|falha externa/);
  });

  it("status do portal é distinto do HTTP 200 do Firecrawl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      success: true, data: { rawHtml: htmlOlx, metadata: { statusCode: 403 } },
    })));
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const eventos: EventoConsultaFirecrawl[] = [];
    await expect(buscarComFirecrawl(filtros, urlDaPesquisa(filtros), undefined, undefined,
      (evento) => eventos.push(evento))).rejects.toMatchObject({
        codigo: "portal_http_falhou", statusPortalHttp: 403,
      });
    expect(eventos.at(-1)).toMatchObject({
      fase: "falha", statusHttp: 200, statusPortalHttp: 403,
    });
    expect(cacheFalso.size).toBe(0);
  });

  it("timeout ao ler o corpo continua timeout, com resposta já recebida", async () => {
    const resposta = Response.json({ success: true, data: { rawHtml: htmlOlx } });
    vi.spyOn(resposta, "json").mockRejectedValue(new DOMException("segredo", "TimeoutError"));
    vi.stubGlobal("fetch", vi.fn(async () => resposta));
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const eventos: EventoConsultaFirecrawl[] = [];
    await expect(buscarComFirecrawl(filtros, urlDaPesquisa(filtros), undefined, undefined,
      (evento) => eventos.push(evento))).rejects.toMatchObject({ codigo: "firecrawl_timeout" });
    expect(eventos.map((evento) => evento.fase)).toEqual([
      "caminho_escolhido", "fetch_iniciado", "resposta_recebida", "falha",
    ]);
  });

  it("HTML com zero anúncios é resultado interpretado e fica no cache", async () => {
    const requisicao = vi.fn(async () => Response.json({
      success: true, data: { rawHtml: "<html><body>Sem anúncios</body></html>" },
    }));
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const url = urlDaPesquisa(filtros);
    const eventos: EventoConsultaFirecrawl[] = [];
    expect(await buscarComFirecrawl(filtros, url, undefined, undefined,
      (evento) => eventos.push(evento))).toEqual([]);
    expect(await buscarComFirecrawl(filtros, url)).toEqual([]);
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheFalso.size).toBe(1);
    expect(eventos.at(-1)?.fase).toBe("resultado_interpretado");
  });

  it("single-flight compartilha a mesma falha sem duplicar a chamada", async () => {
    let liberar!: (resposta: Response) => void;
    const requisicao = vi.fn(() => new Promise<Response>((resolve) => { liberar = resolve; }));
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const url = urlDaPesquisa(filtros);
    const primeiro: EventoConsultaFirecrawl[] = [];
    const segundo: EventoConsultaFirecrawl[] = [];
    const a = buscarComFirecrawl(filtros, url, undefined, undefined, (evento) => primeiro.push(evento));
    const b = buscarComFirecrawl(filtros, url, undefined, undefined, (evento) => segundo.push(evento));
    await vi.waitFor(() => expect(requisicao).toHaveBeenCalledOnce());
    liberar(new Response("indisponível", { status: 503 }));
    const resultados = await Promise.allSettled([a, b]);
    expect(resultados.map((resultado) => resultado.status)).toEqual(["rejected", "rejected"]);
    expect(primeiro[0].coletaId).toBe(segundo[0].coletaId);
    expect(segundo.map((evento) => evento.fase)).toEqual(["single_flight", "falha"]);
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cacheFalso.size).toBe(0);
  });
});
