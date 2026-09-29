import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { autenticarRequisicao, classificarFalhaAuth } from "@/lib/servidor/autenticacao";

/* O SDK é o de verdade: só o HTTP é simulado. Assim o teste prova como o
   auth-js 2.x converte cada resposta do GoTrue (session_not_found vira
   AuthSessionMissingError, 5xx vira AuthRetryableFetchError...), em vez de
   supor. */

const URL_SUPABASE = "https://projeto.supabase.co";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3VhcmlvIn0.assinatura-secreta";
const USUARIO = { id: "0f3c2d4e-1111-4222-8333-444455556666", email: "corretor@exemplo.test", phone: "5543999990000" };

type Resposta = () => Response | Promise<Response>;

function json(status: number, corpo: unknown, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "x-supabase-api-version": "2024-01-01", ...cabecalhos },
  });
}

function requisicao(authorization?: string): Request {
  return new Request("http://localhost/api/qualquer", {
    method: "POST",
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
}

let chamadasUser: Array<{ url: string; authorization: string | null }>;
let chamadasRest: Array<{ url: string; authorization: string | null }>;
let respostaUser: Resposta;
let aviso: MockInstance<typeof console.warn>;

function instalarFetch() {
  vi.stubGlobal("fetch", vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    const cabecalhos = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    const registro = { url, authorization: cabecalhos.get("authorization") };
    if (url.includes("/auth/v1/user")) {
      chamadasUser.push(registro);
      return respostaUser();
    }
    chamadasRest.push(registro);
    return json(200, []);
  }));
}

function logs(): unknown[] {
  return aviso.mock.calls.map((chamada) => chamada[1]);
}

describe("autenticarRequisicao com o SDK real", () => {
  beforeEach(() => {
    chamadasUser = [];
    chamadasRest = [];
    respostaUser = () => json(200, USUARIO);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_SUPABASE);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-publica");
    instalarFetch();
    aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    // O auth-js escreve o erro de rede no console.error; não é do helper.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["sem Authorization", undefined],
    ["scheme Basic", "Basic dXN1YXJpbzpzZW5oYQ=="],
    ["Bearer vazio", "Bearer "],
    ["Bearer só com espaços", "Bearer    "],
  ])("%s: 401 sem perguntar ao Auth", async (_caso, authorization) => {
    const resultado = await autenticarRequisicao(requisicao(authorization), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 401, erro: "sessao-invalida" });
    expect(chamadasUser).toHaveLength(0);
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "sem_token", status: 401 }]);
  });

  it("Bearer não vazio e malformado vai ao Auth uma vez e o bad_jwt vira 401", async () => {
    respostaUser = () => json(403, { code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" });
    const resultado = await autenticarRequisicao(requisicao("Bearer abc"), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 401, erro: "sessao-invalida" });
    expect(chamadasUser).toEqual([{ url: `${URL_SUPABASE}/auth/v1/user`, authorization: "Bearer abc" }]);
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "jwt_invalido", status: 401, codigoAuth: "bad_jwt", statusAuth: 403 }]);
  });

  it("sessão revogada (session_not_found) vira 401", async () => {
    respostaUser = () => json(403, { code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" });
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 401, erro: "sessao-invalida" });
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "sessao_revogada", status: 401, statusAuth: 400 }]);
  });

  it.each(["user_not_found", "session_expired"])("%s vira 401", async (codigo) => {
    respostaUser = () => json(codigo === "user_not_found" ? 404 : 403, { code: codigo, msg: "x" });
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 401, erro: "sessao-invalida" });
    expect(logs()[0]).toMatchObject({ motivo: "sessao_revogada", codigoAuth: codigo });
  });

  it.each([500, 502, 503, 504, 522])("Auth respondendo %i vira 503", async (status) => {
    respostaUser = () => json(status, { msg: "upstream" });
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 503, erro: "auth-indisponivel" });
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "auth_indisponivel", status: 503, statusAuth: status }]);
  });

  it("falha de rede vira 503 (AuthRetryableFetchError status 0)", async () => {
    respostaUser = () => { throw new TypeError("fetch failed"); };
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 503, erro: "auth-indisponivel" });
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "auth_indisponivel", status: 503, statusAuth: 0 }]);
  });

  it("rate limit do Auth vira 503", async () => {
    respostaUser = () => json(429, { code: "over_request_rate_limit", msg: "Request rate limit reached" });
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 503, erro: "auth-indisponivel" });
    expect(logs()[0]).toMatchObject({ motivo: "auth_indisponivel", codigoAuth: "over_request_rate_limit", statusAuth: 429 });
  });

  it("resposta de erro que não é JSON (proxy) vira 503", async () => {
    respostaUser = () => new Response("<html>Bad Request</html>", { status: 400, headers: { "Content-Type": "text/html" } });
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 503, erro: "auth-indisponivel" });
  });

  it("AuthApiError 4xx com código não mapeado vira 500, nunca 401", async () => {
    respostaUser = () => json(400, { code: "validation_failed", msg: "x" });
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 500, erro: "erro-auth" });
    expect(logs()).toEqual([{
      rota: "rota/teste", motivo: "erro_auth", status: 500, causa: "codigo_nao_mapeado",
      codigoAuth: "validation_failed", statusAuth: 400,
    }]);
  });

  it("Auth responde 200 sem usuário: 500, nunca 401", async () => {
    respostaUser = () => json(200, {});
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 500, erro: "erro-auth" });
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "erro_auth", status: 500, causa: "resposta_inesperada" }]);
  });

  it("exceção inesperada (createClient com URL inválida) vira 500", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "isto não é url");
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 500, erro: "erro-auth" });
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "erro_auth", status: 500, causa: "excecao" }]);
  });

  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"])("%s ausente vira 500", async (variavel) => {
    vi.stubEnv(variavel, "");
    const resultado = await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    expect(resultado).toEqual({ ok: false, status: 500, erro: "erro-auth" });
    expect(chamadasUser).toHaveLength(0);
    expect(logs()).toEqual([{ rota: "rota/teste", motivo: "erro_auth", status: 500, causa: "configuracao" }]);
  });

  it("usuário válido: um getUser, só o userId, e o cliente devolvido carrega o Bearer do chamador", async () => {
    const resultado = await autenticarRequisicao(requisicao(`bearer ${TOKEN}`), "rota/teste");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.userId).toBe(USUARIO.id);
    expect(Object.keys(resultado).sort()).toEqual(["ok", "supabase", "userId"]);
    expect(chamadasUser).toEqual([{ url: `${URL_SUPABASE}/auth/v1/user`, authorization: `Bearer ${TOKEN}` }]);
    expect(aviso).not.toHaveBeenCalled();

    // O mesmo cliente segue para o PostgREST sob o RLS do chamador, sem revalidar.
    await resultado.supabase.from("radar_buscas").select("id");
    expect(chamadasRest).toHaveLength(1);
    expect(chamadasRest[0].authorization).toBe(`Bearer ${TOKEN}`);
    expect(chamadasUser).toHaveLength(1);
  });

  it("log e resultado nunca carregam token, header, mensagem do SDK, e-mail, telefone ou user_id", async () => {
    const cenarios: Resposta[] = [
      () => json(403, { code: "bad_jwt", msg: `token ${TOKEN} inválido para ${USUARIO.email}` }),
      () => json(403, { code: "session_not_found", msg: `sessão de ${USUARIO.id}` }),
      () => json(503, { msg: `falha interna ${USUARIO.phone}` }),
      () => json(400, { code: "Código Com Texto Livre", msg: USUARIO.email }),
      () => json(200, {}),
    ];
    const resultados: unknown[] = [];
    for (const cenario of cenarios) {
      respostaUser = cenario;
      resultados.push(await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste"));
    }
    resultados.push(await autenticarRequisicao(requisicao(`Basic ${TOKEN}`), "rota/teste"));
    const serializado = JSON.stringify([aviso.mock.calls, resultados]);
    for (const proibido of [TOKEN, "Bearer", "Basic", "authorization", "Authorization", USUARIO.email, USUARIO.id, USUARIO.phone, "msg", "inválido", "Texto Livre"]) {
      expect(serializado).not.toContain(proibido);
    }
    for (const [prefixo, entrada] of aviso.mock.calls) {
      expect(prefixo).toBe("[auth]");
      for (const chave of Object.keys(entrada as object)) {
        expect(["rota", "motivo", "status", "causa", "codigoAuth", "statusAuth"]).toContain(chave);
      }
    }
  });

  it("nunca renova, encerra nem guarda sessão no servidor", async () => {
    respostaUser = () => json(403, { code: "bad_jwt", msg: "x" });
    await autenticarRequisicao(requisicao(`Bearer ${TOKEN}`), "rota/teste");
    const urls = [...chamadasUser, ...chamadasRest].map((chamada) => chamada.url);
    expect(urls).toEqual([`${URL_SUPABASE}/auth/v1/user`]);
  });
});

describe("classificarFalhaAuth", () => {
  it.each([
    ["AuthSessionMissingError", new AuthSessionMissingError(), { motivo: "sessao_revogada", status: 401 }],
    ["session_not_found cru", new AuthApiError("x", 403, "session_not_found"), { motivo: "sessao_revogada", status: 401 }],
    ["bad_jwt", new AuthApiError("x", 403, "bad_jwt"), { motivo: "jwt_invalido", status: 401 }],
    ["user_not_found", new AuthApiError("x", 404, "user_not_found"), { motivo: "sessao_revogada", status: 401 }],
    ["session_expired", new AuthApiError("x", 403, "session_expired"), { motivo: "sessao_revogada", status: 401 }],
    ["Retryable status 0", new AuthRetryableFetchError("x", 0), { motivo: "auth_indisponivel", status: 503 }],
    ["Retryable 503", new AuthRetryableFetchError("x", 503), { motivo: "auth_indisponivel", status: 503 }],
    ["rate limit", new AuthApiError("x", 429, "over_request_rate_limit"), { motivo: "auth_indisponivel", status: 503 }],
    ["AuthApiError 5xx fora da lista do SDK", new AuthApiError("x", 507, undefined), { motivo: "auth_indisponivel", status: 503 }],
    ["AuthUnknownError", new AuthUnknownError("x", new Error("y")), { motivo: "auth_indisponivel", status: 503 }],
    ["AuthApiError 4xx desconhecido", new AuthApiError("x", 400, "validation_failed"), { motivo: "erro_auth", status: 500, causa: "codigo_nao_mapeado" }],
    ["AuthApiError 403 sem código", new AuthApiError("x", 403, undefined), { motivo: "erro_auth", status: 500, causa: "codigo_nao_mapeado" }],
    ["outro AuthError", new AuthError("x", 400, "otp_expired"), { motivo: "erro_auth", status: 500, causa: "codigo_nao_mapeado" }],
    ["TypeError", new TypeError("x"), { motivo: "erro_auth", status: 500, causa: "excecao" }],
    ["valor qualquer", "texto", { motivo: "erro_auth", status: 500, causa: "excecao" }],
  ])("%s", (_caso, erro, esperado) => {
    expect(classificarFalhaAuth(erro)).toEqual(esperado);
  });

  it("não lê a mensagem: bad_jwt com texto de rede continua 401, e Retryable com texto de JWT continua 503", () => {
    expect(classificarFalhaAuth(new AuthApiError("network timeout 503", 403, "bad_jwt")).status).toBe(401);
    expect(classificarFalhaAuth(new AuthRetryableFetchError("invalid JWT session_not_found", 0)).status).toBe(503);
  });
});
