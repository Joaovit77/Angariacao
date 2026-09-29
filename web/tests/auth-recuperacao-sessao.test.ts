import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAutenticado,
  MENSAGEM_SESSAO_ENCERRADA,
  MENSAGEM_SESSAO_RENOVADA,
  recuperarSessao,
} from "@/lib/auth/recuperacaoSessao";
import { toast } from "@/lib/toast";

vi.mock("@/lib/toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => {
    throw new Error("os testes injetam o cliente; o singleton não pode ser usado");
  },
}));

const toastMock = vi.mocked(toast);

type ResultadoGetUser = { data: { user: { id: string } | null }; error: unknown };
type ResultadoRefresh = { data: { session: { access_token: string } | null }; error: unknown };

const USUARIO_VALIDO: ResultadoGetUser = { data: { user: { id: "u1" } }, error: null };
const SESSAO_INEXISTENTE: ResultadoGetUser = { data: { user: null }, error: new AuthSessionMissingError() };
const JWT_RECUSADO: ResultadoGetUser = {
  data: { user: null },
  error: new AuthApiError("invalid JWT", 403, "bad_jwt"),
};
const AUTH_FORA: ResultadoGetUser = {
  data: { user: null },
  error: new AuthRetryableFetchError("Gateway Timeout", 504),
};
const REFRESH_OK: ResultadoRefresh = { data: { session: { access_token: "token-novo" } }, error: null };
const REFRESH_SEM_SESSAO: ResultadoRefresh = {
  data: { session: null },
  error: new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found"),
};
const REFRESH_AUTH_FORA: ResultadoRefresh = {
  data: { session: null },
  error: new AuthRetryableFetchError("Service Unavailable", 503),
};

function clienteFalso({
  token = "token-velho" as string | null,
  getUser = USUARIO_VALIDO,
  refresh = REFRESH_OK,
  portaoGetUser,
}: {
  token?: string | null;
  getUser?: ResultadoGetUser;
  refresh?: ResultadoRefresh;
  portaoGetUser?: Promise<void>;
} = {}) {
  let atual = token;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: atual ? { access_token: atual } : null }, error: null })),
    getUser: vi.fn(async () => {
      if (portaoGetUser) await portaoGetUser;
      return getUser;
    }),
    refreshSession: vi.fn(async () => {
      if (refresh.data.session) atual = refresh.data.session.access_token;
      return refresh;
    }),
    signOut: vi.fn(async () => {
      atual = null;
      return { error: null };
    }),
  };
  return { auth, cliente: { auth } as unknown as SupabaseClient };
}

function resposta(status: number): Response {
  return new Response(JSON.stringify({ ok: status < 400 }), { status });
}

/** Responde na ordem dada; a última se repete. */
function fetchFalso(...status: number[]) {
  let i = 0;
  return vi.fn<typeof fetch>(async () => resposta(status[Math.min(i++, status.length - 1)]));
}

function bearer(chamada: unknown[]): string | undefined {
  return ((chamada[1] as RequestInit).headers as Record<string, string>).Authorization;
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
});

describe("fetchAutenticado — fluxo sem recuperação", () => {
  it("1. sessão válida: uma chamada, com o Bearer da sessão local, sem consultar o Auth", async () => {
    const { auth, cliente } = clienteFalso();
    const fetchImpl = fetchFalso(200);

    const r = await fetchAutenticado("/api/x", { cache: "no-store" }, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    expect(bearer(fetchImpl.mock.calls[0])).toBe("Bearer token-velho");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("2. sem sessão local não envia a requisição protegida e devolve null", async () => {
    const { auth, cliente } = clienteFalso({ token: null });
    const fetchImpl = fetchFalso(200);

    const r = await fetchAutenticado("/api/x", { method: "POST" }, { repetivel: false, cliente, fetchImpl });

    expect(r).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("11. 403 volta como veio: zero getUser, zero refresh, zero signOut", async () => {
    const { auth, cliente } = clienteFalso({ getUser: SESSAO_INEXISTENTE });
    const fetchImpl = fetchFalso(403);

    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("mantém os headers de quem chama e só acrescenta o Authorization", async () => {
    const { cliente } = clienteFalso();
    const fetchImpl = fetchFalso(200);
    await fetchAutenticado("/api/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, {
      repetivel: false,
      cliente,
      fetchImpl,
    });
    expect(fetchImpl.mock.calls[0][1]).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-velho" },
      body: "{}",
    });
  });
});

describe("classificação depois de um 401", () => {
  it("3. getUser válido: resultado `valida`, sem refresh e sem logout; o 401 segue para quem chamou", async () => {
    const { auth, cliente } = clienteFalso();
    const fetchImpl = fetchFalso(401);

    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    await expect(recuperarSessao(cliente)).resolves.toBe("valida");
  });

  it("4. session_not_found: sem refresh, signOut com scope local e resultado `encerrada`", async () => {
    const { auth, cliente } = clienteFalso({ getUser: SESSAO_INEXISTENTE });
    const fetchImpl = fetchFalso(401);

    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("5. session_not_found: uma única mensagem simples, sem código interno", async () => {
    const { cliente } = clienteFalso({ getUser: SESSAO_INEXISTENTE });

    await expect(recuperarSessao(cliente)).resolves.toBe("encerrada");

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(MENSAGEM_SESSAO_ENCERRADA, "error");
    expect(MENSAGEM_SESSAO_ENCERRADA).toBe("Sua sessão expirou. Entre novamente.");
    expect(MENSAGEM_SESSAO_ENCERRADA).not.toMatch(/session|jwt|auth|erro|error/i);
  });

  it("6/7. bad_jwt: exatamente um refresh, que ao passar dá `renovada` sem logout", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });

    await expect(recuperarSessao(cliente)).resolves.toBe("renovada");

    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("8. bad_jwt com refresh que prova sessão inexistente: logout local", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO, refresh: REFRESH_SEM_SESSAO });

    await expect(recuperarSessao(cliente)).resolves.toBe("encerrada");

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(toastMock).toHaveBeenCalledWith(MENSAGEM_SESSAO_ENCERRADA, "error");
  });

  it("9. AuthRetryableFetchError no getUser: `indeterminada`, sem refresh, sem logout, sem repetir", async () => {
    const { auth, cliente } = clienteFalso({ getUser: AUTH_FORA });
    const fetchImpl = fetchFalso(401);

    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    await expect(recuperarSessao(cliente)).resolves.toBe("indeterminada");
  });

  it("10. AuthRetryableFetchError no refresh: `indeterminada`, sem logout", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO, refresh: REFRESH_AUTH_FORA });

    await expect(recuperarSessao(cliente)).resolves.toBe("indeterminada");

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("erro sem código conhecido e exceção inesperada não provam nada: `indeterminada`, sem logout", async () => {
    const semCodigo = clienteFalso({
      getUser: { data: { user: null }, error: new AuthApiError("Internal Server Error", 500, "unexpected_failure") },
    });
    await expect(recuperarSessao(semCodigo.cliente)).resolves.toBe("indeterminada");
    expect(semCodigo.auth.signOut).not.toHaveBeenCalled();

    const excecao = clienteFalso();
    excecao.auth.getUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(recuperarSessao(excecao.cliente)).resolves.toBe("indeterminada");
    expect(excecao.auth.signOut).not.toHaveBeenCalled();
    expect(excecao.auth.refreshSession).not.toHaveBeenCalled();
  });
});

describe("repetição", () => {
  it("12. GET repetível com refresh ok: exatamente 2 fetches, o segundo com o token novo", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const fetchImpl = fetchFalso(401, 200);

    const r = await fetchAutenticado("/api/x", { cache: "no-store" }, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bearer(fetchImpl.mock.calls[0])).toBe("Bearer token-velho");
    expect(bearer(fetchImpl.mock.calls[1])).toBe("Bearer token-novo");
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("13. GET repetido que volta 401 de novo: nunca uma terceira tentativa nem nova recuperação", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const fetchImpl = fetchFalso(401, 401, 200);

    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl });

    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("14. POST com refresh ok: exatamente 1 fetch e o aviso de sessão renovada", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const fetchImpl = fetchFalso(401, 200);

    const r = await fetchAutenticado("/api/x", { method: "POST", body: "{}" }, { repetivel: false, cliente, fetchImpl });

    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(MENSAGEM_SESSAO_RENOVADA, "warning");
  });

  it("mutação marcada por engano como repetível continua sem repetir", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const { cliente } = clienteFalso({ getUser: JWT_RECUSADO });
      const fetchImpl = fetchFalso(401, 200);
      const r = await fetchAutenticado("/api/x", { method }, { repetivel: true, cliente, fetchImpl });
      expect(r?.status).toBe(401);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("GET não marcado como repetível não repete", async () => {
    const { cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const fetchImpl = fetchFalso(401, 200);
    const r = await fetchAutenticado("/api/x", {}, { repetivel: false, cliente, fetchImpl });
    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("depois de sessão encerrada nada é repetido", async () => {
    const { cliente } = clienteFalso({ getUser: SESSAO_INEXISTENTE });
    const fetchImpl = fetchFalso(401, 200);
    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl });
    expect(r?.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("single-flight", () => {
  async function cincoSimultaneas(getUser: ResultadoGetUser, metodo: "GET" | "POST" = "GET") {
    let liberar!: () => void;
    const portaoGetUser = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const falso = clienteFalso({ getUser, portaoGetUser });
    const fetchImpl = vi.fn<typeof fetch>(async (...chamada) =>
      resposta(bearer(chamada) === "Bearer token-novo" ? 200 : 401));
    const chamadas = Array.from({ length: 5 }, () =>
      fetchAutenticado("/api/x", { method: metodo }, { repetivel: metodo === "GET", cliente: falso.cliente, fetchImpl }));
    // Só libera o Auth quando as cinco já receberam o 401.
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(5));
    liberar();
    const respostas = await Promise.all(chamadas);
    return { ...falso, fetchImpl, respostas };
  }

  it("15. cinco 401 simultâneos: 1 getUser, no máximo 1 refresh, e cada GET repete uma vez", async () => {
    const { auth, fetchImpl, respostas } = await cincoSimultaneas(JWT_RECUSADO);

    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(respostas.map((r) => r?.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("16. cinco session_not_found simultâneos: 1 getUser, 1 signOut local, 1 aviso", async () => {
    const { auth, fetchImpl } = await cincoSimultaneas(SESSAO_INEXISTENTE);

    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("cinco POSTs renovados juntos: nenhum repete e o aviso sai uma vez", async () => {
    const { auth, fetchImpl } = await cincoSimultaneas(JWT_RECUSADO, "POST");

    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(MENSAGEM_SESSAO_RENOVADA, "warning");
  });

  it("17. a recuperação concluída libera a vaga: um 401 depois abre outra verificação", async () => {
    const { auth, cliente } = clienteFalso({ getUser: AUTH_FORA });

    await expect(recuperarSessao(cliente)).resolves.toBe("indeterminada");
    await expect(recuperarSessao(cliente)).resolves.toBe("indeterminada");

    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });

  it("a vaga é liberada mesmo quando o Auth lança", async () => {
    const { auth, cliente } = clienteFalso();
    auth.getUser.mockRejectedValueOnce(new Error("boom"));

    await expect(recuperarSessao(cliente)).resolves.toBe("indeterminada");
    await expect(recuperarSessao(cliente)).resolves.toBe("valida");
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });
});

describe("401 tardio (a resposta chega depois que outra recuperação terminou)", () => {
  /** Duas chamadas saem com o token velho; cada 401 só chega quando o
      teste manda. Chamadas com o token novo respondem na hora. */
  function doisEnviosComTokenVelho(statusTokenNovo = 200) {
    const liberacoes: Array<() => void> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (...chamada) => {
      if (bearer(chamada) !== "Bearer token-velho") return resposta(statusTokenNovo);
      await new Promise<void>((resolve) => liberacoes.push(resolve));
      return resposta(401);
    });
    return { fetchImpl, liberar: (i: number) => liberacoes[i]() };
  }

  it("A. depois de `encerrada`: sem novo getUser, sem segundo aviso, 401 original de volta", async () => {
    const { auth, cliente } = clienteFalso({ getUser: SESSAO_INEXISTENTE });
    const { fetchImpl, liberar } = doisEnviosComTokenVelho();
    const primeira = fetchAutenticado("/api/a", {}, { repetivel: true, cliente, fetchImpl });
    const segunda = fetchAutenticado("/api/b", {}, { repetivel: true, cliente, fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    liberar(0);
    expect((await primeira)?.status).toBe(401);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    liberar(1);
    const r = await segunda;

    expect(r?.status).toBe(401);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(logs.at(-1)).toEqual(["[auth]", { recuperacao: "encerrada", motivo: "401-tardio-sessao-encerrada" }]);
  });

  it("B. depois de `renovada`: GET repetível refaz uma vez com o token atual, sem novo getUser nem refresh", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const { fetchImpl, liberar } = doisEnviosComTokenVelho();
    const primeira = fetchAutenticado("/api/a", {}, { repetivel: true, cliente, fetchImpl });
    const segunda = fetchAutenticado("/api/b", {}, { repetivel: true, cliente, fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    liberar(0);
    expect((await primeira)?.status).toBe(200);
    liberar(1);
    const r = await segunda;

    expect(r?.status).toBe(200);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    const daSegunda = fetchImpl.mock.calls.filter(([url]) => url === "/api/b").map(bearer);
    expect(daSegunda).toEqual(["Bearer token-velho", "Bearer token-novo"]);
    expect(logs.at(-1)).toEqual(["[auth]", { recuperacao: "renovada", motivo: "401-tardio-token-renovado" }]);
  });

  it("B'. a repetição com o token atual que volta 401 não repete de novo nem abre recuperação", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const { fetchImpl, liberar } = doisEnviosComTokenVelho(401);
    const primeira = fetchAutenticado("/api/a", {}, { repetivel: true, cliente, fetchImpl });
    const segunda = fetchAutenticado("/api/b", {}, { repetivel: true, cliente, fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    liberar(0);
    await primeira;
    liberar(1);
    const r = await segunda;

    expect(r?.status).toBe(401);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/b")).toHaveLength(2);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("C. mutação depois de `renovada`: não repete, não abre recuperação, devolve o 401 original", async () => {
    const { auth, cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const { fetchImpl, liberar } = doisEnviosComTokenVelho();
    const primeira = fetchAutenticado("/api/a", {}, { repetivel: true, cliente, fetchImpl });
    const segunda = fetchAutenticado("/api/b", { method: "POST", body: "{}" }, { repetivel: false, cliente, fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    liberar(0);
    await primeira;
    liberar(1);
    const r = await segunda;

    expect(r?.status).toBe(401);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/b")).toHaveLength(1);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("GET não repetível depois de `renovada` também não repete", async () => {
    const { cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const { fetchImpl, liberar } = doisEnviosComTokenVelho();
    const primeira = fetchAutenticado("/api/a", {}, { repetivel: true, cliente, fetchImpl });
    const segunda = fetchAutenticado("/api/b", {}, { repetivel: false, cliente, fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    liberar(0);
    await primeira;
    liberar(1);
    expect((await segunda)?.status).toBe(401);
    expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/b")).toHaveLength(1);
  });

  it("C (sem mudança de token). 401 com o token local igual ao enviado segue o fluxo existente de recuperação", async () => {
    const { auth, cliente } = clienteFalso({ getUser: SESSAO_INEXISTENTE });
    const r = await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl: fetchFalso(401) });
    expect(r?.status).toBe(401);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("os logs do 401 tardio não carregam token", async () => {
    const { cliente } = clienteFalso({ getUser: JWT_RECUSADO });
    const { fetchImpl, liberar } = doisEnviosComTokenVelho();
    const primeira = fetchAutenticado("/api/a", {}, { repetivel: true, cliente, fetchImpl });
    const segunda = fetchAutenticado("/api/b", {}, { repetivel: true, cliente, fetchImpl });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    liberar(0);
    await primeira;
    liberar(1);
    await segunda;

    expect(JSON.stringify(logs)).not.toMatch(/token-velho|token-novo|Bearer|Authorization|access_token/);
    for (const args of logs) {
      expect(args[0]).toBe("[auth]");
      expect(Object.keys(args[1] as object).sort()).toEqual(["motivo", "recuperacao"]);
    }
  });
});

describe("segurança e fronteiras", () => {
  const RAIZ = join(__dirname, "..");
  const fonteHelper = readFileSync(join(RAIZ, "lib/auth/recuperacaoSessao.ts"), "utf8");

  it("18. o helper nunca navega: sem next/navigation, router ou window.location", () => {
    const codigo = fonteHelper.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/next\/navigation|useRouter|router\.|window\.location|location\.(href|assign|replace)/);
  });

  it("19. logs não contêm token, Bearer nem o objeto de erro", async () => {
    const cenarios: ResultadoGetUser[] = [USUARIO_VALIDO, SESSAO_INEXISTENTE, JWT_RECUSADO, AUTH_FORA];
    for (const getUser of cenarios) {
      const { cliente } = clienteFalso({ getUser });
      await fetchAutenticado("/api/x", {}, { repetivel: true, cliente, fetchImpl: fetchFalso(401, 200) });
    }
    const { cliente } = clienteFalso({ getUser: JWT_RECUSADO, refresh: REFRESH_SEM_SESSAO });
    await recuperarSessao(cliente);

    expect(logs.length).toBeGreaterThan(0);
    const texto = JSON.stringify(logs);
    expect(texto).not.toMatch(/token-velho|token-novo|Bearer|Authorization|access_token|refresh_token|u1/);
    expect(texto).not.toMatch(/Invalid|Gateway|session missing/i);
    for (const args of logs) {
      expect(args[0]).toBe("[auth]");
      expect(Object.keys(args[1] as object).sort()).toEqual(["motivo", "recuperacao"]);
    }
  });

  it("20/25. logout do código de produção: nunca signOut() sem argumento, nunca global/others", () => {
    function arquivos(dir: string): string[] {
      return readdirSync(dir).flatMap((nome) => {
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) return arquivos(caminho);
        return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
      });
    }
    const chamadas: { arquivo: string; chamada: string }[] = [];
    for (const pasta of ["app", "components", "lib"]) {
      for (const arquivo of arquivos(join(RAIZ, pasta))) {
        const fonte = readFileSync(arquivo, "utf8");
        for (const achado of fonte.matchAll(/\.signOut\(([^)]*)\)/g)) {
          chamadas.push({ arquivo: relative(RAIZ, arquivo).replace(/\\/g, "/"), chamada: achado[1].trim() });
        }
      }
    }

    expect(chamadas.map((c) => c.arquivo).sort()).toEqual([
      "components/configuracoes/ConfiguracoesView.tsx",
      "components/painel/MenuUsuario.tsx",
      "lib/auth/recuperacaoSessao.ts",
    ]);
    for (const { arquivo, chamada } of chamadas) {
      expect(chamada, arquivo).toBe('{ scope: "local" }');
    }
  });
});
