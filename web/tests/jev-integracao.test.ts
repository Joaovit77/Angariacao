/* ================================================================
   INTEGRAÇÃO JEV (Typesafe AI) — suíte offline (zero rede real)

   Cobre:
   1. Trava de ambiente e fronteira de servidor (`lib/servidor/jev.ts`);
   2. Parser estrito allowlist e transporte fail-closed (`executarJev`);
   3. Garimpo em Campo com JEV + evidência literal + fallback OpenAI;
   4. Atendimento WhatsApp em modo shadow (fail-open, zero efeito na
      resposta entregue ao corretor, telemetria sem PII).
   ================================================================ */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registroMocks = vi.hoisted(() => ({
  registrarEvento: vi.fn(),
  registrarUsoIa: vi.fn(),
}));

vi.mock("@/lib/servidor/registro", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/registro")>();
  return {
    ...original,
    registrarEvento: registroMocks.registrarEvento,
    registrarUsoIa: registroMocks.registrarUsoIa,
  };
});

import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";

const CONFIG_IA_TESTE: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  versao: 1,
  criadoEm: null,
  alteradoPor: null,
  origem: "padrao",
};
import { classificarAvistamento, type DependenciasClassificacao } from "@/lib/servidor/classificacaoProspeccao";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";
import {
  chamadaJevRealAutorizada,
  chaveJevConfigurada,
  ENDPOINT_JEV,
  executarJev,
  jevDisponivel,
  MODELO_JEV_PADRAO,
  parsearRespostaJev,
  type PedidoJev,
} from "@/lib/servidor/jev";
import {
  classificarDivergenciaShadowJev,
  DIMENSOES_VALIDACAO_SHADOW_JEV,
  montarPedidoValidacaoShadowJev,
  shadowAtendimentoJevHabilitado,
} from "@/lib/servidor/jevAtendimentoShadow";
import {
  classificarObservacaoComJev,
  montarPedidoGarimpoJev,
} from "@/lib/servidor/jevGarimpo";

function respostaChoice(
  opcoes: Record<string, string | null>,
  escolhida: string,
  confianca = 0.92,
) {
  const chaves = Object.keys(opcoes);
  const resto = chaves.length > 1 ? (1 - confianca) / (chaves.length - 1) : 0;
  const probabilities: Record<string, number> = {};
  for (const chave of chaves) {
    probabilities[chave] = chave === escolhida ? confianca : resto;
  }
  return { type: "choice", choice: escolhida, confidence: confianca, probabilities };
}

function respostaJevParaPedido(
  pedido: PedidoJev,
  escolhas: Record<string, { choice: string; confidence?: number }> = {},
) {
  const answers: Record<string, ReturnType<typeof respostaChoice>> = {};
  for (const [id, pergunta] of Object.entries(pedido.questions)) {
    const primeiraOpcao = Object.keys(pergunta.criteria)[0];
    const padrao = Object.hasOwn(pergunta.criteria, "NO")
      ? "NO"
      : Object.hasOwn(pergunta.criteria, "NENHUM")
        ? "NENHUM"
        : Object.hasOwn(pergunta.criteria, "PASS")
          ? "PASS"
          : primeiraOpcao;
    const desejada = escolhas[id];
    answers[id] = respostaChoice(
      pergunta.criteria,
      desejada?.choice ?? padrao,
      desejada?.confidence ?? 0.9,
    );
  }
  return {
    model: pedido.model,
    usage: { input_tokens: 180, output_tokens: 42 },
    answers,
  };
}

function listarArquivosTs(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    const st = statSync(caminho);
    if (st.isDirectory()) saida.push(...listarArquivosTs(caminho));
    else if (/\.(ts|tsx)$/.test(entrada)) saida.push(caminho);
  }
  return saida;
}

describe("JEV — trava de ambiente, chave e fronteira de servidor", () => {
  it("aceita JEV_API_KEY e alias local API_JEV, rejeitando espaços/vazios", () => {
    expect(chaveJevConfigurada({ JEV_API_KEY: "jev_prod_123" })).toBe("jev_prod_123");
    expect(chaveJevConfigurada({ API_JEV: "jev_local_456" })).toBe("jev_local_456");
    expect(chaveJevConfigurada({ JEV_API_KEY: "jev_prod", API_JEV: "jev_alias" })).toBe("jev_prod");
    expect(chaveJevConfigurada({ JEV_API_KEY: "   " })).toBeNull();
    expect(chaveJevConfigurada({ JEV_API_KEY: "chave com espaco" })).toBeNull();
    expect(chaveJevConfigurada({})).toBeNull();
  });

  it("espelha docs/IA-AMBIENTES.md: libera Production na Vercel, bloqueia Preview/CI/Codex e exige ALLOW_REAL_JEV=1 localmente", () => {
    expect(chamadaJevRealAutorizada({ VERCEL: "1", VERCEL_ENV: "production" })).toBe(true);
    expect(jevDisponivel({ VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "k" })).toBe(true);

    // Preview permanece bloqueado mesmo com chave e ALLOW_REAL_JEV=1.
    expect(chamadaJevRealAutorizada({ VERCEL: "1", VERCEL_ENV: "preview", ALLOW_REAL_JEV: "1" })).toBe(false);
    expect(jevDisponivel({ VERCEL: "1", VERCEL_ENV: "preview", JEV_API_KEY: "k", ALLOW_REAL_JEV: "1" })).toBe(false);

    // CI e Codex permanecem bloqueados mesmo com opt-in.
    expect(chamadaJevRealAutorizada({ CI: "true", ALLOW_REAL_JEV: "1" })).toBe(false);
    expect(chamadaJevRealAutorizada({ CODEX_THREAD_ID: "abc", ALLOW_REAL_JEV: "1" })).toBe(false);

    // Local exige opt-in literal ALLOW_REAL_JEV=1.
    expect(jevDisponivel({ API_JEV: "k" })).toBe(false);
    expect(jevDisponivel({ API_JEV: "k", ALLOW_REAL_JEV: "true" })).toBe(false);
    expect(jevDisponivel({ API_JEV: "k", ALLOW_REAL_JEV: "1" })).toBe(true);
  });

  it("nenhum componente de cliente expõe chave, flag ou endpoint do JEV", () => {
    const pastas = [resolve("components"), resolve("app/(painel)")];
    for (const pasta of pastas) {
      for (const arquivo of listarArquivosTs(pasta)) {
        const conteudo = readFileSync(arquivo, "utf8");
        expect(conteudo, arquivo).not.toMatch(/JEV_API_KEY|API_JEV|NEXT_PUBLIC_JEV|ALLOW_REAL_JEV|api\.typesafe\.ai/);
      }
    }
  });
});

describe("JEV — parser estrito e transporte HTTP", () => {
  const pedidoSimples: PedidoJev = {
    model: MODELO_JEV_PADRAO,
    state: { texto: "ok" },
    questions: {
      q1: { type: "choice", instructions: "teste", criteria: { YES: "sim", NO: "nao" } },
    },
  };

  it("valida resposta Choice coerente e extrai uso", () => {
    const corpo = respostaJevParaPedido(pedidoSimples, { q1: { choice: "YES", confidence: 0.88 } });
    const res = parsearRespostaJev(corpo, pedidoSimples, 120);
    expect(res.status).toBe("COMPLETED");
    expect(res.answers?.q1.choice).toBe("YES");
    expect(res.answers?.q1.confidence).toBe(0.88);
    expect(res.usage).toEqual({ inputTokens: 180, outputTokens: 42, totalTokens: 222 });
  });

  it("rejeita pergunta faltando, enum inválido, soma != 1 e escolha incoerente com probabilidades", () => {
    expect(parsearRespostaJev({ model: MODELO_JEV_PADRAO, answers: {} }, pedidoSimples).codigoErro).toBe("INVALID_QUESTIONS");

    expect(parsearRespostaJev({
      model: MODELO_JEV_PADRAO,
      answers: { q1: { type: "choice", choice: "TALVEZ", confidence: 0.9, probabilities: { YES: 0.9, NO: 0.1 } } },
    }, pedidoSimples).codigoErro).toBe("INVALID_ENUM");

    expect(parsearRespostaJev({
      model: MODELO_JEV_PADRAO,
      answers: { q1: { type: "choice", choice: "YES", confidence: 0.9, probabilities: { YES: 0.7, NO: 0.7 } } },
    }, pedidoSimples).codigoErro).toBe("INVALID_PROBABILITIES");

    expect(parsearRespostaJev({
      model: MODELO_JEV_PADRAO,
      answers: { q1: { type: "choice", choice: "YES", confidence: 0.9, probabilities: { YES: 0.2, NO: 0.8 } } },
    }, pedidoSimples).codigoErro).toBe("INVALID_PROBABILITIES");
  });

  it("executarJev usa host fixo, redirect:error e nunca lança ou vaza segredo em erro HTTP/timeout", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(respostaJevParaPedido(pedidoSimples, { q1: { choice: "YES", confidence: 0.91 } })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const ok = await executarJev(pedidoSimples, {
      fetcher,
      ambiente: { VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "segredo-super-privado" },
    });
    expect(ok.status).toBe("COMPLETED");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(ENDPOINT_JEV);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");

    const erroHttp = await executarJev(pedidoSimples, {
      fetcher: vi.fn<typeof fetch>(async () => new Response("corpo secreto segredo-super-privado", { status: 503 })),
      ambiente: { VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "segredo-super-privado" },
    });
    expect(erroHttp.status).toBe("HTTP_ERROR");
    expect(erroHttp.statusHttp).toBe(503);
    expect(JSON.stringify(erroHttp)).not.toContain("segredo-super-privado");

    const timeout = await executarJev(pedidoSimples, {
      fetcher: vi.fn<typeof fetch>(async () => {
        const erro = new Error("abortado");
        erro.name = "TimeoutError";
        throw erro;
      }),
      ambiente: { VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "k" },
    });
    expect(timeout.status).toBe("TIMEOUT");
    expect(timeout.codigoErro).toBe("TIMEOUT");
  });
});

describe("Integração #1 — Garimpo em Campo com JEV + evidência literal + fallback OpenAI", () => {
  beforeEach(() => {
    registroMocks.registrarEvento.mockClear();
    registroMocks.registrarUsoIa.mockClear();
  });

  function criarDeps(sobrescritas: Partial<DependenciasClassificacao> & {
    observacao?: string;
    rpcSpy?: ReturnType<typeof vi.fn>;
  } = {}) {
    const observacao = sobrescritas.observacao ?? "Casa fechada com mato alto, sem placa visível na frente.";
    const rpcSpy = sobrescritas.rpcSpy ?? vi.fn(async (nome: string) => {
      if (nome === "iniciar_classificacao") {
        return { data: { ok: true, repetida: false, ocupado: false, run_id: "run-1", lease_token: "lease-1", modo: "modelo" }, error: null };
      }
      if (nome === "concluir_classificacao") {
        return { data: { ok: true, repetida: false, aplicadas: 2, snapshot_aplicado: true }, error: null };
      }
      if (nome === "falhar_classificacao") {
        return { data: { ok: true }, error: null };
      }
      throw new Error(`RPC inesperada: ${nome}`);
    });

    const construtor = (resultado: { data: unknown; error: null; count?: number }) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "gte", "order", "update", "limit"]) c[m] = vi.fn(() => c);
      c.maybeSingle = async () => resultado;
      c.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado).then(ok);
      return c;
    };

    const chamador = {
      from: vi.fn((tabela: string) => {
        if (tabela === "imoveis_identificados_avistamentos") {
          return construtor({
            data: { id: "av-1", imovel_identificado_id: "id-1", observacao, observacao_revisao: 1, classificacao_estado: "pendente" },
            error: null,
          });
        }
        if (tabela === "imoveis_identificados") {
          return construtor({ data: { id: "id-1", exclusao_solicitada_em: null, tipo: null, tipo_origem: null }, error: null });
        }
        if (tabela === "ia_permissoes") {
          return construtor({ data: { liberado: true }, error: null });
        }
        if (tabela === "imoveis_identificados_etiquetas") {
          return construtor({ data: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 92 }], error: null });
        }
        if (tabela === "imoveis_identificados_classificacoes") {
          return construtor({ data: { tipo_sugerido: "Casa", tipo_confianca: 90 }, error: null });
        }
        throw new Error(`Tabela inesperada: ${tabela}`);
      }),
    } as unknown as SupabaseClient;

    const servico = {
      rpc: rpcSpy,
      from: vi.fn(() => construtor({ data: null, error: null, count: 0 })),
    } as unknown as SupabaseClient;

    const deps: DependenciasClassificacao = {
      chamador,
      servico,
      userId: "user-1",
      executor: null,
      configuracao: CONFIG_IA_TESTE,
      tetoDiario: null,
      ...sobrescritas,
    };
    return { deps, rpcSpy };
  }

  it("monta catálogo fechado completo (13 etiquetas + tipo_imovel) e aplica evidência literal obrigatória em sem-placa-visivel", async () => {
    const observacaoSemEvidencia = "Casa antiga com mato alto e muro descascando.";
    const pedido = montarPedidoGarimpoJev(observacaoSemEvidencia);
    expect(Object.keys(pedido.questions)).toHaveLength(14);
    expect(pedido.questions.etq_sem_placa_visivel).toBeTruthy();
    expect(pedido.questions.tipo_imovel.criteria.NENHUM).toBeTruthy();

    // Mesmo que o JEV marque sem-placa-visivel=YES, sem frase literal na observação a
    // validação determinística descarta a etiqueta (não fabrica evidência).
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(respostaJevParaPedido(pedido, {
        etq_mato_alto: { choice: "YES", confidence: 0.93 },
        etq_sem_placa_visivel: { choice: "YES", confidence: 0.95 },
        tipo_imovel: { choice: "Casa", confidence: 0.91 },
      })), { status: 200 }),
    );

    const { deps, rpcSpy } = criarDeps({
      observacao: observacaoSemEvidencia,
      classificadorJev: (obs) => classificarObservacaoComJev(obs, {
        fetcher,
        ambiente: { VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "k" },
      }),
    });

    const res = await classificarAvistamento(deps, "av-1");
    expect(res.ok).toBe(true);
    const chamadaConcluir = rpcSpy.mock.calls.find(([nome]) => nome === "concluir_classificacao")?.[1] as {
      p_tipo_sugerido: string;
      p_etiquetas: { codigo: string }[];
      p_contadores: { sem_evidencia: number };
    };
    expect(chamadaConcluir.p_tipo_sugerido).toBe("Casa");
    expect(chamadaConcluir.p_etiquetas.map((e) => e.codigo)).toEqual(["mato-alto"]);
    expect(chamadaConcluir.p_contadores.sem_evidencia).toBe(1);
    expect(registroMocks.registrarUsoIa).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      modelo: MODELO_JEV_PADRAO,
      tokensEntrada: 180,
      tokensSaida: 42,
    }));
  });

  it("aceita sem-placa-visivel quando a observação contém evidência literal", async () => {
    const obsComEvidencia = "Sobrado fechado, sem placa visível na frente e com mato alto.";
    const pedido = montarPedidoGarimpoJev(obsComEvidencia);
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(respostaJevParaPedido(pedido, {
        etq_sem_placa_visivel: { choice: "YES", confidence: 0.94 },
        etq_imovel_fechado: { choice: "YES", confidence: 0.91 },
        tipo_imovel: { choice: "Sobrado", confidence: 0.89 },
      })), { status: 200 }),
    );
    const { deps, rpcSpy } = criarDeps({
      observacao: obsComEvidencia,
      classificadorJev: (obs) => classificarObservacaoComJev(obs, {
        fetcher,
        ambiente: { VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "k" },
      }),
    });

    const res = await classificarAvistamento(deps, "av-1");
    expect(res.ok).toBe(true);
    const chamadaConcluir = rpcSpy.mock.calls.find(([nome]) => nome === "concluir_classificacao")?.[1] as {
      p_etiquetas: { codigo: string }[];
    };
    expect(chamadaConcluir.p_etiquetas.map((e) => e.codigo).sort()).toEqual(["imovel-fechado", "sem-placa-visivel"]);
  });

  it("faz fallback limpo para OpenAI quando o JEV falha e registra ia-classificacao-jev-fallback", async () => {
    const executarOpenAI = vi.fn(async () => ({
      texto: JSON.stringify({
        tipo: "Casa",
        tipoConfianca: 84,
        etiquetas: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 88, evidencia: null }],
      }),
      conclusao: {} as never,
    }));
    const executorOpenAI: ExecutorOpenAI = { executar: executarOpenAI } as unknown as ExecutorOpenAI;

    const { deps } = criarDeps({
      executor: executorOpenAI,
      classificadorJev: async () => ({
        ok: false,
        status: "TIMEOUT",
        codigoErro: "TIMEOUT",
        statusHttp: null,
        duracaoMs: 15000,
      }),
    });

    const res = await classificarAvistamento(deps, "av-1");
    expect(res.ok).toBe(true);
    expect(executarOpenAI).toHaveBeenCalledTimes(1);
    expect(registroMocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      evento: "ia-classificacao-jev-fallback",
      nivel: "aviso",
    }));
  });
});

describe("Integração #2 — Atendimento WhatsApp em modo shadow (fail-open e sem PII)", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    registroMocks.registrarEvento.mockClear();
    registroMocks.registrarUsoIa.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("classifica todas as divergências GPT × JEV e respeita kill-switch JEV_ATENDIMENTO_SHADOW_ENABLED=0", () => {
    const base = {
      status: "COMPLETED" as const,
      modeloSolicitado: MODELO_JEV_PADRAO,
      modeloObservado: MODELO_JEV_PADRAO,
      confianca: 0.9,
      dimensoesReprovadas: [],
      dimensoesInconclusivas: [],
      codigoErro: null,
      statusHttp: 200,
      duracaoMs: 300,
      tokensEntrada: 100,
      tokensSaida: 20,
    };
    expect(classificarDivergenciaShadowJev("aprovada", { ...base, veredito: "APPROVE" })).toBe("concorda");
    expect(classificarDivergenciaShadowJev("rejeitada", { ...base, veredito: "REJECT" })).toBe("concorda");
    expect(classificarDivergenciaShadowJev("aprovada", { ...base, veredito: "REJECT" })).toBe("jev-mais-rigido");
    expect(classificarDivergenciaShadowJev("rejeitada", { ...base, veredito: "APPROVE" })).toBe("jev-mais-permissivo");
    expect(classificarDivergenciaShadowJev("aprovada", { ...base, veredito: "INCONCLUSIVE" })).toBe("jev-inconclusivo");
    expect(classificarDivergenciaShadowJev("aprovada", { ...base, status: "TIMEOUT", veredito: null })).toBe("erro");

    expect(shadowAtendimentoJevHabilitado({ VERCEL: "1", VERCEL_ENV: "production", JEV_API_KEY: "k" })).toBe(true);
    expect(shadowAtendimentoJevHabilitado({
      VERCEL: "1",
      VERCEL_ENV: "production",
      JEV_API_KEY: "k",
      JEV_ATENDIMENTO_SHADOW_ENABLED: "0",
    })).toBe(false);
  });

  function criarCenarioAtendimento() {
    const mensagemSecreta = "Qual é a taxa da imobiliária para o sobrado da Rua Secreta 999?";
    const rascunhoSeguro = "A taxa de administração é de 10%.";
    const supabase = {
      from: vi.fn((tabela: string) => {
        if (tabela === "imoveis") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "imovel-shadow-1",
                    status: "Em negociação",
                    proprietario_nome: "Proprietária Secreta",
                    endereco: "Rua Secreta, 999",
                    tentativas: [],
                    notas: [{ id: "wa:1", texto: `Resposta pelo WhatsApp: ${mensagemSecreta}`, data: "2026-11-26T10:00" }],
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (tabela === "protocolos") {
          return {
            select: () => ({
              order: async () => ({
                data: [{
                  id: "proto-1",
                  tipo: "informacao_comercial",
                  titulo: "Taxa",
                  conteudo: "A taxa de administração é de 10%.",
                  arquivado: false,
                }],
                error: null,
              }),
            }),
          };
        }
        if (tabela === "user_config") {
          return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
        }
        throw new Error(`Tabela inesperada: ${tabela}`);
      }),
    } as unknown as SupabaseClient;

    const executor: ExecutorOpenAI = {
      executar: vi.fn(async (pedido: { tipo: string; mensagens?: { content: string }[] }) => {
        if (pedido.tipo.endsWith("-decisao")) {
          const textoPrompt = pedido.mensagens?.map((m) => m.content).join("\n") ?? "";
          const matchFonte = textoPrompt.match(/"id"\s*:\s*"(fonte_\d+)"\s*,\s*"origem"\s*:\s*"protocolo"/);
          const fonteId = matchFonte?.[1] ?? "fonte_4";
          return {
            texto: JSON.stringify({
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
              evidencias: [{
                id: "evidencia_1",
                fonteId,
                fato: "a taxa de administração é de 10%",
                temporalidade: "atemporal",
                evento: "",
              }],
              obrigacoesResposta: [{
                id: "obrigacao_1",
                evidenciaId: "evidencia_1",
                necessidade: "obrigatoria",
              }],
              informacoesFaltantes: [],
              nivelConfianca: "alta",
              precisaIntervencaoHumana: false,
              podeResponderComSeguranca: true,
            }),
            conclusao: { usage: { prompt_tokens: 100, completion_tokens: 40 } },
          };
        }
        if (pedido.tipo.endsWith("-geracao")) {
          return {
            texto: JSON.stringify({
              mensagem: rascunhoSeguro,
              protocolosUsados: ["Taxa"],
              obrigacoesCobertas: ["obrigacao_1"],
              afirmacoes: [{
                descricao: "a taxa de administração é de 10%",
                tipo: "fato",
                evidencias: ["evidencia_1"],
                lacunas: [],
                temporalidade: "atual",
                evento: "",
              }],
            }),
            conclusao: { usage: { prompt_tokens: 120, completion_tokens: 30 } },
          };
        }
        return {
          texto: JSON.stringify({ problemas: [] }),
          conclusao: { usage: { prompt_tokens: 110, completion_tokens: 20 } },
        };
      }),
    } as unknown as ExecutorOpenAI;

    return { supabase, executor, mensagemSecreta, rascunhoSeguro };
  }

  it("roda em paralelo sem alterar resposta entregue ao corretor mesmo quando JEV diverge (REJECT) e não vaza PII no log", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("JEV_API_KEY", "jev-segredo-nao-pode-vazar");
    vi.stubEnv("CI", "");

    const pedidoExemplo = montarPedidoValidacaoShadowJev({
      mensagemAtual: "x",
      contextoImovel: "x",
      conversa: "x",
      protocolos: [],
      rascunhoCandidato: "x",
      protocolosUsados: [],
    });
    expect(Object.keys(pedidoExemplo.questions)).toHaveLength(1 + DIMENSOES_VALIDACAO_SHADOW_JEV.length);

    globalThis.fetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(respostaJevParaPedido(pedidoExemplo, {
        verdict: { choice: "REJECT", confidence: 0.87 },
        grounding: { choice: "FAIL", confidence: 0.84 },
      })), { status: 200 }),
    );

    const { supabase, executor, mensagemSecreta, rascunhoSeguro } = criarCenarioAtendimento();
    const resposta = await atenderProprietario({
      corpo: { imovelId: "imovel-shadow-1" },
      supabase,
      userId: "user-1",
      executor,
      tipo: "rascunhar-resposta",
      configuracao: CONFIG_IA_TESTE,
    });

    expect(resposta.status).toBe(200);
    const corpo = (await resposta.json()) as { ok: boolean; rascunho: string };
    expect(corpo.ok).toBe(true);
    expect(corpo.rascunho).toBe(rascunhoSeguro);

    const eventoShadow = registroMocks.registrarEvento.mock.calls
      .map(([e]) => e as { evento: string; detalhe: string })
      .find((e) => e.evento === "ia-atendimento-validacao-jev-shadow");
    expect(eventoShadow).toBeTruthy();

    const detalheBruto = eventoShadow!.detalhe;
    expect(detalheBruto).not.toContain(mensagemSecreta);
    expect(detalheBruto).not.toContain(rascunhoSeguro);
    expect(detalheBruto).not.toContain("Proprietária Secreta");
    expect(detalheBruto).not.toContain("Rua Secreta");
    expect(detalheBruto).not.toContain("jev-segredo-nao-pode-vazar");

    expect(JSON.parse(detalheBruto)).toMatchObject({
      modo: "shadow",
      provider: "jev",
      veredito_gpt: "aprovada",
      veredito_jev: "REJECT",
      dimensoes_reprovadas_jev: ["grounding"],
      divergencia: "jev-mais-rigido",
    });
  });

  it("é fail-open quando JEV dá erro de rede: entrega a resposta normalmente e registra divergencia=erro", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("JEV_API_KEY", "jev-segredo");
    vi.stubEnv("CI", "");

    globalThis.fetch = vi.fn<typeof fetch>(async () => {
      throw new Error("rede indisponivel");
    });

    const { supabase, executor, rascunhoSeguro } = criarCenarioAtendimento();
    const resposta = await atenderProprietario({
      corpo: { imovelId: "imovel-shadow-1" },
      supabase,
      userId: "user-1",
      executor,
      tipo: "rascunhar-resposta",
      configuracao: CONFIG_IA_TESTE,
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, rascunho: rascunhoSeguro });
    const eventoShadow = registroMocks.registrarEvento.mock.calls
      .map(([e]) => e as { evento: string; nivel: string; detalhe: string })
      .find((e) => e.evento === "ia-atendimento-validacao-jev-shadow");
    expect(eventoShadow?.nivel).toBe("aviso");
    expect(JSON.parse(eventoShadow!.detalhe)).toMatchObject({
      status_estrutural: "REDE",
      divergencia: "erro",
    });
  });
});
