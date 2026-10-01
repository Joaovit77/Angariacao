/* ================================================================
   IA-M1c-D1: O CHAT DO ASSISTENTE (F10) NA RESPONSES API

   Duas partes:

   1. CARACTERIZAÇÃO. Congela o que o F10 faz hoje: o corpo exato de cada
      `responses.create` (sha256 do JSON, com relógio fixo), o número de
      chamadas, os quatro argumentos de sempre do registro de uso, o evento
      final, o retorno, o fallback, o caminho `limite` e o 502 da rota na
      falha do provedor. Passa na base 91b6335.
   2. METADADOS. O que o M1c-D1 acrescenta: um execucao_id por turno, a
      configuração, o modelo servido, o request id, a duração, o motivo de
      fim, a recusa e o raciocínio, sem mudar nada da parte 1.

   SDK, Supabase e configuração são falsos. Nenhuma chamada real.
   ================================================================ */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  executarFerramenta: vi.fn(),
  registrarUso: vi.fn(),
  registrarEvento: vi.fn(),
  carregarConfiguracaoIa: vi.fn(),
  autorizado: true,
  /** Cópia de cada corpo NO MOMENTO da chamada: o F10 reaproveita o array
      `input` entre rodadas, então a referência guardada pelo mock muda depois. */
  enviados: [] as Record<string, unknown>[],
  /** Relógio falso: só anda (por `passo` ms) dentro do create. */
  relogio: 10_000,
  passo: 0,
}));

vi.mock("@/lib/servidor/openai-real", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/openai-real")>()),
  chamadaOpenAIRealAutorizada: () => mocks.autorizado,
  criarClienteOpenAIReal: () => ({
    responses: {
      create: (corpo: Record<string, unknown>, ...resto: unknown[]) => {
        mocks.enviados.push(JSON.parse(JSON.stringify(corpo)) as Record<string, unknown>);
        mocks.relogio += mocks.passo;
        return mocks.create(corpo, ...resto);
      },
    },
  }),
}));
vi.mock("@/lib/servidor/assistente/ferramentas", () => ({
  DEFINICOES_FERRAMENTAS: [],
  executarFerramenta: mocks.executarFerramenta,
}));
vi.mock("@/lib/servidor/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/registro")>()),
  registrarUsoDaResponsesApi: mocks.registrarUso,
  registrarEvento: mocks.registrarEvento,
}));
vi.mock("@/lib/servidor/ia/configuracao", () => ({ carregarConfiguracaoIa: mocks.carregarConfiguracaoIa }));
vi.mock("@/lib/servidor/iaAcesso", () => ({
  tokenDaRequisicao: () => "token-valido",
  clienteDoChamador: () => ({ auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) } }),
  podeUsarIa: async () => true,
}));

import { responderComAssistente } from "@/lib/servidor/assistente/orquestrador";
import { POST as assistente } from "@/app/api/assistente/route";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import { criarAtividadesIa } from "@/lib/calculo/atividadeIa";
import type { PedidoAssistente } from "@/lib/assistente/tipos";
import type { MetadadosUsoIa } from "@/lib/servidor/registro";
import { metadadosDaRespostaResponses, motivoFimDaResposta, recusaDaResposta } from "@/lib/servidor/ia/metadados-responses";

const USUARIO = "10000000-0000-4000-8000-000000000001";
const INSTANTE = "2026-10-01T12:00:00.000Z";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const DO_BANCO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  assistente: { modelo: "gpt-5.6-sol", esforco: "high" },
  versao: 9,
  criadoEm: "2026-09-01T00:00:00.000Z",
  alteradoPor: null,
  origem: "banco",
};
const PADRAO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  versao: null,
  criadoEm: null,
  alteradoPor: null,
  origem: "padrao",
};

function pedido(mensagem = "Qual foi minha última angariação?"): PedidoAssistente {
  return {
    mensagem,
    contexto: { rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" },
    historico: [{ papel: "usuario", texto: "Oi" }, { papel: "assistente", texto: "Olá! Como posso ajudar?" }],
  };
}

/* ---------------- respostas falsas da Responses API ---------------- */

type RespostaFalsa = Record<string, unknown>;

/** `AUSENTE` apaga o id: o provedor não mandou o cabeçalho. */
const AUSENTE = Symbol("ausente");
function comRequestId<T extends RespostaFalsa>(r: T, id: unknown = "req_f10"): T {
  if (id === AUSENTE) {
    delete (r as Record<string, unknown>)._request_id;
    return r;
  }
  Object.defineProperty(r, "_request_id", { value: id, enumerable: false, configurable: true });
  return r;
}

function respostaTexto(texto: string, extra: RespostaFalsa = {}): RespostaFalsa {
  return comRequestId({
    id: "resp_1",
    object: "response",
    model: "gpt-5.6-sol-2026-09-01",
    status: "completed",
    incomplete_details: null,
    output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: texto, annotations: [] }] }],
    output_text: texto,
    usage: { input_tokens: 500, input_tokens_details: { cached_tokens: 100 }, output_tokens: 60, output_tokens_details: { reasoning_tokens: 20 }, total_tokens: 560 },
    ...extra,
  });
}

function respostaFerramenta(): RespostaFalsa {
  return comRequestId({
    id: "resp_tool",
    object: "response",
    model: "gpt-5.6-sol-2026-09-01",
    status: "completed",
    incomplete_details: null,
    output: [{
      type: "function_call",
      id: "fc-1",
      call_id: "call-1",
      name: "buscar_marcos_imoveis",
      arguments: JSON.stringify({ marco: "angariado", data_inicio: null, data_fim: null, somente_contagem: false, limite: 1 }),
      status: "completed",
    }],
    output_text: "",
    usage: { input_tokens: 400, input_tokens_details: { cached_tokens: 0 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 10 }, total_tokens: 430 },
  }, "req_tool");
}

const sha = (valor: unknown) => createHash("sha256").update(JSON.stringify(valor)).digest("hex");
const corpos = () => mocks.enviados;
const usos = () => mocks.registrarUso.mock.calls;
const eventos = () => mocks.registrarEvento.mock.calls.map(([e]) => e as { evento: string; nivel: string; categoria: string; detalhe: string });
function detalheFinal(): Record<string, unknown> {
  const finais = eventos().filter((e) => e.evento === "ia-assistente-respondido");
  expect(finais).toHaveLength(1);
  return JSON.parse(finais[0].detalhe) as Record<string, unknown>;
}
function semChave<T extends Record<string, unknown>>(objeto: T, ...chaves: string[]): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...objeto };
  for (const chave of chaves) delete copia[chave];
  return copia;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(INSTANTE));
  vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  mocks.autorizado = true;
  mocks.create.mockReset();
  mocks.enviados.length = 0;
  mocks.passo = 0;
  mocks.executarFerramenta.mockReset();
  mocks.executarFerramenta.mockResolvedValue({ dados: { itensRetornados: 0, itens: [] } });
  mocks.registrarUso.mockReset();
  mocks.registrarEvento.mockReset();
  mocks.carregarConfiguracaoIa.mockReset();
  mocks.carregarConfiguracaoIa.mockResolvedValue(DO_BANCO);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ================================================================
   1. CARACTERIZAÇÃO (passa na base 91b6335)
   ================================================================ */

/** sha256 do JSON de cada corpo enviado, capturado na base 91b6335. */
const CORPO_SIMPLES = "0ed4a230832bb8de45e46119a2aef9cf878217d6794f20dd153248af5e9e6ea7";
const CORPOS_COM_FERRAMENTA = [
  "0ed4a230832bb8de45e46119a2aef9cf878217d6794f20dd153248af5e9e6ea7",
  "f4583fe3aa3cfa71230c5f4914ab037c3a97fbbc7d5490e1776d8e6d0b431f91",
];
/** O detalhe do evento final (sem execucao_id e sem duracaoContextoMs, que mede
    tempo real) e a mensagem devolvida (sem id), na base. */
const DETALHE_FINAL_SIMPLES =
  '{"operacao":"assistente-chat","protocolosConsiderados":[],"protocolosAplicados":[],"ferramentasChamadas":[],"entidadesUtilizadas":[],"fontesDeDados":[],"validacoesAplicadas":["normalizacao-do-pedido","limites-do-historico","selecao-deterministica-de-contexto","contexto-tipado-user-scoped","serializacao-sem-identificadores-internos","sanitizacao-da-saida"],"resultado":"respondido","motivo":"resposta-gerada","blocosContexto":["imovel","pipeline"],"fontesContexto":[],"consultasExecutadas":0,"caracteresContexto":882,"tokensContextoAproximados":221,"consultasReutilizadas":0}';
const MENSAGEM_SIMPLES = '{"papel":"assistente","texto":"Sua última angariação foi o LD-211."}';

const CHAVES_DO_CORPO = [
  "model", "instructions", "input", "tools", "tool_choice", "parallel_tool_calls",
  "max_output_tokens", "reasoning", "safety_identifier", "store",
];

describe("F10: caracterização do comportamento atual", () => {
  it("turno simples: uma chamada, corpo exato, quatro argumentos de uso de sempre, evento e retorno", async () => {
    mocks.create.mockResolvedValueOnce(respostaTexto("Sua última angariação foi o LD-211."));
    const resposta = await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const [corpo] = corpos();
    expect(Object.keys(corpo)).toEqual(CHAVES_DO_CORPO);
    expect(corpo).toMatchObject({
      model: "gpt-5.6-sol",
      tool_choice: "auto",
      parallel_tool_calls: false,
      max_output_tokens: 2500,
      reasoning: { effort: "high" },
      safety_identifier: createHash("sha256").update(USUARIO).digest("hex").slice(0, 32),
      store: false,
    });
    expect(mocks.create.mock.calls[0]).toHaveLength(1);
    if (process.env.CAPTURAR_F10) console.log("CORPO_SIMPLES", sha(corpo));
    expect(sha(corpo)).toBe(CORPO_SIMPLES);

    expect(usos()).toHaveLength(1);
    expect(usos()[0].slice(0, 4)).toEqual([USUARIO, "assistente-chat", "gpt-5.6-sol", respostaTexto("").usage]);

    const completo = detalheFinal();
    expect(typeof completo.duracaoContextoMs).toBe("number");
    const detalhe = semChave(completo, "execucao_id", "duracaoContextoMs");
    if (process.env.CAPTURAR_F10) console.log("DETALHE_FINAL_SIMPLES", JSON.stringify(detalhe));
    expect(JSON.stringify(detalhe)).toBe(DETALHE_FINAL_SIMPLES);
    expect(eventos()).toHaveLength(1);
    expect(eventos()[0]).toMatchObject({ categoria: "ia", nivel: "info", evento: "ia-assistente-respondido" });

    expect(resposta.modelo).toBe("gpt-5.6-sol");
    expect(resposta.mensagem.id).toMatch(UUID);
    const mensagem = semChave(resposta.mensagem as unknown as Record<string, unknown>, "id");
    if (process.env.CAPTURAR_F10) console.log("MENSAGEM_SIMPLES", JSON.stringify(mensagem));
    expect(JSON.stringify(mensagem)).toBe(MENSAGEM_SIMPLES);
  });

  it("turno com ferramenta: duas chamadas, corpos exatos, um uso por rodada", async () => {
    mocks.create.mockResolvedValueOnce(respostaFerramenta()).mockResolvedValueOnce(respostaTexto("Encontrei."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.executarFerramenta).toHaveBeenCalledTimes(1);
    const hashes = corpos().map(sha);
    if (process.env.CAPTURAR_F10) console.log("CORPOS_COM_FERRAMENTA", JSON.stringify(hashes));
    expect(hashes).toEqual(CORPOS_COM_FERRAMENTA);
    for (const corpo of corpos()) expect(Object.keys(corpo)).toEqual(CHAVES_DO_CORPO);
    expect(usos().map((u) => u.slice(0, 3))).toEqual([
      [USUARIO, "assistente-chat", "gpt-5.6-sol"],
      [USUARIO, "assistente-chat", "gpt-5.6-sol"],
    ]);
  });

  it("ferramenta em todas as rodadas: no máximo cinco chamadas, cinco usos", async () => {
    mocks.create.mockImplementation(async () => respostaFerramenta());
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(mocks.create).toHaveBeenCalledTimes(5);
    expect(usos()).toHaveLength(5);
  });

  it("texto vazio: o fallback de sempre e o motivo resposta-vazia-com-fallback", async () => {
    mocks.create.mockResolvedValueOnce(respostaTexto(""));
    const resposta = await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(resposta.mensagem.texto).toBe("Nao consegui formular uma resposta. Tente reformular a pergunta.");
    expect(detalheFinal()).toMatchObject({ resultado: "respondido", motivo: "resposta-vazia-com-fallback" });
    expect(eventos().map((e) => e.evento)).toEqual(["ia-assistente-respondido"]);
  });

  it("caminho limite: nenhuma chamada, nenhum uso, o evento de capacidade indisponível", async () => {
    const resposta = await responderComAssistente(pedido("Como está o mercado para este imóvel?"), {} as SupabaseClient, USUARIO);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(usos()).toHaveLength(0);
    expect(mocks.carregarConfiguracaoIa).not.toHaveBeenCalled();
    expect(resposta.modelo).toBe("catalogo-capacidades");
    expect(detalheFinal()).toMatchObject({ resultado: "respondido", motivo: "capacidade-indisponivel:consultar_mercado" });
  });

  it("falha do provedor: a mesma exceção sobe, sem uso e sem evento", async () => {
    const falha = new Error("provedor fora");
    mocks.create.mockRejectedValueOnce(falha);
    await expect(responderComAssistente(pedido(), {} as SupabaseClient, USUARIO)).rejects.toBe(falha);
    expect(usos()).toHaveLength(0);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("rota: a falha do provedor continua 502 falha_ia, sem uso e sem evento novo", async () => {
    mocks.create.mockRejectedValueOnce(new Error("provedor fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const resposta = await assistente(new Request("http://localhost/api/assistente", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-valido" },
      body: JSON.stringify(pedido()),
    }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toEqual({ ok: false, erro: "Nao foi possivel consultar o assistente agora.", codigo: "falha_ia" });
    expect(erro).toHaveBeenCalledTimes(1);
    expect(erro.mock.calls[0][0]).toBe("Assistente: falha ao responder:");
    expect(usos()).toHaveLength(0);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });
});

/* ================================================================
   2. METADADOS DO M1c-D1
   ================================================================ */

function metadadosDos(): MetadadosUsoIa[] {
  return usos().map((u) => u[4] as MetadadosUsoIa);
}

/** `performance.now()` fixo, que só anda (por `passo` ms) dentro do create:
    o contexto do assistente também lê o relógio, e não pode consumir o tempo. */
function relogioQueAndaNoCreate(passo: number) {
  mocks.relogio = 10_000;
  mocks.passo = passo;
  vi.spyOn(performance, "now").mockImplementation(() => mocks.relogio);
}

describe("F10: um execucao_id por turno", () => {
  it("as rodadas de um turno compartilham o id; a linha de uso e o evento final também", async () => {
    mocks.create
      .mockResolvedValueOnce(respostaFerramenta())
      .mockResolvedValueOnce(respostaFerramenta())
      .mockResolvedValueOnce(respostaTexto("Pronto."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    const ids = metadadosDos().map((m) => m.execucaoId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(UUID);
    expect(detalheFinal().execucao_id).toBe(ids[0]);
  });

  it("um turno novo tem outro id", async () => {
    mocks.create.mockImplementation(async () => respostaTexto("Ok."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    const [a, b] = metadadosDos().map((m) => m.execucaoId);
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it("o id nunca vai no corpo enviado ao provedor", async () => {
    mocks.create.mockResolvedValueOnce(respostaFerramenta()).mockResolvedValueOnce(respostaTexto("Ok."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    const id = metadadosDos()[0].execucaoId!;
    for (const corpo of corpos()) expect(JSON.stringify(corpo)).not.toContain(id);
  });

  it("caminho limite: o evento final sai com execucao_id null", async () => {
    await responderComAssistente(pedido("Como está o mercado para este imóvel?"), {} as SupabaseClient, USUARIO);
    expect(detalheFinal()).toHaveProperty("execucao_id", null);
  });
});

describe("F10: metadados da chamada", () => {
  it("configuração do banco, modelo servido, request id, duração e raciocínio", async () => {
    relogioQueAndaNoCreate(734.4);
    mocks.create.mockResolvedValueOnce(respostaTexto("Ok."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(metadadosDos()[0]).toEqual({
      execucaoId: expect.stringMatching(UUID),
      rota: "assistente",
      esforco: "high",
      configOrigem: "banco",
      configVersao: 9,
      modeloServido: "gpt-5.6-sol-2026-09-01",
      requisicaoProvedorId: "req_f10",
      duracaoMs: 734,
      motivoFim: "stop",
      recusa: false,
      tokensRaciocinio: 20,
    });
  });

  it("configuração padrão: origem padrao, versão null, o esforço padrão do assistente", async () => {
    mocks.carregarConfiguracaoIa.mockResolvedValue(PADRAO);
    mocks.create.mockResolvedValueOnce(respostaTexto("Ok."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(metadadosDos()[0]).toMatchObject({
      rota: "assistente", configOrigem: "padrao", configVersao: null, esforco: CONFIGURACAO_IA_PADRAO.assistente.esforco,
    });
  });

  it("duração inteira e nunca negativa", async () => {
    relogioQueAndaNoCreate(-10);
    mocks.create.mockResolvedValueOnce(respostaTexto("Ok."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(metadadosDos()[0].duracaoMs).toBe(0);
  });

  it.each([
    { nome: "modelo longo demais", extra: { model: "m".repeat(121) }, requestId: "req_ok", campo: "modeloServido" },
    { nome: "modelo não textual", extra: { model: 42 }, requestId: "req_ok", campo: "modeloServido" },
    { nome: "request id com espaço", extra: {}, requestId: "req com espaço", campo: "requisicaoProvedorId" },
    { nome: "request id longo demais", extra: {}, requestId: "r".repeat(201), campo: "requisicaoProvedorId" },
    { nome: "request id ausente", extra: {}, requestId: AUSENTE, campo: "requisicaoProvedorId" },
  ])("$nome → $campo null", async ({ extra, requestId, campo }) => {
    mocks.create.mockResolvedValueOnce(comRequestId(respostaTexto("Ok.", extra), requestId));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect((metadadosDos()[0] as unknown as Record<string, unknown>)[campo]).toBeNull();
  });

  it.each([-1, 1.5, "7", null])("raciocínio inválido (%s) → null", async (valor) => {
    mocks.create.mockResolvedValueOnce(respostaTexto("Ok.", {
      usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: valor }, total_tokens: 2 },
    }));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(metadadosDos()[0].tokensRaciocinio).toBeNull();
  });
});

describe("F10: motivo de fim, na ordem explícita", () => {
  it.each([
    { nome: "function_call vence o status", resposta: () => ({ ...respostaFerramenta(), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), motivo: "tool_calls" },
    { nome: "completed", resposta: () => respostaTexto("Ok."), motivo: "stop" },
    { nome: "incomplete por max_output_tokens", resposta: () => respostaTexto("Corta", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }), motivo: "length" },
    { nome: "incomplete por content_filter", resposta: () => respostaTexto("Filtrado", { status: "incomplete", incomplete_details: { reason: "content_filter" } }), motivo: "content_filter" },
    { nome: "incomplete sem motivo", resposta: () => respostaTexto("?", { status: "incomplete", incomplete_details: null }), motivo: null },
    { nome: "status desconhecido", resposta: () => respostaTexto("?", { status: "failed" }), motivo: null },
    { nome: "status ausente", resposta: () => respostaTexto("?", { status: undefined }), motivo: null },
  ])("$nome → $motivo", async ({ resposta, motivo }) => {
    // Só a primeira resposta importa: uma segunda, se houver rodada, encerra o turno.
    mocks.create.mockResolvedValueOnce(comRequestId(resposta())).mockResolvedValue(respostaTexto("Fim."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(metadadosDos()[0].motivoFim).toBe(motivo);
  });
});

describe("F10: recusa", () => {
  it.each([
    {
      nome: "item de recusa",
      extra: { output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "RECUSA-SECRETA não posso" }] }] },
      recusa: true,
    },
    { nome: "saída normal", extra: {}, recusa: false },
    { nome: "saída vazia", extra: { output: [] }, recusa: false },
  ])("$nome → $recusa", async ({ extra, recusa }) => {
    mocks.create.mockResolvedValueOnce(respostaTexto("Ok.", extra));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(metadadosDos()[0].recusa).toBe(recusa);
  });
});

describe("F10: helper, formas que o orquestrador não deixa chegar", () => {
  // O F10 lê `resposta.output.filter(...)` antes de qualquer coisa: uma
  // resposta sem `output` não chega ao registro. O helper ainda assim é
  // fechado para essa forma.
  it("saída ausente: recusa e motivo null, sem lançar", () => {
    expect(recusaDaResposta({ status: "completed" })).toBeNull();
    expect(recusaDaResposta(undefined)).toBeNull();
    expect(motivoFimDaResposta({ status: "completed" })).toBe("stop");
    expect(motivoFimDaResposta(null)).toBeNull();
    const hostil = {};
    Object.defineProperty(hostil, "output", { get() { throw new Error("getter"); } });
    expect(recusaDaResposta(hostil)).toBeNull();
    expect(motivoFimDaResposta(hostil)).toBeNull();
    expect(metadadosDaRespostaResponses(hostil, {
      execucaoId: "x", rota: "assistente", esforco: "low", configOrigem: "padrao", configVersao: null, duracaoMs: 0,
    })).toMatchObject({ modeloServido: null, requisicaoProvedorId: null, motivoFim: null, recusa: null, tokensRaciocinio: null });
  });
});

describe("F10: invariantes", () => {
  it("uma linha de uso por rodada, nunca duplicada, com os quatro argumentos de sempre", async () => {
    mocks.create.mockResolvedValueOnce(respostaFerramenta()).mockResolvedValueOnce(respostaTexto("Ok."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    expect(usos()).toHaveLength(2);
    expect(usos()[0].slice(0, 4)).toEqual([USUARIO, "assistente-chat", "gpt-5.6-sol", respostaFerramenta().usage]);
    expect(usos()[1].slice(0, 4)).toEqual([USUARIO, "assistente-chat", "gpt-5.6-sol", respostaTexto("").usage]);
  });

  it("nenhum texto da conversa, da resposta, da recusa ou das ferramentas vai para os metadados", async () => {
    mocks.create
      .mockResolvedValueOnce(respostaFerramenta())
      .mockResolvedValueOnce(respostaTexto("RESPOSTA-SECRETA Maria (43) 99999-0000", {
        output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "RECUSA-SECRETA" }] }],
      }));
    await responderComAssistente(pedido("Mensagem SECRETA da Maria Souza, Rua das Flores"), {} as SupabaseClient, USUARIO);
    const serializado = JSON.stringify(metadadosDos());
    for (const trecho of ["SECRETA", "Maria", "99999", "Flores", "buscar_marcos", "angariado", "call-1"]) {
      expect(serializado).not.toContain(trecho);
    }
  });

  it("o evento final só ganha execucao_id: o resto do detalhe e a timeline não mudam", async () => {
    mocks.create.mockResolvedValueOnce(respostaTexto("Sua última angariação foi o LD-211."));
    await responderComAssistente(pedido(), {} as SupabaseClient, USUARIO);
    const final = eventos().find((e) => e.evento === "ia-assistente-respondido")!;
    const comChave = JSON.parse(final.detalhe) as Record<string, unknown>;
    expect(JSON.stringify(semChave(comChave, "execucao_id", "duracaoContextoMs"))).toBe(DETALHE_FINAL_SIMPLES);
    const linha = (detalhe: string) => [{ id: 1, evento: final.evento, detalhe, criado_em: INSTANTE }];
    const usosTimeline = [{ id: 1, tipo: "assistente-chat", criado_em: INSTANTE }];
    expect(criarAtividadesIa(usosTimeline, 8, linha(final.detalhe)))
      .toEqual(criarAtividadesIa(usosTimeline, 8, linha(JSON.stringify(semChave(comChave, "execucao_id")))));
  });
});
