/* ================================================================
   IA-M1c-A: METADADOS DAS CHAMADAS EM ia_uso

   Uma linha em ia_uso continua significando SÓ "o provedor respondeu com
   usage e houve consumo registrado". Estes testes provam duas coisas:

   1. o registro (registro.ts): sem metadados, o insert é exatamente o de
      antes; com eles, as colunas novas saem com os valores certos;
   2. o executor: monta os metadados da resposta do provedor sem lançar,
      sem vazar texto e sem que nada disso vá no corpo enviado.

   O SDK e o Supabase são falsos. Nenhuma chamada real.
   ================================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inseridos: [] as Array<{ tabela: string; linha: Record<string, unknown> }>,
  erroInsert: null as { message: string } | null,
  registrarUsoDaResposta: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (tabela: string) => ({
      insert: async (linha: Record<string, unknown>) => {
        mocks.inseridos.push({ tabela, linha });
        return { error: mocks.erroInsert };
      },
    }),
  }),
}));

// O executor recebe o registro espionado; a parte 1 usa o módulo real.
vi.mock("@/lib/servidor/registro", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/registro")>();
  return { ...original, registrarUsoDaResposta: mocks.registrarUsoDaResposta };
});

import type OpenAI from "openai";
import type * as Registro from "@/lib/servidor/registro";
import type { MetadadosUsoIa } from "@/lib/servidor/registro";
import {
  contextoDaConfiguracao,
  criarExecutorOpenAIMockParaTeste,
  type PedidoExecutorOpenAI,
} from "@/lib/servidor/ia/executor-openai";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COLUNAS_LEGADAS = [
  "user_id", "tipo", "modelo", "tokens_entrada", "tokens_entrada_cache", "tokens_entrada_cache_gravacao", "tokens_saida",
];
const COLUNAS_NOVAS = [
  "execucao_id", "rota", "esforco", "config_origem", "config_versao", "modelo_servido",
  "requisicao_provedor_id", "duracao_ms", "motivo_fim", "recusa", "tokens_raciocinio",
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const METADADOS: MetadadosUsoIa = {
  execucaoId: "11111111-2222-4333-8444-555555555555",
  rota: "operacoes",
  esforco: "medium",
  configOrigem: "padrao",
  configVersao: null,
  modeloServido: "gpt-5.4-mini-2026-03-17",
  requisicaoProvedorId: "req_abc123",
  duracaoMs: 812,
  motivoFim: "stop",
  recusa: false,
  tokensRaciocinio: 64,
};

beforeEach(() => {
  mocks.inseridos.length = 0;
  mocks.erroInsert = null;
  mocks.registrarUsoDaResposta.mockReset();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-falsa");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/* ================================================================
   1. registro.ts: o insert
   ================================================================ */

describe("registro de uso: colunas de ia_uso", () => {
  const registro = () => vi.importActual<typeof Registro>("@/lib/servidor/registro");
  const uso = { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 30 } };

  it("sem metadados, o insert é exatamente o de antes do IA-M1c-A", async () => {
    (await registro()).registrarUsoDaResposta("u1", "resumo-dia", "gpt-5.4-mini", uso);
    await flush();
    expect(mocks.inseridos).toEqual([{
      tabela: "ia_uso",
      linha: {
        user_id: "u1", tipo: "resumo-dia", modelo: "gpt-5.4-mini",
        tokens_entrada: 100, tokens_entrada_cache: 30, tokens_entrada_cache_gravacao: 0, tokens_saida: 20,
      },
    }]);
    // Nem chave com valor undefined: o objeto é o mesmo de antes, chave a chave.
    expect(Object.keys(mocks.inseridos[0].linha)).toEqual(COLUNAS_LEGADAS);
  });

  it("com metadados, cada campo vai para a sua coluna, sem nada além disso", async () => {
    (await registro()).registrarUsoDaResposta("u1", "resumo-dia", "gpt-5.4-mini", uso, METADADOS);
    await flush();
    expect(mocks.inseridos).toHaveLength(1);
    const { linha } = mocks.inseridos[0];
    expect(Object.keys(linha).sort()).toEqual([...COLUNAS_LEGADAS, ...COLUNAS_NOVAS].sort());
    expect(linha).toMatchObject({
      modelo: "gpt-5.4-mini",
      execucao_id: METADADOS.execucaoId,
      rota: "operacoes",
      esforco: "medium",
      config_origem: "padrao",
      config_versao: null,
      modelo_servido: "gpt-5.4-mini-2026-03-17",
      requisicao_provedor_id: "req_abc123",
      duracao_ms: 812,
      motivo_fim: "stop",
      recusa: false,
      tokens_raciocinio: 64,
    });
  });

  it("sem usage nada é gravado, mesmo com metadados: falha nunca vira linha de consumo", async () => {
    (await registro()).registrarUsoDaResposta("u1", "resumo-dia", "gpt-5.4-mini", undefined, METADADOS);
    await flush();
    expect(mocks.inseridos).toEqual([]);
  });

  it("insert recusado não lança: a operação de IA segue", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.erroInsert = { message: "coluna desconhecida" };
    const { registrarUsoDaResposta } = await registro();
    expect(() => registrarUsoDaResposta("u1", "resumo-dia", "m", uso, METADADOS)).not.toThrow();
    await vi.waitFor(() => expect(erro).toHaveBeenCalledWith("Registro: uso de IA recusado:", expect.anything()));
  });
});

/* ================================================================
   2. executor: os metadados da chamada
   ================================================================ */

const USO_CHAT = {
  prompt_tokens: 50,
  completion_tokens: 30,
  total_tokens: 80,
  completion_tokens_details: { reasoning_tokens: 12 },
};

function conclusao(parcial: {
  model?: unknown;
  requestId?: unknown;
  finish?: unknown;
  refusal?: string | null;
  content?: string | null;
  semChoices?: boolean;
  usage?: unknown;
} = {}): OpenAI.Chat.ChatCompletion {
  const base: Record<string, unknown> = {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 1,
    model: "model" in parcial ? parcial.model : "gpt-5.4-nano-2026-03-17",
    usage: "usage" in parcial ? parcial.usage : USO_CHAT,
  };
  if (!parcial.semChoices) {
    base.choices = [{
      index: 0,
      finish_reason: "finish" in parcial ? parcial.finish : "stop",
      logprobs: null,
      message: { role: "assistant", content: parcial.content ?? "{}", refusal: parcial.refusal ?? null },
    }];
  }
  // Como o SDK: o id da requisição é uma propriedade não enumerável.
  Object.defineProperty(base, "_request_id", {
    value: "requestId" in parcial ? parcial.requestId : "req_7f3a9c",
    enumerable: false,
  });
  return base as unknown as OpenAI.Chat.ChatCompletion;
}

const VERSAO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  operacoes: { modelo: "gpt-5.4-nano", esforco: "high" },
  versao: 42,
  criadoEm: "2026-09-01T00:00:00.000Z",
  alteradoPor: null,
  origem: "banco",
};

function executorCom(resposta: OpenAI.Chat.ChatCompletion | (() => OpenAI.Chat.ChatCompletion), contexto = true) {
  const create = vi.fn<(corpo: unknown, opcoes?: unknown) => Promise<OpenAI.Chat.ChatCompletion>>(
    async () => (typeof resposta === "function" ? resposta() : resposta),
  );
  const executor = criarExecutorOpenAIMockParaTeste(
    { chat: { completions: { create } } } as unknown as OpenAI,
    "usuario-1",
    VERSAO.operacoes,
    contexto ? contextoDaConfiguracao(VERSAO, "operacoes") : undefined,
  );
  return { create, executor };
}

const PEDIDO: PedidoExecutorOpenAI = {
  tipo: "resumo-dia",
  reasoningEffort: "low",
  mensagens: [{ role: "user", content: "Prompt com Maria Souza, (43) 99999-0000, Rua das Flores 12" }],
  interpretarTexto: false,
};

function metadadosRegistrados(usoEsperado: unknown = USO_CHAT): MetadadosUsoIa {
  expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
  const chamada = mocks.registrarUsoDaResposta.mock.calls[0];
  expect(chamada.slice(0, 4)).toEqual(["usuario-1", "resumo-dia", "gpt-5.4-nano", usoEsperado]);
  return chamada[4] as MetadadosUsoIa;
}

describe("executor: metadados da chamada bem-sucedida", () => {
  it("rota, configuração, esforço, modelo servido, request id, motivo de fim, recusa e raciocínio", async () => {
    const agora = vi.spyOn(performance, "now");
    agora.mockReturnValueOnce(1_000).mockReturnValueOnce(1_234.6);
    const { executor } = executorCom(conclusao());
    await executor.executar({ ...PEDIDO, execucaoId: METADADOS.execucaoId });
    expect(metadadosRegistrados()).toEqual({
      execucaoId: METADADOS.execucaoId,
      rota: "operacoes",
      esforco: "high",
      configOrigem: "banco",
      configVersao: 42,
      modeloServido: "gpt-5.4-nano-2026-03-17",
      requisicaoProvedorId: "req_7f3a9c",
      duracaoMs: 235,
      motivoFim: "stop",
      recusa: false,
      tokensRaciocinio: 12,
    });
  });

  it("duração é inteira e nunca negativa, mesmo com relógio voltando", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(5_000).mockReturnValueOnce(4_990);
    const { executor } = executorCom(conclusao());
    await executor.executar(PEDIDO);
    expect(metadadosRegistrados().duracaoMs).toBe(0);
  });

  it("sem execucaoId, cada chamada ganha um uuid próprio", async () => {
    const { executor } = executorCom(conclusao());
    await executor.executar(PEDIDO);
    await executor.executar(PEDIDO);
    const [a, b] = mocks.registrarUsoDaResposta.mock.calls.map((c) => (c[4] as MetadadosUsoIa).execucaoId);
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it("execucaoId e os metadados nunca vão no corpo enviado ao provedor", async () => {
    const { create, executor } = executorCom(conclusao());
    await executor.executar({ ...PEDIDO, execucaoId: METADADOS.execucaoId });
    const corpo = create.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(Object.keys(corpo)).toEqual(["model", "max_completion_tokens", "reasoning_effort", "messages"]);
    expect(JSON.stringify(corpo)).not.toContain(METADADOS.execucaoId);
    expect(create.mock.calls[0][1]).toEqual({});
  });

  it("sem contexto de configuração, rota e configuração ficam null; o esforço segue o enviado", async () => {
    const { executor } = executorCom(conclusao(), false);
    await executor.executar(PEDIDO);
    expect(metadadosRegistrados()).toMatchObject({ rota: null, configOrigem: null, configVersao: null, esforco: "high" });
  });

  it("recusa e truncamento aparecem nos metadados", async () => {
    const { executor } = executorCom(conclusao({ refusal: "não posso", content: null }));
    await executor.executar(PEDIDO);
    expect(metadadosRegistrados()).toMatchObject({ recusa: true, motivoFim: "stop" });

    mocks.registrarUsoDaResposta.mockReset();
    const truncada = executorCom(conclusao({ finish: "length" }));
    await truncada.executor.executar(PEDIDO);
    expect(metadadosRegistrados()).toMatchObject({ recusa: false, motivoFim: "length" });
  });

  it("resposta sem choices: nenhuma exceção nova no opt-out; recusa e motivo ficam null", async () => {
    const { executor } = executorCom(conclusao({ semChoices: true }));
    await expect(executor.executar(PEDIDO)).resolves.toHaveProperty("conclusao");
    expect(metadadosRegistrados()).toMatchObject({ recusa: null, motivoFim: null });
  });

  it("valores do provedor fora do formato viram null, sem derrubar a chamada", async () => {
    const usoNegativo = { ...USO_CHAT, completion_tokens_details: { reasoning_tokens: -1 } };
    const { executor } = executorCom(conclusao({
      model: "m".repeat(121),
      requestId: "req com espaço",
      finish: "STOP!",
      usage: usoNegativo,
    }));
    await executor.executar(PEDIDO);
    expect(metadadosRegistrados(usoNegativo)).toMatchObject({
      modeloServido: null, requisicaoProvedorId: null, motivoFim: null, tokensRaciocinio: null,
    });

    for (const raciocinio of [1.5, "7", null]) {
      mocks.registrarUsoDaResposta.mockReset();
      const usoEstranho = { ...USO_CHAT, completion_tokens_details: { reasoning_tokens: raciocinio } };
      const outro = executorCom(conclusao({ model: 42, requestId: undefined, usage: usoEstranho }));
      await outro.executor.executar(PEDIDO);
      expect(metadadosRegistrados(usoEstranho)).toMatchObject({ modeloServido: null, requisicaoProvedorId: null, tokensRaciocinio: null });
    }
  });

  it("nenhum texto do prompt ou da resposta vai para os metadados", async () => {
    const { executor } = executorCom(conclusao({ content: "RESPOSTA-SECRETA com Maria Souza" }));
    await executor.executar(PEDIDO);
    const serializado = JSON.stringify(metadadosRegistrados());
    for (const trecho of ["Maria", "99999", "Flores", "RESPOSTA-SECRETA", "Prompt"]) {
      expect(serializado).not.toContain(trecho);
    }
  });

  it("uso é registrado uma única vez por chamada, antes de qualquer parse", async () => {
    const { executor } = executorCom(conclusao({ content: "{quebrado" }));
    await executor.executar(PEDIDO);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
  });

  it("erro do provedor não registra uso (falha não vira linha de consumo)", async () => {
    const create = vi.fn(async () => { throw new Error("rede"); });
    const executor = criarExecutorOpenAIMockParaTeste(
      { chat: { completions: { create } } } as unknown as OpenAI,
      "usuario-1",
      VERSAO.operacoes,
      contextoDaConfiguracao(VERSAO, "operacoes"),
    );
    await expect(executor.executar(PEDIDO)).rejects.toThrow("rede");
    expect(mocks.registrarUsoDaResposta).not.toHaveBeenCalled();
  });
});

describe("contextoDaConfiguracao", () => {
  it("copia só nome, versão e origem; o padrão do código sai como versão null/padrao", () => {
    expect(contextoDaConfiguracao(VERSAO, "classificacao")).toEqual({ nome: "classificacao", versao: 42, origem: "banco" });
    expect(contextoDaConfiguracao({ ...VERSAO, versao: null, origem: "padrao" }, "assistente"))
      .toEqual({ nome: "assistente", versao: null, origem: "padrao" });
  });
});
