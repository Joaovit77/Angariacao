import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* R5: a aquisição real (`buscarComFirecrawl` e o wrapper do Chaves) com
   fetch, cache e espera simulados. Nenhuma chamada sai da máquina. */

const armazenamentos = vi.hoisted(() => new Map<string, Map<string, unknown>>());
vi.mock("@vercel/functions", () => ({
  getCache: ({ namespace }: { namespace: string }) => ({
    get: async (chave: string) => armazenamentos.get(namespace)?.get(chave) ?? null,
    set: async (chave: string, valor: unknown) => {
      if (!armazenamentos.has(namespace)) armazenamentos.set(namespace, new Map());
      armazenamentos.get(namespace)!.set(chave, valor);
    },
  }),
}));
vi.mock("cheerio", async (importOriginal) => {
  const real = await importOriginal<typeof import("cheerio")>();
  return {
    ...real,
    load: (html: string, ...args: Parameters<typeof real.load> extends [unknown, ...infer Rest] ? Rest : never) => {
      if (html.includes("FORCAR_EXCECAO_PARSER")) throw new Error("erro externo cru");
      return real.load(html, ...args);
    },
  };
});

import {
  buscarComFirecrawl,
  FirecrawlIndisponivel,
  type PoliticaRetryFirecrawl,
} from "@/lib/servidor/firecrawlCentralAngariacao";
import { buscarComFallbackHttpChaves } from "@/lib/servidor/fallbackHttpChaves";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { chaveCanonicaConsultaPortal } from "@/lib/servidor/planejadorColetaMercados";
import { criarObservadorRadar } from "@/lib/servidor/observabilidadeRadar";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { htmlZap } from "./fixtures/zap-listagem-sintetica";

const HTML_OLX = `<section class="olx-adcard">
  <a data-testid="adcard-link" title="Casa para alugar" href="https://pr.olx.com.br/imoveis/casa-1525177784">Casa</a>
  <span class="olx-adcard__price">R$ 2.500</span>
  <span class="olx-adcard__location">Londrina, Centro</span>
</section>`;
const OLX: FiltrosCentralAngariacao = { portal: "olx", cidade: "Londrina", estado: "PR" };
const URL_OLX = urlDaPesquisa(OLX);
const CHAVES: FiltrosCentralAngariacao = { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR" };
const CARD_CHAVES = `<a href="/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/">
  <h2>Casa para alugar no Centro</h2><p>Rua Exemplo</p><p>Centro, Londrina/PR</p><p>R$ 2.500</p></a>`;
const ZAP: FiltrosCentralAngariacao = { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" };

const ok = (html: string, statusPortal = 200) =>
  Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: statusPortal } } });
const status = (codigo: number, headers: Record<string, string> = {}) =>
  new Response("erro do provedor com detalhe privado", { status: codigo, headers });
const erroRede = (code: string) => Object.assign(new TypeError("fetch failed"), {
  cause: Object.assign(new Error(`socket ${code} http://segredo.test`), { code }),
});
const timeout = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

/** Fila de respostas do fetch; `Error` vira rejeição. */
function fetchEm(...passos: Array<Response | Error>) {
  const fila = [...passos];
  const requisicao = vi.fn<(url: string | URL | Request) => Promise<Response>>(async () => {
    const passo = fila.shift();
    if (!passo) throw new Error("chamada inesperada");
    if (passo instanceof Error) throw passo;
    return passo;
  });
  vi.stubGlobal("fetch", requisicao);
  return requisicao;
}

function politica(parcial: Partial<PoliticaRetryFirecrawl> = {}) {
  const esperar = vi.fn(async (ms: number) => { void ms; });
  return {
    esperar,
    politica: { restanteMs: () => 115_000, reservaPosAquisicaoMs: 35_000, aleatorio: () => 0.5, esperar, ...parcial },
  };
}

function observador(portal = "olx") {
  const o = criarObservadorRadar({ execucaoId: "execucao-teste", iniciador: "pesquisar", portal });
  return o;
}

const chamadasFirecrawl = (requisicao: ReturnType<typeof fetchEm>) =>
  requisicao.mock.calls.filter(([url]) => String(url).includes("api.firecrawl.dev")).length;

async function falhaDe(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro as FirecrawlIndisponivel;
  }
  throw new Error("esperava falha");
}

describe("R5: retry da aquisição Firecrawl", () => {
  beforeEach(() => {
    armazenamentos.clear();
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-sintetica");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("1. sucesso na primeira tentativa: exatamente 1 Firecrawl, sem espera", async () => {
    const requisicao = fetchEm(ok(HTML_OLX));
    const { politica: p, esperar } = politica();
    const o = observador();
    expect(await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, o.observar, p)).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledOnce();
    expect(esperar).not.toHaveBeenCalled();
    expect(o.resumo().tentativas_firecrawl).toBe(1);
    expect(o.resumo().fases.map((f) => f.fase)).not.toContain("retry_agendado");
  });

  it.each([
    ["2. 503", status(503)],
    ["3. 502", status(502)],
    ["4. 504", status(504)],
    ["5. ECONNRESET", erroRede("ECONNRESET")],
    ["6. UND_ERR_SOCKET", erroRede("UND_ERR_SOCKET")],
    ["7. EAI_AGAIN", erroRede("EAI_AGAIN")],
  ])("%s → retry → sucesso, com 2 Firecrawl e espera de ~1 s", async (_nome, primeira) => {
    const requisicao = fetchEm(primeira, ok(HTML_OLX));
    const { politica: p, esperar } = politica();
    expect(await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p)).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  it("8. 429 com Retry-After válido de até 5 s repete esperando o header", async () => {
    const requisicao = fetchEm(status(429, { "Retry-After": "2" }), ok(HTML_OLX));
    const { politica: p, esperar } = politica();
    await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledExactlyOnceWith(2_000);
  });

  it.each([
    ["9. 429 sem Retry-After", status(429), "firecrawl_429"],
    ["10. 429 com Retry-After acima de 5 s", status(429, { "Retry-After": "6" }), "firecrawl_429"],
    ["10b. 429 com Retry-After em data HTTP", status(429, { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" }), "firecrawl_429"],
    ["11. timeout", timeout(), "firecrawl_timeout"],
    ["12. 408", status(408), "firecrawl_http_falhou"],
    ["13. 500", status(500), "firecrawl_http_falhou"],
    ["14. 400", status(400), "firecrawl_http_falhou"],
    ["15. 401", status(401), "firecrawl_http_falhou"],
    ["16. 402", status(402), "firecrawl_http_falhou"],
    ["17. 403", status(403), "firecrawl_http_falhou"],
    ["18. 404", status(404), "firecrawl_http_falhou"],
    ["19. 409", status(409), "firecrawl_http_falhou"],
    ["19b. 422", status(422), "firecrawl_http_falhou"],
    ["19c. 425", status(425), "firecrawl_http_falhou"],
    ["20. ENOTFOUND", erroRede("ENOTFOUND"), "firecrawl_indisponivel"],
    ["20b. TypeError sem cause", new TypeError("fetch failed"), "firecrawl_indisponivel"],
    ["21. success:false", Response.json({ success: false, error: "falhou" }), "firecrawl_resposta_falhou"],
    ["22. JSON inválido", new Response("{não é json", { status: 200 }), "firecrawl_resposta_invalida"],
    ["23. HTML vazio", Response.json({ success: true, data: { rawHtml: "   " } }), "firecrawl_html_invalido"],
    ["24. portal com erro", ok(HTML_OLX, 403), "portal_http_falhou"],
  ])("%s → sem retry, 1 Firecrawl", async (_nome, primeira, codigo) => {
    const requisicao = fetchEm(primeira, ok(HTML_OLX));
    const { politica: p, esperar } = politica();
    const erro = await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p));
    expect(erro).toBeInstanceOf(FirecrawlIndisponivel);
    expect(erro.codigo).toBe(codigo);
    expect(requisicao).toHaveBeenCalledOnce();
    expect(esperar).not.toHaveBeenCalled();
  });

  it("o erro guarda só os sinais da decisão: status, causa curta e Retry-After em ms", async () => {
    fetchEm(status(429, { "Retry-After": "3" }));
    const semPolitica = await falhaDe(buscarComFirecrawl(OLX, URL_OLX));
    expect(semPolitica).toMatchObject({ codigo: "firecrawl_429", statusHttp: 429, retryAfterMs: 3_000, causaRede: null });
    fetchEm(erroRede("ECONNRESET"));
    const rede = await falhaDe(buscarComFirecrawl({ ...OLX, bairro: "Centro" }, urlDaPesquisa({ ...OLX, bairro: "Centro" })));
    expect(rede).toMatchObject({ codigo: "firecrawl_indisponivel", statusHttp: null, causaRede: "ECONNRESET" });
    expect(JSON.stringify(rede)).not.toContain("segredo");
  });

  it("25. parser com zero anúncios não repete a aquisição", async () => {
    const requisicao = fetchEm(ok("<html><main>sem cards</main></html>"), ok(HTML_OLX));
    const { politica: p } = politica();
    expect(await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p)).toEqual([]);
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("26. parser_falhou não repete a aquisição", async () => {
    const requisicao = fetchEm(ok("FORCAR_EXCECAO_PARSER"), ok(HTML_OLX));
    const { politica: p } = politica();
    const erro = await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p));
    expect(erro.codigo).toBe("parser_falhou");
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("27. duas falhas transitórias: erro final com exatamente 2 Firecrawl, nunca 3", async () => {
    const requisicao = fetchEm(status(503), status(503), ok(HTML_OLX));
    const { politica: p, esperar } = politica();
    const o = observador();
    const erro = await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, o.observar, p));
    expect(erro).toMatchObject({ codigo: "firecrawl_http_falhou", statusHttp: 503 });
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledOnce();
    const falha = o.resumo().fases.at(-1);
    expect(falha).toMatchObject({ fase: "falha", tentativa: 2, status_http: 503, codigo: "firecrawl_http_falhou" });
    expect(o.resumo().tentativas_firecrawl).toBe(2);
  });

  it("28. cache hit: zero Firecrawl e zero retry", async () => {
    fetchEm(ok(HTML_OLX));
    await buscarComFirecrawl(OLX, URL_OLX);
    const requisicao = fetchEm(status(503));
    const { politica: p, esperar } = politica();
    const o = observador();
    expect(await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, o.observar, p)).toHaveLength(1);
    expect(requisicao).not.toHaveBeenCalled();
    expect(esperar).not.toHaveBeenCalled();
    expect(o.resumo()).toMatchObject({ aquisicao: "cache", tentativas_firecrawl: 0 });
  });

  it("29. cache recebe só o HTML final; a tentativa que falhou nunca entra", async () => {
    fetchEm(status(503), status(503));
    const { politica: p } = politica();
    await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p));
    const chave = chaveCanonicaConsultaPortal("olx", URL_OLX);
    expect(armazenamentos.get("central-firecrawl-html-v2")?.get(chave)).toBeUndefined();

    fetchEm(status(503), ok(HTML_OLX));
    await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, politica().politica);
    const salvo = armazenamentos.get("central-firecrawl-html-v2")?.get(chave);
    expect(gunzipSync(Buffer.from(String(salvo), "base64")).toString("utf8")).toBe(HTML_OLX);
  });

  it("30. single-flight: dois chamadores, uma falha transitória e um retry → 2 Firecrawl no total, não 4", async () => {
    let liberarPrimeira!: () => void;
    const primeiraPendente = new Promise<void>((resolver) => { liberarPrimeira = resolver; });
    const requisicao = vi.fn()
      .mockImplementationOnce(async () => { await primeiraPendente; return status(503); })
      .mockImplementationOnce(async () => ok(HTML_OLX));
    vi.stubGlobal("fetch", requisicao);
    const a = politica();
    const b = politica();
    const oA = observador();
    const oB = observador();
    const pA = buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, oA.observar, a.politica);
    const pB = buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, oB.observar, b.politica);
    liberarPrimeira();
    const [ra, rb] = await Promise.all([pA, pB]);
    expect(ra).toEqual(rb);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(a.esperar).toHaveBeenCalledOnce();
    expect(b.esperar).not.toHaveBeenCalled();
    expect(oA.resumo().tentativas_firecrawl).toBe(2);
    expect(oB.resumo()).toMatchObject({ reutilizacao: "single_flight", tentativas_firecrawl: 0 });
  });

  it("31. sem política: comportamento antigo, 503 não repete", async () => {
    const requisicao = fetchEm(status(503), ok(HTML_OLX));
    const erro = await falhaDe(buscarComFirecrawl(OLX, URL_OLX));
    expect(erro.codigo).toBe("firecrawl_http_falhou");
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("32. sem tempo suficiente: nenhuma tentativa adicional", async () => {
    const requisicao = fetchEm(status(503), ok(HTML_OLX));
    const { politica: p, esperar } = politica({ restanteMs: () => 90_000 });
    await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p));
    expect(requisicao).toHaveBeenCalledOnce();
    expect(esperar).not.toHaveBeenCalled();
  });

  it("o orçamento é lido no momento da falha, não no início", async () => {
    let restante = 115_000;
    const requisicao = vi.fn(async () => { restante = 40_000; return status(503); });
    vi.stubGlobal("fetch", requisicao);
    const { politica: p } = politica({ restanteMs: () => restante });
    await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, undefined, p));
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("33. Chaves: falha transitória do Firecrawl vai direto ao fallback HTTP, sem retry Firecrawl", async () => {
    const requisicao = fetchEm(status(503), new Response(CARD_CHAVES, { status: 200 }));
    const { politica: p, esperar } = politica();
    const o = observador("chaves-na-mao");
    const anuncios = await buscarComFallbackHttpChaves(
      CHAVES, urlDaPesquisa(CHAVES), undefined, undefined, o.observar, () => 115_000, p,
    );
    expect(anuncios).toHaveLength(1);
    expect(chamadasFirecrawl(requisicao)).toBe(1);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(esperar).not.toHaveBeenCalled();
    expect(o.resumo().fases.map((f) => f.fase)).not.toContain("retry_agendado");
    expect(o.resumo()).toMatchObject({ aquisicao: "http_direto", tentativas_firecrawl: 1 });
  });

  it("33b. Chaves sem orçamento para o fallback falha fechado, sem HTTP nem retry", async () => {
    const requisicao = fetchEm(status(503));
    const erro = await falhaDe(buscarComFallbackHttpChaves(
      CHAVES, urlDaPesquisa(CHAVES), undefined, undefined, undefined, () => 40_000, politica().politica,
    ));
    expect(erro).toMatchObject({ codigo: "http_orcamento_insuficiente" });
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("34. Chaves com Firecrawl bem-sucedido não chama HTTP", async () => {
    const requisicao = fetchEm(ok(CARD_CHAVES));
    const anuncios = await buscarComFallbackHttpChaves(
      CHAVES, urlDaPesquisa(CHAVES), undefined, undefined, undefined, () => 115_000, politica().politica,
    );
    expect(anuncios).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("portais comuns repetem também pelo wrapper do Chaves (a política chega à aquisição)", async () => {
    const requisicao = fetchEm(status(503), ok(HTML_OLX));
    const anuncios = await buscarComFallbackHttpChaves(
      OLX, URL_OLX, undefined, undefined, undefined, () => 115_000, politica().politica,
    );
    expect(anuncios).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledTimes(2);
  });

  it("36. ZAP com estrutura alterada: zero anúncios e diagnóstico, sem novo Firecrawl", async () => {
    const requisicao = fetchEm(ok("<html><body><ul><li>card sem marcador</li></ul></body></html>"), ok(htmlZap([{ id: "2600000001" }])));
    const o = observador("zap");
    const anuncios = await buscarComFirecrawl(ZAP, urlDaPesquisa(ZAP), undefined, undefined, o.observar, politica().politica);
    expect(anuncios).toEqual([]);
    expect(requisicao).toHaveBeenCalledOnce();
    expect(o.resumo().diagnostico_zap).toMatchObject({ seletor_cards: 0 });

    const quebrado = fetchEm(ok("FORCAR_EXCECAO_PARSER"), ok(htmlZap([{ id: "2600000001" }])));
    const erro = await falhaDe(buscarComFirecrawl({ ...ZAP, valorMax: 9_000 }, urlDaPesquisa(ZAP) + "&x=1", undefined, undefined, undefined, politica().politica));
    expect(erro.codigo).toBe("parser_falhou");
    expect(quebrado).toHaveBeenCalledOnce();
  });

  it("38–40. uma execução e uma coleta: tentativa 1 → 503 → retry_agendado → tentativa 2 → sucesso", async () => {
    fetchEm(status(503), ok(HTML_OLX));
    const o = observador();
    await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, o.observar, politica().politica);
    const resumo = o.resumo();
    expect(resumo.execucao_id).toBe("execucao-teste");
    expect(new Set(resumo.fases.map((f) => f.coleta_id))).toEqual(new Set([resumo.coleta_id]));
    expect(resumo.fases.map((f) => [f.fase, "tentativa" in f ? f.tentativa : null, f.status_http])).toEqual([
      ["caminho_escolhido", null, null],
      ["fetch_iniciado", 1, null],
      ["resposta_recebida", 1, 503],
      ["retry_agendado", 1, 503],
      ["fetch_iniciado", 2, null],
      ["resposta_recebida", 2, 200],
      ["resultado_interpretado", null, null],
    ]);
    expect(resumo.fases[3]).toMatchObject({ codigo: "firecrawl_5xx", backoff_ms: 1_000 });
    expect(resumo).toMatchObject({ tentativas_firecrawl: 2, aquisicao: "firecrawl", resultado_interpretado: true });
  });

  it("39b. rede e 429 aparecem com os códigos próprios de retry", async () => {
    fetchEm(erroRede("ECONNRESET"), ok(HTML_OLX));
    const rede = observador();
    await buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, rede.observar, politica().politica);
    expect(rede.resumo().fases.find((f) => f.fase === "retry_agendado"))
      .toMatchObject({ codigo: "firecrawl_rede_transitoria", backoff_ms: 1_000, tentativa: 1 });

    fetchEm(status(429, { "Retry-After": "4" }), ok(HTML_OLX));
    const limite = observador();
    await buscarComFirecrawl({ ...OLX, bairro: "Centro" }, urlDaPesquisa({ ...OLX, bairro: "Centro" }), undefined, undefined, limite.observar, politica().politica);
    expect(limite.resumo().fases.find((f) => f.fase === "retry_agendado"))
      .toMatchObject({ codigo: "firecrawl_429", backoff_ms: 4_000, status_http: 429 });
  });

  it("41. nenhum dado sensível nos eventos do retry", async () => {
    fetchEm(erroRede("ECONNRESET"), status(503, { "Retry-After": "1", "Set-Cookie": "sessao=segredo" }));
    const o = observador();
    await falhaDe(buscarComFirecrawl(OLX, URL_OLX, undefined, undefined, o.observar, politica().politica));
    const texto = JSON.stringify(o.resumo());
    for (const proibido of ["fc-sintetica", "segredo", "olx.com.br", "Bearer", "detalhe privado", "ECONNRESET", "fetch failed"]) {
      expect(texto).not.toContain(proibido);
    }
  });
});
