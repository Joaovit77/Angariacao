import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({ transporte: vi.fn(), finalizar: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/fallbackHttpChaves", () => ({ buscarComFallbackHttpChaves: m.transporte, RESERVA_PROCESSAMENTO_CENTRAL_MS: 35000 }));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", () => ({ finalizarColetaCentralAngariacao: m.finalizar }));
import { executarAquisicaoResumivelRadar } from "@/lib/servidor/aquisicaoResumivelRadar";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { paginaRadar } from "./fixtures/paginacaoRadar";
const filtros = { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", finalidade: "locacao", tipoRecorte: "casa" } as const;
const base = "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/";
const h = "radar_resumivel_retorno_leve_v1";
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  const progresso = { varreduraId: "varredura-local", estado: "in_progress", paginasConcluidas: 0, resultadosColetados: 0, admitidos: 0, totalDeclarado: 1, proximaPagina: 1 };
  rpc = vi.fn(async (nome: string, args: Record<string, unknown>) => nome === "iniciar_varredura_resumivel_radar"
    ? { data: { disponivel: true, varreduraId: progresso.varreduraId, reserva: "reserva-local", url: base, pagina: 1, progresso }, error: null }
    : { data: { novos: 0, anuncios: [], baselineFormada: true, cobertura: "completa", progresso: { ...progresso, estado: "complete", paginasConcluidas: 1 },
      ...(args.p_incluir_anuncios_coletados === false ? { contratoRetorno: h } : { anunciosColetados: [{ id: "privado-local" }] }) }, error: null });
  m.finalizar.mockImplementation(async (_db, _user, anuncios) => ({ anuncios }));
  m.transporte.mockImplementation(async (_f, url, _o, _d, _e, _r, _policy, registrar) => {
    const html = paginaRadar(filtros, 1, ["100001"], 1, false);
    registrar({ id: "aquisicao-local", em: new Date().toISOString(), origem: "http_direto", confiavel: true, html,
      transporte: { urlSolicitada: url, urlEfetiva: url, statusHttp: 200, statusPortalHttp: 200, redirecionada: false } });
    return extrairAnunciosFirecrawl(html, filtros);
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida no teste do motor."); }));
});
afterEach(() => vi.unstubAllGlobals());
const banco = () => ({ rpc } as unknown as SupabaseClient);
const busca = { id: "busca-local", user_id: "dono-local" };
describe("O — dependência mínima de retorno no motor existente", () => {
  it("H explícito envia exatamente dez argumentos, booleano false, e conserva receipts sem snapshot", async () => {
    const r = await executarAquisicaoResumivelRadar(banco(), busca, filtros, "manual", { restanteMs: () => 120000, incluirAnunciosColetados: false });
    const avancos = rpc.mock.calls.filter(([nome]) => nome === "avancar_varredura_resumivel_radar");
    expect(avancos).toHaveLength(1); expect(Object.keys(avancos[0][1])).toHaveLength(10);
    expect(avancos[0][1]).toMatchObject({ p_user_id: busca.user_id, p_busca_id: busca.id, p_incluir_anuncios_coletados: false });
    expect(r).toMatchObject({ contratoRetorno: h, novos: 0, baselineFormada: true, progresso: { estado: "complete" }, coleta: { paginasLidas: 1 }, orcamento: expect.any(Object) });
    expect(r).not.toHaveProperty("anunciosColetados"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, true])("modo histórico %s mantém nove argumentos e snapshot", async incluirAnunciosColetados => {
    const r = await executarAquisicaoResumivelRadar(banco(), busca, filtros, "manual", { restanteMs: () => 120000, ...(incluirAnunciosColetados === undefined ? {} : { incluirAnunciosColetados }) });
    const args = rpc.mock.calls.find(([nome]) => nome === "avancar_varredura_resumivel_radar")![1];
    expect(Object.keys(args)).toHaveLength(9); expect(args).not.toHaveProperty("p_incluir_anuncios_coletados");
    expect(r).toHaveProperty("anunciosColetados"); expect(r).not.toHaveProperty("contratoRetorno");
  });
  it("H sem reserva disponível conserva negociação sem aquisição ou avanço", async () => {
    const progresso = { varreduraId: "ocupada", estado: "in_progress", paginasConcluidas: 1, resultadosColetados: 1, admitidos: 1, totalDeclarado: 2, proximaPagina: 2 };
    rpc.mockResolvedValue({ data: { disponivel: false, varreduraId: "ocupada", progresso }, error: null });
    const r = await executarAquisicaoResumivelRadar(banco(), busca, filtros, "manual", { restanteMs: () => 120000, incluirAnunciosColetados: false });
    expect(r).toMatchObject({ contratoRetorno: h, novos: 0, progresso }); expect(r).not.toHaveProperty("anunciosColetados");
    expect(rpc).toHaveBeenCalledOnce(); expect(m.transporte).not.toHaveBeenCalled();
  });
});
