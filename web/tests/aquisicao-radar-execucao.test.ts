import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORTAIS_CONHECIDOS, type FiltrosAquisicaoRadar } from "@/lib/calculo/centralAngariacao";
import { urlDaPesquisa, URL_ZAP_LONDRINA_APARTAMENTOS } from "@/lib/servidor/centralAngariacao";
import { planejarColetaMercado } from "@/lib/servidor/planejadorColetaMercados";

const mocks = vi.hoisted(() => ({
  coletar: vi.fn(), navegador: vi.fn(), salvar: vi.fn(), evento: vi.fn(), fetchCliente: vi.fn(),
  maybeSingle: vi.fn(), eq: vi.fn(), select: vi.fn(), from: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/autenticacao", () => ({ autenticarRequisicao: vi.fn(async () => ({
  ok: true, userId: "dono", supabase: { from: mocks.from },
})) }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.evento }));
vi.mock("@/lib/servidor/fallbackHttpChaves", () => ({
  buscarComFallbackHttpChaves: mocks.coletar, HttpChavesIndisponivel: class extends Error {}, RESERVA_PROCESSAMENTO_CENTRAL_MS: 35000,
}));
vi.mock("@/lib/servidor/scraperCentralAngariacao", () => ({ buscarComNavegador: mocks.navegador, NavegadorIndisponivel: class extends Error {} }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({ salvarComparaveisMercado: mocks.salvar }));
vi.mock("@/lib/auth/recuperacaoSessao", () => ({ fetchAutenticado: mocks.fetchCliente }));

import { POST } from "@/app/api/central-angariacao/buscar/route";
import { buscarNaCentral } from "@/lib/centralAngariacao";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";

const base = { cidade: "Londrina", estado: "PR" };
const pedido = (filtros: unknown) => new Request("http://localhost/api/central-angariacao/buscar", {
  method: "POST", body: JSON.stringify(filtros), headers: { "Content-Type": "application/json" },
});
const parciais = [
  ["olx", "casa"], ["olx", "apartamento"], ["viva-real", "casa"],
  ["viva-real", "apartamento"], ["chaves-na-mao", "apartamento"], ["wimoveis", "casa"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIRECRAWL_API_KEY", "fixture-sem-transporte-real");
  mocks.coletar.mockResolvedValue([]);
  mocks.salvar.mockResolvedValue(0);
  mocks.eq.mockImplementation(() => ({ eq: mocks.eq, maybeSingle: mocks.maybeSingle }));
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("aquisição explícita bloqueia antes de qualquer transporte", () => {
  for (const portal of PORTAIS_CONHECIDOS) {
    for (const tipoRecorte of ["casa", "apartamento"] as const) {
      it(`${portal}: venda ${tipoRecorte} nunca usa aluguel nem dispara coleta`, async () => {
        const filtros = { ...base, portal, finalidade: "venda", tipoRecorte } satisfies FiltrosAquisicaoRadar;
        expect(() => urlDaPesquisa(filtros)).toThrow();
        expect((await POST(pedido(filtros))).status).toBe(422);
        expect(await buscarNaCentral(filtros)).toMatchObject({ ok: false, anuncios: [] });
        expect(mocks.coletar).not.toHaveBeenCalled();
        expect(mocks.navegador).not.toHaveBeenCalled();
        expect(mocks.fetchCliente).not.toHaveBeenCalled();
        expect(mocks.salvar).not.toHaveBeenCalled();
      });
    }
  }
  it.each(parciais)("%s locação %s parcial não executa", async (portal, tipoRecorte) => {
    const filtros = { ...base, portal, finalidade: "locacao" as const, tipoRecorte };
    expect(() => urlDaPesquisa(filtros)).toThrow();
    expect((await POST(pedido(filtros))).status).toBe(422);
    expect((await buscarNaCentral(filtros)).ok).toBe(false);
    expect(mocks.coletar).not.toHaveBeenCalled();
    expect(mocks.fetchCliente).not.toHaveBeenCalled();
  });
  it("ZAP Casa permanece bloqueado", async () => {
    const filtros = { ...base, portal: "zap" as const, finalidade: "locacao" as const, tipoRecorte: "casa" as const };
    expect(() => urlDaPesquisa(filtros)).toThrow();
    expect((await POST(pedido(filtros))).status).toBe(422);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
  it.each([
    ["zap", "apartamento", URL_ZAP_LONDRINA_APARTAMENTOS],
    ["chaves-na-mao", "casa", "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/"],
    ["wimoveis", "apartamento", "https://www.wimoveis.com.br/aluguel/apartamentos/pr/londrina"],
  ] as const)("%s locação %s preserva aquisição comprovada", async (portal, tipoRecorte, url) => {
    const filtros = { ...base, portal, finalidade: "locacao" as const, tipoRecorte };
    expect(urlDaPesquisa(filtros)).toBe(url);
    const resposta = await POST(pedido(filtros));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true });
    expect(mocks.coletar).toHaveBeenCalledOnce();
    expect(mocks.coletar.mock.calls[0][0]).toMatchObject(filtros);
    expect(mocks.coletar.mock.calls[0][1]).toBe(url);
  });
  it("planejador explícito só seleciona os recortes comprovados", () => {
    const mercado = { ...base, finalidade: "locacao", segmento: "residencial" };
    expect(planejarColetaMercado({ ...mercado, tipoRecorte: "casa" }).consultas.map((q) => q.filtros.portal)).toEqual(["chaves-na-mao"]);
    expect(planejarColetaMercado({ ...mercado, tipoRecorte: "apartamento" }).consultas.map((q) => q.filtros.portal)).toEqual(["wimoveis", "zap"]);
    expect(planejarColetaMercado({ ...mercado, finalidade: "venda", tipoRecorte: "casa" }).consultas).toEqual([]);
    expect(planejarColetaMercado(mercado).consultas).toEqual([]);
  });
});

describe("compatibilidade somente do estado salvo legado", () => {
  it("requisição sem finalidade não ganha exceção só por omitir o campo", async () => {
    expect((await POST(pedido({ ...base, portal: "olx" }))).status).toBe(422);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
  it("busca legada do dono mantém OLX e usa filtros salvos sem aceitar alterações", async () => {
    const salvos = { ...base, portal: "olx", tipo: "Casa" };
    mocks.maybeSingle.mockResolvedValue({ data: { filtros: salvos }, error: null });
    const resposta = await POST(pedido({ ...base, portal: "olx", tipo: "Apartamento", bairro: "alterado", buscaLegadaId: "busca-antiga" }));
    expect(resposta.status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("id", "busca-antiga");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "dono");
    expect(mocks.coletar.mock.calls[0][0]).toMatchObject(salvos);
    expect(mocks.coletar.mock.calls[0][0].bairro).toBeUndefined();
  });
  it("busca de outra conta ou inexistente não libera compatibilidade", async () => {
    expect((await POST(pedido({ ...base, portal: "olx", buscaLegadaId: "outra-busca" }))).status).toBe(422);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
  it("ID legado não rebaixa Venda explícita para Locação", async () => {
    const resposta = await POST(pedido({ ...base, portal: "zap", finalidade: "venda", tipoRecorte: "apartamento", buscaLegadaId: "busca-antiga" }));
    expect(resposta.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
  it("uma busca explícita persistida não recebe a exceção legada", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { filtros: { ...base, portal: "olx", finalidade: "locacao", tipoRecorte: "casa" } }, error: null });
    expect((await POST(pedido({ ...base, portal: "olx", buscaLegadaId: "busca-nova" }))).status).toBe(422);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
  it("erro ao ler o estado legado não libera aquisição alternativa", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "erro-sintetico" } });
    expect((await POST(pedido({ ...base, portal: "olx", buscaLegadaId: "busca-antiga" }))).status).toBe(503);
    expect(mocks.coletar).not.toHaveBeenCalled();
    expect(mocks.navegador).not.toHaveBeenCalled();
  });
  it("estado legado malformado falha antes de qualquer transporte", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { filtros: { portal: "olx" } }, error: null });
    expect((await POST(pedido({ ...base, portal: "olx", buscaLegadaId: "busca-antiga" }))).status).toBe(422);
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
});

describe("contexto de finalidade na finalização", () => {
  it("transporta locação explícita sem transformar tipo solicitado em observado", async () => {
    const filtros = { ...base, portal: "chaves-na-mao" as const, finalidade: "locacao" as const, tipoRecorte: "casa" as const, tipo: "Casa" };
    const anuncio = { ...base, idExterno: "35106344", portal: filtros.portal, titulo: "Sem tipo publicado", url: "https://www.chavesnamao.com.br/imovel/casa/id-35106344/", anunciante: "incerto" as const };
    const resultado = await finalizarColetaCentralAngariacao({} as never, "dono", [anuncio], filtros);
    expect(resultado.anuncios[0]).toMatchObject({ finalidade: "locacao", tipo: "Casa", tipoDeclarado: null });
    expect(mocks.salvar.mock.calls[0][3]).toMatchObject({ finalidade: "locacao", tipoRecorte: "casa" });
  });
  it("compatibilidade legada significa locação, sem gravar o histórico antigo", async () => {
    const anuncio = { ...base, idExterno: "1", portal: "olx" as const, titulo: "Casa", url: "https://exemplo.test/1", anunciante: "incerto" as const };
    const resultado = await finalizarColetaCentralAngariacao({} as never, "dono", [anuncio], { ...base, portal: "olx" });
    expect(resultado.anuncios[0].finalidade).toBe("locacao");
    expect(anuncio).not.toHaveProperty("finalidade");
  });
  it("não reinterpreta preço declarado de Venda como aluguel", async () => {
    const filtros = { ...base, portal: "chaves-na-mao" as const, finalidade: "locacao" as const, tipoRecorte: "casa" as const };
    const anuncio = { ...base, finalidade: "venda" as const, idExterno: "1", portal: filtros.portal, titulo: "Casa", preco: 500000, url: "https://exemplo.test/1", anunciante: "incerto" as const };
    expect((await finalizarColetaCentralAngariacao({} as never, "dono", [anuncio], filtros)).anuncios).toEqual([]);
  });
});
