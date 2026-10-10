// R4.2g/R4.2h — nas rotas: consultar exige portal ATIVO e dentro da capacidade;
// ler dado salvo aceita portal CONHECIDO. O ZAP é consultável só no recorte comprovado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { corpoBuscaLegada, lerBuscaLegada } from "./fixtures/buscaRadarLegada";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  buscarComNavegador: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
  registrarEvento: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({ salvarComparaveisMercado: mocks.salvarComparaveisMercado }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/firecrawlCentralAngariacao", () => ({
  buscarComFirecrawl: mocks.buscarComFirecrawl,
  FirecrawlIndisponivel: class FirecrawlIndisponivel extends Error {},
}));
vi.mock("@/lib/servidor/scraperCentralAngariacao", () => ({
  buscarComNavegador: mocks.buscarComNavegador,
  NavegadorIndisponivel: class NavegadorIndisponivel extends Error {},
}));

import { POST as buscar } from "@/app/api/central-angariacao/buscar/route";
import { GET as contextoAvaliacao } from "@/app/api/avaliacao/contexto/route";
import { GET as contextoInvestigador } from "@/app/api/investigador-imoveis/route";
import { URL_ZAP_LONDRINA_APARTAMENTOS } from "@/lib/servidor/centralAngariacao";

const COMPARAVEL_ID = "44444444-4444-4444-8444-444444444444";
const RADAR_ID = "33333333-3333-4333-8333-333333333333";

function clienteComLinha(linha: unknown) {
  const consulta: Record<string, ReturnType<typeof vi.fn>> = {};
  consulta.eq = vi.fn(() => consulta);
  consulta.order = vi.fn(() => consulta);
  consulta.limit = vi.fn(() => consulta);
  consulta.maybeSingle = vi.fn(async () => ({ data: linha, error: null }));
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario-autenticado" } }, error: null }) },
    from: vi.fn((tabela: string) => tabela === "radar_buscas"
      ? lerBuscaLegada(tabela, "usuario-autenticado")
      : { select: vi.fn(() => consulta) }),
  };
}

function pedidoBusca(portal: string, extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/central-angariacao/buscar", {
    method: "POST",
    headers: { Authorization: "Bearer token-valido", "Content-Type": "application/json" },
    body: corpoBuscaLegada({ portal, cidade: "Londrina", estado: "PR", ...extra }),
  });
}

describe("R4.2g nas rotas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
    mocks.createClient.mockReturnValue(clienteComLinha(null));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("a busca da Central recusa portal arbitrário antes de qualquer coleta", async () => {
    const portal = "portal-inexistente";
    const resposta = await buscar(pedidoBusca(portal));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ ok: false, anuncios: [], urlPesquisa: "" });
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
  });

  it.each([
    ["sem tipo", {}],
    ["casa", { tipo: "Casa" }],
    ["com bairro", { tipo: "Apartamento", bairro: "Centro" }],
  ])("a busca da Central recusa o ZAP %s pela capacidade, sem coletar", async (_nome, extra) => {
    const resposta = await buscar(pedidoBusca("zap", extra));
    expect(resposta.status).toBe(422);
    expect((await resposta.json()).aviso).toMatch(/ZAP Imóveis/);
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();
  });

  it("a busca da Central aceita o ZAP no recorte comprovado, com a URL real", async () => {
    mocks.buscarComFirecrawl.mockResolvedValue([]);
    const resposta = await buscar(pedidoBusca("zap", { tipo: "Apartamento" }));
    expect(resposta.status).toBe(200);
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledTimes(1);
    expect(mocks.buscarComFirecrawl.mock.calls[0][1]).toBe(URL_ZAP_LONDRINA_APARTAMENTOS);
  });

  it("a busca da Central continua aceitando um portal ativo", async () => {
    mocks.buscarComFirecrawl.mockResolvedValue([]);
    const resposta = await buscar(pedidoBusca("olx"));
    expect(resposta.status).toBe(200);
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledTimes(1);
  });

  it("a leitura de um comparável salvo com portal zap é reconhecida", async () => {
    mocks.createClient.mockReturnValue(clienteComLinha({
      id: COMPARAVEL_ID, portal: "zap", id_externo: "2612345678", finalidade: "locacao",
      endereco: null, bairro: "Centro", cidade: "Londrina", estado: "PR", tipo: "Apartamento",
      area_privativa_m2: null, area_m2: 60, quartos: 2, banheiros: 1, vagas: 1,
    }));
    const resposta = await contextoAvaliacao(new Request(`http://localhost/api/avaliacao/contexto?comparavel=${COMPARAVEL_ID}`, {
      headers: { Authorization: "Bearer token-valido" },
    }));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      origem: "central",
      origemExterna: { tipo: "comparavel", portal: "zap", idExterno: "2612345678" },
    });
  });

  it("o Investigador reconhece um anúncio salvo do Radar com portal zap", async () => {
    mocks.createClient.mockReturnValue(clienteComLinha({
      id: RADAR_ID, portal: "zap", id_externo: "2612345678",
      dados: { titulo: "Apartamento", bairro: "Centro", cidade: "Londrina", tipo: "Apartamento", quartos: 2 },
    }));
    const resposta = await contextoInvestigador(new Request(`http://localhost/api/investigador-imoveis?radarAnuncio=${RADAR_ID}`, {
      headers: { Authorization: "Bearer token-valido" },
    }));
    expect(resposta.status).toBe(200);
    const corpo = await resposta.json();
    expect(corpo.origem).toBe("radar");
    expect(corpo.consulta).toContain("anúncio ZAP Imóveis 2612345678");
  });

  it("o Investigador continua recusando um portal que não é conhecido", async () => {
    mocks.createClient.mockReturnValue(clienteComLinha({
      id: RADAR_ID, portal: "portal-inexistente", id_externo: "1", dados: { cidade: "Londrina" },
    }));
    const resposta = await contextoInvestigador(new Request(`http://localhost/api/investigador-imoveis?radarAnuncio=${RADAR_ID}`, {
      headers: { Authorization: "Bearer token-valido" },
    }));
    expect(resposta.status).not.toBe(200);
  });

  it("a leitura continua recusando um portal que não é conhecido", async () => {
    mocks.createClient.mockReturnValue(clienteComLinha({
      id: COMPARAVEL_ID, portal: "portal-inexistente", id_externo: "1", finalidade: "locacao",
      cidade: "Londrina", estado: "PR",
    }));
    const resposta = await contextoAvaliacao(new Request(`http://localhost/api/avaliacao/contexto?comparavel=${COMPARAVEL_ID}`, {
      headers: { Authorization: "Bearer token-valido" },
    }));
    expect(resposta.status).toBe(404);
  });
});
