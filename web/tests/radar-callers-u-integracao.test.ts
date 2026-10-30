import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuscaRadar } from "@/lib/calculo/radarAngariacao";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
const m = vi.hoisted(() => ({ autenticar: vi.fn(), cliente: vi.fn(), fetchAuth: vi.fn(), transporte: vi.fn(),
  finalizar: vi.fn(), paginar: vi.fn(), persistir: vi.fn(), atualizar: vi.fn(), rpc: vi.fn(), registro: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/recuperacaoSessao", () => ({ fetchAutenticado: m.fetchAuth }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => { throw new Error("Escrita do cliente proibida no ensaio."); } }));
vi.mock("@supabase/supabase-js", async real => ({ ...await real<object>(), createClient: m.cliente }));
vi.mock("@/lib/servidor/autenticacao", () => ({ autenticarRequisicao: m.autenticar }));
vi.mock("@/lib/servidor/ingestaoRadar", async real => ({ ...await real<object>(), clienteServicoRadar: m.cliente, persistirColetaRadar: m.persistir }));
vi.mock("@/lib/servidor/fallbackHttpChaves", () => ({ buscarComFallbackHttpChaves: m.transporte, RESERVA_PROCESSAMENTO_CENTRAL_MS: 35000 }));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", () => ({ finalizarColetaCentralAngariacao: m.finalizar }));
vi.mock("@/lib/servidor/paginacaoRadar", () => ({ buscarColetaPaginadaRadar: m.paginar }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: m.registro }));
vi.mock("@/lib/servidor/observabilidadeRadar", () => ({ novoIdExecucao: () => "ensaio-local",
  criarObservadorRadar: () => ({ observar: vi.fn(), concluir: vi.fn(), resumo: () => ({}) }) }));
import { verificarBuscaRadar } from "@/lib/radarAngariacao";
import { POST } from "@/app/api/radar/verificar/route";
import { GET } from "@/app/api/cron/radar/route";
import { executarMonitorRadar, ORCAMENTO_RODADA_RADAR_MS } from "@/lib/servidor/monitorRadarAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { paginaRadar } from "./fixtures/paginacaoRadar";
const candidato = "A" as string;
const h = "radar_resumivel_retorno_leve_v1";
const filtros: FiltrosCentralAngariacao = { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", finalidade: "locacao", tipoRecorte: "casa", tipo: "Casa" };
const busca: BuscaRadar = { id: "11111111-1111-4111-8111-111111111111", nome: "Ensaio local", filtros, ativo: true,
  ultimoCheck: null, ultimoCheckAutomatico: null, ultimoCheckOrigem: null, criadoEm: "2026-09-01T12:00:00Z" };
type Linha = { id: string; user_id: string; nome: string; filtros: FiltrosCentralAngariacao; ativo: boolean;
  ultimo_check: string | null; ultimo_check_automatico: string | null; ultimo_check_origem: null; created_at: string };
function salva(b = busca): Linha { return { id: b.id, user_id: "dono-local", nome: b.nome, filtros: b.filtros, ativo: b.ativo,
  ultimo_check: b.ultimoCheck, ultimo_check_automatico: b.ultimoCheckAutomatico, ultimo_check_origem: null, created_at: b.criadoEm }; }
let linhas: Linha[], leituras: Array<[string, unknown]>, respostas: Record<string, unknown>[], falhar: Set<string>, semReserva: boolean;
beforeEach(() => {
  vi.clearAllMocks(); linhas = [salva()]; leituras = []; respostas = []; falhar = new Set(); semReserva = false;
  for (const [k,v] of Object.entries({ FIRECRAWL_API_KEY: "fixture-local", SUPABASE_SERVICE_ROLE_KEY: "fixture-local",
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid", CRON_SECRET: "cron-local", RADAR_MAX_PAGINAS_RODADA: "10", RADAR_MAX_CHAMADAS_PAGAS_RODADA: "10" })) vi.stubEnv(k,v);
  vi.spyOn(console,"info").mockImplementation(() => {}); vi.spyOn(console,"error").mockImplementation(() => {});
  const q = () => ({ eq(k: string,v: unknown) { leituras.push([k,v]); return this; }, order() { return this; },
    limit: async () => ({ data: linhas, error: null }), maybeSingle: async () => ({ data: linhas[0], error: null }),
    then(resolve: (v: object) => unknown) { return Promise.resolve({ data: [], error: null }).then(resolve); } });
  m.atualizar.mockImplementation(() => q());
  const db = { from: vi.fn(() => ({ select: q, update: m.atualizar })), rpc: m.rpc };
  m.cliente.mockReturnValue(db); m.autenticar.mockResolvedValue({ ok: true, userId: "dono-local", supabase: db });
  m.rpc.mockImplementation(async (nome: string,args: Record<string, unknown>) => {
    if (falhar.has(String(args.p_busca_id))) return { data: null, error: new Error("Falha H simulada") };
    const progresso = { varreduraId: "varredura-local", estado: "in_progress", paginasConcluidas: 0, resultadosColetados: 0, admitidos: 0, totalDeclarado: 1, proximaPagina: 1 };
    if (nome === "iniciar_varredura_resumivel_radar") return { data: { disponivel: !semReserva, varreduraId: progresso.varreduraId,
      reserva: "reserva-local", pagina: 1, url: "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/", progresso }, error: null };
    return { data: { novos: 0, anuncios: [], baselineFormada: true, cobertura: "completa", contratoRetorno: h,
      progresso: { ...progresso, estado: "complete", paginasConcluidas: 1 } }, error: null };
  });
  m.transporte.mockImplementation(async (f,url,_o,_d,_e,_r,_policy,registrar) => {
    const html = paginaRadar(f,1,["100001"],1,false);
    registrar({ id: "aquisicao-local", em: new Date().toISOString(), origem: "http_direto", confiavel: true, html,
      transporte: { urlSolicitada: url, urlEfetiva: url, statusHttp: 200, statusPortalHttp: 200, redirecionada: false } });
    return extrairAnunciosFirecrawl(html,f);
  });
  m.finalizar.mockImplementation(async (_db,_u,anuncios) => ({ anuncios, comparaveisSalvos: 0 }));
  m.paginar.mockResolvedValue({ anuncios: [], aquisicao: {}, resumo: { paginasLidas: 1 }, orcamento: {} });
  m.persistir.mockResolvedValue({ novos: 0, anuncios: [], cobertura: "parcial", anunciosColetados: [{ id: "snapshot-legado" }] });
  m.fetchAuth.mockImplementation(async (_url,opts) => {
    const r = await POST(new Request("http://localhost/api/radar/verificar", { ...opts, headers: { ...opts.headers, authorization: "Bearer sessao-simulada" } }));
    respostas.push(await r.clone().json()); return r;
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida neste ensaio."); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function provaH(origem: string) {
  const args = m.rpc.mock.calls.find(([nome]) => nome === "avancar_varredura_resumivel_radar")?.[1];
  expect(Object.keys(args)).toHaveLength(10); expect(args).toMatchObject({ p_user_id: "dono-local", p_busca_id: busca.id, p_origem: origem, p_incluir_anuncios_coletados: false });
  expect(m.paginar).not.toHaveBeenCalled(); expect(m.persistir).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
}
describe("U — integração local do candidato " + candidato, () => {
  it.each(["manual","navegador"] as const)("origem %s percorre somente sua modalidade isolada", async origem => {
    expect(await verificarBuscaRadar("id-cliente-nao-confiavel",busca,origem)).toEqual([]);
    const ativo = candidato === "A" ? origem === "manual" : candidato === "B" && origem === "navegador";
    expect(JSON.parse(m.fetchAuth.mock.calls[0][1].body)).toEqual({ buscaId: busca.id, origem, ...(ativo ? { contratoRetorno: h } : {}) });
    expect(m.fetchAuth.mock.calls[0][2]).toEqual({ repetivel: false });
    expect(leituras).toContainEqual(["user_id","dono-local"]);
    if (ativo) { provaH(origem); expect(respostas[0]).toMatchObject({ contratoRetorno: h, novos: 0, progresso: { estado: "complete" } }); expect(respostas[0]).not.toHaveProperty("anunciosColetados"); }
    else { expect(m.rpc).not.toHaveBeenCalled(); expect(m.paginar).toHaveBeenCalledOnce(); expect(respostas[0]).toHaveProperty("anunciosColetados"); }
  });
  it.each(["olx","wimoveis","viva-real"] as const)("%s permanece no legado nas duas origens", async portal => {
    linhas[0].filtros = { ...filtros,portal };
    for (const origem of ["manual","navegador"] as const) {
      await verificarBuscaRadar("ignorado",{ ...busca, filtros: linhas[0].filtros },origem);
      expect(JSON.parse(m.fetchAuth.mock.lastCall![1].body)).toEqual({ buscaId: busca.id,origem });
    }
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.paginar).toHaveBeenCalledTimes(2);
  });
  if (candidato !== "C") {
    const origem = candidato === "A" ? "manual" : "navegador";
    it.each([{ cidade: "Cambé" },{ finalidade: undefined },{ tipoRecorte: undefined },{ tipo: "Apartamento" },{ bairro: "Sem rota" }])("contexto incompatível não emite H: %j", async delta => {
      const f = { ...filtros,...delta }; linhas[0].filtros = f;
      await verificarBuscaRadar("ignorado",{ ...busca,filtros:f },origem).catch(() => {});
      expect(JSON.parse(m.fetchAuth.mock.lastCall![1].body)).not.toHaveProperty("contratoRetorno"); expect(m.rpc).not.toHaveBeenCalled();
    });
    it("H ausente/divergente na resposta não provoca nova tentativa nem fallback", async () => {
      m.fetchAuth.mockResolvedValue(Response.json({ ok:true,anuncios:[],anunciosColetados:[] }));
      await expect(verificarBuscaRadar("ignorado",busca,origem)).rejects.toThrow("contrato de retorno"); expect(m.fetchAuth).toHaveBeenCalledOnce();
    });
    it("falha H atravessa erro publicado, sem adquirir pelo legado", async () => {
      falhar.add(busca.id);
      await expect(verificarBuscaRadar("ignorado",busca,origem)).rejects.toThrow("Nenhuma novidade");
      expect(m.fetchAuth).toHaveBeenCalledOnce(); expect(m.rpc).toHaveBeenCalledOnce(); expect(m.paginar).not.toHaveBeenCalled(); expect(m.atualizar).toHaveBeenCalledOnce();
    });
    it("bairro com rota factual admite H sem alterar filtros privados no cliente", async () => {
      linhas[0].filtros = { ...filtros,bairro:"Jardim Tókio",valorMin:1000 };
      await verificarBuscaRadar("ignorado",{ ...busca,filtros:linhas[0].filtros },origem);
      expect(JSON.parse(m.fetchAuth.mock.lastCall![1].body)).toEqual({ buscaId:busca.id,origem,contratoRetorno:h }); provaH(origem);
    });
  } else {
    it("cron autenticado atravessa monitor/motor reais simulados e assinatura H, sem HTTP do receptor", async () => {
      const r = await GET(new Request("http://localhost/api/cron/radar",{ headers: { authorization:"Bearer cron-local" } }));
      expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ok:true,verificadas:1,falhas:0 }); provaH("cron");
      expect(m.autenticar).not.toHaveBeenCalled(); expect(m.fetchAuth).not.toHaveBeenCalled();
    });
    it("falha H não faz fallback e permite a outra busca de outro dono continuar", async () => {
      falhar.add(busca.id); linhas.push({ ...salva(),id:"segunda",user_id:"outro-dono" });
      expect(await executarMonitorRadar()).toMatchObject({ verificadas:2,falhas:1 });
      expect(m.rpc.mock.calls).toEqual(expect.arrayContaining([["iniciar_varredura_resumivel_radar",expect.objectContaining({ p_busca_id:"segunda",p_user_id:"outro-dono" })]]));
      expect(leituras).toContainEqual(["user_id","dono-local"]); expect(m.atualizar).toHaveBeenCalledOnce(); expect(m.paginar).not.toHaveBeenCalled();
    });
    it("oito buscas por rodada, duas simultâneas; sem lease disponível não adquire nem avança", async () => {
      linhas = Array.from({length:12},(_,i) => ({ ...salva(),id:String(i) })); semReserva=true;
      let simultaneas=0,pico=0; const padrao=m.rpc.getMockImplementation()!;
      m.rpc.mockImplementation(async (...args) => { simultaneas++;pico=Math.max(pico,simultaneas); await new Promise(r=>setTimeout(r,0)); const v=await padrao(...args);simultaneas--;return v; });
      expect(await executarMonitorRadar()).toMatchObject({ candidatas:12,elegiveis:12,verificadas:8,falhas:0 });
      expect(pico).toBe(2); expect(m.rpc).toHaveBeenCalledTimes(8); expect(m.transporte).not.toHaveBeenCalled();
      expect(m.rpc.mock.calls.every(([n])=>n==="iniciar_varredura_resumivel_radar")).toBe(true);
    });
    it("outros portais preservam coleta/writer legados e não usam H", async () => {
      linhas[0].filtros={...filtros,portal:"wimoveis"}; expect(await executarMonitorRadar()).toMatchObject({verificadas:1,falhas:0});
      expect(m.paginar).toHaveBeenCalledOnce(); expect(m.persistir).toHaveBeenCalledOnce(); expect(m.rpc).not.toHaveBeenCalled();
    });
    it("busca inativa, mercado incompatível e execução automática no mesmo dia não são alcançados", async () => {
      linhas=[{...salva(),ativo:false},{...salva(),id:"fora",filtros:{...filtros,cidade:"Cambé"}},{...salva(),id:"hoje",ultimo_check_automatico:new Date().toISOString()}];
      expect(await executarMonitorRadar()).toMatchObject({candidatas:3,elegiveis:0,verificadas:0});expect(m.rpc).not.toHaveBeenCalled();
    });
    it("preserva orçamento compartilhado 10/10 e deadline absoluto 300s entre buscas H", async () => {
      linhas.push({...salva(),id:"segunda"}); const r=await executarMonitorRadar();
      expect(r.orcamento).toMatchObject({limitePaginas:10,limiteChamadasPagas:10});expect(ORCAMENTO_RODADA_RADAR_MS).toBe(300000);
      const a=m.transporte.mock.calls;expect(a).toHaveLength(2);expect(a[0][8]).toBe(a[1][8]);
      for(const c of a) { const restante=c[5]();expect(restante).toBeGreaterThan(0);expect(restante).toBeLessThanOrEqual(300000); }
    });
  }
});
