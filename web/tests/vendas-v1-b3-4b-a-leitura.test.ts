import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { COLUNAS_IMOVEIS_CANDIDATOS_VENDA, listarImoveisCandidatosVenda, type ClienteImoveisVenda } from "@/lib/persistencia/vendasImoveisLeitura";
import { candidatosSinteticos, clienteCandidatosFalso, CONTA_CANDIDATOS, OUTRA_CONTA_CANDIDATOS, idCandidato, linhaCandidato } from "./fixtures/vendasB34bA";

const padrao = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: padrao.getSupabase }));

describe("B3.4b-A: catálogo factual da carteira", () => {
  it("preserva locação, venda, ambos, NULL, retirada, Locado e Perdido sem filtro comercial", async () => {
    const falso = clienteCandidatosFalso();
    const resultado = await listarImoveisCandidatosVenda(falso.cliente);
    expect(resultado).toEqual({ ok: true, dados: candidatosSinteticos().map((r) => ({
      id: r.id, codigo: r.codigo, referenciaCrm: r.referencia_crm, endereco: r.endereco, bairro: r.bairro,
      cidade: r.cidade, estado: r.estado, unidade: r.unidade, bloco: r.bloco, finalidade: r.finalidade,
      status: r.status, retirado: r.retirado, valorVenda: r.valor_venda,
    })) });
    expect(falso.mutar).not.toHaveBeenCalled();
  });
  it("Locação e venda + Locado continua presente e continua Locado", async () => {
    const resultado = await listarImoveisCandidatosVenda(clienteCandidatosFalso([linhaCandidato({ finalidade: "locacao_venda", status: "Locado" })]).cliente);
    expect(resultado).toMatchObject({ ok: true, dados: [{ finalidade: "locacao_venda", status: "Locado" }] });
  });
  it("venda + Locado é representável sem corrigir dados", async () => {
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([linhaCandidato({ status: "Locado" })]).cliente))
      .toMatchObject({ ok: true, dados: [{ finalidade: "venda", status: "Locado" }] });
  });
  it("NULL e finalidade ausente permanecem desconhecidos", async () => {
    const ausente: Record<string, unknown> = linhaCandidato(); delete ausente.finalidade;
    for (const r of [linhaCandidato({ finalidade: null }), ausente]) {
      expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([r]).cliente)).toMatchObject({ ok: true, dados: [{ finalidade: null }] });
    }
  });
  it.each([null, 0, 450000.55])("preserva valor de venda %s sem usar aluguel", async (valor) => {
    const falso = clienteCandidatosFalso([linhaCandidato({ valor_venda: valor })]);
    expect(await listarImoveisCandidatosVenda(falso.cliente)).toMatchObject({ ok: true, dados: [{ valorVenda: valor }] });
  });
  it("conta sem imóveis devolve catálogo vazio", async () => {
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([]).cliente)).toEqual({ ok: true, dados: [] });
  });
  it("SELECT exato, só identificação e situação, sem telefone, proprietário, notas ou histórico", async () => {
    const falso = clienteCandidatosFalso(); await listarImoveisCandidatosVenda(falso.cliente);
    expect(COLUNAS_IMOVEIS_CANDIDATOS_VENDA).toBe("id,codigo,referencia_crm,endereco,bairro,cidade,estado,unidade,bloco,finalidade,status,retirado,valor_venda");
    expect(falso.consultas).toEqual([{
      tabela: "imoveis", colunas: COLUNAS_IMOVEIS_CANDIDATOS_VENDA,
      escopo: [["user_id", CONTA_CANDIDATOS]], ordem: [["id", true]], intervalo: [0, 499],
    }]);
    expect(falso.mutar).not.toHaveBeenCalled();
  });
  it("obtém o usuário do Auth; default mantém o singleton autenticado, sem id recebido", async () => {
    const falso = clienteCandidatosFalso([], { usuarioId: OUTRA_CONTA_CANDIDATOS });
    padrao.getSupabase.mockReturnValueOnce(falso.cliente);
    expect(await listarImoveisCandidatosVenda()).toEqual({ ok: true, dados: [] });
    expect(falso.getUser).toHaveBeenCalledOnce();
    expect(falso.getUser.mock.invocationCallOrder[0]).toBeLessThan(falso.from.mock.invocationCallOrder[0]);
    expect(falso.consultas[0].escopo).toEqual([["user_id", OUTRA_CONTA_CANDIDATOS]]);
    expect(falso.mutar).not.toHaveBeenCalled();
  });
  it("não consulta carteira sem sessão ou com sessão inválida", async () => {
    for (const usuarioId of [null, "usuario-invalido"]) {
      const falso = clienteCandidatosFalso([], { usuarioId });
      expect(await listarImoveisCandidatosVenda(falso.cliente)).toEqual({ ok: false, erro: usuarioId === null ? "nao-autenticado" : "resposta-invalida" });
      expect(falso.from).not.toHaveBeenCalled();
    }
  });
  it("SDK real sem sessão retorna não autenticado e não faz rede", async () => {
    const transporte = vi.fn(() => { throw new Error("Nenhuma rede autorizada neste teste."); });
    const cliente = createClient("http://127.0.0.1:9", "anon-sintetica", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transporte },
    });
    expect(await listarImoveisCandidatosVenda(cliente as unknown as ClienteImoveisVenda)).toEqual({ ok: false, erro: "nao-autenticado" });
    expect(transporte).not.toHaveBeenCalled();
  });
  it("SDK real envia somente GET Auth/PostgREST com credencial sintética e projeção limitada", async () => {
    const chamadas: { url: URL; metodo: string; headers: Headers }[] = [];
    const transporte = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      chamadas.push({ url, metodo: init?.method ?? "GET", headers: new Headers(init?.headers) });
      if (url.pathname === "/auth/v1/user") return new Response(JSON.stringify({ id: CONTA_CANDIDATOS }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.pathname === "/rest/v1/imoveis") return new Response(JSON.stringify([linhaCandidato({ finalidade: "locacao_venda", status: "Locado" })]), { status: 200, headers: { "Content-Type": "application/json" } });
      throw new Error("Rota fora do contrato sintético.");
    });
    const cliente = createClient("http://127.0.0.1:9", "anon-sintetica", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: transporte, headers: { Authorization: "Bearer sessao-sintetica" } },
    });
    expect(await listarImoveisCandidatosVenda(cliente as unknown as ClienteImoveisVenda)).toMatchObject({ ok: true, dados: [{ finalidade: "locacao_venda", status: "Locado" }] });
    expect(chamadas.map((c) => [c.url.pathname, c.metodo])).toEqual([["/auth/v1/user", "GET"], ["/rest/v1/imoveis", "GET"]]);
    const consulta = chamadas[1];
    expect(consulta.url.searchParams.get("select")).toBe(COLUNAS_IMOVEIS_CANDIDATOS_VENDA);
    expect(consulta.url.searchParams.get("user_id")).toBe(`eq.${CONTA_CANDIDATOS}`);
    expect(consulta.url.searchParams.get("order")).toBe("id.asc");
    expect(consulta.url.searchParams.get("offset")).toBe("0");
    expect(consulta.url.searchParams.get("limit")).toBe("500");
    expect(consulta.headers.get("Authorization")).toBe("Bearer sessao-sintetica");
    expect(consulta.headers.get("apikey")).toBe("anon-sintetica");
  });
  it.each(["42501", "PGRST301", "PGRST302", "PGRST303"])("propaga erro de acesso %s sem expor detalhes", async (code) => {
    const erro = { code, message: "Informação interna não publicável" };
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([], { erroConsulta: erro }).cliente)).toEqual({ ok: false, erro: "nao-autenticado" });
    const falso = clienteCandidatosFalso([], { erroAuth: erro });
    expect(await listarImoveisCandidatosVenda(falso.cliente)).toEqual({ ok: false, erro: "nao-autenticado" });
    expect(falso.from).not.toHaveBeenCalled();
  });
  it("rede e falha PostgREST são explícitas; erro não é catálogo vazio", async () => {
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([], { falhaRede: true }).cliente)).toEqual({ ok: false, erro: "transporte-indisponivel" });
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([], { erroConsulta: { code: "XX000" } }).cliente)).toEqual({ ok: false, erro: "falha-interna" });
    const falso = clienteCandidatosFalso(); falso.getUser.mockRejectedValueOnce(new Error("Rede"));
    expect(await listarImoveisCandidatosVenda(falso.cliente)).toEqual({ ok: false, erro: "transporte-indisponivel" });
  });
  it.each([
    { id: "" }, { endereco: null }, { status: null }, { status: "" }, { finalidade: "desconhecida" },
    { retirado: null }, { retirado: "true" }, { valor_venda: undefined }, { valor_venda: "123" }, { valor_venda: -1 },
    { valor_venda: NaN }, { valor_venda: Infinity }, { codigo: 12 }, { telefone: "proibido" }, { notas: [] },
  ])("dados inválidos não viram valor ou situação inventados: %j", async (extra) => {
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([linhaCandidato(extra)]).cliente)).toEqual({ ok: false, erro: "resposta-invalida" });
  });
  it.each([null, {}, "", [null]])("resposta inválida %j é recusada", async (resposta) => {
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([], { resposta }).cliente)).toEqual({ ok: false, erro: "resposta-invalida" });
  });
  it("carteira maior que o limite padrão: pagina até o fim com mesmo escopo", async () => {
    const linhas = Array.from({ length: 1003 }, (_, n) => linhaCandidato({ id: idCandidato(n + 1) }));
    const falso = clienteCandidatosFalso(linhas);
    const resultado = await listarImoveisCandidatosVenda(falso.cliente);
    expect(resultado.ok && resultado.dados).toHaveLength(1003);
    expect(falso.consultas.map((c) => c.intervalo)).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(falso.consultas.every((c) => c.escopo[0][1] === CONTA_CANDIDATOS)).toBe(true);
  });
  it("falha em página posterior e ids repetidos recusam catálogo parcial", async () => {
    const linhas = Array.from({ length: 501 }, (_, n) => linhaCandidato({ id: idCandidato(n + 1) }));
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso(linhas, { erroPagina: 500 }).cliente)).toEqual({ ok: false, erro: "falha-interna" });
    expect(await listarImoveisCandidatosVenda(clienteCandidatosFalso([linhaCandidato(), linhaCandidato()]).cliente)).toEqual({ ok: false, erro: "resposta-invalida" });
  });
});
