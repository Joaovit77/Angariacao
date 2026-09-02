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
    const primeira = await buscarComFirecrawl(filtros, url);
    const segunda = await buscarComFirecrawl(filtros, url);

    expect(primeira).toHaveLength(1);
    expect(segunda).toEqual(primeira);
    expect(requisicao).toHaveBeenCalledTimes(1);
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
    await expect(buscarComFirecrawl(base, urlDaPesquisa(base))).rejects.toMatchObject({ codigo: "firecrawl_429" });
    expect(cacheFalso.size).toBe(0);
    expect(requisicao).toHaveBeenCalledTimes(1);
  });

  it("timeout possui código sanitizado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("token-remoto", "TimeoutError")));
    const base = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const erro = await buscarComFirecrawl(base, urlDaPesquisa(base)).catch((e) => e);
    expect(erro).toBeInstanceOf(FirecrawlIndisponivel);
    expect(erro.codigo).toBe("firecrawl_timeout");
    expect(erro.message).not.toContain("token-remoto");
  });
});
