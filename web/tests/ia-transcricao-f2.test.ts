/* ================================================================
   IA-M1c-E2: TRANSCRIÇÃO DE ÁUDIO DO WHATSAPP (F2)

   Duas partes:

   1. CARACTERIZAÇÃO. Congela o que `transcreverAudio` faz hoje: o download
      da Evolution, o pedido exato à OpenAI (URL, método, autorização,
      formulário, timeout), as até 3 tentativas com esperas de 1,5 s e 3 s,
      quais status repetem, os retornos, o "nunca lança", o registro de uso
      antes de julgar o texto e todos os caminhos de falha. Passa na base
      ec296f6.
   2. METADADOS E FALHA. O que o M1c-E2 acrescenta: um execucao_id por áudio
      (compartilhado pelas tentativas), duração e request id na linha de
      uso, e um `ia-chamada-falhou` por tentativa que falha, sem mudar nada
      da parte 1.

   `fetch`, relógio, esperas e registro são falsos. Nenhuma chamada real.
   ================================================================ */
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ---------------- dublês ---------------- */

type RespostaFalsa = {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<unknown>;
};

const mocks = vi.hoisted(() => ({
  autorizado: true,
  registrarUso: vi.fn(),
  registrarEvento: vi.fn(),
  /** O que o fetch da Evolution devolve (ou lança). */
  download: null as null | (() => unknown),
  /** Uma entrada por tentativa à OpenAI: a resposta ou o erro lançado. */
  openai: [] as Array<() => unknown>,
  pedidos: [] as Array<{ url: string; init: RequestInit }>,
  esperas: [] as number[],
  timeouts: [] as number[],
  relogio: 10_000,
  passoDownload: 0,
  passoOpenai: 0,
  passoCorpo: 0,
  /** A próxima leitura do relógio lança (uma vez). */
  relogioLanca: false,
  /** Os argumentos de cada chamada ao registrador de falha do M1c-B. */
  argsFalha: [] as unknown[][],
}));

vi.mock("@/lib/servidor/openai-real", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/openai-real")>()),
  chamadaOpenAIRealAutorizada: () => mocks.autorizado,
}));
vi.mock("@/lib/servidor/ia/executor-openai", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/ia/executor-openai")>();
  return {
    ...original,
    registrarFalhaDaChamada: (...args: Parameters<typeof original.registrarFalhaDaChamada>) => {
      mocks.argsFalha.push(args);
      return original.registrarFalhaDaChamada(...args);
    },
  };
});
vi.mock("@/lib/servidor/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/registro")>()),
  registrarUsoIa: mocks.registrarUso,
  registrarEvento: mocks.registrarEvento,
}));

import { transcreverAudio, type PedidoTranscricao } from "@/app/api/whatsapp/_transcricao";
import type { MetadadosUsoIa } from "@/lib/servidor/registro";
import { MAX_BYTES_AUDIO } from "@/lib/calculo/transcricao";

const URL_OPENAI = "https://api.openai.com/v1/audio/transcriptions";
const MODELO = "gpt-4o-mini-transcribe-2025-12-15";
const USUARIO = "10000000-0000-4000-8000-000000000001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHAVE = "sk-CHAVE-OPENAI-FICTICIA";
const TOKEN = "TOKEN-EVOLUTION-FICTICIO";
/** Bytes reconhecíveis do "áudio". */
const AUDIO = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0x41, 0x55, 0x44, 0x49, 0x4f]);
const AUDIO_B64 = Buffer.from(AUDIO).toString("base64");
const TEXTO = "Oi, o imóvel ainda está disponível? Me liga no 43 99999-0000, Maria";

function pedido(extra: Partial<PedidoTranscricao> = {}): PedidoTranscricao {
  return {
    serverUrl: "https://evolution.local",
    instancia: "instancia-1",
    token: TOKEN,
    mensagemId: "msg-123",
    chaveOpenai: CHAVE,
    userId: USUARIO,
    ...extra,
  };
}

/** `AUSENTE` apaga o cabeçalho: o provedor não o mandou. */
const AUSENTE = Symbol("ausente");

function resposta(status: number, corpo: unknown = {}, requestId: unknown = "req_tr", corpoQuebrado = false): RespostaFalsa {
  const headers = new Headers({ "content-type": "application/json", "set-cookie": "__cf_bm=COOKIE-SECRETO", "openai-organization": "org-SECRETA" });
  if (requestId !== AUSENTE) headers.set("x-request-id", String(requestId));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => {
      mocks.relogio += mocks.passoCorpo;
      if (corpoQuebrado) throw new SyntaxError("Unexpected token");
      return corpo;
    },
  };
}
const ok = (texto = TEXTO, requestId: unknown = "req_tr") =>
  resposta(200, { text: texto, usage: { input_tokens: 40, output_tokens: 12 } }, requestId);
const http = (status: number, requestId: unknown = "req_falha123") =>
  resposta(status, { error: { message: "CORPO-SECRETO do erro" } }, requestId);
const lancar = (erro: unknown) => () => {
  throw erro;
};
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const rede = () => new TypeError("fetch failed MENSAGEM-SECRETA");

function respondendo(...tentativas: Array<RespostaFalsa | (() => unknown)>) {
  mocks.openai = tentativas.map((t) => (typeof t === "function" ? t : () => t));
}

async function fetchFalso(url: string, init: RequestInit = {}) {
  mocks.pedidos.push({ url, init });
  if (url.includes("/chat/getBase64FromMediaMessage/")) {
    mocks.relogio += mocks.passoDownload;
    const r = mocks.download ? mocks.download() : { ok: true, json: async () => ({ base64: AUDIO_B64 }) };
    return r;
  }
  mocks.relogio += mocks.passoOpenai;
  const proxima = mocks.openai.shift();
  if (!proxima) throw new Error("tentativa à OpenAI não prevista no teste");
  return proxima();
}

const pedidosOpenai = () => mocks.pedidos.filter((p) => p.url === URL_OPENAI);
const usos = () => mocks.registrarUso.mock.calls.map(([e]) => e as Record<string, unknown>);
const metadadosDos = () => usos().map((u) => u.metadados as MetadadosUsoIa | undefined);
const semMetadados = (u: Record<string, unknown>) => {
  const resto = { ...u };
  delete resto.metadados;
  return resto;
};
const eventos = () => mocks.registrarEvento.mock.calls.map(([e]) => e as { userId: string | null; categoria: string; nivel: string; evento: string; detalhe: string });
const falhas = () => eventos().filter((e) => e.evento === "ia-chamada-falhou");
const detalhes = () => falhas().map((e) => JSON.parse(e.detalhe) as Record<string, unknown>);

beforeEach(() => {
  mocks.autorizado = true;
  mocks.download = null;
  mocks.openai = [];
  mocks.pedidos.length = 0;
  mocks.esperas.length = 0;
  mocks.timeouts.length = 0;
  mocks.relogio = 10_000;
  mocks.passoDownload = 0;
  mocks.passoOpenai = 0;
  mocks.passoCorpo = 0;
  mocks.relogioLanca = false;
  mocks.argsFalha.length = 0;
  mocks.registrarUso.mockReset();
  mocks.registrarEvento.mockReset();
  vi.stubGlobal("fetch", fetchFalso);
  vi.spyOn(performance, "now").mockImplementation(() => {
    if (mocks.relogioLanca) {
      mocks.relogioLanca = false;
      throw new Error("relógio quebrado");
    }
    return mocks.relogio;
  });
  // As esperas do retry: registradas e cumpridas na hora.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
    mocks.esperas.push(ms ?? 0);
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  const original = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    mocks.timeouts.push(ms);
    return original(ms);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ================================================================
   1. CARACTERIZAÇÃO (passa na base ec296f6)
   ================================================================ */

describe("F2: caracterização do comportamento atual", () => {
  it("sucesso: download, pedido exato à OpenAI, uso com os campos de sempre, texto normalizado", async () => {
    respondendo(ok("  Oi,   tudo bem?  "));
    const r = await transcreverAudio(pedido());
    expect(r).toEqual({ ok: true, texto: "Oi, tudo bem?" });

    const [download, chamada] = mocks.pedidos;
    expect(mocks.pedidos).toHaveLength(2);
    expect(download.url).toBe("https://evolution.local/chat/getBase64FromMediaMessage/instancia-1");
    expect(download.init.method).toBe("POST");
    expect(download.init.headers).toEqual({ apikey: TOKEN, "Content-Type": "application/json" });
    expect(JSON.parse(String(download.init.body))).toEqual({ message: { key: { id: "msg-123" } }, convertToMp4: false });

    expect(chamada.url).toBe(URL_OPENAI);
    expect(chamada.init.method).toBe("POST");
    expect(chamada.init.headers).toEqual({ Authorization: `Bearer ${CHAVE}` });
    expect(chamada.init.signal).toBeInstanceOf(AbortSignal);
    const form = chamada.init.body as FormData;
    expect([...form.keys()]).toEqual(["file", "model", "language"]);
    const arquivo = form.get("file") as File;
    expect(arquivo.name).toBe("audio.ogg");
    expect(arquivo.type).toBe("audio/ogg");
    expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(AUDIO);
    expect(form.get("model")).toBe(MODELO);
    expect(form.get("language")).toBe("pt");
    expect(mocks.timeouts).toEqual([20_000, 20_000]);
    expect(mocks.esperas).toEqual([]);

    expect(usos()).toHaveLength(1);
    expect(semMetadados(usos()[0])).toEqual({ userId: USUARIO, tipo: "transcricao", modelo: MODELO, tokensEntrada: 40, tokensSaida: 12 });
  });

  it("sem userId: o uso sai com null", async () => {
    respondendo(ok());
    await transcreverAudio(pedido({ userId: undefined }));
    expect(usos()[0].userId).toBeNull();
  });

  it("fetch que lança nas 3 tentativas: sem-conexao, esperas de 1,5 s e 3 s, nunca lança", async () => {
    respondendo(lancar(rede()), lancar(timeout()), lancar(rede()));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "sem-conexao" });
    expect(pedidosOpenai()).toHaveLength(3);
    expect(mocks.esperas).toEqual([1500, 3000]);
    expect(mocks.timeouts).toEqual([20_000, 20_000, 20_000, 20_000]);
    expect(usos()).toHaveLength(0);
  });

  it.each([429, 403, 500, 503])("status %i repete; três vezes dá limite-de-taxa", async (status) => {
    respondendo(http(status), http(status), http(status));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "limite-de-taxa" });
    expect(pedidosOpenai()).toHaveLength(3);
    expect(mocks.esperas).toEqual([1500, 3000]);
  });

  it.each([400, 404, 401, 422])("status %i não repete: falha-openai na primeira", async (status) => {
    respondendo(http(status));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "falha-openai" });
    expect(pedidosOpenai()).toHaveLength(1);
    expect(mocks.esperas).toEqual([]);
  });

  it("403 e depois sucesso: o texto, uma espera, um uso", async () => {
    respondendo(http(403), ok());
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(pedidosOpenai()).toHaveLength(2);
    expect(mocks.esperas).toEqual([1500]);
    expect(usos()).toHaveLength(1);
  });

  it("falha, falha e sucesso: as duas esperas e um uso", async () => {
    respondendo(http(429), lancar(rede()), ok());
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(mocks.esperas).toEqual([1500, 3000]);
    expect(usos()).toHaveLength(1);
  });

  it("texto vazio: o uso é gravado antes do julgamento e não há nova tentativa", async () => {
    respondendo(ok(" ... "));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "vazio" });
    expect(pedidosOpenai()).toHaveLength(1);
    expect(usos()).toHaveLength(1);
  });

  it("JSON ilegível: sem uso, vazio, sem nova tentativa", async () => {
    respondendo(resposta(200, null, "req_tr", true));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "vazio" });
    expect(pedidosOpenai()).toHaveLength(1);
    expect(usos()).toHaveLength(0);
  });

  it("resposta sem usage: nenhum uso, o texto segue", async () => {
    respondendo(resposta(200, { text: TEXTO }));
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(usos()).toHaveLength(0);
  });

  it.each([
    { nome: "sem autorização", ajuste: () => { mocks.autorizado = false; }, extra: {} },
    { nome: "sem chave", ajuste: () => {}, extra: { chaveOpenai: "" } },
    { nome: "sem servidor", ajuste: () => {}, extra: { serverUrl: "" } },
    { nome: "sem token", ajuste: () => {}, extra: { token: "" } },
  ])("trava ($nome): nao-configurado, nenhum fetch", async ({ ajuste, extra }) => {
    ajuste();
    expect(await transcreverAudio(pedido(extra))).toEqual({ ok: false, falha: "nao-configurado" });
    expect(mocks.pedidos).toHaveLength(0);
  });

  it.each([
    { nome: "Evolution recusa", download: () => ({ ok: false, json: async () => ({}) }), falha: "sem-midia" },
    { nome: "sem base64", download: () => ({ ok: true, json: async () => ({}) }), falha: "sem-midia" },
    { nome: "download sem conexão", download: lancar(rede()), falha: "sem-conexao" },
    {
      nome: "áudio grande demais",
      download: () => ({ ok: true, json: async () => ({ base64: Buffer.alloc(MAX_BYTES_AUDIO + 1).toString("base64") }) }),
      falha: "audio-grande-demais",
    },
  ])("download ($nome): $falha, nenhuma chamada à OpenAI", async ({ download, falha }) => {
    mocks.download = download;
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha });
    expect(pedidosOpenai()).toHaveLength(0);
    expect(usos()).toHaveLength(0);
  });

  it("se o registro de uso lançasse (por contrato ele não lança), a exceção subiria: comportamento atual", async () => {
    const quebrado = new Error("registro quebrado");
    mocks.registrarUso.mockImplementationOnce(() => {
      throw quebrado;
    });
    respondendo(ok());
    await expect(transcreverAudio(pedido())).rejects.toBe(quebrado);
  });
});

/* ================================================================
   2. METADADOS DO M1c-E2
   ================================================================ */

describe("F2: metadados da linha de uso", () => {
  it("execucao_id, duração (fetch mais leitura do corpo) e request id; o resto null", async () => {
    mocks.passoDownload = 7_000;
    mocks.passoOpenai = 300.4;
    mocks.passoCorpo = 50;
    respondendo(ok());
    await transcreverAudio(pedido());
    expect(metadadosDos()[0]).toEqual({
      execucaoId: expect.stringMatching(UUID),
      rota: null,
      esforco: null,
      configOrigem: null,
      configVersao: null,
      modeloServido: null,
      requisicaoProvedorId: "req_tr",
      duracaoMs: 350,
      motivoFim: null,
      recusa: null,
      tokensRaciocinio: null,
    });
  });

  it("a duração do sucesso não inclui as esperas nem as tentativas anteriores", async () => {
    mocks.passoOpenai = 200;
    mocks.passoCorpo = 20;
    respondendo(http(500), ok());
    await transcreverAudio(pedido());
    expect(metadadosDos()[0]?.duracaoMs).toBe(220);
  });

  it("duração inteira e nunca negativa", async () => {
    mocks.passoOpenai = -30;
    respondendo(ok());
    await transcreverAudio(pedido());
    expect(metadadosDos()[0]?.duracaoMs).toBe(0);
  });

  it.each([
    { nome: "válido", valor: "req_abc.123:x-y" as unknown, esperado: "req_abc.123:x-y" },
    { nome: "no limite de 200", valor: "r".repeat(200), esperado: "r".repeat(200) },
    { nome: "com espaço", valor: "req com espaço", esperado: null },
    { nome: "com barra", valor: "req/abc", esperado: null },
    { nome: "longo demais", valor: "r".repeat(201), esperado: null },
    { nome: "ausente", valor: AUSENTE, esperado: null },
  ])("request id do sucesso $nome", async ({ valor, esperado }) => {
    respondendo(ok(TEXTO, valor));
    await transcreverAudio(pedido());
    expect(metadadosDos()[0]?.requisicaoProvedorId).toBe(esperado);
  });

  it("vazio também leva os metadados (a chamada foi cobrada)", async () => {
    respondendo(ok(" . "));
    await transcreverAudio(pedido());
    expect(metadadosDos()[0]).toMatchObject({ execucaoId: expect.stringMatching(UUID), requisicaoProvedorId: "req_tr" });
  });
});

/* ================================================================
   3. FALHA DO PROVEDOR, UMA POR TENTATIVA
   ================================================================ */

const CHAVES_DA_FALHA = [
  "tipo", "execucao_id", "rota", "esforco", "config_origem", "config_versao",
  "modelo", "categoria", "status_http", "requisicao_provedor_id", "duracao_ms",
];

describe("F2: ia-chamada-falhou por tentativa", () => {
  it("A. falha e sucesso: 1 evento aviso com as 11 chaves, 1 uso, o mesmo id", async () => {
    mocks.passoOpenai = 120;
    respondendo(http(403), ok());
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(falhas()).toHaveLength(1);
    expect(falhas()[0]).toMatchObject({ userId: USUARIO, categoria: "ia", nivel: "aviso" });
    const [detalhe] = detalhes();
    expect(Object.keys(detalhe)).toEqual(CHAVES_DA_FALHA);
    expect(detalhe).toEqual({
      tipo: "transcricao",
      execucao_id: expect.stringMatching(UUID),
      rota: null,
      esforco: null,
      config_origem: null,
      config_versao: null,
      modelo: MODELO,
      categoria: "autenticacao",
      status_http: 403,
      requisicao_provedor_id: "req_falha123",
      duracao_ms: 120,
    });
    expect(usos()).toHaveLength(1);
    expect(metadadosDos()[0]?.execucaoId).toBe(detalhe.execucao_id);
  });

  it("B. falha, falha e sucesso: 2 eventos, 1 uso, o mesmo id", async () => {
    respondendo(http(403), http(500), ok());
    await transcreverAudio(pedido());
    expect(detalhes().map((d) => d.categoria)).toEqual(["autenticacao", "erro-do-provedor"]);
    const ids = [...detalhes().map((d) => d.execucao_id), metadadosDos()[0]?.execucaoId];
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
  });

  it("C. três falhas: 3 eventos, nenhum uso, o mesmo id", async () => {
    respondendo(http(429), lancar(timeout()), lancar(rede()));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "sem-conexao" });
    expect(detalhes().map((d) => d.categoria)).toEqual(["limite-de-taxa", "timeout", "conexao"]);
    expect(new Set(detalhes().map((d) => d.execucao_id)).size).toBe(1);
    expect(usos()).toHaveLength(0);
  });

  it("D. um áudio novo tem outro id", async () => {
    respondendo(http(500), ok());
    await transcreverAudio(pedido());
    respondendo(http(500), ok());
    await transcreverAudio(pedido());
    const [a, b] = detalhes().map((d) => d.execucao_id);
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
    expect(metadadosDos().map((m) => m?.execucaoId)).toEqual([a, b]);
  });

  it("falha HTTP sem nova tentativa (400): 1 evento, o mesmo retorno de sempre", async () => {
    respondendo(http(400));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "falha-openai" });
    expect(detalhes()).toEqual([expect.objectContaining({ categoria: "requisicao-recusada", status_http: 400 })]);
  });

  it.each([
    { nome: "429", tentativa: () => http(429), categoria: "limite-de-taxa", status: 429 },
    { nome: "401", tentativa: () => http(401), categoria: "autenticacao", status: 401 },
    { nome: "403", tentativa: () => http(403), categoria: "autenticacao", status: 403 },
    { nome: "400", tentativa: () => http(400), categoria: "requisicao-recusada", status: 400 },
    { nome: "404", tentativa: () => http(404), categoria: "requisicao-recusada", status: 404 },
    { nome: "422", tentativa: () => http(422), categoria: "requisicao-recusada", status: 422 },
    { nome: "500", tentativa: () => http(500), categoria: "erro-do-provedor", status: 500 },
    { nome: "503", tentativa: () => http(503), categoria: "erro-do-provedor", status: 503 },
    { nome: "409", tentativa: () => http(409), categoria: "desconhecida", status: 409 },
    { nome: "TimeoutError", tentativa: lancar(timeout()), categoria: "timeout", status: null },
    { nome: "TypeError de rede", tentativa: lancar(rede()), categoria: "conexao", status: null },
    { nome: "Error comum", tentativa: lancar(new Error("MENSAGEM-SECRETA")), categoria: "desconhecida", status: null },
    { nome: "AbortError", tentativa: lancar(new DOMException("abortado", "AbortError")), categoria: "desconhecida", status: null },
    { nome: "valor que não é erro", tentativa: lancar("texto"), categoria: "desconhecida", status: null },
  ])("categoria de $nome → $categoria (status $status)", async ({ tentativa, categoria, status }) => {
    respondendo(tentativa, ok());
    await transcreverAudio(pedido());
    expect(detalhes()[0]).toMatchObject({ categoria, status_http: status });
  });

  it("request id da falha: só o cabeçalho saneado, e só quando houve resposta", async () => {
    respondendo(http(500, "req com espaço"), http(500, AUSENTE), http(500, "req_ok-1"));
    await transcreverAudio(pedido());
    respondendo(lancar(rede()), ok());
    await transcreverAudio(pedido());
    expect(detalhes().map((d) => d.requisicao_provedor_id)).toEqual([null, null, "req_ok-1", null]);
  });

  it("duração da falha: até o status (sem ler o corpo) e até a exceção", async () => {
    mocks.passoOpenai = 90;
    mocks.passoCorpo = 5_000;
    respondendo(http(500), lancar(timeout()), ok());
    await transcreverAudio(pedido());
    expect(detalhes().map((d) => d.duracao_ms)).toEqual([90, 90]);
  });

  it("o corpo de uma resposta de erro não é lido", async () => {
    const r = http(500);
    const json = vi.spyOn(r, "json");
    respondendo(r, ok());
    await transcreverAudio(pedido());
    expect(json).not.toHaveBeenCalled();
  });
});

describe("F2: a telemetria nunca muda o resultado nem o ritmo", () => {
  it("registrador quebrado: o mesmo retorno, as mesmas esperas, o mesmo número de tentativas", async () => {
    mocks.registrarEvento.mockImplementation(() => {
      throw new Error("registro quebrado");
    });
    respondendo(http(429), lancar(rede()), http(503));
    expect(await transcreverAudio(pedido())).toEqual({ ok: false, falha: "limite-de-taxa" });
    expect(pedidosOpenai()).toHaveLength(3);
    expect(mocks.esperas).toEqual([1500, 3000]);
    expect(mocks.registrarEvento).toHaveBeenCalledTimes(3);
  });

  it("as esperas continuam 1,5 s e 3 s com a telemetria ligada", async () => {
    respondendo(http(500), http(500), ok());
    await transcreverAudio(pedido());
    expect(mocks.esperas).toEqual([1500, 3000]);
    expect(falhas()).toHaveLength(2);
  });

  it("um relógio que lança dentro da telemetria não muda o retorno nem o ritmo", async () => {
    respondendo(() => {
      mocks.relogioLanca = true;
      return http(500);
    }, ok());
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(mocks.esperas).toEqual([1500]);
    expect(falhas()).toHaveLength(0);
  });

  it("um erro hostil (name que lança) não derruba o fluxo: desconhecida", async () => {
    const hostil = {};
    Object.defineProperty(hostil, "name", { get() { throw new Error("getter"); } });
    respondendo(lancar(hostil), ok());
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(detalhes()[0]).toMatchObject({ categoria: "desconhecida", status_http: null });
  });

  it("cabeçalhos hostis não derrubam o fluxo: request id null", async () => {
    const r = http(500);
    Object.defineProperty(r, "headers", { get() { throw new Error("getter"); } });
    const s = ok();
    Object.defineProperty(s, "headers", { get() { throw new Error("getter"); } });
    respondendo(r, s);
    expect(await transcreverAudio(pedido())).toEqual({ ok: true, texto: TEXTO });
    expect(detalhes()[0]).toMatchObject({ requisicao_provedor_id: null, status_http: 500 });
    expect(metadadosDos()[0]?.requisicaoProvedorId).toBeNull();
  });
});

describe("F2: falha que não é do provedor não gera ia-chamada-falhou", () => {
  it.each([
    { nome: "trava", preparar: () => { mocks.autorizado = false; } },
    { nome: "Evolution recusa", preparar: () => { mocks.download = () => ({ ok: false, json: async () => ({}) }); } },
    { nome: "sem base64", preparar: () => { mocks.download = () => ({ ok: true, json: async () => ({}) }); } },
    { nome: "download sem conexão", preparar: () => { mocks.download = lancar(rede()); } },
    { nome: "download com timeout", preparar: () => { mocks.download = lancar(timeout()); } },
    {
      nome: "áudio grande demais",
      preparar: () => { mocks.download = () => ({ ok: true, json: async () => ({ base64: Buffer.alloc(MAX_BYTES_AUDIO + 1).toString("base64") }) }); },
    },
    { nome: "texto vazio", preparar: () => respondendo(ok(" ")) },
    { nome: "JSON ilegível", preparar: () => respondendo(resposta(200, null, "req_tr", true)) },
    { nome: "sucesso", preparar: () => respondendo(ok()) },
  ])("$nome", async ({ preparar }) => {
    preparar();
    await transcreverAudio(pedido());
    expect(falhas()).toHaveLength(0);
  });

  it("registro de uso quebrado: nenhum evento de provedor", async () => {
    mocks.registrarUso.mockImplementationOnce(() => {
      throw new Error("registro quebrado");
    });
    respondendo(ok());
    await transcreverAudio(pedido()).catch(() => {});
    expect(falhas()).toHaveLength(0);
  });
});

describe("F2: privacidade", () => {
  it("o registrador recebe só a classificação fechada: nunca o erro nem a resposta", async () => {
    respondendo(http(500), lancar(rede()), lancar(timeout()));
    await transcreverAudio(pedido());
    expect(mocks.argsFalha).toHaveLength(3);
    for (const [erro, , , classificacao] of mocks.argsFalha) {
      expect(erro).toBeNull();
      expect(Object.keys(classificacao as object)).toEqual(["categoria", "statusHttp", "requisicaoProvedorId"]);
    }
  });

  it("nem áudio, nem texto, nem segredos entram no evento ou nos metadados", async () => {
    respondendo(http(500), lancar(rede()), ok());
    await transcreverAudio(pedido());
    const texto = inspect([eventos(), usos()], { depth: Infinity });
    for (const trecho of [
      AUDIO_B64, "OggSAUDIO", "audio.ogg", "Maria", "99999", "imóvel ainda", CHAVE, "Bearer", TOKEN,
      "CORPO-SECRETO", "MENSAGEM-SECRETA", "COOKIE-SECRETO", "org-SECRETA", "fetch failed", "at ", "FormData",
    ]) {
      expect(texto).not.toContain(trecho);
    }
  });
});
