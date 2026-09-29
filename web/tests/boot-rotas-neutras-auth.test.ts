import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getIa } from "@/app/api/ia/route";
import { GET as getAdminEu } from "@/app/api/admin/eu/route";

/* AUTH-1c.1: as duas rotas que o boot consulta sozinho. Falha de
   autenticação segue o contrato do AUTH-1b (401/503/500); permissão e
   cargo continuam respondendo 200, porque são resposta, não erro.

   O SDK é o de verdade e só o HTTP é simulado, como em
   auth-servidor.test.ts: o teste prova a conversão real de cada resposta
   do GoTrue, em vez de supor. */

const URL_SUPABASE = "https://projeto.supabase.co";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3VhcmlvIn0.assinatura-secreta";
const USUARIO = { id: "0f3c2d4e-1111-4222-8333-444455556666", email: "corretor@exemplo.test", phone: "5543999990000" };
const NEUTRO = { admin: false, operaCarteira: true };

type Resposta = () => Response | Promise<Response>;

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "x-supabase-api-version": "2024-01-01" },
  });
}

function requisicao(rota: string, authorization: string | null = `Bearer ${TOKEN}`): Request {
  return new Request(`http://localhost${rota}`, {
    headers: authorization === null ? {} : { Authorization: authorization },
  });
}

let chamadasUser: number;
let chamadasRest: Array<{ tabela: string; authorization: string | null }>;
let respostaUser: Resposta;
let respostaRest: Record<string, Resposta>;
let saidaConsole: unknown[][];

function instalarFetch() {
  vi.stubGlobal("fetch", vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url.includes("/auth/v1/user")) {
      chamadasUser += 1;
      return respostaUser();
    }
    const cabecalhos = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
    const tabela = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1] ?? "?";
    chamadasRest.push({ tabela, authorization: cabecalhos.get("authorization") });
    return (respostaRest[tabela] ?? (() => json(200, [])))();
  }));
}

const FALHAS_AUTH: Array<[string, Resposta, number, string]> = [
  ["session_not_found", () => json(403, { code: "session_not_found", msg: "Session does not exist" }), 401, "sessao-invalida"],
  ["bad_jwt", () => json(403, { code: "bad_jwt", msg: "invalid JWT" }), 401, "sessao-invalida"],
  ["AuthRetryable (rede)", () => { throw new TypeError("fetch failed"); }, 503, "auth-indisponivel"],
  ["AuthRetryable (5xx)", () => json(503, { msg: "upstream" }), 503, "auth-indisponivel"],
  ["erro Auth desconhecido", () => json(400, { code: "validation_failed", msg: "x" }), 500, "erro-auth"],
];

beforeEach(() => {
  chamadasUser = 0;
  chamadasRest = [];
  respostaUser = () => json(200, USUARIO);
  respostaRest = {};
  saidaConsole = [];
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-publica");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-secreta");
  // IA configurada e autorizada fora da Vercel (o opt-in local), sem as
  // travas de execução automática.
  vi.stubEnv("OPENAI_API_KEY", "sk-teste");
  vi.stubEnv("ALLOW_REAL_OPENAI", "1");
  vi.stubEnv("CI", "0");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  for (const nome of Object.keys(process.env)) {
    if (nome === "CODEX_HOME" || nome.startsWith("CODEX_")) vi.stubEnv(nome, "0");
  }
  instalarFetch();
  for (const nivel of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
      saidaConsole.push(args);
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function logsAuth(): unknown[] {
  return saidaConsole.filter((args) => args[0] === "[auth]").map((args) => args[1]);
}

describe("GET /api/ia", () => {
  it("1. IA não configurada: 200 configurado:false sem perguntar ao Auth", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const r = await getIa(requisicao("/api/ia"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ configurado: false, permitido: false });
    expect(chamadasUser).toBe(0);
    expect(chamadasRest).toHaveLength(0);
  });

  it("1b. OpenAI não autorizada no ambiente (Preview): também não pergunta ao Auth", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const r = await getIa(requisicao("/api/ia"));
    expect(await r.json()).toEqual({ configurado: false, permitido: false });
    expect(chamadasUser).toBe(0);
  });

  it("2. sessão válida com permissão: 200 permitido:true, lendo ia_permissoes com o Bearer do chamador", async () => {
    respostaRest.ia_permissoes = () => json(200, [{ liberado: true }]);
    const r = await getIa(requisicao("/api/ia"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ configurado: true, permitido: true });
    expect(chamadasUser).toBe(1);
    expect(chamadasRest).toEqual([{ tabela: "ia_permissoes", authorization: `Bearer ${TOKEN}` }]);
  });

  it("3. sessão válida sem permissão: 200 permitido:false (não é erro de sessão)", async () => {
    respostaRest.ia_permissoes = () => json(200, []);
    const r = await getIa(requisicao("/api/ia"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ configurado: true, permitido: false });
    expect(logsAuth()).toEqual([]);
  });

  it.each(FALHAS_AUTH)("4-7. %s: status do contrato, nunca 200 neutro", async (_caso, falha, status, erro) => {
    respostaUser = falha;
    const r = await getIa(requisicao("/api/ia"));
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ erro });
    expect(chamadasUser).toBe(1);
    expect(chamadasRest).toHaveLength(0);
    expect(logsAuth()).toEqual([expect.objectContaining({ rota: "ia", status })]);
  });

  it("sem Bearer: 401, sem perguntar ao Auth", async () => {
    const r = await getIa(requisicao("/api/ia", null));
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: "sessao-invalida" });
    expect(chamadasUser).toBe(0);
  });

  it("8. erro ao ler ia_permissoes continua negando com 200 (não vira erro de autenticação)", async () => {
    respostaRest.ia_permissoes = () => json(500, { code: "XX000", message: "falha interna" });
    const r = await getIa(requisicao("/api/ia"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ configurado: true, permitido: false });
    expect(logsAuth()).toEqual([]);
  });
});

describe("GET /api/admin/eu", () => {
  it("9. sessão válida de admin: 200 admin:true, consultando pelo usuário do token", async () => {
    respostaRest.admins = () => json(200, [{ user_id: USUARIO.id, opera_carteira: false }]);
    const r = await getAdminEu(requisicao("/api/admin/eu"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ admin: true, operaCarteira: false });
    expect(chamadasUser).toBe(1);
    expect(chamadasRest).toEqual([{ tabela: "admins", authorization: "Bearer service-role-secreta" }]);
  });

  it("10. sessão válida de não admin: 200 NEUTRO (anti-oráculo), nunca 401/403", async () => {
    respostaRest.admins = () => json(200, []);
    const r = await getAdminEu(requisicao("/api/admin/eu"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(NEUTRO);
    expect(logsAuth()).toEqual([]);
  });

  it.each(FALHAS_AUTH)("11-14. %s: status do contrato, sem consultar admins", async (_caso, falha, status, erro) => {
    respostaUser = falha;
    const r = await getAdminEu(requisicao("/api/admin/eu"));
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ erro });
    expect(chamadasRest).toHaveLength(0);
    expect(logsAuth()).toEqual([expect.objectContaining({ rota: "admin-eu", status })]);
  });

  it("sem Bearer: 401, sem perguntar ao Auth", async () => {
    const r = await getAdminEu(requisicao("/api/admin/eu", null));
    expect(r.status).toBe(401);
    expect(chamadasUser).toBe(0);
  });

  it("15. erro na query admins: 200 NEUTRO", async () => {
    respostaRest.admins = () => json(500, { code: "XX000", message: "falha interna" });
    const r = await getAdminEu(requisicao("/api/admin/eu"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(NEUTRO);
  });

  it("service role ausente depois de autenticar: 200 NEUTRO", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await getAdminEu(requisicao("/api/admin/eu"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(NEUTRO);
    expect(chamadasUser).toBe(1);
    expect(chamadasRest).toHaveLength(0);
  });
});

describe("fronteiras", () => {
  it("cada rota valida a sessão uma vez só (o caminho feliz não soma chamadas ao Auth)", async () => {
    respostaRest.ia_permissoes = () => json(200, [{ liberado: true }]);
    await getIa(requisicao("/api/ia"));
    await getAdminEu(requisicao("/api/admin/eu"));
    expect(chamadasUser).toBe(2);
  });

  it("nenhuma saída de console carrega token, header, e-mail, telefone ou user_id", async () => {
    const cenarios: Resposta[] = [
      () => json(200, USUARIO),
      () => json(403, { code: "bad_jwt", msg: `token ${TOKEN} de ${USUARIO.email}` }),
      () => json(403, { code: "session_not_found", msg: `sessão de ${USUARIO.id}` }),
      () => json(503, { msg: `falha ${USUARIO.phone}` }),
    ];
    const corpos: unknown[] = [];
    for (const cenario of cenarios) {
      respostaUser = cenario;
      corpos.push(await (await getIa(requisicao("/api/ia"))).json());
      corpos.push(await (await getAdminEu(requisicao("/api/admin/eu"))).json());
    }
    const serializado = JSON.stringify([saidaConsole, corpos]);
    for (const proibido of [TOKEN, "Bearer", "authorization", "Authorization", USUARIO.email, USUARIO.id, USUARIO.phone, "service-role-secreta"]) {
      expect(serializado).not.toContain(proibido);
    }
  });
});
