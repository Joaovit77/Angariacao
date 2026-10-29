import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), servico: vi.fn(), paginar: vi.fn(), finalizar: vi.fn(), persistir: vi.fn(), importarMotor: vi.fn(), atualizar: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/aquisicaoResumivelRadar", () => { m.importarMotor(); throw new Error("O legado não pode importar o motor."); });
vi.mock("@/lib/servidor/autenticacao", () => ({ autenticarRequisicao: m.auth }));
vi.mock("@/lib/servidor/ingestaoRadar", async real => ({ ...await real<object>(), clienteServicoRadar: m.servico, persistirColetaRadar: m.persistir }));
vi.mock("@/lib/servidor/paginacaoRadar", () => ({ buscarColetaPaginadaRadar: m.paginar }));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", () => ({ finalizarColetaCentralAngariacao: m.finalizar }));
vi.mock("@/lib/servidor/observabilidadeRadar", () => ({ novoIdExecucao: () => "local", criarObservadorRadar: () => ({ observar: vi.fn(), concluir: vi.fn() }) }));
import { POST } from "@/app/api/radar/verificar/route";
const buscaId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("FIRECRAWL_API_KEY", "fixture-local"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-local");
  const q = { eq: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: { id: buscaId, ativo: true,
    filtros: { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", tipoRecorte: "casa", finalidade: "locacao" } } }) };
  m.auth.mockResolvedValue({ ok: true, userId: "dono", supabase: { from: () => ({ select: () => q, update: m.atualizar }) } });
  m.servico.mockReturnValue({ rpc: vi.fn(() => { throw new Error("RPC inesperada no ensaio de controle da rota."); }) });
  m.paginar.mockResolvedValue({ anuncios: [], aquisicao: {}, resumo: { paginasLidas: 1 }, orcamento: {} });
  m.finalizar.mockResolvedValue({ anuncios: [] });
  m.persistir.mockResolvedValue({ novos: 0, anuncios: [], anunciosColetados: [{ id: "base-local" }], baselineFormada: false, cobertura: "parcial" });
});
afterEach(() => vi.unstubAllEnvs());
describe("O — legado não importa o módulo resumível", () => {
  it.each(["manual", "navegador"])("origem %s segue as três operações sem importar motor", async origem => {
    const r = await POST(new Request("http://localhost/api/radar/verificar", { method: "POST", body: JSON.stringify({ buscaId, origem }) }));
    expect(r.status).toBe(200); expect((await r.json()).anunciosColetados).toEqual([{ id: "base-local" }]);
    expect(m.paginar).toHaveBeenCalledOnce(); expect(m.finalizar).toHaveBeenCalledOnce(); expect(m.persistir).toHaveBeenCalledOnce();
    expect(m.importarMotor).not.toHaveBeenCalled(); expect(m.atualizar).not.toHaveBeenCalled();
  });
  it.each(["desconhecida", null, "", true, 1, {}, []])("negociação inválida %j não importa motor nem produz efeitos", async contratoRetorno => {
    expect((await POST(new Request("http://localhost/api/radar/verificar", { method: "POST", body: JSON.stringify({ buscaId, origem: "manual", contratoRetorno }) }))).status).toBe(400);
    for (const fn of [m.servico, m.importarMotor, m.paginar, m.finalizar, m.persistir, m.atualizar]) expect(fn).not.toHaveBeenCalled();
  });
});
