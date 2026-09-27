import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@vercel/functions", () => ({
  getCache: () => ({
    get: async (chave: string) => cache.get(chave) ?? null,
    set: async (chave: string, valor: unknown) => { cache.set(chave, valor); },
  }),
}));

import { buscarComFirecrawlAoVivo, extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { diagnosticarEstruturaVivaReal } from "@/lib/servidor/diagnosticoEstruturalVivaReal";

const filtros = { portal: "viva-real" as const, cidade: "Londrina", estado: "PR", tipo: "Apartamento" };
const html = `<a href="https://www.vivareal.com.br/imovel/apartamento-2-quartos-id-2904079401/">
  <h2>Apartamento 2 quartos em Centro, Londrina</h2>
  <p>Rua Exemplo, 12</p><p>Aluguel R$ 2.500</p><p>Condomínio R$ 500</p>
</a>`;

describe("observador temporário do Viva Real", () => {
  beforeEach(() => {
    cache.clear();
    vi.stubEnv("FIRECRAWL_API_KEY", "chave-falsa-para-teste");
    vi.stubEnv("VERCEL_ENV", "preview");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("preserva o resultado normal sem observer", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: html } })));
    vi.stubGlobal("fetch", requisicao);
    expect(await buscarComFirecrawlAoVivo(filtros, urlDaPesquisa(filtros)))
      .toEqual(extrairAnunciosFirecrawl(html, filtros));
    expect(requisicao).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
  });

  it("observa em memória antes do parser sem mudar resultado nem aquisição", async () => {
    const requisicao = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { rawHtml: html } })));
    vi.stubGlobal("fetch", requisicao);
    const metricas: ReturnType<typeof diagnosticarEstruturaVivaReal>[] = [];
    const anuncios = await buscarComFirecrawlAoVivo(filtros, urlDaPesquisa(filtros), {
      observarHtml: (conteudo) => { metricas.push(diagnosticarEstruturaVivaReal(conteudo)); },
    });
    expect(anuncios).toEqual(extrairAnunciosFirecrawl(html, filtros));
    expect(requisicao).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
    expect(metricas).toHaveLength(1);
    expect(metricas[0].preco).toMatchObject({ doisValores: 1, primeiroRotuladoAluguel: 1, rotuloCondominio: 1 });
    expect(metricas[0].identidade).toMatchObject({ idNaUrl: 1, fallbackPosicional: 0, idsUnicos: 1 });
    expect(JSON.stringify(metricas)).not.toContain("Rua Exemplo");
    expect(JSON.stringify(metricas)).not.toContain("2904079401");
  });

  it("nega observer em Production antes de qualquer aquisição", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const requisicao = vi.fn();
    vi.stubGlobal("fetch", requisicao);
    await expect(buscarComFirecrawlAoVivo(filtros, urlDaPesquisa(filtros), {
      observarHtml: vi.fn(),
    })).rejects.toThrow(/Preview/);
    expect(requisicao).not.toHaveBeenCalled();
  });

  it("não promove valores sem rótulo individual a aluguel", () => {
    const misturado = html.replace("<p>Aluguel R$ 2.500</p><p>Condomínio R$ 500</p>",
      "<p>Aluguel e condomínio R$ 2.500 R$ 500</p>");
    expect(diagnosticarEstruturaVivaReal(misturado).preco).toMatchObject({
      doisValores: 1, primeiroSemRotulo: 1, primeiroRotuladoAluguel: 0, ambiguos: 1,
    });
  });
});
