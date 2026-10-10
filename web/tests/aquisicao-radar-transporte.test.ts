import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORTAIS_CONHECIDOS } from "@/lib/calculo/centralAngariacao";

const mocks = vi.hoisted(() => ({ getCache: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: mocks.getCache }));

import { buscarComFirecrawl, buscarComFirecrawlAoVivo, extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { buscarComFallbackHttpChaves } from "@/lib/servidor/fallbackHttpChaves";
import { buscarComNavegador } from "@/lib/servidor/scraperCentralAngariacao";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";

const fetchFalso = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchFalso); });
afterEach(() => vi.unstubAllGlobals());

describe("nenhum caminho alternativo contorna o contrato explícito", () => {
  for (const portal of PORTAIS_CONHECIDOS) {
    it(`${portal}: Venda bloqueia cache, Firecrawl, HTTP, navegador e escrita`, async () => {
      const filtros = { portal, finalidade: "venda" as const, tipoRecorte: "apartamento" as const, cidade: "Londrina", estado: "PR" };
      const urlAluguel = "https://exemplo.test/aluguel";
      await expect(buscarComFirecrawl(filtros, urlAluguel)).rejects.toThrow();
      await expect(buscarComFirecrawlAoVivo(filtros, urlAluguel)).rejects.toThrow();
      await expect(buscarComFallbackHttpChaves(filtros, urlAluguel)).rejects.toThrow();
      await expect(buscarComNavegador(filtros, urlAluguel)).rejects.toThrow();
      await expect(salvarComparaveisMercado({ rpc: mocks.rpc } as never, "dono", [], filtros)).rejects.toThrow();
      expect(() => extrairAnunciosFirecrawl("<html></html>", filtros)).toThrow();
      expect(fetchFalso).not.toHaveBeenCalled();
      expect(mocks.getCache).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    });
  }
  it.each([
    ["olx", "casa"], ["viva-real", "apartamento"], ["chaves-na-mao", "apartamento"], ["wimoveis", "casa"], ["zap", "casa"],
  ] as const)("%s/%s não executa capacidade parcial ou bloqueada pelo transporte direto", async (portal, tipoRecorte) => {
    await expect(buscarComFirecrawl({ portal, tipoRecorte, finalidade: "locacao", cidade: "Londrina", estado: "PR" }, "https://exemplo.test/"))
      .rejects.toThrow();
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(mocks.getCache).not.toHaveBeenCalled();
  });
  it("comparável declarado de Venda não é persistido como aluguel mesmo no contexto legado", async () => {
    const anuncio = { finalidade: "venda" as const, idExterno: "1", portal: "olx" as const, titulo: "Casa", preco: 500000, cidade: "Londrina", estado: "PR", url: "https://exemplo.test/1", anunciante: "incerto" as const };
    expect(await salvarComparaveisMercado({ rpc: mocks.rpc } as never, "dono", [anuncio], { portal: "olx", cidade: "Londrina", estado: "PR" })).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
