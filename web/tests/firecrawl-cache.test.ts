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

import { buscarComFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";

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
});
