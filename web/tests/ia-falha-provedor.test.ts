/* ================================================================
   IA-M1c-B: FALHA NA CHAMADA AO PROVEDOR, NO EXECUTOR COMUM

   Quando a chamada ao provedor é iniciada e falha, o executor emite
   exatamente UM evento `ia-chamada-falhou` (categoria ia, nível aviso)
   em log_eventos e relança a MESMA exceção. Nada vai para ia_uso: uma
   linha ali continua significando "o provedor respondeu com usage".

   O registro aqui é o módulo real; só o Supabase é falso e conta os
   inserts por tabela, então "zero linhas em ia_uso" é provado no ponto
   em que a linha seria escrita. O SDK é falso: nenhuma chamada real.
   ================================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inseridos: [] as Array<{ tabela: string; linha: Record<string, unknown> }>,
  clienteLanca: false,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    if (mocks.clienteLanca) throw new Error("cliente do registro quebrado");
    return {
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        mocks.inseridos.push({ tabela, linha });
        return { error: null };
      },
    }),
  };
  },
}));

import OpenAI from "openai";
import {
  categorizarFalhaProvedor,
  type CategoriaFalhaProvedor,
  contextoDaConfiguracao,
  criarExecutorOpenAI,
  criarExecutorOpenAIMockParaTeste,
  type PedidoExecutorOpenAI,
} from "@/lib/servidor/ia/executor-openai";
import { ChamadaOpenAIRealNaoAutorizadaError } from "@/lib/servidor/openai-real";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import { errosPorCorretor, type EventoLog } from "@/lib/calculo/admin";

const USUARIO = "usuario-1";
const EXECUCAO = "11111111-2222-4333-8444-555555555555";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHAVES_DO_DETALHE = [
  "tipo", "execucao_id", "rota", "esforco", "config_origem", "config_versao",
  "modelo", "categoria", "status_http", "requisicao_provedor_id", "duracao_ms",
];
/** Marcadores que só existem na mensagem, no corpo e nos cabeçalhos do erro. */
const SEGREDO_MENSAGEM = "MENSAGEM-SECRETA Maria Souza (43) 99999-0000";
const SEGREDO_CORPO = "CORPO-SECRETO sk-proj-abc";
const SEGREDO_CABECALHO = "CABECALHO-SECRETO";

const VERSAO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  operacoes: { modelo: "gpt-5.4-nano", esforco: "high" },
  versao: 42,
  criadoEm: "2026-09-01T00:00:00.000Z",
  alteradoPor: null,
  origem: "banco",
};

const PEDIDO: PedidoExecutorOpenAI = {
  tipo: "resumo-dia",
  reasoningEffort: "low",
  mensagens: [{ role: "user", content: "Prompt com Maria Souza, (43) 99999-0000, Rua das Flores 12" }],
  interpretarTexto: false,
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function cabecalhos(requestId: string | null): Headers {
  const h = new Headers({ "x-segredo": SEGREDO_CABECALHO });
  if (requestId !== null) h.set("x-request-id", requestId);
  return h;
}

/** Erro HTTP do SDK, como o SDK o monta a partir da resposta. */
/** `requestId` null: o provedor não mandou o cabeçalho. */
function erroHttp(status: number, requestId: string | null = "req_falha123"): InstanceType<typeof OpenAI.APIError> {
  return OpenAI.APIError.generate(status, { message: SEGREDO_CORPO }, SEGREDO_MENSAGEM, cabecalhos(requestId));
}

function executorFalhando(erro: unknown, contexto = true) {
  const create = vi.fn(async () => {
    throw erro;
  });
  const executor = criarExecutorOpenAIMockParaTeste(
    { chat: { completions: { create } } } as unknown as OpenAI,
    USUARIO,
    VERSAO.operacoes,
    contexto ? contextoDaConfiguracao(VERSAO, "operacoes") : undefined,
  );
  return { create, executor };
}

/** Executa, devolve o erro recebido por quem chamou e os inserts gravados. */
async function falhar(erro: unknown, pedido: PedidoExecutorOpenAI = PEDIDO, contexto = true) {
  const { executor } = executorFalhando(erro, contexto);
  let recebido: unknown = "nada-lançado";
  try {
    await executor.executar(pedido);
  } catch (e) {
    recebido = e;
  }
  await flush();
  return { recebido, ...gravados() };
}

function gravados() {
  const eventos = mocks.inseridos.filter((i) => i.tabela === "log_eventos").map((i) => i.linha);
  const usos = mocks.inseridos.filter((i) => i.tabela === "ia_uso").map((i) => i.linha);
  return { eventos, usos };
}

function detalhe(linha: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(String(linha.detalhe)) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.inseridos.length = 0;
  mocks.clienteLanca = false;
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-falsa");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/* ================================================================
   1. Categorização fechada, na ordem obrigatória
   ================================================================ */

describe("categorizarFalhaProvedor", () => {
  const casos: Array<{ nome: string; criar: () => unknown; esperado: CategoriaFalhaProvedor }> = [
    { nome: "APIUserAbortError", criar: () => new OpenAI.APIUserAbortError(), esperado: "cancelada" },
    { nome: "APIConnectionTimeoutError", criar: () => new OpenAI.APIConnectionTimeoutError(), esperado: "timeout" },
    { nome: "APIConnectionError", criar: () => new OpenAI.APIConnectionError({ message: "rede" }), esperado: "conexao" },
    { nome: "429", criar: () => erroHttp(429), esperado: "limite-de-taxa" },
    { nome: "401", criar: () => erroHttp(401), esperado: "autenticacao" },
    { nome: "403", criar: () => erroHttp(403), esperado: "autenticacao" },
    { nome: "400", criar: () => erroHttp(400), esperado: "requisicao-recusada" },
    { nome: "404", criar: () => erroHttp(404), esperado: "requisicao-recusada" },
    { nome: "422", criar: () => erroHttp(422), esperado: "requisicao-recusada" },
    { nome: "500", criar: () => erroHttp(500), esperado: "erro-do-provedor" },
    { nome: "502", criar: () => erroHttp(502), esperado: "erro-do-provedor" },
    { nome: "503", criar: () => erroHttp(503), esperado: "erro-do-provedor" },
    { nome: "409", criar: () => erroHttp(409), esperado: "desconhecida" },
    { nome: "Error comum", criar: () => new Error("qualquer"), esperado: "desconhecida" },
    { nome: "valor que não é erro", criar: () => "texto", esperado: "desconhecida" },
    { nome: "null", criar: () => null, esperado: "desconhecida" },
  ];
  it.each(casos)("$nome → $esperado", ({ criar, esperado }) => {
    expect(categorizarFalhaProvedor(criar())).toBe(esperado);
  });

  it("o timeout é uma conexão para o SDK, mas sai como timeout (a ordem importa)", () => {
    const timeout = new OpenAI.APIConnectionTimeoutError();
    expect(timeout).toBeInstanceOf(OpenAI.APIConnectionError);
    expect(categorizarFalhaProvedor(timeout)).toBe("timeout");
  });

  it("um status fora da faixa HTTP não vira categoria HTTP", () => {
    expect(categorizarFalhaProvedor({ status: 429.5 })).toBe("desconhecida");
    expect(categorizarFalhaProvedor({ status: "500" })).toBe("desconhecida");
    expect(categorizarFalhaProvedor({ status: 600 })).toBe("desconhecida");
  });
});

/* ================================================================
   2. O evento emitido pelo executor
   ================================================================ */

describe("executor: falha na chamada ao provedor", () => {
  const falhas: Array<{ categoria: CategoriaFalhaProvedor; criar: () => unknown; status: number | null }> = [
    { categoria: "cancelada", criar: () => new OpenAI.APIUserAbortError(), status: null },
    { categoria: "timeout", criar: () => new OpenAI.APIConnectionTimeoutError(), status: null },
    { categoria: "conexao", criar: () => new OpenAI.APIConnectionError({ message: SEGREDO_MENSAGEM }), status: null },
    { categoria: "limite-de-taxa", criar: () => erroHttp(429), status: 429 },
    { categoria: "autenticacao", criar: () => erroHttp(401), status: 401 },
    { categoria: "autenticacao", criar: () => erroHttp(403), status: 403 },
    { categoria: "requisicao-recusada", criar: () => erroHttp(400), status: 400 },
    { categoria: "requisicao-recusada", criar: () => erroHttp(404), status: 404 },
    { categoria: "requisicao-recusada", criar: () => erroHttp(422), status: 422 },
    { categoria: "erro-do-provedor", criar: () => erroHttp(500), status: 500 },
    { categoria: "erro-do-provedor", criar: () => erroHttp(502), status: 502 },
    { categoria: "desconhecida", criar: () => new Error(SEGREDO_MENSAGEM), status: null },
  ];
  it.each(falhas)("$categoria (status $status): um evento aviso, a mesma exceção, nenhum uso", async ({ categoria, criar, status }) => {
    const original = criar();
    const { recebido, eventos, usos } = await falhar(original);
    expect(recebido).toBe(original);
    expect(usos).toHaveLength(0);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ user_id: USUARIO, categoria: "ia", nivel: "aviso", evento: "ia-chamada-falhou" });
    expect(detalhe(eventos[0])).toMatchObject({ categoria, status_http: status });
  });

  it("detalhe: exatamente a lista fechada, com execução, rota, configuração e modelo pedido", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(1_417.6);
    const { eventos } = await falhar(erroHttp(503, "req_abc.123:x-9"), { ...PEDIDO, execucaoId: EXECUCAO });
    const d = detalhe(eventos[0]);
    expect(Object.keys(d)).toEqual(CHAVES_DO_DETALHE);
    expect(d).toEqual({
      tipo: "resumo-dia",
      execucao_id: EXECUCAO,
      rota: "operacoes",
      esforco: "high",
      config_origem: "banco",
      config_versao: 42,
      modelo: "gpt-5.4-nano",
      categoria: "erro-do-provedor",
      status_http: 503,
      requisicao_provedor_id: "req_abc.123:x-9",
      duracao_ms: 418,
    });
  });

  it("sem contexto de configuração, rota e configuração saem null; esforço e modelo seguem os enviados", async () => {
    const { create, executor } = executorFalhando(erroHttp(500), false);
    await expect(executor.executar(PEDIDO)).rejects.toBeInstanceOf(OpenAI.InternalServerError);
    await flush();
    const corpo = (create.mock.calls[0] as unknown[])[0] as { model: string; reasoning_effort: string };
    const d = detalhe(gravados().eventos[0]);
    expect(d).toMatchObject({ rota: null, config_origem: null, config_versao: null });
    expect(d.esforco).toBe(corpo.reasoning_effort);
    expect(d.modelo).toBe(corpo.model);
  });

  it("sem execucaoId, a falha ganha um uuid próprio, e cada falha um diferente", async () => {
    const { executor } = executorFalhando(erroHttp(500));
    await expect(executor.executar(PEDIDO)).rejects.toThrow();
    await expect(executor.executar(PEDIDO)).rejects.toThrow();
    await flush();
    const ids = gravados().eventos.map((e) => detalhe(e).execucao_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(UUID);
    expect(ids[1]).toMatch(UUID);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("duração é inteira e nunca negativa, mesmo com relógio voltando", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(5_000).mockReturnValueOnce(4_990);
    const { eventos } = await falhar(erroHttp(500));
    expect(detalhe(eventos[0]).duracao_ms).toBe(0);
  });

  it("request id inválido, longo ou ausente não vaza: sai null", async () => {
    for (const id of ["req com espaço", "req_<script>", "r".repeat(201), "", null]) {
      mocks.inseridos.length = 0;
      const { eventos } = await falhar(erroHttp(500, id));
      expect(detalhe(eventos[0]).requisicao_provedor_id).toBeNull();
    }
    mocks.inseridos.length = 0;
    const { eventos } = await falhar(erroHttp(500, "r".repeat(200)));
    expect(detalhe(eventos[0]).requisicao_provedor_id).toBe("r".repeat(200));
  });

  it("um requestID que lança no getter vira null, e a exceção original segue", async () => {
    const original = new Error(SEGREDO_MENSAGEM);
    Object.defineProperty(original, "requestID", { get() { throw new Error("getter"); } });
    const { recebido, eventos } = await falhar(original);
    expect(recebido).toBe(original);
    expect(detalhe(eventos[0]).requisicao_provedor_id).toBeNull();
  });

  it("nenhuma mensagem, stack, corpo, cabeçalho ou prompt vai para o evento", async () => {
    const original = erroHttp(500);
    expect(original.stack).toBeTruthy();
    const { eventos } = await falhar(original);
    const serializado = JSON.stringify(eventos[0]);
    for (const trecho of [
      SEGREDO_MENSAGEM, SEGREDO_CORPO, SEGREDO_CABECALHO, "Maria", "99999", "Flores", "Prompt", "sk-proj",
      String(original.stack).split("\n")[1]?.trim() ?? "at ", "x-segredo",
    ]) {
      expect(serializado).not.toContain(trecho);
    }
  });

  it("sucesso não emite evento e grava uso uma vez", async () => {
    const create = vi.fn(async () => ({
      id: "chatcmpl-1", object: "chat.completion", created: 1, model: "m",
      choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: "ok", refusal: null } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }));
    const executor = criarExecutorOpenAIMockParaTeste(
      { chat: { completions: { create } } } as unknown as OpenAI,
      USUARIO,
      VERSAO.operacoes,
      contextoDaConfiguracao(VERSAO, "operacoes"),
    );
    await executor.executar(PEDIDO);
    await flush();
    expect(gravados().eventos).toHaveLength(0);
    expect(gravados().usos).toHaveLength(1);
  });

  it("falha ao registrar o evento não mascara a exceção original", async () => {
    // registrarEvento monta o cliente fora do after(): se isso lançar, a
    // exceção que sobe ainda tem de ser a do provedor.
    mocks.clienteLanca = true;
    const original = erroHttp(429);
    const { recebido, eventos } = await falhar(original);
    expect(recebido).toBe(original);
    expect(eventos).toHaveLength(0);
  });

  it("o evento em nível aviso não entra na contagem de erros do admin", async () => {
    const { eventos } = await falhar(erroHttp(500));
    const comoLog = (linha: Record<string, unknown>, nivel = linha.nivel): EventoLog => ({
      id: 1,
      userId: linha.user_id as string,
      categoria: linha.categoria as string,
      nivel: nivel as string,
      evento: linha.evento as string,
      detalhe: linha.detalhe as string,
      criadoEm: "2026-09-30T00:00:00.000Z",
    });
    expect(errosPorCorretor([comoLog(eventos[0])]).get(USUARIO)).toBeUndefined();
    // Controle: o mesmo evento em nível erro contaria.
    expect(errosPorCorretor([comoLog(eventos[0], "erro")]).get(USUARIO)).toBe(1);
  });
});

/* ================================================================
   3. A trava de ambiente fica fora: a aplicação decidiu não chamar
   ================================================================ */

describe("executor: trava antes do provedor", () => {
  it("Vercel fora de produção: lança a trava, não chama o provedor e não emite evento", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const create = vi.fn();
    const executor = criarExecutorOpenAI(
      { chat: { completions: { create } } } as unknown as OpenAI,
      USUARIO,
      VERSAO.operacoes,
      contextoDaConfiguracao(VERSAO, "operacoes"),
    );
    await expect(executor.executar(PEDIDO)).rejects.toBeInstanceOf(ChamadaOpenAIRealNaoAutorizadaError);
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(gravados()).toEqual({ eventos: [], usos: [] });
  });
});
