import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async (chave: string) => cache.get(chave) ?? null,
    set: async (chave: string, valor: unknown) => { cache.set(chave, valor); },
  }),
}));
vi.mock("cheerio", async (importOriginal) => ({
  ...await importOriginal<typeof import("cheerio")>(),
  load: () => { throw new Error("HTML externo sensível"); },
}));

import { buscarComFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";

describe("fronteira do cache quando o parser falha", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("não armazena HTML que lançou exceção na interpretação", async () => {
    const requisicao = vi.fn(async () => Response.json({
      success: true, data: { rawHtml: "<section>conteúdo externo</section>" },
    }));
    vi.stubGlobal("fetch", requisicao);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const observar = vi.fn();
    await expect(buscarComFirecrawl(filtros, urlDaPesquisa(filtros), undefined, undefined, observar))
      .rejects.toMatchObject({ codigo: "parser_falhou" });
    expect(requisicao).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
    expect(observar.mock.calls.at(-1)?.[0]).toMatchObject({
      fase: "falha", aquisicao: "firecrawl", codigo: "parser_falhou",
    });
    expect(JSON.stringify(observar.mock.calls)).not.toContain("HTML externo sensível");
  });
});