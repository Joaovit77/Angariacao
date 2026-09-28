// R4.2f (temporário): guarda da rota diagnóstica do ZAP. Sai junto com o harness.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HTML_ZAP_SINTETICO, respostaFirecrawl, SEGREDOS_DO_HTML } from "./fixtures/zap-diagnostico-sintetico";

const mocks = vi.hoisted(() => ({
  exigirAdmin: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/app/api/admin/_comum", () => ({ exigirAdmin: mocks.exigirAdmin }));

import { POST } from "@/app/api/admin/diagnostico-zap/route";
import { ENDPOINT_FIRECRAWL_SCRAPE, URL_DIAGNOSTICO_ZAP } from "@/lib/servidor/diagnosticoTemporarioZap";

// A URL que o usuário gerou no próprio site do ZAP, copiada literalmente.
const URL_REAL_FORNECIDA = "https://www.zapimoveis.com.br/aluguel/apartamentos/pr+londrina/?onde=%2CParan%C3%A1%2CLondrina%2C%2C%2C%2C%2Ccity%2CBR%3EParana%3ENULL%3ELondrina%2C-23.319731%2C-51.166201%2C&tipos=apartamento_residencial";
const CHAVE = "fc-chave-secreta-de-teste";
const TOKEN = "token-falso-do-admin";
const rota = "https://preview.test/api/admin/diagnostico-zap";

const fetchMock = vi.fn<typeof fetch>();
const pedido = (url = rota, body?: BodyInit) => new Request(url, {
  method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body,
});
const pedidoComStreamVazio = () => new Request(rota, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}` },
  body: new ReadableStream<Uint8Array>({ start(controle) { controle.close(); } }),
  duplex: "half",
} as RequestInit);

/** Código da rota e do módulo, sem comentários (que citam de propósito o que está fora). */
function codigoSemComentarios(): string {
  return ["app/api/admin/diagnostico-zap/route.ts", "lib/servidor/diagnosticoTemporarioZap.ts"]
    .map((arquivo) => readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))
    .join("\n");
}

function corpoEnviadoAoFirecrawl(indice = 0): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[indice][1]?.body));
}

describe("rota diagnóstica temporária do ZAP", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("FIRECRAWL_API_KEY", CHAVE);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(respostaFirecrawl());
    mocks.exigirAdmin.mockReset();
    mocks.exigirAdmin.mockResolvedValue({ userId: "admin-falso", sb: { from: mocks.from, rpc: mocks.rpc } });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  it("A. aceita POST de Preview, admin, sem query e com stream de zero bytes", async () => {
    const requisicao = pedidoComStreamVazio();
    expect(requisicao.body).not.toBeNull();
    const resposta = await POST(requisicao);
    expect(resposta.status).toBe(200);
    expect(mocks.exigirAdmin).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await resposta.json()).ok).toBe(true);
  });

  it("A. aceita também o POST sem body algum", async () => {
    expect((await POST(pedido())).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["production", "development", ""])("B. bloqueia VERCEL_ENV=%j antes da autenticação e da aquisição", async (ambiente) => {
    vi.stubEnv("VERCEL_ENV", ambiente);
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(403);
    expect((await resposta.json()).falha).toBe("ambiente_bloqueado");
    expect(mocks.exigirAdmin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("C. usuário não admin (ou sessão inválida) não chega ao Firecrawl", async () => {
    for (const status of [401, 403]) {
      mocks.exigirAdmin.mockResolvedValueOnce({ resposta: Response.json({ ok: false }, { status }) });
      expect((await POST(pedido())).status).toBe(status);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("D. rejeita qualquer query antes da autenticação", async () => {
    for (const query of ["?url=https%3A%2F%2Foutro.test%2F", "?x=1", "?"]) {
      const resposta = await POST(pedido(`${rota}${query}`));
      expect(resposta.status, query).toBe(query === "?" ? 200 : 400);
    }
    // "?" sozinho não carrega parâmetro nenhum: URL.search fica vazio.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.exigirAdmin).toHaveBeenCalledTimes(1);
  });

  it("E. rejeita body de configuração, inclusive vazio em JSON", async () => {
    for (const body of [JSON.stringify({ tipo: "casa" }), "{}", "texto", " "]) {
      expect((await POST(pedido(rota, body))).status, body).toBe(400);
    }
    expect(mocks.exigirAdmin).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F. a URL do cliente é recusada e a consultada é sempre a fixa, igual à fornecida pelo usuário", async () => {
    expect((await POST(pedido(rota, JSON.stringify({ url: "https://outro.test/" })))).status).toBe(400);
    expect((await POST(pedido(`${rota}?url=https://outro.test/`))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    expect(URL_DIAGNOSTICO_ZAP).toBe(URL_REAL_FORNECIDA);
    await POST(pedido());
    expect(corpoEnviadoAoFirecrawl().url).toBe(URL_REAL_FORNECIDA);
    const fonte = readFileSync("app/api/admin/diagnostico-zap/route.ts", "utf8");
    expect(fonte).not.toMatch(/searchParams|request\.json|formData/);
  });

  it("G. faz exatamente uma chamada ao Firecrawl, com o contrato operacional da coleta", async () => {
    await POST(pedido());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [destino, opcoes] = fetchMock.mock.calls[0];
    expect(destino).toBe(ENDPOINT_FIRECRAWL_SCRAPE);
    expect(destino).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(opcoes?.method).toBe("POST");
    expect(opcoes?.signal).toBeInstanceOf(AbortSignal);
    expect(corpoEnviadoAoFirecrawl()).toEqual({
      url: URL_REAL_FORNECIDA,
      formats: ["rawHtml"],
      proxy: "basic",
      location: { country: "BR", languages: ["pt-BR"] },
      timeout: 55_000,
      storeInCache: false,
      maxAge: 0,
    });
  });

  const falhas: Array<[string, () => Promise<Response> | Response, string]> = [
    ["HTTP 500", () => new Response("erro", { status: 500 }), "firecrawl_http_falhou"],
    ["HTTP 429", () => new Response("limite", { status: 429 }), "firecrawl_429"],
    ["rede", () => Promise.reject(new TypeError("fetch failed")), "firecrawl_indisponivel"],
    ["timeout", () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" })), "firecrawl_timeout"],
    ["success=false", () => Response.json({ success: false, error: "x" }), "firecrawl_resposta_falhou"],
    ["JSON inválido", () => new Response("não é json", { status: 200 }), "firecrawl_resposta_invalida"],
    ["portal 403", () => respostaFirecrawl(HTML_ZAP_SINTETICO, 403), "portal_http_falhou"],
    ["HTML vazio", () => respostaFirecrawl("   "), "firecrawl_html_invalido"],
  ];

  it.each(falhas)("H/I. falha %s: uma chamada, sem retry nem fallback", async (_nome, falhar, codigo) => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => falhar());
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(502);
    const corpo = await resposta.json();
    expect(corpo).toMatchObject({ ok: false, falha: codigo, aquisicao: { chamadasFirecrawl: 1, falha: codigo } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [destino] of fetchMock.mock.calls) expect(destino).toBe(ENDPOINT_FIRECRAWL_SCRAPE);
    expect(JSON.stringify(corpo)).not.toContain(CHAVE);
  });

  it("I. o harness não importa navegador, HTTP direto, cache nem a coleta compartilhada", () => {
    const fontes = codigoSemComentarios();
    for (const proibido of [
      "playwright", "scraperCentralAngariacao", "fallbackHttpChaves", "buscarComFirecrawl",
      "getCache", "@vercel/functions", "extrairJsonLd", "urlDaPesquisa", "PortalAngariacao",
    ]) {
      expect(fontes, proibido).not.toContain(proibido);
    }
  });

  it("J. nenhum write no Supabase: a rota só usa a guarda de admin", async () => {
    await POST(pedido());
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(codigoSemComentarios()).not.toMatch(/supabase|\.from\(|\.rpc\(|\.insert\(|\.upsert\(|\.update\(/);
  });

  it("K/L. responde só agregados: sem HTML, conteúdo de anúncio, chave ou token", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const resposta = await POST(pedido());
    const texto = await resposta.text();
    const corpo = JSON.parse(texto);
    expect(Object.keys(corpo)).toEqual(expect.arrayContaining([
      "horario", "url", "duracaoMs", "htmlCaracteres", "aquisicao", "estrutura", "identidade",
      "preco", "localizacao", "imovel", "autoria", "data", "paginacao", "imagens",
    ]));
    expect(corpo.htmlCaracteres).toBe(HTML_ZAP_SINTETICO.length);
    expect(texto.length).toBeLessThan(HTML_ZAP_SINTETICO.length * 3);
    for (const proibido of [...SEGREDOS_DO_HTML, CHAVE, TOKEN, "Bearer", "rawHtml", "Authorization"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
    const registros = JSON.stringify([log.mock.calls, aviso.mock.calls, erro.mock.calls]);
    expect(registros).not.toContain(CHAVE);
    expect(registros).not.toContain(TOKEN);
  });

  it("sem FIRECRAWL_API_KEY responde indisponível sem chamar nada", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const resposta = await POST(pedido());
    expect(resposta.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("um segundo POST simultâneo na mesma instância é recusado e não chama o Firecrawl", async () => {
    let liberar!: (r: Response) => void;
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => new Promise<Response>((resolver) => { liberar = resolver; }));
    const primeiro = POST(pedido());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const segundo = await POST(pedido());
    expect(segundo.status).toBe(409);
    liberar(respostaFirecrawl());
    expect((await primeiro).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
