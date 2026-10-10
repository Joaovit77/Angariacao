import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { casaReal, sobradoReal, apartamentoReal } from "./fixtures/zap-r6-casa";
import { URL_ZAP_LONDRINA_CASAS, URL_ZAP_LONDRINA_APARTAMENTOS } from "@/lib/servidor/centralAngariacao";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), cacheGet: vi.fn(), cacheSet: vi.fn(), fetch: vi.fn(), evento: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ getCache: () => ({ get: mocks.cacheGet, set: mocks.cacheSet }) }));
vi.mock("@/lib/servidor/autenticacao", () => ({ autenticarRequisicao: async () => ({ ok: true, userId: "dono-sintetico", supabase: { rpc: mocks.rpc } }) }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.evento }));
import { POST } from "@/app/api/central-angariacao/buscar/route";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("FIRECRAWL_API_KEY", "somente-transporte-falso");
  vi.stubEnv("ALLOW_REAL_OPENAI", "0"); vi.stubEnv("OPENAI_API_KEY", "");
  mocks.cacheGet.mockResolvedValue(null); mocks.cacheSet.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ data: [{ id: "comparavel-sintetico", precisa_embedding: false }], error: null });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const base = { portal: "zap", cidade: "Londrina", estado: "PR", finalidade: "locacao" };
const requisitar = (filtros: unknown) => POST(new Request("http://localhost/api/central-angariacao/buscar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(filtros) }));

describe("rota real → contrato → transporte falso → parser → finalização → RPC falso", () => {
  it.each([
    ["casa", casaReal, "Casa", 12000, URL_ZAP_LONDRINA_CASAS],
    ["casa", sobradoReal, "Sobrado", 2600, URL_ZAP_LONDRINA_CASAS],
    ["apartamento", apartamentoReal, "Apartamento", 2300, URL_ZAP_LONDRINA_APARTAMENTOS],
  ])("%s preserva finalidade, tipo observado e persistência", async (tipoRecorte, html, observado, preco, url) => {
    mocks.fetch.mockResolvedValue(Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: 200 } } }));
    const resposta = await requisitar({ ...base, tipoRecorte });
    expect(resposta.status).toBe(200);
    const resultado = await resposta.json();
    expect(resultado).toMatchObject({ ok: true, urlPesquisa: url, anuncios: [{ finalidade: "locacao", tipoRecorte, tipoDeclarado: observado, preco }] });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    const [endpoint, parametros] = mocks.fetch.mock.calls[0];
    expect(endpoint).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(JSON.parse(parametros.body)).toMatchObject({ url, formats: ["rawHtml"] });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("registrar_comparavel_mercado", {
      p_dados: expect.objectContaining({ user_id: "dono-sintetico", finalidade: "locacao", valor_anunciado: preco, tipo: observado,
        dados_originais: expect.objectContaining({ finalidade: "locacao", tipoRecorte, tipoDeclarado: observado }),
      }),
    });
  });
  it.each([
    { tipoRecorte: "casa", finalidade: "venda" }, { tipoRecorte: "apartamento", finalidade: "venda" },
    { tipoRecorte: "casa", bairro: "Centro" }, { tipoRecorte: "casa", cidade: "Curitiba" },
    { tipoRecorte: "casa", estado: "SP" },
  ])("$tipoRecorte/$finalidade/$bairro/$cidade/$estado bloqueia antes de cache/transporte/RPC", async (delta) => {
    const sentinela = () => { throw Error("SENTINELA: caminho proibido em combinação bloqueada"); };
    mocks.fetch.mockImplementation(sentinela); mocks.cacheGet.mockImplementation(sentinela); mocks.rpc.mockImplementation(sentinela);
    expect((await requisitar({ ...base, ...delta })).status).toBe(422);
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.cacheGet).not.toHaveBeenCalled(); expect(mocks.cacheSet).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
