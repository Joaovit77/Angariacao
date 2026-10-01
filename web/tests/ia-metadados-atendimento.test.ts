/* ================================================================
   IA-M1c-A: METADADOS DO ATENDIMENTO (F3), DE PONTA A PONTA

   Caminho real: POST /api/ia (rascunhar-resposta) → a rota monta o executor
   com a rota `atendimento` e a versão carregada → o handler roda as etapas
   → cada etapa registra o uso. Só o SDK, o Supabase e a configuração são
   falsos; executor, rota e handler são os de produção.

   A prova é comportamental: os metadados capturados em
   registrarUsoDaResposta, não o texto do código.
   ================================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  carregarConfiguracaoIa: vi.fn(),
  create: vi.fn(),
  registrarUsoDaResposta: vi.fn(),
  registrarEvento: vi.fn(),
}));

// A conversa do mesmo harness de ia-handler-atendimento.test.ts: uma
// pergunta de taxa com um protocolo comercial que a responde.
vi.mock("@/lib/calculo/notas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calculo/notas")>()),
  corpoDaMensagemEnviada: () => "",
  corpoDaResposta: () => "Qual é a taxa?",
  ehNotaDeMensagemEnviada: () => false,
  ehNotaRecebidaNaConversa: () => true,
  ehNotaDeResposta: () => true,
  ehSoMidia: () => false,
}));
vi.mock("@/lib/calculo/respostas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calculo/respostas")>()),
  respostasDoImovel: () => [{ texto: "wa: Qual é a taxa?" }],
}));
vi.mock("@/lib/persistencia/mapeadores", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/persistencia/mapeadores")>()),
  fromDbImovel: () => ({
    id: "imovel-1",
    status: "Em negociação",
    proprietarioNome: "Marta",
    endereco: "Rua A, 10",
    tentativas: [],
    notas: [{ id: "wa:1", texto: "Resposta pelo WhatsApp: Qual é a taxa?", data: "2026-08-17T09:00" }],
  }),
  fromDbAbordagem: (valor: unknown) => valor,
  fromDbProtocolo: (valor: unknown) => valor,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/ia/configuracao", () => ({ carregarConfiguracaoIa: mocks.carregarConfiguracaoIa }));
vi.mock("@/lib/servidor/openai-real", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/openai-real")>()),
  chamadaOpenAIRealAutorizada: () => true,
  exigirAutorizacaoOpenAIReal: () => {},
  criarClienteOpenAIReal: () => ({ chat: { completions: { create: mocks.create } } }),
}));
vi.mock("@/lib/servidor/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/registro")>()),
  registrarUsoDaResposta: mocks.registrarUsoDaResposta,
  registrarEvento: mocks.registrarEvento,
}));

import OpenAI from "openai";
import { POST as ia } from "@/app/api/ia/route";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import type { MetadadosUsoIa } from "@/lib/servidor/registro";

const USUARIO = "10000000-0000-4000-8000-000000000001";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Duas configurações bem diferentes: a salva no banco e o padrão do código.
    Nenhum valor de atendimento coincide com o de outra rota. */
const DO_BANCO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  operacoes: { modelo: "gpt-5.4-nano", esforco: "medium" },
  atendimento: { modelo: "gpt-5.6-terra", esforco: "xhigh" },
  versao: 7,
  criadoEm: "2026-09-01T00:00:00.000Z",
  alteradoPor: null,
  origem: "banco",
};
const PADRAO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  atendimento: { modelo: "gpt-5.4-mini", esforco: "high" },
  versao: null,
  criadoEm: null,
  alteradoPor: null,
  origem: "padrao",
};

const decisaoTaxa = {
  intencao: "taxa",
  objecao: "",
  tipoResposta: "factual",
  estadoConversacional: "entendimento",
  informacoesJaExplicadas: [],
  acaoEsperada: "responder",
  proximoPassoPermitido: "responder a taxa",
  acoesProibidas: [],
  contextoRelevante: "pergunta direta",
  protocolosAplicaveis: ["Taxa"],
  evidencias: [{ id: "evidencia_1", fonteId: "fonte_4", fato: "a taxa é de 10%", temporalidade: "atemporal", evento: "" }],
  obrigacoesResposta: [{ id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria" }],
  informacoesFaltantes: [],
  nivelConfianca: "alta",
  precisaIntervencaoHumana: false,
  podeResponderComSeguranca: true,
};
const geracaoTaxa = {
  mensagem: "A taxa é de 10%.",
  protocolosUsados: ["Taxa"],
  obrigacoesCobertas: ["obrigacao_1"],
  afirmacoes: [{
    descricao: "a taxa é de 10%", tipo: "fato", evidencias: ["evidencia_1"], lacunas: [], temporalidade: "atual", evento: "",
  }],
};
const SAIDA_POR_ETAPA: Record<string, unknown> = {
  decisao_atendimento: decisaoTaxa,
  resposta_atendimento: geracaoTaxa,
  validacao_atendimento: { problemas: [] },
};

function consulta(tabela: string) {
  let unica = false;
  const resolver = () => {
    if (tabela === "ia_permissoes") return { data: { liberado: true }, error: null };
    if (tabela === "imoveis") return { data: { id: "imovel-1" }, error: null };
    if (tabela === "user_config") return { data: null, error: null };
    if (tabela === "abordagens") return { data: unica ? null : [], error: null };
    if (tabela === "protocolos") {
      return {
        data: [
          { id: "protocolo-taxa", tipo: "informacao_comercial", titulo: "Taxa", conteudo: "A taxa é de 10%.", arquivado: false },
          { id: "conduta", tipo: "regra_conduta", titulo: "Não repetir", conteudo: "Não repita o que já foi explicado.", arquivado: false },
        ],
        error: null,
      };
    }
    throw new Error(`Tabela inesperada: ${tabela}`);
  };
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order", "limit", "or"]) q[metodo] = () => q;
  q.maybeSingle = () => {
    unica = true;
    return q;
  };
  q.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => Promise.resolve().then(resolver).then(ok, falha);
  return q;
}

function requisicao(): Request {
  return new Request("http://localhost/api/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-valido" },
    body: JSON.stringify({ tipo: "rascunhar-resposta", imovelId: "imovel-1" }),
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "");
  mocks.create.mockReset();
  mocks.create.mockImplementation(async (corpo: { response_format?: { json_schema?: { name?: string } } }) => ({
    id: "chatcmpl-atendimento",
    object: "chat.completion",
    created: 1,
    model: "modelo-servido",
    choices: [{
      index: 0,
      finish_reason: "stop",
      logprobs: null,
      message: { role: "assistant", content: JSON.stringify(SAIDA_POR_ETAPA[corpo.response_format?.json_schema?.name || ""]), refusal: null },
    }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  }));
  mocks.registrarUsoDaResposta.mockReset();
  mocks.registrarEvento.mockReset();
  mocks.carregarConfiguracaoIa.mockReset();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => ({
    auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) },
    from: (tabela: string) => consulta(tabela),
  }));
});
afterEach(() => vi.unstubAllEnvs());

/** Roda uma requisição com a configuração dada e devolve, por chamada
    registrada, o tipo, o modelo pedido, o esforço enviado e os metadados. */
async function atendimentoCom(configuracao: VersaoConfiguracaoIa) {
  mocks.carregarConfiguracaoIa.mockResolvedValue(configuracao);
  const inicioUso = mocks.registrarUsoDaResposta.mock.calls.length;
  const inicioCreate = mocks.create.mock.calls.length;
  const resposta = await ia(requisicao());
  expect(resposta.status).toBe(200);
  expect(await resposta.json()).toMatchObject({ ok: true, rascunho: "A taxa é de 10%.", fallbackAplicado: false });
  const usos = mocks.registrarUsoDaResposta.mock.calls.slice(inicioUso);
  const corpos = mocks.create.mock.calls.slice(inicioCreate).map(([corpo]) => corpo as { reasoning_effort: string });
  expect(usos).toHaveLength(corpos.length);
  return usos.map((chamada, i) => ({
    usuario: chamada[0] as string,
    tipo: chamada[1] as string,
    modelo: chamada[2] as string,
    esforcoEnviado: corpos[i].reasoning_effort,
    metadados: chamada[4] as MetadadosUsoIa,
  }));
}

describe("F3: metadados de configuração e correlação, comportamentais", () => {
  it("todas as etapas carregam rota atendimento, a versão/origem carregadas, o esforço usado e um só execucaoId", async () => {
    const etapas = await atendimentoCom(DO_BANCO);
    expect(etapas.map((e) => e.tipo)).toEqual([
      "rascunhar-resposta-decisao",
      "rascunhar-resposta-geracao",
      "rascunhar-resposta-validacao",
    ]);
    for (const etapa of etapas) {
      expect(etapa.usuario).toBe(USUARIO);
      expect(etapa.modelo).toBe("gpt-5.6-terra");
      expect(etapa.esforcoEnviado).toBe("xhigh");
      expect(etapa.metadados).toMatchObject({
        rota: "atendimento",
        configOrigem: "banco",
        configVersao: 7,
        esforco: "xhigh",
        modeloServido: "modelo-servido",
      });
    }
    const ids = etapas.map((e) => e.metadados.execucaoId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(UUID);
  });

  it("uma segunda requisição, com outra configuração, compartilha o seu próprio id e segue a configuração carregada", async () => {
    const primeira = await atendimentoCom(DO_BANCO);
    const segunda = await atendimentoCom(PADRAO);

    for (const etapa of segunda) {
      expect(etapa.modelo).toBe("gpt-5.4-mini");
      expect(etapa.esforcoEnviado).toBe("high");
      expect(etapa.metadados).toMatchObject({ rota: "atendimento", configOrigem: "padrao", configVersao: null, esforco: "high" });
    }
    const idsPrimeira = new Set(primeira.map((e) => e.metadados.execucaoId));
    const idsSegunda = new Set(segunda.map((e) => e.metadados.execucaoId));
    expect(idsPrimeira.size).toBe(1);
    expect(idsSegunda.size).toBe(1);
    expect([...idsSegunda][0]).toMatch(UUID);
    expect([...idsSegunda][0]).not.toBe([...idsPrimeira][0]);
  });
});

describe("F3: falha do provedor numa etapa (IA-M1c-B)", () => {
  it("a decisão grava uso, a geração falha: o ia-chamada-falhou tem o mesmo execucaoId; resposta e evento legado iguais", async () => {
    mocks.carregarConfiguracaoIa.mockResolvedValue(DO_BANCO);
    const falhaDoProvedor = new OpenAI.InternalServerError(500, { message: "x" }, "x", new Headers({ "x-request-id": "req_f3" }));
    const sucesso = mocks.create.getMockImplementation()!;
    mocks.create.mockImplementation(async (corpo: { response_format?: { json_schema?: { name?: string } } }) => {
      if (corpo.response_format?.json_schema?.name === "resposta_atendimento") throw falhaDoProvedor;
      return sucesso(corpo);
    });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const resposta = await ia(requisicao());
    erro.mockRestore();

    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "falha-ia" });

    const usos = mocks.registrarUsoDaResposta.mock.calls;
    expect(usos.map((c) => c[1])).toEqual(["rascunhar-resposta-decisao"]);
    const execucaoDoSucesso = (usos[0][4] as MetadadosUsoIa).execucaoId;
    expect(execucaoDoSucesso).toMatch(UUID);

    const eventos = mocks.registrarEvento.mock.calls.map(([e]) => e as { evento: string; nivel: string; detalhe: string });
    const falhas = eventos.filter((e) => e.evento === "ia-chamada-falhou");
    expect(falhas).toHaveLength(1);
    expect(falhas[0].nivel).toBe("aviso");
    expect(JSON.parse(falhas[0].detalhe)).toMatchObject({
      tipo: "rascunhar-resposta-geracao",
      execucao_id: execucaoDoSucesso,
      rota: "atendimento",
      esforco: "xhigh",
      config_origem: "banco",
      config_versao: 7,
      modelo: "gpt-5.6-terra",
      categoria: "erro-do-provedor",
      status_http: 500,
      requisicao_provedor_id: "req_f3",
    });
    // O fluxo registra a etapa que deu certo e o bloqueio de sempre.
    expect(eventos.filter((e) => e.evento === "ia-atendimento-etapa")).toHaveLength(1);
    const bloqueios = eventos.filter((e) => e.evento === "ia-atendimento-bloqueado");
    expect(bloqueios).toHaveLength(1);
    expect(bloqueios[0].nivel).toBe("erro");
    expect(JSON.parse(bloqueios[0].detalhe)).toMatchObject({ etapaFinal: "geracao", resultado: "erro", motivo: "falha-ia", chamadas: 2 });
  });
});
