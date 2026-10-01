/* ================================================================
   IA-M1c-D2: OS DOIS LOGS DE FALHA DA ROTA /api/assistente

   O catch da rota recebe qualquer coisa: falha do provedor, de uma
   ferramenta, do Supabase ou da própria aplicação. Por isso o log não
   leva nada do erro (nem mensagem, nem stack, nem corpo, nem cabeçalhos):
   só um objeto fechado que diz qual operação do Assistente falhou. Quem
   afirma "foi o provedor" é o evento `ia-chamada-falhou`, não este log.

   1. CARACTERIZAÇÃO (passa na base 23ec825): status, corpo HTTP, um único
      log com o prefixo de sempre, e o caminho do ErroAnaliseAprofundada.
   2. LOG SEGURO: o argumento do log é o objeto fechado.

   O orquestrador e a análise aprofundada são falsos: só lançam o erro do
   caso. Nenhuma chamada real.
   ================================================================ */
import { inspect } from "node:util";
import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  responder: vi.fn(),
  analisar: vi.fn(),
  registrarEvento: vi.fn(),
}));

vi.mock("@/lib/servidor/iaAcesso", () => ({
  tokenDaRequisicao: () => "token-valido",
  clienteDoChamador: () => ({ auth: { getUser: async () => ({ data: { user: { id: "usuario-1" } }, error: null }) } }),
  podeUsarIa: async () => true,
}));
vi.mock("@/lib/servidor/openai-real", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/openai-real")>()),
  chamadaOpenAIRealAutorizada: () => true,
}));
vi.mock("@/lib/servidor/assistente/orquestrador", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/assistente/orquestrador")>()),
  responderComAssistente: mocks.responder,
}));
vi.mock("@/lib/servidor/assistente/analiseAprofundada", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/assistente/analiseAprofundada")>()),
  executarAnaliseAprofundada: mocks.analisar,
}));
vi.mock("@/lib/servidor/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/registro")>()),
  registrarEvento: mocks.registrarEvento,
}));

import { POST as assistente } from "@/app/api/assistente/route";
import { ErroAnaliseAprofundada } from "@/lib/servidor/assistente/analiseAprofundada";

/** Marcadores que só existem dentro dos erros. */
const SEGREDOS = [
  "MENSAGEM-SECRETA", "Maria Souza", "99999-0000", "CORPO-SECRETO", "sk-proj-abc",
  "COOKIE-SECRETO", "org-SECRETA", "proj_SECRETO", "req_vazado", "SUPABASE-SECRETO",
  "43999990000", "Rua das Flores", "STACK-SECRETA",
];

function erroDoProvedor(status: number) {
  const cabecalhos = new Headers({
    "x-request-id": "req_vazado",
    "set-cookie": "__cf_bm=COOKIE-SECRETO; path=/",
    "openai-organization": "org-SECRETA",
    "openai-project": "proj_SECRETO",
  });
  return OpenAI.APIError.generate(status, { message: "CORPO-SECRETO sk-proj-abc" }, "MENSAGEM-SECRETA Maria Souza (43) 99999-0000", cabecalhos);
}

const ERROS: Array<{ nome: string; criar: () => unknown }> = [
  { nome: "provedor 400 com cabeçalhos e corpo", criar: () => erroDoProvedor(400) },
  { nome: "provedor 500", criar: () => erroDoProvedor(500) },
  { nome: "timeout do provedor", criar: () => new OpenAI.APIConnectionTimeoutError({ message: "MENSAGEM-SECRETA" }) },
  {
    nome: "erro do Supabase numa ferramenta",
    criar: () => Object.assign(new Error("duplicate key SUPABASE-SECRETO"), {
      code: "23505", details: "Key (telefone)=(43999990000) already exists.", hint: "Rua das Flores",
    }),
  },
  {
    nome: "erro da aplicação com stack",
    criar: () => {
      const e = new TypeError("Cannot read properties of undefined (MENSAGEM-SECRETA)");
      e.stack = "TypeError: STACK-SECRETA\n    at Rua das Flores";
      return e;
    },
  },
  { nome: "valor que não é erro", criar: () => "MENSAGEM-SECRETA Maria Souza" },
];

function requisicao(corpo: unknown) {
  return new Request("http://localhost/api/assistente", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-valido" },
    body: JSON.stringify(corpo),
  });
}
const CHAT = { mensagem: "Qual foi minha última angariação?", contexto: { rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" }, historico: [] };
const ANALISE = { tipo: "analise_aprofundada", imovelId: "10000000-0000-4000-8000-000000000002", sessaoId: "sessao-12345", incluirAtendimento: false };

let logErro: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  mocks.responder.mockReset();
  mocks.analisar.mockReset();
  mocks.registrarEvento.mockReset();
  logErro = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Tudo o que o log levaria, formatado como o console formata. */
const formatado = (args: unknown[]) => inspect(args, { depth: Infinity, showHidden: true });

/* ================================================================
   1. CARACTERIZAÇÃO (passa na base 23ec825)
   ================================================================ */

describe("rota do Assistente: o fluxo da falha não muda", () => {
  it.each(ERROS)("chat ($nome): 502 falha_ia, um log com o prefixo de sempre", async ({ criar }) => {
    mocks.responder.mockRejectedValueOnce(criar());
    const resposta = await assistente(requisicao(CHAT));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toEqual({ ok: false, erro: "Nao foi possivel consultar o assistente agora.", codigo: "falha_ia" });
    expect(mocks.responder).toHaveBeenCalledTimes(1);
    expect(logErro).toHaveBeenCalledTimes(1);
    expect(logErro.mock.calls[0]).toHaveLength(2);
    expect(logErro.mock.calls[0][0]).toBe("Assistente: falha ao responder:");
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it.each(ERROS)("análise aprofundada ($nome): 502 falha_ia, um log com o prefixo de sempre", async ({ criar }) => {
    mocks.analisar.mockRejectedValueOnce(criar());
    const resposta = await assistente(requisicao(ANALISE));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toEqual({ ok: false, erro: "Não foi possível concluir a análise agora.", codigo: "falha_ia" });
    expect(mocks.analisar).toHaveBeenCalledTimes(1);
    expect(logErro).toHaveBeenCalledTimes(1);
    expect(logErro.mock.calls[0]).toHaveLength(2);
    expect(logErro.mock.calls[0][0]).toBe("Assistente: falha na análise aprofundada:");
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("análise aprofundada com ErroAnaliseAprofundada: o status e o código dele, sem log", async () => {
    mocks.analisar.mockRejectedValueOnce(new ErroAnaliseAprofundada("Imóvel não encontrado.", "imovel_nao_encontrado", 404));
    const resposta = await assistente(requisicao(ANALISE));
    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({ ok: false, erro: "Imóvel não encontrado.", codigo: "imovel_nao_encontrado" });
    expect(logErro).not.toHaveBeenCalled();
  });

  it("sucesso do chat: nenhum log de falha", async () => {
    mocks.responder.mockResolvedValueOnce({ modelo: "gpt-5.4-mini", mensagem: { id: "m", papel: "assistente", texto: "Ok." } });
    const resposta = await assistente(requisicao(CHAT));
    expect(resposta.status).toBe(200);
    expect(logErro).not.toHaveBeenCalled();
  });
});

/* ================================================================
   2. LOG SEGURO (IA-M1c-D2)
   ================================================================ */

describe("rota do Assistente: o log de falha não leva nada do erro", () => {
  it.each(ERROS)("chat ($nome): só o objeto fechado", async ({ criar }) => {
    mocks.responder.mockRejectedValueOnce(criar());
    await assistente(requisicao(CHAT));
    expect(logErro.mock.calls[0]).toEqual(["Assistente: falha ao responder:", { operacao: "assistente-chat", codigo: "falha_ia" }]);
    const texto = formatado(logErro.mock.calls[0]);
    for (const segredo of SEGREDOS) expect(texto).not.toContain(segredo);
  });

  it.each(ERROS)("análise aprofundada ($nome): só o objeto fechado", async ({ criar }) => {
    mocks.analisar.mockRejectedValueOnce(criar());
    await assistente(requisicao(ANALISE));
    expect(logErro.mock.calls[0]).toEqual(["Assistente: falha na análise aprofundada:", { operacao: "analise-aprofundada", codigo: "falha_ia" }]);
    const texto = formatado(logErro.mock.calls[0]);
    for (const segredo of SEGREDOS) expect(texto).not.toContain(segredo);
  });

  it("um erro hostil, que lança ao ser lido, não derruba o 502", async () => {
    const hostil = new Proxy({}, { get() { throw new Error("MENSAGEM-SECRETA"); }, has() { throw new Error("MENSAGEM-SECRETA"); } });
    mocks.responder.mockRejectedValueOnce(hostil);
    const resposta = await assistente(requisicao(CHAT));
    expect(resposta.status).toBe(502);
    expect(logErro.mock.calls[0]).toEqual(["Assistente: falha ao responder:", { operacao: "assistente-chat", codigo: "falha_ia" }]);
  });
});
