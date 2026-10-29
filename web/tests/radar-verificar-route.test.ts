import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ autenticar: vi.fn(), clienteServico: vi.fn(), coletar: vi.fn(), paginar: vi.fn(), rpc: vi.fn(), finalizar: vi.fn(), persistir: vi.fn(), concluir: vi.fn(), resumir: vi.fn() }));
vi.mock("@/lib/servidor/aquisicaoResumivelRadar", () => ({ executarAquisicaoResumivelRadar: mocks.resumir }));
vi.mock("@/lib/servidor/paginacaoRadar", () => ({ buscarColetaPaginadaRadar: mocks.paginar }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/autenticacao", () => ({ autenticarRequisicao: mocks.autenticar }));
vi.mock("@/lib/servidor/ingestaoRadar", async (real) => ({ ...await real<object>(), clienteServicoRadar: mocks.clienteServico, persistirColetaRadar: mocks.persistir }));
vi.mock("@/lib/servidor/fallbackHttpChaves", () => ({ buscarComFallbackHttpChaves: mocks.coletar, RESERVA_PROCESSAMENTO_CENTRAL_MS: 35000 }));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", () => ({ finalizarColetaCentralAngariacao: mocks.finalizar }));
vi.mock("@/lib/servidor/observabilidadeRadar", () => ({ novoIdExecucao: () => "execucao-local", criarObservadorRadar: () => ({ observar: vi.fn(), concluir: mocks.concluir }) }));
import { POST } from "@/app/api/radar/verificar/route";
import { POST as POSTPublicado } from "./fixtures/radar-receptor-publicado-6a4a7ba";
const buscaId = "11111111-1111-4111-8111-111111111111";
const filtros = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR", valorMin: 1000 };
let filtrosDaBusca: Record<string,unknown>;
let filtrosLidos: Array<[string,unknown]>;
let atualizar: ReturnType<typeof vi.fn>;
function requisicao(corpo: object = { buscaId, origem: "manual" }) {
  return new Request("http://localhost/api/radar/verificar", { method: "POST", body: JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
}
beforeEach(() => {
  vi.clearAllMocks(); filtrosLidos = []; filtrosDaBusca = { ...filtros };
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-local-nao-usada"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-local-nao-usada");
  const query = { eq: (chave: string,valor: unknown) => { filtrosLidos.push([chave,valor]); return query; },
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: buscaId, user_id: "dono-confiavel", filtros: filtrosDaBusca, ativo: true }, error: null }) };
  const escrita = { eq: vi.fn().mockReturnThis() };
  atualizar = vi.fn().mockReturnValue(escrita);
  mocks.autenticar.mockResolvedValue({ ok: true, userId: "dono-confiavel", supabase: { from: vi.fn().mockReturnValue({ select: () => query, update: atualizar }) } });
  mocks.clienteServico.mockReturnValue({ marcador: "servico-local", rpc: mocks.rpc });
  mocks.paginar.mockResolvedValue({ anuncios: [], aquisicao: { id: "aquisicao-local" },
    resumo: { paginasLidas: 1, motivoTermino: "fim_comprovado" }, orcamento: { paginas: 1 } });
  mocks.coletar.mockResolvedValue([]);
  mocks.finalizar.mockResolvedValue({ anuncios: [], comparaveisSalvos: 0, erroComparaveis: null });
  mocks.persistir.mockResolvedValue({ novos: 0, anuncios: [], cobertura: "desconhecida", baselineFormada: false });
  mocks.resumir.mockResolvedValue({ novos: 0, anuncios: [], cobertura: "parcial", baselineFormada: false,
    progresso: { estado: "in_progress", paginasConcluidas: 1 }, coleta: {}, orcamento: {} });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Radar — rota autenticada da ponte", () => {
  it.each([401,503,500])("auth %s não coleta nem escreve", async (status) => {
    mocks.autenticar.mockResolvedValue({ ok: false, status, erro: status===401 ? "sessao-invalida" : "auth-indisponivel" });
    expect((await POST(requisicao())).status).toBe(status);
    expect(mocks.coletar).not.toHaveBeenCalled(); expect(mocks.resumir).not.toHaveBeenCalled(); expect(mocks.persistir).not.toHaveBeenCalled(); expect(atualizar).not.toHaveBeenCalled();
  });
  it.each(["manual","navegador"])("%s usa dono/filtros do banco e ignora evidência forjada pelo cliente", async (origem) => {
    const resposta = await POST(requisicao({ buscaId, origem, user_id: "outra-conta", filtros: { finalidade: "venda" }, cobertura: "completa", anuncios: [{ idExterno: "falso" }] }));
    expect(resposta.status).toBe(200);
    expect(filtrosLidos).toContainEqual(["id",buscaId]); expect(filtrosLidos).toContainEqual(["user_id","dono-confiavel"]);
    expect(mocks.paginar.mock.calls[0][0]).toEqual({ portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" });
    expect(mocks.persistir).toHaveBeenCalledWith(expect.objectContaining({ marcador: "servico-local" }), { id: buscaId,user_id: "dono-confiavel" }, expect.any(Object), [], { id: "aquisicao-local" }, origem);
    expect(mocks.resumir).not.toHaveBeenCalled(); expect(mocks.paginar).toHaveBeenCalledOnce();
  });
  it("bairro salvo participa da aquisição e a URL do cliente não altera o universo", async () => {
    filtrosDaBusca.bairro = "Jardim Tókio";
    expect((await POST(requisicao({buscaId,origem:"manual",filtros:{bairro:"Outro bairro"}}))).status).toBe(200);
    expect(mocks.paginar.mock.calls[0][0]).toMatchObject({bairro:"jardim tokio",cidade:"Londrina",finalidade:"locacao",tipoRecorte:"casa"});
    expect(mocks.paginar.mock.calls[0][0]).not.toHaveProperty("valorMin");
  });
  it("ambiente sem capacidade retorna indisponibilidade explícita, sem transporte", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const r = await POST(requisicao()); expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, aviso: expect.stringContaining("indisponível") });
    expect(mocks.coletar).not.toHaveBeenCalled();
  });
  it("coleta parcial não se transforma em sucesso com novidade", async () => {
    mocks.persistir.mockResolvedValue({ novos: 0, anuncios: [], cobertura: "parcial", baselineFormada: false });
    expect(await (await POST(requisicao())).json()).toMatchObject({ ok: true, novos: 0, anuncios: [], cobertura: "parcial" });
  });
  it("falha de portal conserva janela de tentativas, sem executar a transação", async () => {
    mocks.paginar.mockRejectedValue(new Error("portal indisponível"));
    expect((await POST(requisicao())).status).toBe(503);
    expect(atualizar).toHaveBeenCalledWith({ ultimo_check: expect.any(String), ultimo_check_origem: "manual" });
    expect(mocks.persistir).not.toHaveBeenCalled();
  });
  it("falha transacional não devolve anúncio fantasma nem repete a aquisição", async () => {
    mocks.persistir.mockRejectedValue(new Error("rollback local"));
    const r = await POST(requisicao()); expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false }); expect(mocks.paginar).toHaveBeenCalledOnce(); expect(mocks.resumir).not.toHaveBeenCalled();
  });
});


describe("H — negociação de retorno da API", () => {
  it("P: sem versão mantém caller e snapshot legados", async () => {
    mocks.persistir.mockResolvedValue({ novos: 0, anuncios: [], anunciosColetados: [{ url: "https://example.invalid/legado" }] });
    const r = await (await POST(requisicao())).json();
    expect(r.anunciosColetados).toHaveLength(1);
    expect(mocks.resumir).not.toHaveBeenCalled(); expect(mocks.paginar).toHaveBeenCalledOnce();
    expect(r).not.toHaveProperty("contratoRetorno");
  });
  it("Q: versão leve negocia explicitamente o motor", async () => {
    mocks.resumir.mockResolvedValue({ novos: 0, anuncios: [], contratoRetorno: "radar_resumivel_retorno_leve_v1" });
    const r = await (await POST(requisicao({ buscaId, origem: "manual", contratoRetorno: "radar_resumivel_retorno_leve_v1" }))).json();
    expect(r.contratoRetorno).toBe("radar_resumivel_retorno_leve_v1"); expect(r).not.toHaveProperty("anunciosColetados");
    expect(mocks.resumir.mock.calls[0][4]).toMatchObject({ incluirAnunciosColetados: false });
  });
  it.each(["desconhecido", null, false, 1, {}, [], ""])("R: versão inválida %j falha antes de aquisição", async (contratoRetorno) => {
    expect((await POST(requisicao({ buscaId, origem: "manual", contratoRetorno }))).status).toBe(400);
    expect(mocks.resumir).not.toHaveBeenCalled(); expect(mocks.persistir).not.toHaveBeenCalled(); expect(atualizar).not.toHaveBeenCalled();
    expect(mocks.paginar).not.toHaveBeenCalled(); expect(mocks.finalizar).not.toHaveBeenCalled();
    expect(mocks.clienteServico).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});


// A fixture é o handler publicado byte-exato. Os mocks comparam o controle da rota,
// sem afirmar equivalência dos parsers/collectors compartilhados nem do banco real.
describe("O — opt-in estrito comparado ao receptor publicado", () => {
  const contratoRetorno = "radar_resumivel_retorno_leve_v1";
  function semEfeitos() {
    for (const fn of [mocks.clienteServico, mocks.paginar, mocks.coletar, mocks.finalizar,
      mocks.persistir, mocks.resumir, mocks.rpc, atualizar]) expect(fn).not.toHaveBeenCalled();
  }
  function ordemLegada() {
    expect(mocks.paginar).toHaveBeenCalledOnce(); expect(mocks.finalizar).toHaveBeenCalledOnce();
    expect(mocks.persistir).toHaveBeenCalledOnce();
    expect(mocks.paginar.mock.invocationCallOrder[0]).toBeLessThan(mocks.finalizar.mock.invocationCallOrder[0]);
    expect(mocks.finalizar.mock.invocationCallOrder[0]).toBeLessThan(mocks.persistir.mock.invocationCallOrder[0]);
    expect(mocks.resumir).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  }
  function normalizar(valor: unknown): unknown {
    if (typeof valor === "function") return "funcao";
    if (Array.isArray(valor)) return valor.map(normalizar);
    if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k,v]) => [k,normalizar(v)]));
    return valor;
  }
  function chamadas() {
    return normalizar({ aquisicao: mocks.paginar.mock.calls, finalizacao: mocks.finalizar.mock.calls,
      persistencia: mocks.persistir.mock.calls, observacao: mocks.concluir.mock.calls, atualizacao: atualizar.mock.calls });
  }
  it.each(["manual", "navegador"])("A/B sem contrato, origem %s: operações, argumentos, receipts e snapshot publicados", async (origem) => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const snapshot = [{ id: "privado-local", visto: true, dados: { url: "https://example.invalid/base" } }];
    mocks.persistir.mockResolvedValue({ novos: 0, anuncios: [], anunciosColetados: snapshot,
      cobertura: "parcial", baselineFormada: false });
    const referencia = await POSTPublicado(requisicao({ buscaId, origem }));
    const corpoPublicado = await referencia.json(); ordemLegada();
    const chamadasPublicadas = chamadas(); vi.clearAllMocks();
    const candidato = await POST(requisicao({ buscaId, origem }));
    expect(candidato.status).toBe(referencia.status);
    expect(await candidato.json()).toEqual(corpoPublicado); ordemLegada();
    expect(chamadas()).toEqual(chamadasPublicadas);
    expect(corpoPublicado.anunciosColetados).toEqual(snapshot);
    expect(mocks.paginar.mock.calls[0][1].politicaRetry).toMatchObject({ reservaPosAquisicaoMs: 35000 });
    expect(mocks.paginar.mock.calls[0][1].restanteMs()).toBe(120000);
  });
  it.each(["portal", "persistencia"])("A/B falha de %s: conserva erro/janela legados sem fallback resumível", async (falha) => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const fn = falha === "portal" ? mocks.paginar : mocks.persistir;
    fn.mockRejectedValue(new Error("falha local controlada"));
    const referencia = await POSTPublicado(requisicao());
    const corpoPublicado = await referencia.json();
    const chamadasPublicadas = chamadas(); vi.clearAllMocks();
    const candidato = await POST(requisicao());
    expect(candidato.status).toBe(503); expect(await candidato.json()).toEqual(corpoPublicado);
    // O instante real de ultimo_check pode diferir entre chamadas consecutivas.
    expect(atualizar).toHaveBeenCalledWith({ ultimo_check: expect.any(String), ultimo_check_origem: "manual" });
    const atuais = chamadas() as Record<string,unknown>;
    expect({ ...atuais, atualizacao: null }).toEqual({ ...chamadasPublicadas as object, atualizacao: null });
    expect(mocks.paginar).toHaveBeenCalledOnce(); expect(mocks.resumir).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    if (falha === "portal") expect(mocks.persistir).not.toHaveBeenCalled();
  });
  it("H explícito seleciona apenas o motor com retorno leve e conserva seus receipts", async () => {
    const recibo = { novos: 0, anuncios: [], contratoRetorno, cobertura: "parcial", baselineFormada: false,
      progresso: { estado: "in_progress", paginasConcluidas: 1 }, coleta: { paginasLidas: 1 }, orcamento: { paginas: 1 } };
    mocks.resumir.mockResolvedValue(recibo);
    const resposta = await POST(requisicao({ buscaId, origem: "manual", contratoRetorno }));
    expect(await resposta.json()).toEqual({ ok: true, ...recibo });
    expect(mocks.resumir).toHaveBeenCalledOnce();
    expect(mocks.resumir.mock.calls[0][4]).toMatchObject({ incluirAnunciosColetados: false });
    for (const fn of [mocks.paginar, mocks.finalizar, mocks.persistir, atualizar]) expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    { nome: "portal incompatível", filtro: { portal: "olx" }, status: 400 },
    { nome: "cidade incompatível", filtro: { cidade: "Cambé" }, status: 422 },
    { nome: "finalidade incompatível", filtro: { finalidade: "invalida" }, status: 422 },
    { nome: "tipo incompatível", filtro: { tipoRecorte: "terreno" }, status: 422 },
    { nome: "bairro sem rota comprovada", filtro: { bairro: "Bairro sem rota publicada" }, status: 400 },
  ])("H com $nome falha antes de qualquer efeito", async ({ filtro, status }) => {
    Object.assign(filtrosDaBusca, filtro);
    expect((await POST(requisicao({ buscaId, origem: "manual", contratoRetorno }))).status).toBe(status);
    semEfeitos();
  });
  it("falha em H não recai silenciosamente no legado", async () => {
    mocks.resumir.mockRejectedValue(new Error("falha local controlada"));
    expect((await POST(requisicao({ buscaId, origem: "manual", contratoRetorno }))).status).toBe(503);
    expect(mocks.resumir).toHaveBeenCalledOnce();
    expect(mocks.paginar).not.toHaveBeenCalled(); expect(mocks.persistir).not.toHaveBeenCalled();
  });
});
