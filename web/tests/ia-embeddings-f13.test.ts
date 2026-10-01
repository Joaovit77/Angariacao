/* ================================================================
   IA-M1c-E1: EMBEDDINGS DE IMÓVEIS (F13)

   Duas partes:

   1. CARACTERIZAÇÃO. Congela o que `gerarEmbeddingsDeImoveis` faz hoje: o
      corpo exato de cada `embeddings.create` (sha256 do JSON), os lotes de
      100, o número de chamadas, a ordenação por `index`, o retorno, os
      quatro argumentos de sempre do registro de uso, a lista vazia, o lote
      incompleto, a trava e a exceção do provedor. Passa na base 75deaeb.
   2. METADADOS E FALHA. O que o M1c-E1 acrescenta: um execucao_id por
      chamada da função (compartilhado pelos lotes), a duração do create, o
      modelo servido e o request id na linha de uso, e um
      `ia-chamada-falhou` quando o create lança.

   SDK e registro são falsos. Nenhuma chamada real.
   ================================================================ */
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  registrarUso: vi.fn(),
  registrarEvento: vi.fn(),
  autorizado: true,
  falharCliente: null as unknown,
  /** Se definido, ler as dimensões do corpo lança (montagem do corpo). */
  falharCorpo: null as unknown,
  chavesDoCliente: [] as unknown[],
  /** Cópia de cada corpo NO MOMENTO da chamada. */
  enviados: [] as Record<string, unknown>[],
  /** Relógio falso: anda ao criar o cliente, dentro do create e ao registrar
      o uso, para provar que a duração mede só o create. */
  relogio: 10_000,
  passoCliente: 0,
  passoCreate: 0,
  passoUso: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/calculo/comparaveisMercado", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/calculo/comparaveisMercado")>();
  return {
    ...original,
    CONFIGURACAO_COMPARAVEIS_MERCADO: new Proxy(original.CONFIGURACAO_COMPARAVEIS_MERCADO, {
      get(alvo, chave, receptor) {
        if (chave === "dimensoesEmbedding" && mocks.falharCorpo) throw mocks.falharCorpo;
        return Reflect.get(alvo, chave, receptor);
      },
    }),
  };
});
vi.mock("@/lib/servidor/openai-real", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/openai-real")>()),
  chamadaOpenAIRealAutorizada: () => mocks.autorizado,
  criarClienteOpenAIReal: (opcoes: { apiKey?: unknown }) => {
    mocks.chavesDoCliente.push(opcoes?.apiKey);
    mocks.relogio += mocks.passoCliente;
    if (mocks.falharCliente) throw mocks.falharCliente;
    return {
      embeddings: {
        create: (corpo: Record<string, unknown>, ...resto: unknown[]) => {
          mocks.enviados.push(JSON.parse(JSON.stringify(corpo)) as Record<string, unknown>);
          mocks.relogio += mocks.passoCreate;
          return mocks.create(corpo, ...resto);
        },
      },
    };
  },
}));
vi.mock("@/lib/servidor/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/registro")>()),
  registrarUsoDaResposta: (...args: unknown[]) => {
    mocks.relogio += mocks.passoUso;
    return mocks.registrarUso(...args);
  },
  registrarEvento: mocks.registrarEvento,
}));

import { gerarEmbeddingsDeImoveis, modeloEmbeddingImoveis } from "@/lib/servidor/embeddingsImoveis";
import { CONFIGURACAO_COMPARAVEIS_MERCADO } from "@/lib/calculo/comparaveisMercado";
import { ChamadaOpenAIRealNaoAutorizadaError } from "@/lib/servidor/openai-real";
import type { MetadadosUsoIa } from "@/lib/servidor/registro";

const USUARIO = "10000000-0000-4000-8000-000000000001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODELO = CONFIGURACAO_COMPARAVEIS_MERCADO.modeloEmbedding;

/* ---------------- respostas falsas da Embeddings API ---------------- */

/** `AUSENTE` apaga o campo: o provedor não o mandou. */
const AUSENTE = Symbol("ausente");

/** Vetor determinístico e reconhecível de um texto (3 números bastam). */
const vetorDe = (texto: string, i: number) => [i + 0.123456, texto.length + 0.654321, 0.987654];

function respostaDoLote(
  lote: string[],
  { requestId = "req_emb" as unknown, modelo = "text-embedding-3-small" as unknown, embaralhar = false, faltar = 0 } = {},
) {
  const data = lote.slice(0, lote.length - faltar).map((texto, index) => ({ object: "embedding", index, embedding: vetorDe(texto, index) }));
  const resposta: Record<string, unknown> = {
    object: "list",
    data: embaralhar ? [...data].reverse() : data,
    model: modelo,
    usage: { prompt_tokens: lote.length * 7, total_tokens: lote.length * 7 },
  };
  if (modelo === AUSENTE) delete resposta.model;
  if (requestId !== AUSENTE) Object.defineProperty(resposta, "_request_id", { value: requestId, enumerable: false, configurable: true });
  return resposta;
}

/** O create responde cada lote com base no corpo recebido. */
function responderTudo(opcoes: Parameters<typeof respostaDoLote>[1] = {}) {
  mocks.create.mockImplementation(async (corpo: { input: string[] }) => respostaDoLote(corpo.input, opcoes));
}

const textos = (n: number, prefixo = "imovel") => Array.from({ length: n }, (_, i) => `${prefixo} ${i}`);
const sha = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");
const usos = () => mocks.registrarUso.mock.calls;
const metadadosDos = () => usos().map((u) => u[4] as MetadadosUsoIa | undefined);
const eventos = () => mocks.registrarEvento.mock.calls.map(([e]) => e as { userId: string | null; categoria: string; nivel: string; evento: string; detalhe: string });
const falhas = () => eventos().filter((e) => e.evento === "ia-chamada-falhou");
function detalheDaFalha(): Record<string, unknown> {
  expect(falhas()).toHaveLength(1);
  return JSON.parse(falhas()[0].detalhe) as Record<string, unknown>;
}
async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
    return "nada-lançado";
  } catch (e) {
    return e;
  }
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  vi.stubEnv("OPENAI_EMBEDDING_MODEL", "");
  mocks.autorizado = true;
  mocks.falharCliente = null;
  mocks.falharCorpo = null;
  mocks.chavesDoCliente.length = 0;
  mocks.enviados.length = 0;
  mocks.relogio = 10_000;
  mocks.passoCliente = 0;
  mocks.passoCreate = 0;
  mocks.passoUso = 0;
  mocks.create.mockReset();
  mocks.registrarUso.mockReset();
  mocks.registrarEvento.mockReset();
  vi.spyOn(performance, "now").mockImplementation(() => mocks.relogio);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ================================================================
   1. CARACTERIZAÇÃO (passa na base 75deaeb)
   ================================================================ */

/** sha256 do JSON de cada corpo enviado, capturado na base 75deaeb. */
const CORPO_UM_LOTE = "b93a150341ba92c2d6ecacc5f499e30b0dcbea515196352c69624fafaab2da0b";
const CORPOS_TRES_LOTES = [
  "b0a261cc7e16833e36d8fca06bfddfaefd0613ec2a92550e7820d1aba97b3f35",
  "3e93f0ebe5182666f7ad8761d9ef8a0cf324c03a865d62da8a6c789f5b794cb1",
  "4ffae95376e5eab04fe7827c52ba674e2d2bd5edce81fa825a0cc178a3265948",
];

describe("F13: caracterização do comportamento atual", () => {
  it("um lote: uma chamada, corpo exato, retorno na ordem, os quatro argumentos de uso", async () => {
    responderTudo();
    const entrada = ["Apartamento 2 quartos Gleba Palhano", "Casa 3 quartos Centro"];
    const vetores = await gerarEmbeddingsDeImoveis(entrada, USUARIO, "embedding-comparavel-mercado");

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0]).toHaveLength(1);
    const [corpo] = mocks.enviados;
    expect(Object.keys(corpo)).toEqual(["model", "input", "dimensions", "encoding_format"]);
    expect(corpo).toEqual({ model: MODELO, input: entrada, dimensions: 512, encoding_format: "float" });
    if (process.env.CAPTURAR_F13) console.log("CORPO_UM_LOTE", sha(corpo));
    expect(sha(corpo)).toBe(CORPO_UM_LOTE);
    expect(mocks.chavesDoCliente).toEqual(["chave-ficticia"]);

    expect(vetores).toEqual(entrada.map((t, i) => vetorDe(t, i)));
    expect(usos()).toHaveLength(1);
    expect(usos()[0].slice(0, 4)).toEqual([USUARIO, "embedding-comparavel-mercado", MODELO, { prompt_tokens: 14, total_tokens: 14 }]);
  });

  it("250 textos: três lotes de 100, 100 e 50, corpos exatos, um uso por lote", async () => {
    responderTudo();
    const entrada = textos(250);
    const vetores = await gerarEmbeddingsDeImoveis(entrada, USUARIO, "embedding-comparavel-mercado");
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.enviados.map((c) => (c.input as string[]).length)).toEqual([100, 100, 50]);
    expect(mocks.enviados.flatMap((c) => c.input as string[])).toEqual(entrada);
    const hashes = mocks.enviados.map(sha);
    if (process.env.CAPTURAR_F13) console.log("CORPOS_TRES_LOTES", JSON.stringify(hashes));
    expect(hashes).toEqual(CORPOS_TRES_LOTES);
    expect(vetores).toHaveLength(250);
    expect(vetores[100]).toEqual(vetorDe(entrada[100], 0));
    expect(usos().map((u) => u.slice(0, 3))).toEqual([
      [USUARIO, "embedding-comparavel-mercado", MODELO],
      [USUARIO, "embedding-comparavel-mercado", MODELO],
      [USUARIO, "embedding-comparavel-mercado", MODELO],
    ]);
  });

  it("exatamente 100 textos cabem num lote; 101 viram dois", async () => {
    responderTudo();
    await gerarEmbeddingsDeImoveis(textos(100));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await gerarEmbeddingsDeImoveis(textos(101));
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.enviados.map((c) => (c.input as string[]).length)).toEqual([100, 100, 1]);
  });

  it("a resposta fora de ordem é reordenada por index", async () => {
    responderTudo({ embaralhar: true });
    const entrada = ["a", "bb", "ccc"];
    expect(await gerarEmbeddingsDeImoveis(entrada)).toEqual(entrada.map((t, i) => vetorDe(t, i)));
  });

  it("padrões: userId null e tipo embedding-imovel", async () => {
    responderTudo();
    await gerarEmbeddingsDeImoveis(["x"]);
    expect(usos()[0].slice(0, 3)).toEqual([null, "embedding-imovel", MODELO]);
  });

  it("o modelo configurado por ambiente vai no corpo e no uso", async () => {
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "  text-embedding-3-large  ");
    responderTudo();
    await gerarEmbeddingsDeImoveis(["x"], USUARIO, "embedding-consulta-avaliacao");
    expect(modeloEmbeddingImoveis()).toBe("text-embedding-3-large");
    expect(mocks.enviados[0].model).toBe("text-embedding-3-large");
    expect(usos()[0].slice(0, 3)).toEqual([USUARIO, "embedding-consulta-avaliacao", "text-embedding-3-large"]);
  });

  it("lista vazia: nenhum cliente, nenhuma chamada, nenhum uso", async () => {
    expect(await gerarEmbeddingsDeImoveis([])).toEqual([]);
    expect(mocks.chavesDoCliente).toHaveLength(0);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(usos()).toHaveLength(0);
  });

  it("trava e configuração: sem autorização ou sem chave, devolve [] sem chamar", async () => {
    mocks.autorizado = false;
    expect(await gerarEmbeddingsDeImoveis(["x"])).toEqual([]);
    mocks.autorizado = true;
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await gerarEmbeddingsDeImoveis(["x"])).toEqual([]);
    expect(mocks.chavesDoCliente).toHaveLength(0);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(eventos()).toHaveLength(0);
  });

  it("lote incompleto: o uso é gravado e o erro de sempre sobe", async () => {
    mocks.create.mockImplementation(async (corpo: { input: string[] }) => respostaDoLote(corpo.input, { faltar: 1 }));
    await expect(gerarEmbeddingsDeImoveis(["a", "b"], USUARIO, "embedding-comparavel-mercado"))
      .rejects.toThrow("A API não devolveu todos os embeddings do lote.");
    expect(usos()).toHaveLength(1);
    expect(eventosSemFalha()).toEqual([]);
  });

  it("falha do provedor no primeiro lote: a mesma exceção sobe, sem uso", async () => {
    const original = new Error("provedor fora");
    mocks.create.mockRejectedValueOnce(original);
    expect(await capturar(gerarEmbeddingsDeImoveis(textos(3), USUARIO, "embedding-comparavel-mercado"))).toBe(original);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(usos()).toHaveLength(0);
    expect(eventosSemFalha()).toEqual([]);
  });

  it("falha do provedor no terceiro lote: os dois usos anteriores ficam, nenhuma chamada a mais", async () => {
    const original = new Error("provedor fora");
    mocks.create
      .mockImplementationOnce(async (corpo: { input: string[] }) => respostaDoLote(corpo.input))
      .mockImplementationOnce(async (corpo: { input: string[] }) => respostaDoLote(corpo.input))
      .mockRejectedValueOnce(original);
    expect(await capturar(gerarEmbeddingsDeImoveis(textos(250), USUARIO, "embedding-comparavel-mercado"))).toBe(original);
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(usos()).toHaveLength(2);
    expect(eventosSemFalha()).toEqual([]);
  });

  it("montar o corpo que lança: a exceção sobe, nenhuma chamada, nenhum uso", async () => {
    const original = new Error("falha da aplicação");
    mocks.falharCorpo = original;
    expect(await capturar(gerarEmbeddingsDeImoveis(["x"]))).toBe(original);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(usos()).toHaveLength(0);
    expect(eventosSemFalha()).toEqual([]);
  });

  it("criar o cliente que lança: a exceção sobe, nenhuma chamada", async () => {
    const original = new ChamadaOpenAIRealNaoAutorizadaError("test", "preview");
    mocks.falharCliente = original;
    expect(await capturar(gerarEmbeddingsDeImoveis(["x"]))).toBe(original);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

/** Tudo menos o `ia-chamada-falhou`, que é o que o E1 acrescenta. */
function eventosSemFalha() {
  return eventos().filter((e) => e.evento !== "ia-chamada-falhou");
}

/* ================================================================
   2. METADADOS DO M1c-E1
   ================================================================ */

describe("F13: metadados da linha de uso", () => {
  it("cada lote: execucao_id, duração do create, modelo servido e request id; o resto null", async () => {
    mocks.passoCreate = 312.6;
    responderTudo();
    await gerarEmbeddingsDeImoveis(["x"], USUARIO, "embedding-comparavel-mercado");
    expect(metadadosDos()[0]).toEqual({
      execucaoId: expect.stringMatching(UUID),
      rota: null,
      esforco: null,
      configOrigem: null,
      configVersao: null,
      modeloServido: "text-embedding-3-small",
      requisicaoProvedorId: "req_emb",
      duracaoMs: 313,
      motivoFim: null,
      recusa: null,
      tokensRaciocinio: null,
    });
  });

  it("os lotes de uma chamada compartilham o id; uma chamada nova tem outro", async () => {
    responderTudo();
    await gerarEmbeddingsDeImoveis(textos(250));
    await gerarEmbeddingsDeImoveis(["y"]);
    const ids = metadadosDos().map((m) => m?.execucaoId);
    expect(ids).toHaveLength(4);
    expect(ids[0]).toMatch(UUID);
    expect(new Set(ids.slice(0, 3)).size).toBe(1);
    expect(ids[3]).toMatch(UUID);
    expect(ids[3]).not.toBe(ids[0]);
  });

  it("a duração mede só o create: nem a criação do cliente nem o que vem depois", async () => {
    mocks.passoCliente = 7_000;
    mocks.passoCreate = 250;
    mocks.passoUso = 9_000;
    responderTudo();
    await gerarEmbeddingsDeImoveis(textos(150));
    expect(metadadosDos().map((m) => m?.duracaoMs)).toEqual([250, 250]);
  });

  it("duração inteira e nunca negativa", async () => {
    mocks.passoCreate = -40;
    responderTudo();
    await gerarEmbeddingsDeImoveis(["x"]);
    expect(metadadosDos()[0]?.duracaoMs).toBe(0);
  });

  it.each([
    { nome: "válido", valor: "req_abc.123:x-y" as unknown, esperado: "req_abc.123:x-y" },
    { nome: "com espaço", valor: "req com espaço", esperado: null },
    { nome: "com caractere inválido", valor: "req/abc", esperado: null },
    { nome: "longo demais", valor: "r".repeat(201), esperado: null },
    { nome: "no limite de 200", valor: "r".repeat(200), esperado: "r".repeat(200) },
    { nome: "não textual", valor: 42, esperado: null },
    { nome: "ausente", valor: AUSENTE, esperado: null },
  ])("request id $nome", async ({ valor, esperado }) => {
    responderTudo({ requestId: valor });
    await gerarEmbeddingsDeImoveis(["x"]);
    expect(metadadosDos()[0]?.requisicaoProvedorId).toBe(esperado);
  });

  it.each([
    { nome: "o da resposta", valor: "text-embedding-3-small-v2" as unknown, esperado: "text-embedding-3-small-v2" },
    { nome: "ausente (não cai no pedido)", valor: AUSENTE, esperado: null },
    { nome: "vazio", valor: "", esperado: null },
    { nome: "longo demais", valor: "m".repeat(121), esperado: null },
    { nome: "no limite de 120", valor: "m".repeat(120), esperado: "m".repeat(120) },
    { nome: "não textual", valor: 7, esperado: null },
  ])("modelo servido: $nome", async ({ valor, esperado }) => {
    responderTudo({ modelo: valor });
    await gerarEmbeddingsDeImoveis(["x"]);
    expect(metadadosDos()[0]?.modeloServido).toBe(esperado);
  });

  it("uma resposta hostil não derruba o fluxo: os campos ficam null", async () => {
    mocks.create.mockImplementation(async (corpo: { input: string[] }) => {
      const r = respostaDoLote(corpo.input, { requestId: AUSENTE, modelo: AUSENTE });
      Object.defineProperty(r, "model", { get() { throw new Error("getter"); }, enumerable: false });
      Object.defineProperty(r, "_request_id", { get() { throw new Error("getter"); } });
      return r;
    });
    expect(await gerarEmbeddingsDeImoveis(["x"])).toHaveLength(1);
    expect(metadadosDos()[0]).toMatchObject({ modeloServido: null, requisicaoProvedorId: null });
  });
});

/* ================================================================
   3. FALHA DO PROVEDOR (ia-chamada-falhou)
   ================================================================ */

const CHAVES_DA_FALHA = [
  "tipo", "execucao_id", "rota", "esforco", "config_origem", "config_versao",
  "modelo", "categoria", "status_http", "requisicao_provedor_id", "duracao_ms",
];
const SEGREDO_MENSAGEM = "MENSAGEM-SECRETA Rua das Flores 12 (43) 99999-0000";
const SEGREDO_CORPO = "CORPO-SECRETO sk-proj-abc";

function erroHttp(status: number, requestId: unknown = "req_falha123"): InstanceType<typeof OpenAI.APIError> {
  const h = new Headers({ "set-cookie": "__cf_bm=COOKIE-SECRETO", "openai-organization": "org-SECRETA" });
  if (requestId !== AUSENTE) h.set("x-request-id", String(requestId));
  return OpenAI.APIError.generate(status, { message: SEGREDO_CORPO }, SEGREDO_MENSAGEM, h);
}

describe("F13: ia-chamada-falhou na falha do provedor", () => {
  it.each(["embedding-comparavel-mercado", "embedding-consulta-avaliacao"])(
    "%s: falha no primeiro lote, um evento aviso com as 11 chaves, nenhum uso, a mesma exceção",
    async (tipo) => {
      mocks.passoCreate = 421.4;
      const original = erroHttp(500);
      mocks.create.mockRejectedValueOnce(original);
      expect(await capturar(gerarEmbeddingsDeImoveis(["x"], USUARIO, tipo))).toBe(original);
      expect(usos()).toHaveLength(0);
      expect(eventos().map((e) => e.evento)).toEqual(["ia-chamada-falhou"]);
      expect(falhas()[0]).toMatchObject({ userId: USUARIO, categoria: "ia", nivel: "aviso" });
      const detalhe = detalheDaFalha();
      expect(Object.keys(detalhe)).toEqual(CHAVES_DA_FALHA);
      expect(detalhe).toEqual({
        tipo,
        execucao_id: expect.stringMatching(UUID),
        rota: null,
        esforco: null,
        config_origem: null,
        config_versao: null,
        modelo: MODELO,
        categoria: "erro-do-provedor",
        status_http: 500,
        requisicao_provedor_id: "req_falha123",
        duracao_ms: 421,
      });
    },
  );

  it("o modelo do evento é o pedido, inclusive o configurado por ambiente", async () => {
    vi.stubEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-large");
    mocks.create.mockRejectedValueOnce(erroHttp(429));
    await capturar(gerarEmbeddingsDeImoveis(["x"]));
    expect(detalheDaFalha()).toMatchObject({ modelo: "text-embedding-3-large", tipo: "embedding-imovel" });
    expect(falhas()[0].userId).toBeNull();
  });

  it("lote 1 e 2 dão certo, lote 3 falha: dois usos e um evento, todos com o mesmo id", async () => {
    const original = erroHttp(503);
    mocks.create
      .mockImplementationOnce(async (corpo: { input: string[] }) => respostaDoLote(corpo.input))
      .mockImplementationOnce(async (corpo: { input: string[] }) => respostaDoLote(corpo.input))
      .mockRejectedValueOnce(original);
    expect(await capturar(gerarEmbeddingsDeImoveis(textos(250), USUARIO, "embedding-comparavel-mercado"))).toBe(original);
    expect(usos()).toHaveLength(2);
    expect(eventos().map((e) => e.evento)).toEqual(["ia-chamada-falhou"]);
    const ids = [...metadadosDos().map((m) => m?.execucaoId), detalheDaFalha().execucao_id];
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(UUID);
  });

  it("a duração da falha mede só o create que falhou", async () => {
    mocks.passoCliente = 5_000;
    mocks.passoCreate = 180;
    mocks.passoUso = 9_000;
    mocks.create
      .mockImplementationOnce(async (corpo: { input: string[] }) => respostaDoLote(corpo.input))
      .mockRejectedValueOnce(erroHttp(500));
    await capturar(gerarEmbeddingsDeImoveis(textos(150)));
    expect(detalheDaFalha().duracao_ms).toBe(180);
  });

  it.each([
    { nome: "429", criar: () => erroHttp(429), categoria: "limite-de-taxa", status: 429 },
    { nome: "401", criar: () => erroHttp(401), categoria: "autenticacao", status: 401 },
    { nome: "400", criar: () => erroHttp(400), categoria: "requisicao-recusada", status: 400 },
    { nome: "500", criar: () => erroHttp(500), categoria: "erro-do-provedor", status: 500 },
    { nome: "timeout", criar: () => new OpenAI.APIConnectionTimeoutError(), categoria: "timeout", status: null },
    { nome: "conexão", criar: () => new OpenAI.APIConnectionError({ message: SEGREDO_MENSAGEM }), categoria: "conexao", status: null },
    { nome: "Error comum", criar: () => new Error(SEGREDO_MENSAGEM), categoria: "desconhecida", status: null },
  ])("categoria de $nome → $categoria, a mesma exceção sem embrulho", async ({ criar, categoria, status }) => {
    const original = criar();
    mocks.create.mockRejectedValueOnce(original);
    const recebido = await capturar(gerarEmbeddingsDeImoveis(["x"]));
    expect(recebido).toBe(original);
    expect((recebido as Error).message).toBe((original as Error).message);
    expect(detalheDaFalha()).toMatchObject({ categoria, status_http: status });
  });

  it.each([
    { nome: "válido", id: "req_abc.123:x-y" as unknown, esperado: "req_abc.123:x-y" },
    { nome: "com espaço", id: "req com espaço", esperado: null },
    { nome: "longo demais", id: "r".repeat(201), esperado: null },
    { nome: "ausente", id: AUSENTE, esperado: null },
  ])("request id da falha $nome", async ({ id, esperado }) => {
    mocks.create.mockRejectedValueOnce(erroHttp(500, id));
    await capturar(gerarEmbeddingsDeImoveis(["x"]));
    expect(detalheDaFalha().requisicao_provedor_id).toBe(esperado);
  });

  it("nada da entrada, dos vetores ou do erro entra no evento nem nos metadados", async () => {
    const entrada = ["Apartamento da Maria Souza na Rua das Flores 12, (43) 99999-0000", "Casa SEGREDO-DO-IMOVEL"];
    mocks.create
      .mockImplementationOnce(async (corpo: { input: string[] }) => respostaDoLote(corpo.input))
      .mockRejectedValueOnce(erroHttp(400));
    await capturar(gerarEmbeddingsDeImoveis([...entrada, ...textos(99)], USUARIO, "embedding-consulta-avaliacao"));
    const texto = falhas()[0].detalhe + JSON.stringify(metadadosDos());
    for (const trecho of [
      "Maria", "Flores", "99999", "SEGREDO-DO-IMOVEL", "imovel 1", "0.123456", "0.654321", "0.987654",
      "MENSAGEM-SECRETA", "CORPO-SECRETO", "sk-proj", "COOKIE-SECRETO", "org-SECRETA", "chave-ficticia",
      "at ", "Error", "input",
    ]) {
      expect(texto).not.toContain(trecho);
    }
  });
});

describe("F13: a telemetria nunca interfere no erro", () => {
  it("se o registro do evento lançar, a exceção original do provedor continua subindo", async () => {
    const original = erroHttp(500);
    mocks.registrarEvento.mockImplementation(() => {
      throw new Error("registro quebrado");
    });
    mocks.create.mockRejectedValueOnce(original);
    expect(await capturar(gerarEmbeddingsDeImoveis(["x"]))).toBe(original);
    expect(mocks.registrarEvento).toHaveBeenCalledTimes(1);
  });
});

describe("F13: falha que não é do provedor não gera ia-chamada-falhou", () => {
  it("lote incompleto (rejeição da aplicação)", async () => {
    mocks.create.mockImplementation(async (corpo: { input: string[] }) => respostaDoLote(corpo.input, { faltar: 1 }));
    await capturar(gerarEmbeddingsDeImoveis(["a", "b"]));
    expect(falhas()).toHaveLength(0);
  });

  it("trava ao criar o cliente", async () => {
    mocks.falharCliente = new ChamadaOpenAIRealNaoAutorizadaError("test", "preview");
    await capturar(gerarEmbeddingsDeImoveis(["x"]));
    expect(falhas()).toHaveLength(0);
  });

  it("montar o corpo", async () => {
    mocks.falharCorpo = new Error("falha da aplicação");
    await capturar(gerarEmbeddingsDeImoveis(["x"]));
    expect(falhas()).toHaveLength(0);
  });

  it("registrar o uso", async () => {
    const original = new Error("falha da aplicação");
    responderTudo();
    mocks.registrarUso.mockImplementationOnce(() => {
      throw original;
    });
    expect(await capturar(gerarEmbeddingsDeImoveis(["x"]))).toBe(original);
    expect(falhas()).toHaveLength(0);
  });

  it("resposta sem data (leitura posterior)", async () => {
    mocks.create.mockResolvedValueOnce(Object.assign(respostaDoLote(["x"]), { data: undefined }));
    expect(await capturar(gerarEmbeddingsDeImoveis(["x"]))).toBeInstanceOf(TypeError);
    expect(usos()).toHaveLength(1);
    expect(falhas()).toHaveLength(0);
  });

  it("sucesso: nenhum evento", async () => {
    responderTudo();
    await gerarEmbeddingsDeImoveis(textos(250), USUARIO, "embedding-comparavel-mercado");
    expect(eventos()).toHaveLength(0);
  });
});
