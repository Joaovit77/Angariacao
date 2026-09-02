import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
vi.mock("server-only", () => ({}));
const salvar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/servidor/comparaveisMercado", () => ({ salvarComparaveisMercado: salvar }));
import { executarColetaMercados, type MercadoReclamado } from "@/lib/servidor/coletaMercadosMonitorados";
import { FirecrawlIndisponivel, type OrigemConsultaFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";

const mercado: MercadoReclamado = {
  id: "mercado-1", user_id: "owner-do-claim", cidade: "Londrina", estado: "PR",
  finalidade: "locacao", segmento: "residencial", lease_token: "token-privado",
};
const anuncio: AnuncioCentralAngariacao = {
  idExterno: "123456789", portal: "olx", titulo: "Apartamento 70 m² 2 quartos",
  preco: 2000, cidade: "Londrina", estado: "PR", tipo: "Apartamento", anunciante: "incerto", url: "https://pr.olx.com.br/imoveis/apartamento-123456789",
};
function preparar(linhas: MercadoReclamado[] = [mercado]) {
  const rpc = vi.fn().mockImplementation(async (nome: string) => ({
    data: nome === "claim_mercados_monitorados" ? linhas : true, error: null,
  }));
  const supabase = { rpc, from: vi.fn(() => { throw new Error("Não deve gravar Radar nem imóveis"); }) } as unknown as SupabaseClient;
  const buscar = vi.fn(async (f: FiltrosCentralAngariacao, _url: string, origem?: (o: OrigemConsultaFirecrawl) => void) => {
    origem?.("firecrawl");
    return [{ ...anuncio, portal: f.portal }];
  });
  const consultarSaldo = vi.fn(async () => 10);
  const registrar = vi.fn();
  return { supabase, buscar, consultarSaldo, registrar, rpc };
}

describe("executor periódico de mercados", () => {
  beforeEach(() => { salvar.mockReset().mockImplementation(async (_db, _owner, anuncios) => anuncios.length); });
  it("reclama um mercado, executa no máximo quatro consultas e finaliza uma vez com owner confiável", async () => {
    const deps = preparar();
    const r = await executarColetaMercados(deps);
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "claim_mercados_monitorados", { p_limite: 1 });
    expect(deps.buscar).toHaveBeenCalledTimes(4);
    expect(deps.consultarSaldo).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar.mock.calls[0][1]).toBe("owner-do-claim");
    expect(deps.supabase.from).not.toHaveBeenCalled();
    expect(r.mercados[0]).toMatchObject({ status: "sucesso", consultasPlanejadas: 4, consultasExecutadas: 4, chamadasFirecrawl: 4, comparaveisFinalizados: 4 });
    expect(deps.rpc).toHaveBeenLastCalledWith("concluir_mercado_monitorado", {
      p_mercado_id: mercado.id, p_lease_token: mercado.lease_token, p_sucesso: true, p_erro_codigo: null,
    });
    expect(JSON.stringify(deps.registrar.mock.calls)).not.toMatch(/token-privado|owner-do-claim|https:/);
  });
  it("lote vazio não consulta saldo nem dispara coleta", async () => {
    const deps = preparar([]);
    expect((await executarColetaMercados(deps)).mercadosReclamados).toBe(0);
    expect(deps.consultarSaldo).not.toHaveBeenCalled();
    expect(deps.buscar).not.toHaveBeenCalled();
  });
  it.each([{ estado: "XX", erro: "sem_portal_suportado" }, { finalidade: "venda", erro: "mercado_nao_suportado" }, { segmento: "comercial", erro: "mercado_nao_suportado" }])("capacidade indisponível não gasta crédito: %j", async ({ erro, ...parcial }) => {
    const deps = preparar([{ ...mercado, ...parcial }]);
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe(erro);
    expect(deps.buscar).not.toHaveBeenCalled();
    expect(deps.consultarSaldo).not.toHaveBeenCalled();
    expect(deps.rpc).toHaveBeenCalledTimes(2);
  });
  it.each([0, 3, Number.NaN])("saldo insuficiente (%s) libera lease sem chamadas", async (saldo) => {
    const deps = preparar(); deps.consultarSaldo.mockResolvedValue(saldo);
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe("saldo_insuficiente");
    expect(deps.buscar).not.toHaveBeenCalled();
    expect(deps.rpc).toHaveBeenLastCalledWith("concluir_mercado_monitorado", expect.objectContaining({ p_sucesso: false }));
  });
  it("saldo indisponível não vaza mensagem nem segura lease", async () => {
    const deps = preparar(); deps.consultarSaldo.mockRejectedValue(new Error("segredo-do-provider"));
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe("saldo_indisponivel");
    expect(JSON.stringify(deps.registrar.mock.calls)).not.toContain("segredo-do-provider");
    expect(deps.buscar).not.toHaveBeenCalled();
  });
  it("concorrência externa nunca ultrapassa dois", async () => {
    const deps = preparar(); let ativos = 0; let pico = 0;
    deps.buscar.mockImplementation(async () => {
      ativos++; pico = Math.max(pico, ativos);
      await Promise.resolve(); ativos--; return [anuncio];
    });
    await executarColetaMercados(deps);
    expect(pico).toBe(2);
  });
  it("portal falho não perde resultados úteis nem dispara retry pago imediato", async () => {
    const deps = preparar();
    deps.buscar.mockRejectedValueOnce(new FirecrawlIndisponivel("token secreto", "firecrawl_429"));
    const d = (await executarColetaMercados(deps)).mercados[0];
    expect(d).toMatchObject({ status: "parcial", comparaveisFinalizados: 3, erro: null });
    expect(d.falhasPorPortal).toEqual([{ portal: "olx", codigo: "firecrawl_429" }]);
    expect(deps.buscar).toHaveBeenCalledTimes(4);
    expect(deps.rpc).toHaveBeenLastCalledWith("concluir_mercado_monitorado", expect.objectContaining({ p_sucesso: true }));
  });
  it("falha total sanitizada e sem retry imediato", async () => {
    const deps = preparar(); deps.buscar.mockRejectedValue(new Error("Authorization: segredo"));
    const d = (await executarColetaMercados(deps)).mercados[0];
    expect(d.status).toBe("falha");
    expect(d.erro).toBe("firecrawl_indisponivel");
    expect(deps.buscar).toHaveBeenCalledTimes(4);
    expect(salvar).not.toHaveBeenCalled();
    expect(JSON.stringify(d)).not.toContain("segredo");
  });
  it("rodada vazia não altera status ou histórico de anúncios ausentes", async () => {
    const deps = preparar(); deps.buscar.mockResolvedValue([]);
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe("sem_resultados");
    expect(salvar).not.toHaveBeenCalled();
    expect(deps.supabase.from).not.toHaveBeenCalled();
  });
  it("rejeita UF/cidade divergentes na finalização e tipos não residenciais antes dela", async () => {
    const deps = preparar(); deps.buscar.mockResolvedValue([
      anuncio, { ...anuncio, estado: "SP" }, { ...anuncio, cidade: "Curitiba" },
      { ...anuncio, tipo: "Sala Comercial" }, { ...anuncio, tipo: "Terreno" },
    ]);
    const d = (await executarColetaMercados(deps)).mercados[0];
    expect(d.resultadosBrutos).toBe(20);
    expect(d.resultadosNormalizados).toBe(4);
    expect(salvar.mock.calls[0][2]).toHaveLength(4);
    expect(salvar.mock.calls[0][3]).toMatchObject({ cidade: "Londrina", estado: "PR" });
  });
  it("preserva Campinas/SP sem conversão para PR", async () => {
    const deps = preparar([{ ...mercado, cidade: "Campinas", estado: "SP" }]);
    deps.buscar.mockResolvedValue([{ ...anuncio, cidade: "Campinas", estado: "SP" }, anuncio]);
    const d = (await executarColetaMercados(deps)).mercados[0];
    expect(d).toMatchObject({ consultasPlanejadas: 2, resultadosNormalizados: 2, estado: "SP" });
  });
  it("respeita limite de 50 anúncios por consulta mesmo com adaptador excedendo", async () => {
    const deps = preparar(); deps.buscar.mockResolvedValue(Array.from({ length: 80 }, () => anuncio));
    expect((await executarColetaMercados(deps)).mercados[0].resultadosBrutos).toBe(200);
  });
  it("conta cache e in-flight sem inventar chamadas externas", async () => {
    const deps = preparar(); deps.buscar.mockImplementation(async (_f, _u, origem) => { origem?.("cache"); return [anuncio]; });
    expect((await executarColetaMercados(deps)).mercados[0]).toMatchObject({ cacheHits: 4, chamadasFirecrawl: 0 });
  });
  it("não começa nova consulta perto do limite de runtime", async () => {
    const deps = preparar(); let chamadasRelogio = 0;
    const d = (await executarColetaMercados({ ...deps, agora: () => chamadasRelogio++ < 2 ? 0 : 180_000 })).mercados[0];
    expect(deps.buscar).not.toHaveBeenCalled();
    expect(d.erro).toBe("limite_tempo");
  });
  it("persistência falha encerra sem expor mensagem ou repetir coleta", async () => {
    const deps = preparar(); salvar.mockRejectedValue(new Error("senha-banco"));
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe("persistencia_falhou");
    expect(deps.buscar).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(deps.registrar.mock.calls)).not.toContain("senha-banco");
  });
  it.each([false, null])("conclusão recusada não recria mercado (%s)", async (resultado) => {
    const deps = preparar(); deps.rpc.mockResolvedValueOnce({ data: [mercado], error: null }).mockResolvedValueOnce({ data: resultado, error: null });
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe("lease_perdido");
    expect(deps.supabase.from).not.toHaveBeenCalled();
  });
  it("falha de transporte na conclusão fica explícita; recuperação depende da expiração", async () => {
    const deps = preparar(); deps.rpc.mockResolvedValueOnce({ data: [mercado], error: null }).mockRejectedValueOnce(new Error("secret"));
    expect((await executarColetaMercados(deps)).mercados[0].erro).toBe("conclusao_indisponivel");
    expect(deps.rpc).toHaveBeenCalledTimes(2);
  });
});
