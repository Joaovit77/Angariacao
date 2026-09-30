/* ================================================================
   CONTRATO DA REQUISIÇÃO OPENAI: F1 (classificação da resposta) e
   F4–F9 (operações de /api/ia)

   Estes testes fixam o que sai para o provedor em cada chamada: modelo,
   rota de configuração, reasoning_effort, max_completion_tokens,
   structured output, mensagens, opções de transporte (retry/timeout) e o
   `tipo` gravado em `ia_uso`. Eles existem para que centralizar as
   chamadas no executor (IA-M1b) seja provadamente uma troca de caminho,
   não de comportamento.

   A configuração falsa usa um modelo e um esforço DIFERENTES por rota, e
   nenhuma rota usa o modelo padrão: trocar `operacoes` por
   `classificacao` (ou cair no padrão do executor) quebra o teste em vez
   de passar despercebido. Os modelos aqui são só valores distintos da
   allowlist; nada disso é a configuração de Production.

   Nenhum teste chama a OpenAI: o SDK é um objeto falso.
   ================================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  carregarConfiguracaoIa: vi.fn(),
  criarClienteOpenAIReal: vi.fn(),
  create: vi.fn(),
  registrarUsoDaResposta: vi.fn(),
  registrarEvento: vi.fn(),
  autorizado: true,
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/ia/configuracao", () => ({ carregarConfiguracaoIa: mocks.carregarConfiguracaoIa }));
vi.mock("@/lib/servidor/openai-real", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/openai-real")>();
  return {
    ...original,
    chamadaOpenAIRealAutorizada: () => mocks.autorizado,
    exigirAutorizacaoOpenAIReal: () => {
      if (!mocks.autorizado) throw new original.ChamadaOpenAIRealNaoAutorizadaError("test", "preview");
    },
    criarClienteOpenAIReal: mocks.criarClienteOpenAIReal,
  };
});
vi.mock("@/lib/servidor/registro", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/registro")>();
  return {
    ...original,
    registrarEvento: mocks.registrarEvento,
    registrarUsoDaResposta: mocks.registrarUsoDaResposta,
  };
});

import OpenAI from "openai";
import fixtures from "./fixtures-baseline.json";
import { POST as ia } from "@/app/api/ia/route";
import { classificarResposta } from "@/lib/servidor/ia";
import {
  ESQUEMA_ABORDAGEM_ANUNCIO,
  ESQUEMA_ACAO_TERRITORIAL,
  ESQUEMA_ANUNCIO,
  ESQUEMA_ANUNCIO_GERADO,
  ESQUEMA_CLASSIFICACAO,
  ESQUEMA_ROTEIROS,
  contagemPorStatus,
  panoramaDoDia,
  promptAbordagemDoAnuncio,
  promptAcaoTerritorial,
  promptAnalisarAbordagens,
  promptAnalisarDashboard,
  promptClassificarResposta,
  promptExplicarFocoInteligente,
  promptExtrairAnuncio,
  promptGerarAnuncio,
  promptResumoDia,
  promptSugerirRoteiros,
  type ContextoRoteiro,
} from "@/lib/calculo/ia";
import { desempenhoPorAbordagem, resumoTentativas } from "@/lib/calculo/abordagens";
import { kpisDashboard } from "@/lib/calculo/dashboard";
import { focoInteligenteDoDia } from "@/lib/calculo/focoDia";
import { filtrarImoveisMapa, leituraTerritorialMapa } from "@/lib/calculo/mapa";
import { todayISO } from "@/lib/datas";
import { SYSTEM_PROMPT_CENTRAL_ANGARIO } from "@/lib/ia/system-prompt";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { criarExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import type { VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import {
  fromDbAbordagem,
  fromDbAgenda,
  fromDbImovel,
  type DbAbordagemRow,
  type DbAgendaRow,
  type DbImovelRow,
} from "@/lib/persistencia/mapeadores";

const USUARIO = "10000000-0000-4000-8000-000000000001";
const INSTANTE = "2026-07-09T15:00:00.000Z";

/** Um modelo e um esforço por rota, todos diferentes entre si e do padrão. */
const CONFIGURACAO: VersaoConfiguracaoIa = {
  operacoes: { modelo: "gpt-5.4-nano", esforco: "high" },
  classificacao: { modelo: "gpt-5.6-sol", esforco: "medium" },
  atendimento: { modelo: "gpt-5.6-terra", esforco: "xhigh" },
  assistente: { modelo: "gpt-5.6-luna", esforco: "none" },
  instrucaoAtendimento: "",
  versao: 42,
  criadoEm: "2026-07-01T00:00:00.000Z",
  alteradoPor: null,
  origem: "banco",
};

/** Ordem exata das chaves do corpo: o executor e as chamadas diretas
    montam o objeto na mesma ordem, e a serialização segue a ordem. */
const CHAVES_COM_FORMATO = ["model", "max_completion_tokens", "reasoning_effort", "response_format", "messages"];
const CHAVES_SEM_FORMATO = ["model", "max_completion_tokens", "reasoning_effort", "messages"];

const USO = { prompt_tokens: 111, completion_tokens: 22, total_tokens: 133 };

/* ---------------- dados do banco (conta de teste do baseline) ---------------- */

const ABORDAGENS: DbAbordagemRow[] = [
  { id: "ab-1", user_id: USUARIO, nome: "Roteiro direto", roteiro: "Olá, {imovel}", canal_sugerido: null, origens: null, arquivada: false },
  { id: "ab-2", user_id: USUARIO, nome: "Roteiro antigo", roteiro: "Oi", canal_sugerido: null, origens: null, arquivada: true },
];

const IMOVEIS: DbImovelRow[] = (fixtures.imoveis as unknown as DbImovelRow[]).map((linha, indice) =>
  indice === 0
    ? {
        ...linha,
        tentativas: [
          { id: "t-1", data: "2026-07-01T10:00", abordagemId: "ab-1", resultado: "respondeu" },
          { id: "t-2", data: "2026-07-03T10:00", abordagemId: "ab-1", resultado: "sem-resposta" },
        ],
      } as DbImovelRow
    : linha,
);
const AGENDA = fixtures.agenda as unknown as DbAgendaRow[];
const USER_CONFIG = fixtures.user_config as Record<string, unknown>;

/** Builder encadeável do supabase-js: qualquer filtro devolve o próprio
    objeto; `maybeSingle` troca a leitura de lista para linha única. */
function consulta(tabela: string) {
  let unica = false;
  const resolver = () => {
    if (tabela === "ia_permissoes") return { data: { liberado: true }, error: null };
    if (tabela === "abordagens") return { data: ABORDAGENS, error: null };
    if (tabela === "imoveis") return { data: unica ? IMOVEIS[0] : IMOVEIS, error: null };
    if (tabela === "agenda") return { data: AGENDA, error: null };
    if (tabela === "user_config") return { data: USER_CONFIG, error: null };
    throw new Error(`Tabela inesperada: ${tabela}`);
  };
  const q: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "order", "limit"]) q[metodo] = () => q;
  q.maybeSingle = () => {
    unica = true;
    return q;
  };
  q.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) =>
    Promise.resolve().then(resolver).then(ok, falha);
  return q;
}

/* ---------------- respostas falsas do modelo ---------------- */

function conclusao(
  content: string | null,
  finish: OpenAI.Chat.ChatCompletion.Choice["finish_reason"] = "stop",
  refusal: string | null = null,
): OpenAI.Chat.ChatCompletion {
  return {
    id: "chatcmpl-contrato",
    object: "chat.completion",
    created: 1,
    model: "modelo-servido-qualquer",
    choices: [{ index: 0, finish_reason: finish, logprobs: null, message: { role: "assistant", content, refusal } }],
    usage: USO,
  };
}

const SAIDA_VALIDA: Record<string, string> = {
  roteiros: JSON.stringify({ roteiros: [{ nome: "Direto", roteiro: "Oi, {imovel}", canal: "WhatsApp", origens: [] }] }),
  anuncio: JSON.stringify({ tipo: "Apartamento", bairro: "Centro" }),
  anuncio_gerado: JSON.stringify({ titulo: "Título", descricao: "Descrição", faltando: [] }),
  abordagem_anuncio: JSON.stringify({ mensagem: "Olá, vi seu anúncio.", pontos: [] }),
  acao_territorial: JSON.stringify({ acao: "Priorize o bairro com mais captações." }),
  classificacao: JSON.stringify({ resultado: "respondeu", retomarEm: null, horaRetomar: null, resumo: "Respondeu.", motivoPerda: null }),
};

function responderValido() {
  mocks.create.mockImplementation(async (corpo: { response_format?: { json_schema?: { name?: string } } }) => {
    const nome = corpo.response_format?.json_schema?.name;
    return conclusao(nome ? SAIDA_VALIDA[nome] : "Leitura em texto livre.");
  });
}

function requisicao(corpo: Record<string, unknown>): Request {
  return new Request("http://localhost/api/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-valido" },
    body: JSON.stringify(corpo),
  });
}

function unicaChamada(): { corpo: Record<string, unknown>; opcoes: unknown } {
  expect(mocks.create).toHaveBeenCalledTimes(1);
  const [corpo, opcoes] = mocks.create.mock.calls[0] as [Record<string, unknown>, unknown];
  return { corpo, opcoes };
}

function mensagensEsperadas(conteudo: OpenAI.Chat.ChatCompletionUserMessageParam["content"]) {
  return [
    { role: "developer", content: SYSTEM_PROMPT_CENTRAL_ANGARIO },
    { role: "user", content: conteudo },
  ];
}

function formato(nome: string, esquema: unknown) {
  return { type: "json_schema", json_schema: { name: nome, strict: true, schema: esquema } };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(INSTANTE));
  vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.local");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "");
  mocks.autorizado = true;
  mocks.create.mockReset();
  mocks.registrarUsoDaResposta.mockReset();
  mocks.registrarEvento.mockReset();
  mocks.carregarConfiguracaoIa.mockReset();
  mocks.carregarConfiguracaoIa.mockResolvedValue(CONFIGURACAO);
  mocks.criarClienteOpenAIReal.mockReset();
  mocks.criarClienteOpenAIReal.mockImplementation(() => ({ chat: { completions: { create: mocks.create } } }));
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => ({
    auth: { getUser: async () => ({ data: { user: { id: USUARIO } }, error: null }) },
    from: (tabela: string) => consulta(tabela),
  }));
  responderValido();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/* ================================================================
   F4–F9: o que cada tipo de /api/ia envia
   ================================================================ */

const imoveis = () => IMOVEIS.map(fromDbImovel);
const agenda = () => AGENDA.map(fromDbAgenda);

interface CasoOperacao {
  tipo: string;
  corpo: Record<string, unknown>;
  maxTokens: number;
  formato: { nome: string; esquema: unknown } | null;
  conteudo: () => OpenAI.Chat.ChatCompletionUserMessageParam["content"];
  resposta: Record<string, unknown>;
}

const CONTEXTO_ROTEIRO: ContextoRoteiro = {
  tipoImovel: "Apartamento",
  bairro: "Centro",
  situacao: null,
  canal: "WhatsApp",
  captador: null,
  empresa: "Imobiliária Exemplo",
};
const TEXTO_ANUNCIO = "Apartamento 2 quartos no Centro, R$ 1.500. Publicado em 01/07.";

const CASOS_OPERACOES: CasoOperacao[] = [
  {
    tipo: "sugerir-roteiros",
    corpo: { contexto: { ...CONTEXTO_ROTEIRO, extra: "ignorado" } },
    maxTokens: 4000,
    formato: { nome: "roteiros", esquema: ESQUEMA_ROTEIROS },
    conteudo: () => promptSugerirRoteiros(CONTEXTO_ROTEIRO, ["Roteiro direto"]),
    // corrigirMarcadores troca o {imovel} escapado pelo marcador real.
    resposta: { ok: true, roteiros: [{ nome: "Direto", roteiro: "Oi, {endereco}", canal: "WhatsApp", origens: [] }] },
  },
  {
    tipo: "extrair-anuncio",
    corpo: { texto: TEXTO_ANUNCIO },
    maxTokens: 4000,
    formato: { nome: "anuncio", esquema: ESQUEMA_ANUNCIO },
    conteudo: () => [{ type: "text", text: promptExtrairAnuncio(TEXTO_ANUNCIO, todayISO()) }],
    resposta: { ok: true, anuncio: { tipo: "Apartamento", bairro: "Centro" } },
  },
  {
    tipo: "gerar-anuncio",
    corpo: { imovelId: IMOVEIS[0].id, caracteristicas: "Sacada e churrasqueira" },
    maxTokens: 4000,
    formato: { nome: "anuncio_gerado", esquema: ESQUEMA_ANUNCIO_GERADO },
    conteudo: () => promptGerarAnuncio(fromDbImovel(IMOVEIS[0]), "Sacada e churrasqueira"),
    resposta: { ok: true, anuncioGerado: { titulo: "Título", descricao: "Descrição", faltando: [] } },
  },
  {
    tipo: "abordagem-anuncio",
    corpo: { imovelId: IMOVEIS[0].id },
    maxTokens: 4000,
    formato: { nome: "abordagem_anuncio", esquema: ESQUEMA_ABORDAGEM_ANUNCIO },
    conteudo: () => promptAbordagemDoAnuncio(fromDbImovel(IMOVEIS[0])),
    resposta: { ok: true, abordagem: { mensagem: "Olá, vi seu anúncio.", pontos: [] } },
  },
  {
    tipo: "analisar-mapa",
    corpo: { filtros: {} },
    maxTokens: 1000,
    formato: { nome: "acao_territorial", esquema: ESQUEMA_ACAO_TERRITORIAL },
    conteudo: () =>
      promptAcaoTerritorial(
        leituraTerritorialMapa(
          filtrarImoveisMapa(imoveis(), { busca: "", bairro: "", status: "", responsavel: "", origem: "", desde: null }),
        ),
      ),
    resposta: { ok: true, leitura: { acao: "Priorize o bairro com mais captações." } },
  },
  {
    tipo: "analisar-abordagens",
    corpo: {},
    maxTokens: 4000,
    formato: null,
    conteudo: () =>
      promptAnalisarAbordagens(
        desempenhoPorAbordagem(imoveis(), ABORDAGENS.map(fromDbAbordagem), todayISO()),
        resumoTentativas(imoveis()),
      ),
    resposta: { ok: true, texto: "Leitura em texto livre." },
  },
  {
    tipo: "analisar-dashboard",
    corpo: {},
    maxTokens: 4000,
    formato: null,
    conteudo: () =>
      promptAnalisarDashboard(kpisDashboard(imoveis(), Number(USER_CONFIG.comissao_percent)), contagemPorStatus(imoveis())),
    resposta: { ok: true, texto: "Leitura em texto livre." },
  },
  {
    tipo: "explicar-foco",
    corpo: {},
    maxTokens: 4000,
    formato: null,
    conteudo: () => {
      const extras = Array.isArray(USER_CONFIG.origens_extras)
        ? (USER_CONFIG.origens_extras as unknown[]).filter((o): o is string => typeof o === "string" && o.trim() !== "")
        : [];
      return promptExplicarFocoInteligente(focoInteligenteDoDia(imoveis(), agenda(), extras, todayISO()));
    },
    resposta: { ok: true, texto: "Leitura em texto livre." },
  },
  {
    tipo: "resumo-dia",
    corpo: {},
    maxTokens: 4000,
    formato: null,
    conteudo: () => promptResumoDia(panoramaDoDia(imoveis(), agenda())),
    resposta: { ok: true, texto: "Leitura em texto livre." },
  },
];

describe("contrato da requisição: operações de /api/ia (F4–F9)", () => {
  it.each(CASOS_OPERACOES)("$tipo: rota operacoes, parâmetros, mensagens e ia_uso", async (caso) => {
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual(caso.resposta);

    const { corpo, opcoes } = unicaChamada();
    expect(Object.keys(corpo)).toEqual(caso.formato ? CHAVES_COM_FORMATO : CHAVES_SEM_FORMATO);
    expect(corpo.model).toBe(CONFIGURACAO.operacoes.modelo);
    expect(corpo.reasoning_effort).toBe(CONFIGURACAO.operacoes.esforco);
    expect(corpo.max_completion_tokens).toBe(caso.maxTokens);
    if (caso.formato) {
      expect(corpo.response_format).toEqual(formato(caso.formato.nome, caso.formato.esquema));
      expect((corpo.response_format as { json_schema: { schema: unknown } }).json_schema.schema).toBe(caso.formato.esquema);
    }
    expect(corpo.messages).toEqual(mensagensEsperadas(caso.conteudo()));
    // Nenhuma opção de transporte própria: retry e timeout são os do
    // cliente (padrão do SDK), exatamente como na chamada direta.
    expect(opcoes ?? {}).toEqual({});

    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, caso.tipo, CONFIGURACAO.operacoes.modelo, USO);
    expect(mocks.criarClienteOpenAIReal).toHaveBeenCalledWith({ apiKey: "chave-ficticia" });
  });

  it("classificar-imovel-identificado é recusado antes de criar cliente pago", async () => {
    const resposta = await ia(requisicao({ tipo: "classificar-imovel-identificado" }));
    expect(resposta.status).toBe(400);
    expect(mocks.criarClienteOpenAIReal).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("comportamento de falha: operações de /api/ia (F4–F9)", () => {
  const tiposEstruturados = CASOS_OPERACOES.filter((c) => c.formato);
  const todos = CASOS_OPERACOES;

  it.each(todos)("$tipo: erro do provedor vira 502 classificado, evento ia-falhou e nenhum uso", async (caso) => {
    mocks.create.mockRejectedValue(new OpenAI.RateLimitError(429, { message: "rate" }, "rate", new Headers()));
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "limite-excedido" });
    expect(mocks.registrarUsoDaResposta).not.toHaveBeenCalled();
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      userId: USUARIO,
      categoria: "ia",
      nivel: "erro",
      evento: "ia-falhou",
      detalhe: `${caso.tipo}: limite-excedido`,
    }));
  });

  it.each(todos)("$tipo: autenticação recusada vira nao-configurado", async (caso) => {
    mocks.create.mockRejectedValue(new OpenAI.AuthenticationError(401, { message: "auth" }, "auth", new Headers()));
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "nao-configurado" });
  });

  it.each(tiposEstruturados)("$tipo: JSON inválido é 502 falha-ia e o uso já foi registrado", async (caso) => {
    mocks.create.mockResolvedValue(conclusao("{isto não é json"));
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "falha-ia" });
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, caso.tipo, CONFIGURACAO.operacoes.modelo, USO);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it.each(todos)("$tipo: resposta truncada é 502 falha-ia com uso registrado", async (caso) => {
    mocks.create.mockResolvedValue(conclusao(SAIDA_VALIDA[caso.formato?.nome || ""] || "texto", "length"));
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "falha-ia" });
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
  });

  it.each(todos)("$tipo: recusa do modelo é 502 falha-ia com uso registrado", async (caso) => {
    mocks.create.mockResolvedValue(conclusao(null, "stop", "não posso"));
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "falha-ia" });
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
  });

  it("sugerir-roteiros: itens sem nome/roteiro são descartados; lista vazia é 502", async () => {
    mocks.create.mockResolvedValue(conclusao(JSON.stringify({ roteiros: [{ nome: 1, roteiro: "x" }, { nome: "Só nome" }] })));
    const resposta = await ia(requisicao({ tipo: "sugerir-roteiros", contexto: CONTEXTO_ROTEIRO }));
    expect(resposta.status).toBe(502);
  });

  it("extrair-anuncio: sem texto é 400 e não chama o modelo", async () => {
    const resposta = await ia(requisicao({ tipo: "extrair-anuncio", texto: "   " }));
    expect(resposta.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("gerar-anuncio: título sem descrição é 502; faltando só aceita a allowlist", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(JSON.stringify({ titulo: "Só título", descricao: " ", faltando: [] })));
    const semDescricao = await ia(requisicao({ tipo: "gerar-anuncio", imovelId: IMOVEIS[0].id }));
    expect(semDescricao.status).toBe(502);

    mocks.create.mockResolvedValueOnce(conclusao(JSON.stringify({ titulo: " T ", descricao: " D ", faltando: ["inventado", 3] })));
    const filtrado = await ia(requisicao({ tipo: "gerar-anuncio", imovelId: IMOVEIS[0].id }));
    expect(await filtrado.json()).toEqual({ ok: true, anuncioGerado: { titulo: "T", descricao: "D", faltando: [] } });
  });

  it("abordagem-anuncio: mensagem vazia é 502; pontos fora da lista são removidos", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(JSON.stringify({ mensagem: "  ", pontos: [] })));
    expect((await ia(requisicao({ tipo: "abordagem-anuncio", imovelId: IMOVEIS[0].id }))).status).toBe(502);

    mocks.create.mockResolvedValueOnce(conclusao(JSON.stringify({ mensagem: " Olá ", pontos: ["inventado"] })));
    const resposta = await ia(requisicao({ tipo: "abordagem-anuncio", imovelId: IMOVEIS[0].id }));
    expect(await resposta.json()).toEqual({ ok: true, abordagem: { mensagem: "Olá", pontos: [] } });
  });

  it("analisar-mapa: ação vazia é 502; ação longa é cortada em 180", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(JSON.stringify({ acao: "" })));
    expect((await ia(requisicao({ tipo: "analisar-mapa", filtros: {} }))).status).toBe(502);

    mocks.create.mockResolvedValueOnce(conclusao(JSON.stringify({ acao: `  ${"a".repeat(300)}  ` })));
    const resposta = await ia(requisicao({ tipo: "analisar-mapa", filtros: {} }));
    expect(await resposta.json()).toEqual({ ok: true, leitura: { acao: "a".repeat(180) } });
  });

  it("texto livre: resposta vazia é 502; texto é devolvido aparado", async () => {
    mocks.create.mockResolvedValueOnce(conclusao("   "));
    expect((await ia(requisicao({ tipo: "resumo-dia" }))).status).toBe(502);

    mocks.create.mockResolvedValueOnce(conclusao("  Seu dia está limpo.  "));
    const resposta = await ia(requisicao({ tipo: "resumo-dia" }));
    expect(await resposta.json()).toEqual({ ok: true, texto: "Seu dia está limpo." });
  });
});

/* ================================================================
   F1: classificação da resposta do proprietário
   ================================================================ */

const HOJE = "2026-07-09";
const ANTERIORES = [
  { autor: "corretor" as const, texto: "Olá! Seu imóvel ainda está disponível para locação?" },
  { autor: "proprietario" as const, texto: "Boa tarde" },
];
const TEXTO = "Pode me mandar mais detalhes depois";

function saidaF1(campos: Record<string, unknown>): string {
  return JSON.stringify({ resultado: "respondeu", retomarEm: null, horaRetomar: null, resumo: "Respondeu.", motivoPerda: null, ...campos });
}

describe("contrato da requisição: classificação da resposta (F1)", () => {
  it("usa a rota classificacao, 1200 tokens, schema estrito e o tipo classificar-resposta", async () => {
    const resultado = await classificarResposta(TEXTO, HOJE, USUARIO, ANTERIORES);
    expect(resultado).toEqual({ resultado: "respondeu", retomarEm: null, horaRetomar: null, resumo: "Respondeu.", motivoPerda: null });

    const { corpo, opcoes } = unicaChamada();
    expect(Object.keys(corpo)).toEqual(CHAVES_COM_FORMATO);
    expect(corpo.model).toBe(CONFIGURACAO.classificacao.modelo);
    expect(corpo.reasoning_effort).toBe(CONFIGURACAO.classificacao.esforco);
    expect(corpo.max_completion_tokens).toBe(1200);
    expect(corpo.response_format).toEqual(formato("classificacao", ESQUEMA_CLASSIFICACAO));
    expect((corpo.response_format as { json_schema: { schema: unknown } }).json_schema.schema).toBe(ESQUEMA_CLASSIFICACAO);
    expect(corpo.messages).toEqual(mensagensEsperadas(promptClassificarResposta(TEXTO, HOJE, ANTERIORES)));
    expect(opcoes ?? {}).toEqual({});

    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, "classificar-resposta", CONFIGURACAO.classificacao.modelo, USO);
    expect(mocks.criarClienteOpenAIReal).toHaveBeenCalledWith({ apiKey: "chave-ficticia" });
  });

  it("sem dono conhecido, o uso é registrado com userId nulo", async () => {
    await classificarResposta(TEXTO, HOJE);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(null, "classificar-resposta", CONFIGURACAO.classificacao.modelo, USO);
  });
});

describe("comportamento: classificação da resposta (F1)", () => {
  it("sem chave, sem autorização ou sem texto não chama o modelo e devolve null", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
    mocks.autorizado = false;
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    mocks.autorizado = true;
    expect(await classificarResposta("   ", HOJE, USUARIO)).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.carregarConfiguracaoIa).not.toHaveBeenCalled();
  });

  it("erro do provedor devolve null sem registrar uso", async () => {
    mocks.create.mockRejectedValue(new OpenAI.RateLimitError(429, { message: "rate" }, "rate", new Headers()));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    expect(mocks.registrarUsoDaResposta).not.toHaveBeenCalled();
  });

  it("JSON inválido devolve null com o uso já registrado", async () => {
    mocks.create.mockResolvedValue(conclusao("{quebrado"));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
  });

  it("recusa, truncamento e ausência de escolha devolvem null", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(null, "stop", "não posso"));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({}), "length"));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    mocks.create.mockResolvedValueOnce({ ...conclusao(saidaF1({})), choices: [] });
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(3);
  });

  it("conteúdo vazio e desfecho fora do vocabulário devolvem null", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(""));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "inventado" })));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
  });

  it("data futura válida vira retomada com hora; data passada e hora impossível são descartadas", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "vai-retornar", retomarEm: "2026-07-15", horaRetomar: "9:30" })));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toMatchObject({ retomarEm: "2026-07-15", horaRetomar: "09:30" });

    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "vai-retornar", retomarEm: "2026-07-01", horaRetomar: "10:00" })));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toMatchObject({ retomarEm: null, horaRetomar: null });

    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "vai-retornar", retomarEm: "2026-07-15", horaRetomar: "25:80" })));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toMatchObject({ retomarEm: "2026-07-15", horaRetomar: null });
  });

  it("motivo de perda: aceito só com recusa e com as guardas determinísticas", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "recusou", motivoPerda: "Imóvel já vendido" })));
    expect(await classificarResposta("Já vendi o imóvel", HOJE, USUARIO)).toMatchObject({ resultado: "recusou", motivoPerda: "Imóvel já vendido" });

    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "respondeu", motivoPerda: "Imóvel já vendido" })));
    expect(await classificarResposta("Já vendi o imóvel", HOJE, USUARIO)).toMatchObject({ motivoPerda: null });

    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resultado: "recusou", motivoPerda: "Optou por outra imobiliária" })));
    expect(await classificarResposta("Estou vendo com outra imobiliária", HOJE, USUARIO)).toMatchObject({ motivoPerda: null });
  });

  it("resumo é aparado e limitado a 300 caracteres", async () => {
    mocks.create.mockResolvedValueOnce(conclusao(saidaF1({ resumo: `  ${"r".repeat(400)}  ` })));
    const resultado = await classificarResposta(TEXTO, HOJE, USUARIO);
    expect(resultado?.resumo).toBe("r".repeat(300));
  });
});

/* ================================================================
   OBSERVABILIDADE E CASOS DE BORDA: o contrato legado, fixado na base
   b5299ea (antes da centralização) e preservado depois dela.

   "Sem `choices`" é uma resposta fora da tipagem do SDK: improvável, mas
   o caminho que ela percorre é exatamente o que a centralização poderia
   desviar. O contrato antigo continua valendo, inclusive onde é estranho
   (o texto livre deixa a exceção escapar da rota).
   ================================================================ */

const ERRO_SEM_CHOICES = new TypeError("sem choices");
const LOG_PARSE_ESTRUTURADO: Record<string, string> = {
  "sugerir-roteiros": "IA: resposta de roteiros não veio parseável:",
  "extrair-anuncio": "IA: resposta da extração não veio parseável:",
  "gerar-anuncio": "IA: anúncio gerado não veio parseável:",
  "abordagem-anuncio": "IA: abordagem do anúncio não veio parseável:",
  "analisar-mapa": "IA: leitura territorial não veio parseável:",
};

function semChoices(): OpenAI.Chat.ChatCompletion {
  const { choices: _choices, ...resto } = conclusao(SAIDA_VALIDA.classificacao);
  return resto as unknown as OpenAI.Chat.ChatCompletion;
}

describe("observabilidade legada: F1", () => {
  let erros: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { erros = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => erros.mockRestore());

  it("recusa: só a linha antiga do F1, nenhuma outra", async () => {
    mocks.create.mockResolvedValue(conclusao(null, "stop", "não posso"));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    expect(erros.mock.calls).toEqual([["IA: não classificou a resposta (recusa ou resposta truncada)."]]);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("truncamento: só a linha antiga do F1, nenhuma outra", async () => {
    mocks.create.mockResolvedValue(conclusao(saidaF1({}), "length"));
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    expect(erros.mock.calls).toEqual([["IA: não classificou a resposta (recusa ou resposta truncada)."]]);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledTimes(1);
  });

  it("sem choices: null, uso registrado e a linha de falha do F1", async () => {
    mocks.create.mockResolvedValue(semChoices());
    expect(await classificarResposta(TEXTO, HOJE, USUARIO)).toBeNull();
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, "classificar-resposta", CONFIGURACAO.classificacao.modelo, USO);
    expect(erros.mock.calls).toEqual([["IA: falha ao classificar a resposta:", sanitizarErroExterno(ERRO_SEM_CHOICES, "iaTexto")]]);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });
});

describe("observabilidade legada: /api/ia", () => {
  let erros: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { erros = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => erros.mockRestore());

  const estruturados = CASOS_OPERACOES.filter((c) => c.formato);
  const textoLivre = CASOS_OPERACOES.filter((c) => !c.formato);

  it.each(estruturados)("$tipo sem choices: 502 falha-ia pelo parse, uso registrado, sem ia-falhou", async (caso) => {
    mocks.create.mockResolvedValue(semChoices());
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "falha-ia" });
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, caso.tipo, CONFIGURACAO.operacoes.modelo, USO);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
    expect(erros.mock.calls).toEqual([[LOG_PARSE_ESTRUTURADO[caso.tipo], sanitizarErroExterno(ERRO_SEM_CHOICES, "processarRespostaIa")]]);
  });

  it.each(textoLivre)("$tipo sem choices: a exceção escapa da rota, com uso registrado e sem ia-falhou", async (caso) => {
    mocks.create.mockResolvedValue(semChoices());
    await expect(ia(requisicao({ tipo: caso.tipo, ...caso.corpo }))).rejects.toThrow(TypeError);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, caso.tipo, CONFIGURACAO.operacoes.modelo, USO);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
    expect(erros.mock.calls).toEqual([]);
  });

  it.each(CASOS_OPERACOES)("$tipo recusado: só a linha de recusa de sempre", async (caso) => {
    mocks.create.mockResolvedValue(conclusao(null, "stop", "não posso"));
    const resposta = await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    expect(resposta.status).toBe(502);
    const esperado: unknown[][] = [["IA: o modelo recusou responder."]];
    if (caso.formato) esperado.push([LOG_PARSE_ESTRUTURADO[caso.tipo], sanitizarErroExterno(new SyntaxError(), "processarRespostaIa")]);
    expect(erros.mock.calls).toEqual(esperado);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it.each(CASOS_OPERACOES)("$tipo truncado: só a linha de truncamento de sempre", async (caso) => {
    mocks.create.mockResolvedValue(conclusao(SAIDA_VALIDA[caso.formato?.nome || ""] || "texto", "length"));
    await ia(requisicao({ tipo: caso.tipo, ...caso.corpo }));
    const esperado: unknown[][] = [["IA: resposta truncada em MAX_TOKENS."]];
    if (caso.formato) esperado.push([LOG_PARSE_ESTRUTURADO[caso.tipo], sanitizarErroExterno(new SyntaxError(), "processarRespostaIa")]);
    expect(erros.mock.calls).toEqual(esperado);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });
});

describe("executor: interpretação do texto", () => {
  let erros: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { erros = vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => erros.mockRestore());

  const executor = () => criarExecutorOpenAI(
    { chat: { completions: { create: mocks.create } } } as unknown as OpenAI,
    USUARIO,
    CONFIGURACAO.atendimento,
  );
  const pedido = { tipo: "rascunhar-resposta-decisao", reasoningEffort: "low" as const, mensagens: [{ role: "user" as const, content: "x" }] };

  it("padrão (F3/F11/F12): interpreta o texto e mantém o log de recusa do executor", async () => {
    mocks.create.mockResolvedValueOnce(conclusao("  {\"ok\":true}  "));
    expect((await executor().executar(pedido)).texto).toBe('{"ok":true}');
    mocks.create.mockResolvedValueOnce(conclusao(null, "stop", "não posso"));
    expect((await executor().executar(pedido)).texto).toBe("");
    expect(erros.mock.calls).toEqual([["IA: o modelo recusou responder."]]);
  });

  it("interpretarTexto: false devolve a conclusão intacta, sem log e com o mesmo registro de uso", async () => {
    const bruta = conclusao(null, "stop", "não posso");
    mocks.create.mockResolvedValueOnce(bruta);
    const { conclusao: recebida } = await executor().executar({ ...pedido, interpretarTexto: false });
    expect(recebida).toBe(bruta);
    expect(erros.mock.calls).toEqual([]);
    expect(mocks.registrarUsoDaResposta).toHaveBeenCalledWith(USUARIO, "rascunhar-resposta-decisao", CONFIGURACAO.atendimento.modelo, USO);
    // A opção não entra no corpo enviado ao provedor.
    expect(Object.keys(mocks.create.mock.calls[0][0] as object)).toEqual(CHAVES_SEM_FORMATO);
  });

  it("sem choices: o padrão lança dentro do executor; o opt-out devolve a conclusão", async () => {
    mocks.create.mockResolvedValueOnce(semChoices());
    await expect(executor().executar(pedido)).rejects.toThrow(TypeError);
    mocks.create.mockResolvedValueOnce(semChoices());
    await expect(executor().executar({ ...pedido, interpretarTexto: false })).resolves.toHaveProperty("conclusao");
  });
});
