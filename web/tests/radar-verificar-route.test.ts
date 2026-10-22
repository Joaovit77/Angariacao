import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ autenticar: vi.fn(), clienteServico: vi.fn(), coletar: vi.fn(), finalizar: vi.fn(), persistir: vi.fn(), concluir: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/autenticacao", () => ({ autenticarRequisicao: mocks.autenticar }));
vi.mock("@/lib/servidor/ingestaoRadar", async (real) => ({ ...await real<object>(), clienteServicoRadar: mocks.clienteServico, persistirColetaRadar: mocks.persistir }));
vi.mock("@/lib/servidor/fallbackHttpChaves", () => ({ buscarComFallbackHttpChaves: mocks.coletar, RESERVA_PROCESSAMENTO_CENTRAL_MS: 35000 }));
vi.mock("@/lib/servidor/finalizacaoCentralAngariacao", () => ({ finalizarColetaCentralAngariacao: mocks.finalizar }));
vi.mock("@/lib/servidor/observabilidadeRadar", () => ({ novoIdExecucao: () => "execucao-local", criarObservadorRadar: () => ({ observar: vi.fn(), concluir: mocks.concluir }) }));
import { POST } from "@/app/api/radar/verificar/route";
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
  mocks.clienteServico.mockReturnValue({ marcador: "servico-local" });
  mocks.coletar.mockResolvedValue([]);
  mocks.finalizar.mockResolvedValue({ anuncios: [], comparaveisSalvos: 0, erroComparaveis: null });
  mocks.persistir.mockResolvedValue({ novos: 0, anuncios: [], cobertura: "desconhecida", baselineFormada: false });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Radar — rota autenticada da ponte", () => {
  it.each([401,503,500])("auth %s não coleta nem escreve", async (status) => {
    mocks.autenticar.mockResolvedValue({ ok: false, status, erro: status===401 ? "sessao-invalida" : "auth-indisponivel" });
    expect((await POST(requisicao())).status).toBe(status);
    expect(mocks.coletar).not.toHaveBeenCalled(); expect(mocks.persistir).not.toHaveBeenCalled(); expect(atualizar).not.toHaveBeenCalled();
  });
  it.each(["manual","navegador"])("%s usa dono/filtros do banco e ignora evidência forjada pelo cliente", async (origem) => {
    const resposta = await POST(requisicao({ buscaId, origem, user_id: "outra-conta", filtros: { finalidade: "venda" }, cobertura: "completa", anuncios: [{ idExterno: "falso" }] }));
    expect(resposta.status).toBe(200);
    expect(filtrosLidos).toContainEqual(["id",buscaId]); expect(filtrosLidos).toContainEqual(["user_id","dono-confiavel"]);
    expect(mocks.coletar.mock.calls[0][0]).toEqual({ portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR" });
    expect(mocks.persistir).toHaveBeenCalledWith({ marcador: "servico-local" }, { id: buscaId,user_id: "dono-confiavel" }, expect.any(Object), [], undefined, origem);
  });
  it("bairro salvo participa da aquisição e a URL do cliente não altera o universo", async () => {
    filtrosDaBusca.bairro = "Jardim Tókio";
    expect((await POST(requisicao({buscaId,origem:"manual",filtros:{bairro:"Outro bairro"}}))).status).toBe(200);
    expect(mocks.coletar.mock.calls[0][0]).toMatchObject({bairro:"jardim tokio",cidade:"Londrina",finalidade:"locacao",tipoRecorte:"casa"});
    expect(mocks.coletar.mock.calls[0][1]).toBe("https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/");
    expect(mocks.persistir.mock.calls[0][2]).toMatchObject({bairro:"jardim tokio"});
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
    mocks.coletar.mockRejectedValue(new Error("portal indisponível"));
    expect((await POST(requisicao())).status).toBe(503);
    expect(atualizar).toHaveBeenCalledWith({ ultimo_check: expect.any(String), ultimo_check_origem: "manual" });
    expect(mocks.persistir).not.toHaveBeenCalled();
  });
  it("falha transacional não devolve anúncio fantasma nem repete a aquisição", async () => {
    mocks.persistir.mockRejectedValue(new Error("rollback local"));
    const r = await POST(requisicao()); expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false }); expect(mocks.coletar).toHaveBeenCalledOnce();
  });
});
