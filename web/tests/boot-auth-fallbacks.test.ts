import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "@/lib/persistencia/supabase";
import { fetchAutenticado, MENSAGEM_SESSAO_ENCERRADA } from "@/lib/auth/recuperacaoSessao";
import { iaDisponivelParaUsuario } from "@/lib/ia";
import { meuCargo } from "@/lib/admin";
import { toast } from "@/lib/toast";

/* As duas consultas que o SessaoProvider dispara sozinho no boot. Passam
   pelo `fetchAutenticado` de verdade (só o cliente Supabase e o fetch são
   falsos): é por elas que uma sessão revogada é percebida no boot, e nunca
   podem lançar — o layout espera o cargo para sair de "Confirmando seu
   perfil". */

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: vi.fn() }));

const getSupabaseMock = vi.mocked(getSupabase);
const toastMock = vi.mocked(toast);
const NEUTRO = { admin: false, operaCarteira: true };

type ResultadoGetUser = { data: { user: { id: string } | null }; error: unknown };

const SESSAO_INEXISTENTE: ResultadoGetUser = { data: { user: null }, error: new AuthSessionMissingError() };
const JWT_RECUSADO: ResultadoGetUser = { data: { user: null }, error: new AuthApiError("invalid JWT", 403, "bad_jwt") };

function instalarSupabase({ token = "token-velho" as string | null, getUser = SESSAO_INEXISTENTE } = {}) {
  let atual = token;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: atual ? { access_token: atual } : null }, error: null })),
    getUser: vi.fn(async () => getUser),
    refreshSession: vi.fn(async () => {
      atual = "token-novo";
      return { data: { session: { access_token: atual } }, error: null };
    }),
    signOut: vi.fn(async () => {
      atual = null;
      return { error: null };
    }),
  };
  getSupabaseMock.mockReturnValue({ auth } as never);
  return auth;
}

function json(status: number, corpo: unknown = {}): Response {
  return new Response(JSON.stringify(corpo), { status });
}

function bearer(init: RequestInit | undefined): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

/** Responde por rota e por token: o token novo sempre recebe a resposta "boa". */
function instalarFetch(respostas: Record<string, { velho: Response | (() => Response); novo?: Response }>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const rota = Object.keys(respostas).find((r) => url.startsWith(r));
    if (!rota) throw new Error(`rota inesperada ${url}`);
    const { velho, novo } = respostas[rota];
    const escolhida = bearer(init) === "Bearer token-novo" && novo ? novo : velho;
    return (typeof escolhida === "function" ? escolhida() : escolhida).clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function chamadasPara(fetchMock: ReturnType<typeof instalarFetch>, rota: string) {
  return fetchMock.mock.calls.filter(([url]) => url.startsWith(rota));
}

let logs: unknown[][];

beforeEach(() => {
  toastMock.mockClear();
  logs = [];
  for (const nivel of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("boot com sessão válida", () => {
  it("1. um fetch de IA e um de cargo, com o Bearer da sessão, sem perguntar ao Auth no browser", async () => {
    const auth = instalarSupabase();
    const fetchMock = instalarFetch({
      "/api/ia": { velho: json(200, { configurado: true, permitido: true }) },
      "/api/admin/eu": { velho: json(200, { admin: true, operaCarteira: false }) },
    });

    await expect(iaDisponivelParaUsuario()).resolves.toBe(true);
    await expect(meuCargo()).resolves.toEqual({ admin: true, operaCarteira: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => bearer(init))).toEqual(["Bearer token-velho", "Bearer token-velho"]);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("distingue não admin de admin sem enfraquecer a resposta neutra", async () => {
    instalarSupabase();
    instalarFetch({ "/api/admin/eu": { velho: json(200, { admin: false, operaCarteira: true }) } });
    await expect(meuCargo()).resolves.toEqual(NEUTRO);
  });

  it("IA negada é `false` sem nenhuma recuperação de sessão", async () => {
    const auth = instalarSupabase();
    instalarFetch({ "/api/ia": { velho: json(200, { configurado: true, permitido: false }) } });
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
});

describe("boot sem sessão", () => {
  it("2. nenhum fetch, IA false e cargo NEUTRO", async () => {
    const auth = instalarSupabase({ token: null });
    const fetchMock = instalarFetch({});

    await expect(meuCargo()).resolves.toEqual(NEUTRO);
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
  });
});

describe("boot com sessão recusada", () => {
  it("3. session_not_found nas duas GETs: 1 getUser, 1 signOut local, 1 aviso; IA false e cargo NEUTRO", async () => {
    const auth = instalarSupabase({ getUser: SESSAO_INEXISTENTE });
    const fetchMock = instalarFetch({
      "/api/ia": { velho: json(401, { erro: "sessao-invalida" }) },
      "/api/admin/eu": { velho: json(401, { erro: "sessao-invalida" }) },
    });

    const [ia, cargo] = await Promise.all([iaDisponivelParaUsuario(), meuCargo()]);

    expect(ia).toBe(false);
    expect(cargo).toEqual(NEUTRO);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(MENSAGEM_SESSAO_ENCERRADA, "error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("7. a segunda GET recebe o 401 DEPOIS do encerramento: ainda 1 getUser, 1 signOut, 1 aviso", async () => {
    const auth = instalarSupabase({ getUser: SESSAO_INEXISTENTE });
    let liberarAdmin!: () => void;
    const portaoAdmin = new Promise<void>((resolve) => {
      liberarAdmin = resolve;
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/admin/eu")) await portaoAdmin;
      return json(401, { erro: "sessao-invalida" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const cargo = meuCargo();
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    liberarAdmin();

    await expect(cargo).resolves.toEqual(NEUTRO);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("4. bad_jwt renovável: 1 getUser, 1 refresh, e cada GET repete uma vez com o token novo", async () => {
    const auth = instalarSupabase({ getUser: JWT_RECUSADO });
    const fetchMock = instalarFetch({
      "/api/ia": { velho: json(401, { erro: "sessao-invalida" }), novo: json(200, { configurado: true, permitido: true }) },
      "/api/admin/eu": { velho: json(401, { erro: "sessao-invalida" }), novo: json(200, { admin: true, operaCarteira: true }) },
    });

    const [ia, cargo] = await Promise.all([iaDisponivelParaUsuario(), meuCargo()]);

    expect(ia).toBe(true);
    expect(cargo).toEqual({ admin: true, operaCarteira: true });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    for (const rota of ["/api/ia", "/api/admin/eu"]) {
      expect(chamadasPara(fetchMock, rota).map(([, init]) => bearer(init))).toEqual([
        "Bearer token-velho",
        "Bearer token-novo",
      ]);
    }
  });
});

describe("Auth indisponível", () => {
  it.each([503, 500])("5/6. %i: sem logout, sem refresh, sem aviso de sessão; IA false e cargo NEUTRO", async (status) => {
    const auth = instalarSupabase();
    instalarFetch({
      "/api/ia": { velho: json(status, { erro: status === 503 ? "auth-indisponivel" : "erro-auth" }) },
      "/api/admin/eu": { velho: json(status, { erro: status === 503 ? "auth-indisponivel" : "erro-auth" }) },
    });

    const [ia, cargo] = await Promise.all([iaDisponivelParaUsuario(), meuCargo()]);

    expect(ia).toBe(false);
    expect(cargo).toEqual(NEUTRO);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    // A sessão local continua de pé: a próxima chamada ainda sai com ela.
    await expect(auth.getSession()).resolves.toMatchObject({ data: { session: { access_token: "token-velho" } } });
  });

  it("meuCargo nunca lança nem trava o gate: rede caída, corpo ilegível e resposta estranha dão NEUTRO", async () => {
    instalarSupabase();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(meuCargo()).resolves.toEqual(NEUTRO);
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(meuCargo()).resolves.toEqual(NEUTRO);
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);

    getSupabaseMock.mockImplementation(() => {
      throw new Error("configuração ausente");
    });
    await expect(meuCargo()).resolves.toEqual(NEUTRO);
    await expect(iaDisponivelParaUsuario()).resolves.toBe(false);
  });
});

describe("rajada no boot", () => {
  async function rajada(getUser: ResultadoGetUser) {
    const auth = instalarSupabase({ getUser });
    let liberar!: () => void;
    const portao = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    auth.getUser.mockImplementation(async () => {
      await portao;
      return getUser;
    });
    const fetchMock = instalarFetch({
      "/api/ia": { velho: json(401), novo: json(200, { configurado: true, permitido: true }) },
      "/api/admin/eu": { velho: json(401), novo: json(200, { admin: false, operaCarteira: true }) },
      "/api/admin/corretores": { velho: json(401), novo: json(200, { ok: true }) },
    });
    const chamadas = Promise.all([
      iaDisponivelParaUsuario(),
      meuCargo(),
      fetchAutenticado("/api/admin/corretores", {}, { repetivel: true }),
    ]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    liberar();
    const resultados = await chamadas;
    return { auth, fetchMock, resultados };
  }

  it("13. IA + cargo + uma terceira operação com 401 juntas, sessão revogada: 1 getUser, 1 signOut, 1 aviso", async () => {
    const { auth, fetchMock } = await rajada(SESSAO_INEXISTENTE);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("13. a mesma rajada com bad_jwt: 1 getUser, 1 refresh, cada GET repete uma vez, nenhum aviso", async () => {
    const { auth, fetchMock, resultados } = await rajada(JWT_RECUSADO);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(resultados[0]).toBe(true);
    expect(resultados[1]).toEqual(NEUTRO);
    expect(resultados[2]?.status).toBe(200);
  });
});

describe("fronteiras", () => {
  it("nenhum log do boot carrega token ou Bearer", async () => {
    instalarSupabase({ getUser: JWT_RECUSADO });
    instalarFetch({
      "/api/ia": { velho: json(401), novo: json(200, { configurado: true, permitido: true }) },
      "/api/admin/eu": { velho: json(401), novo: json(200, NEUTRO) },
    });
    await Promise.all([iaDisponivelParaUsuario(), meuCargo()]);
    expect(JSON.stringify(logs)).not.toMatch(/token-velho|token-novo|Bearer|Authorization|access_token/);
  });

  it("8. os clientes do boot não navegam: a navegação continua derivada do estado da sessão", () => {
    const raiz = join(__dirname, "..");
    for (const arquivo of ["lib/ia.ts", "lib/admin.ts"]) {
      const codigo = readFileSync(join(raiz, arquivo), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(codigo, arquivo).not.toMatch(/next\/navigation|useRouter|router\.|window\.location|location\.(href|assign|replace)/);
    }
  });
});
