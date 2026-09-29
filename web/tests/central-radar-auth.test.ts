import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  buscarComNavegador: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
  registrarEvento: vi.fn(),
  getSupabase: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("server-only", () => ({}));
// Os guards e as classes de erro do SDK são os reais; só o cliente é falso.
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: mocks.createClient,
}));
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
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { POST as buscar } from "@/app/api/central-angariacao/buscar/route";
import { POST as telemetria } from "@/app/api/central-angariacao/telemetria-radar/route";
import { buscarNaCentral } from "@/lib/centralAngariacao";
import { MENSAGEM_SESSAO_RENOVADA } from "@/lib/auth/recuperacaoSessao";

const ler = (caminho: string) => readFileSync(resolve(caminho), "utf8");

type RespostaGetUser = { data: { user: { id: string } | null }; error: unknown };

function clienteServidor(getUser: () => Promise<RespostaGetUser>, maybeSingle = vi.fn()) {
  const eqUsuario = vi.fn(() => ({ maybeSingle }));
  const eqBusca = vi.fn(() => ({ eq: eqUsuario }));
  const select = vi.fn(() => ({ eq: eqBusca }));
  const from = vi.fn(() => ({ select }));
  return { auth: { getUser: vi.fn(getUser) }, from, eqUsuario, maybeSingle };
}

const valido = async (): Promise<RespostaGetUser> => ({ data: { user: { id: "usuario-central" } }, error: null });
const falha = (erro: unknown) => async (): Promise<RespostaGetUser> => ({ data: { user: null }, error: erro });

function pedidoBusca(corpo: unknown, authorization: string | null = "Bearer token-valido") {
  return new Request("http://localhost/api/central-angariacao/buscar", {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
      "x-angario-iniciador": "monitor_navegador",
    },
    body: JSON.stringify(corpo),
  });
}

const filtrosOlx = { portal: "olx", cidade: "Londrina", estado: "PR" };

describe("rota /buscar: autenticação separada de erro funcional", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
    vi.stubEnv("VERCEL", "1");
    mocks.buscarComFirecrawl.mockResolvedValue([]);
    mocks.salvarComparaveisMercado.mockResolvedValue(0);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sessão válida chega à coleta com o cliente autenticado, validado uma vez", async () => {
    const cliente = clienteServidor(valido);
    mocks.createClient.mockReturnValue(cliente);
    const resposta = await buscar(pedidoBusca(filtrosOlx));
    const corpo = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo).not.toHaveProperty("erro");
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(cliente.auth.getUser).toHaveBeenCalledExactlyOnceWith("token-valido");
    expect(mocks.createClient.mock.calls[0][2]).toMatchObject({
      global: { headers: { Authorization: "Bearer token-valido" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it.each([
    ["sem Bearer", null, valido],
    ["sessão revogada", "Bearer token-valido", falha(new AuthSessionMissingError())],
    ["JWT recusado", "Bearer token-valido", falha(new AuthApiError("x", 403, "bad_jwt"))],
  ])("%s: 401 com o aviso de sempre e sem coleta", async (_caso, authorization, getUser) => {
    mocks.createClient.mockReturnValue(clienteServidor(getUser));
    const resposta = await buscar(pedidoBusca(filtrosOlx, authorization));
    const corpo = await resposta.json();
    expect(resposta.status).toBe(401);
    expect(corpo).toMatchObject({ ok: false, anuncios: [], urlPesquisa: "", aviso: "Sessão inválida.", erro: "sessao-invalida" });
    expect(typeof corpo.execucaoId).toBe("string");
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("Auth indisponível: 503 que não fala em sessão expirada, sem coleta nem registro", async () => {
    mocks.createClient.mockReturnValue(clienteServidor(falha(new AuthRetryableFetchError("fetch failed", 0))));
    const resposta = await buscar(pedidoBusca(filtrosOlx));
    const corpo = await resposta.json();
    expect(resposta.status).toBe(503);
    expect(corpo).toMatchObject({
      ok: false, anuncios: [], erro: "auth-indisponivel",
      aviso: "Não foi possível confirmar sua sessão agora. Tente novamente em instantes.",
    });
    expect(corpo.aviso).not.toMatch(/expirou|inválida/i);
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("env ausente: 500 erro-auth, não 401", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const resposta = await buscar(pedidoBusca(filtrosOlx));
    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toMatchObject({ ok: false, erro: "erro-auth", aviso: "Não foi possível confirmar sua sessão agora." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("erro de Auth não classificado: 500, não 401", async () => {
    mocks.createClient.mockReturnValue(clienteServidor(falha(new AuthApiError("x", 400, "validation_failed"))));
    const resposta = await buscar(pedidoBusca(filtrosOlx));
    expect(resposta.status).toBe(500);
    expect((await resposta.json()).erro).toBe("erro-auth");
  });

  it("400 de filtro e 422 de cobertura continuam iguais depois de autenticar", async () => {
    mocks.createClient.mockReturnValue(clienteServidor(valido));
    const invalido = await buscar(pedidoBusca({ portal: "olx", cidade: "", estado: "PR" }));
    expect(invalido.status).toBe(400);
    expect(await invalido.json()).toMatchObject({ ok: false, aviso: "Informe portal, cidade e uma UF válida." });

    const semCobertura = await buscar(pedidoBusca({ portal: "zap", cidade: "Maringá", estado: "PR" }));
    expect(semCobertura.status).toBe(422);
    const corpo = await semCobertura.json();
    expect(corpo.ok).toBe(false);
    expect(corpo).not.toHaveProperty("erro");
  });

  it("falha de portal segue 200 ok:false sem código de auth", async () => {
    mocks.createClient.mockReturnValue(clienteServidor(valido));
    mocks.buscarComFirecrawl.mockRejectedValue(Object.assign(new Error("portal"), { status: 502 }));
    const resposta = await buscar(pedidoBusca(filtrosOlx));
    const corpo = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(corpo).toMatchObject({ ok: false, aviso: "O serviço de consulta não respondeu agora. A pesquisa pronta ainda pode ser aberta." });
    expect(corpo).not.toHaveProperty("erro");
  });

  it("falha de RLS nos comparáveis continua aviso 200, nunca 401", async () => {
    mocks.createClient.mockReturnValue(clienteServidor(valido));
    mocks.buscarComFirecrawl.mockResolvedValue([{
      idExterno: "novo-1", portal: "olx", titulo: "Casa", preco: 1800, cidade: "Londrina",
      url: "https://www.olx.com.br/imovel/novo-1", anunciante: "incerto",
    }]);
    mocks.salvarComparaveisMercado.mockRejectedValue(Object.assign(new Error("rls"), { status: 403, code: "42501" }));
    const resposta = await buscar(pedidoBusca(filtrosOlx));
    const corpo = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(corpo.ok).toBe(true);
    expect(corpo.aviso).toContain("não foi possível atualizar a base histórica");
  });
});

describe("rota /telemetria-radar: autenticação e 403 legítimo", () => {
  const execucaoId = "229ee00d-1fe9-44b6-9fa4-80702fef8327";
  const buscaId = "229ee00d-1fe9-44b6-9fa4-80702fef8328";
  const pedido = (authorization: string | null = "Bearer token-teste") =>
    new Request("http://localhost/api/central-angariacao/telemetria-radar", {
      method: "POST",
      headers: { ...(authorization ? { Authorization: authorization } : {}), "Content-Type": "application/json" },
      body: JSON.stringify({ execucaoId, buscaId, novos: 1 }),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ["sem Bearer", null, valido, 401, "sessao-invalida"],
    ["sessão revogada", "Bearer token-teste", falha(new AuthSessionMissingError()), 401, "sessao-invalida"],
    ["Auth indisponível", "Bearer token-teste", falha(new AuthRetryableFetchError("x", 503)), 503, "auth-indisponivel"],
    ["erro não classificado", "Bearer token-teste", falha(new AuthApiError("x", 400, "validation_failed")), 500, "erro-auth"],
  ])("%s: %i antes de ler a busca", async (_caso, authorization, getUser, status, erro) => {
    const cliente = clienteServidor(getUser);
    mocks.createClient.mockReturnValue(cliente);
    const resposta = await telemetria(pedido(authorization));
    expect(resposta.status).toBe(status);
    expect(await resposta.json()).toEqual({ ok: false, erro });
    expect(cliente.from).not.toHaveBeenCalled();
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("busca de outro usuário continua 403 e filtra pelo usuário do token", async () => {
    const cliente = clienteServidor(valido, vi.fn().mockResolvedValue({ data: null, error: null }));
    mocks.createClient.mockReturnValue(cliente);
    const resposta = await telemetria(pedido());
    expect(resposta.status).toBe(403);
    expect(cliente.eqUsuario).toHaveBeenCalledWith("user_id", "usuario-central");
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("erro do PostgREST/RLS ao ler a busca continua 403, não vira 401 nem 503", async () => {
    const cliente = clienteServidor(valido, vi.fn().mockResolvedValue({
      data: null, error: { code: "PGRST301", message: "JWT expired" },
    }));
    mocks.createClient.mockReturnValue(cliente);
    expect((await telemetria(pedido())).status).toBe(403);
  });
});

describe("cliente buscarNaCentral com fetchAutenticado", () => {
  let fetchFalso: ReturnType<typeof vi.fn>;
  let auth: {
    getSession: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };

  function respostas(...lista: Array<[number, unknown]>) {
    fetchFalso = vi.fn();
    for (const [status, corpo] of lista) {
      fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify(corpo), { status }));
    }
    vi.stubGlobal("fetch", fetchFalso);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    auth = {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "token-local" } } })),
      getUser: vi.fn(async () => ({ data: { user: { id: "usuario" } }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: "token-novo" } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    };
    mocks.getSupabase.mockReturnValue({ auth });
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sucesso preserva Bearer, iniciador, corpo e execucaoId, sem falhaAuth", async () => {
    respostas([200, { ok: true, anuncios: [], urlPesquisa: "u", execucaoId: "exec-1" }]);
    const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
    const resultado = await buscarNaCentral(filtros, "verificar_agora");
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/central-angariacao/buscar");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token-local", "x-angario-iniciador": "verificar_agora", "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual(filtros);
    expect(resultado).toEqual({ ok: true, anuncios: [], urlPesquisa: "u", execucaoId: "exec-1" });
  });

  it("sem sessão local não faz fetch e marca falha de sessão", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    respostas();
    const resultado = await buscarNaCentral({ portal: "olx", cidade: "Londrina", estado: "PR" });
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ ok: false, aviso: "Sua sessão expirou. Entre novamente.", falhaAuth: "sessao-invalida" });
  });

  it("401 com sessão renovada: recupera uma vez e NUNCA repete o POST", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("x", 403, "bad_jwt") });
    respostas(
      [401, { ok: false, anuncios: [], urlPesquisa: "", aviso: "Sessão inválida.", erro: "sessao-invalida", execucaoId: "e" }],
      [200, { ok: true, anuncios: [], urlPesquisa: "" }],
    );
    const resultado = await buscarNaCentral({ portal: "olx", cidade: "Londrina", estado: "PR" }, "monitor_navegador");
    expect(fetchFalso).toHaveBeenCalledOnce();
    expect(auth.refreshSession).toHaveBeenCalledOnce();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(MENSAGEM_SESSAO_RENOVADA, "warning");
    expect(resultado).toMatchObject({ ok: false, aviso: "Sessão inválida.", falhaAuth: "sessao-invalida" });
    expect(resultado).not.toHaveProperty("erro");
  });

  it("401 com sessão revogada encerra só a sessão local, sem refresh", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    respostas([401, { ok: false, anuncios: [], urlPesquisa: "", aviso: "Sessão inválida.", erro: "sessao-invalida" }]);
    const resultado = await buscarNaCentral({ portal: "olx", cidade: "Londrina", estado: "PR" });
    expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(fetchFalso).toHaveBeenCalledOnce();
    expect(resultado.falhaAuth).toBe("sessao-invalida");
  });

  it.each([
    [503, "auth-indisponivel"],
    [500, "erro-auth"],
  ] as const)("%i não abre recuperação, não renova, não desloga e não vira 401", async (status, erro) => {
    respostas([status, { ok: false, anuncios: [], urlPesquisa: "", aviso: "Não foi possível confirmar sua sessão agora.", erro }]);
    const resultado = await buscarNaCentral({ portal: "olx", cidade: "Londrina", estado: "PR" });
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(fetchFalso).toHaveBeenCalledOnce();
    expect(resultado).toMatchObject({ ok: false, falhaAuth: erro });
    expect(resultado.aviso).not.toMatch(/expirou/);
  });

  it("403 é resposta normal: sem recuperação e sem virar sessão expirada", async () => {
    respostas([403, { ok: false, anuncios: [], urlPesquisa: "", aviso: "Sem permissão." }]);
    const resultado = await buscarNaCentral({ portal: "olx", cidade: "Londrina", estado: "PR" });
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(resultado).toEqual({ ok: false, anuncios: [], urlPesquisa: "", aviso: "Sem permissão." });
  });

  it("código de erro desconhecido no corpo não vira falhaAuth", async () => {
    respostas([200, { ok: false, anuncios: [], urlPesquisa: "", aviso: "Portal fora.", erro: "qualquer-coisa" }]);
    const resultado = await buscarNaCentral({ portal: "olx", cidade: "Londrina", estado: "PR" });
    expect(resultado).not.toHaveProperty("falhaAuth");
  });
});

describe("fronteiras do AUTH-1b", () => {
  it("o cliente da Central usa fetchAutenticado sem repetição; a telemetria do Radar não usa", () => {
    const central = ler("lib/centralAngariacao.ts");
    expect(central).toMatch(/fetchAutenticado\("\/api\/central-angariacao\/buscar"/);
    expect(central).toMatch(/\{ repetivel: false \}/);
    expect(central).not.toMatch(/repetivel: true/);
    expect(central).not.toMatch(/getSession|Authorization/);
    const radar = ler("lib/radarAngariacao.ts");
    expect(radar).not.toMatch(/fetchAutenticado|recuperacaoSessao/);
    expect(radar).toMatch(/fetch\("\/api\/central-angariacao\/telemetria-radar"/);
  });

  it("as rotas da Central/Radar não validam o Bearer por conta própria", () => {
    for (const rota of [
      "app/api/central-angariacao/buscar/route.ts",
      "app/api/central-angariacao/telemetria-radar/route.ts",
    ]) {
      const fonte = ler(rota);
      expect(fonte).toMatch(/autenticarRequisicao\(request, "central-angariacao\//);
      expect(fonte).not.toMatch(/auth\.getUser|createClient\(|startsWith\("bearer/);
    }
  });

  it("o helper do servidor não renova, não encerra, não navega e não guarda sessão", () => {
    // Só o código: o comentário do módulo cita justamente o que ele não faz.
    const helper = ler("lib/servidor/autenticacao.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(helper).not.toMatch(/refreshSession|signOut|localStorage|cookie|redirect|router/i);
    expect(helper).toMatch(/persistSession: false, autoRefreshToken: false/);
  });
});
