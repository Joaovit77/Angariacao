import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuscaRadar } from "@/lib/calculo/radarAngariacao";
const m = vi.hoisted(() => ({ fetchAuth: vi.fn(), clienteBrowser: vi.fn(), clienteServidor: vi.fn(), paginar: vi.fn(), finalizar: vi.fn(), persistir: vi.fn(), importarMotor: vi.fn(), resumo: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/aquisicaoResumivelRadar", () => { m.importarMotor(); throw new Error("Caller automático não pode importar motor."); });
vi.mock("@/lib/auth/recuperacaoSessao", () => ({ fetchAutenticado: m.fetchAuth }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: m.clienteBrowser }));
vi.mock("@supabase/supabase-js", async real => ({ ...await real<object>(), createClient: m.clienteServidor }));
vi.mock("@/lib/servidor/ingestaoRadar", async real => ({ ...await real<object>(), persistirColetaRadar: m.persistir }));
vi.mock("@/lib/servidor/paginacaoRadar", () => ({ buscarColetaPaginadaRadar: m.paginar }));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", () => ({ finalizarColetaCentralAngariacao: m.finalizar }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: vi.fn() }));
vi.mock("@/lib/servidor/observabilidadeRadar", () => ({ novoIdExecucao: () => "rodada-local", criarObservadorRadar: () => ({ observar: vi.fn(), concluir: vi.fn(), resumo: m.resumo }) }));
import { verificarBuscaRadar } from "@/lib/radarAngariacao";
import { executarMonitorRadar } from "@/lib/servidor/monitorRadarAngariacao";
import { GET } from "@/app/api/cron/radar/route";
const filtros = { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", finalidade: "locacao", tipoRecorte: "casa", tipo: "Casa" } as const;
const busca: BuscaRadar = { id: "11111111-1111-4111-8111-111111111111", nome: "Busca local", filtros, ativo: true,
  ultimoCheck: null, ultimoCheckAutomatico: null, ultimoCheckOrigem: null, criadoEm: "2026-09-01T12:00:00Z" };
let banco: { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FIRECRAWL_API_KEY", "fixture-local"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-local"); vi.stubEnv("CRON_SECRET", "cron-local");
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  const salva = { id: busca.id, user_id: "dono-confiavel", nome: busca.nome, filtros, ativo: true,
    ultimo_check: null, ultimo_check_automatico: null, ultimo_check_origem: null, created_at: busca.criadoEm };
  const lista = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: async () => ({ data: [salva], error: null }) };
  const anuncios = { eq: vi.fn().mockReturnThis(), then: (resolve: (v: { data: never[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  banco = { from: vi.fn((tabela: string) => {
    if (tabela === "radar_buscas") return { select: () => lista };
    if (tabela === "radar_anuncios") return { select: () => anuncios };
    throw new Error("Tabela não prevista pelo caller legado.");
  }), rpc: vi.fn(() => { throw new Error("RPC inesperada no ensaio do caller."); }) };
  m.clienteServidor.mockReturnValue(banco); m.clienteBrowser.mockReturnValue({}); m.resumo.mockReturnValue({});
  m.fetchAuth.mockResolvedValue(Response.json({ ok: true, anuncios: [], novos: 0, contratoRetorno: "radar_resumivel_retorno_leve_v1" }));
  m.paginar.mockResolvedValue({ anuncios: [], aquisicao: { id: "local" }, resumo: { paginasLidas: 1 }, orcamento: {} });
  m.finalizar.mockResolvedValue({ anuncios: [], comparaveisSalvos: 0, erroComparaveis: null });
  m.persistir.mockResolvedValue({ novos: 0, anuncios: [], cobertura: "parcial", baselineFormada: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function exigirCronLegado() {
  expect(m.paginar).toHaveBeenCalledOnce(); expect(m.finalizar).toHaveBeenCalledOnce(); expect(m.persistir).toHaveBeenCalledOnce();
  expect(m.persistir.mock.calls[0][1]).toMatchObject({ id: busca.id, user_id: "dono-confiavel" });
  expect(m.persistir.mock.calls[0][5]).toBe("cron");
  expect(m.importarMotor).not.toHaveBeenCalled(); expect(banco.rpc).not.toHaveBeenCalled();
  expect(m.paginar.mock.calls[0][1]).not.toHaveProperty("incluirAnunciosColetados");
}
describe("U — origem manual isolada; cron permanece legado", () => {
  it.each(["manual", "navegador"] as const)("verificarBuscaRadar %s isola contrato por origem sem ativar o cron", async origem => {
    expect(await verificarBuscaRadar("dono-confiavel", busca, origem)).toEqual([]);
    expect(m.fetchAuth).toHaveBeenCalledOnce(); const [url, opcoes, retry] = m.fetchAuth.mock.calls[0];
    expect(url).toBe("/api/radar/verificar"); expect(JSON.parse(opcoes.body)).toEqual({ buscaId: busca.id, origem, ...(origem === "manual" ? { contratoRetorno: "radar_resumivel_retorno_leve_v1" } : {}) });
    expect(retry).toEqual({ repetivel: false }); expect(m.clienteBrowser).not.toHaveBeenCalled(); expect(m.importarMotor).not.toHaveBeenCalled();
  });
  it("executarMonitorRadar usa aquisição e writer legados para Chaves explícito", async () => {
    expect(await executarMonitorRadar()).toMatchObject({ candidatas: 1, elegiveis: 1, verificadas: 1, novos: 0, falhas: 0 });
    exigirCronLegado();
  });
  it("cron autenticado apenas encaminha ao monitor atual, que continua legado", async () => {
    const r = await GET(new Request("http://localhost/api/cron/radar", { headers: { authorization: "Bearer cron-local" } }));
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ok: true, verificadas: 1, falhas: 0 }); exigirCronLegado();
  });
});
