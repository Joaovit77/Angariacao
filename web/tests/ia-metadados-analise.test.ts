/* ================================================================
   IA-M1c-A: METADADOS DA ANÁLISE APROFUNDADA (F11), DE PONTA A PONTA

   Caminho real: executarAnaliseAprofundada (a entrada pública, com as
   dependências de produção) → carregarDadosReais lê o banco → criarExecutorReal
   carrega a configuração e monta o executor com a rota `assistente` → as
   duas chamadas (a normal e a nova tentativa após saída inválida) registram
   o uso. Só o SDK, o Supabase e a configuração são falsos.
   ================================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  carregarConfiguracaoIa: vi.fn(),
  create: vi.fn(),
  registrarUsoDaResposta: vi.fn(),
  registrarEvento: vi.fn(),
}));

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
import type { SupabaseClient } from "@supabase/supabase-js";
import fixtures from "./fixtures-baseline.json";
import { executarAnaliseAprofundada } from "@/lib/servidor/assistente/analiseAprofundada";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import { SECOES_ANALISE_APROFUNDADA } from "@/lib/assistente/analiseAprofundada";
import { CODIGOS_VALIDACAO_ANALISE } from "@/lib/servidor/ia/rejeicao";
import type { MetadadosUsoIa } from "@/lib/servidor/registro";

const IMOVEL_ID = "11111111-1111-4111-8111-111111111111";
const USUARIO_ID = "22222222-2222-4222-8222-222222222222";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const DO_BANCO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  assistente: { modelo: "gpt-5.6-sol", esforco: "medium" },
  classificacao: { modelo: "gpt-5.6-luna", esforco: "low" },
  versao: 9,
  criadoEm: "2026-09-01T00:00:00.000Z",
  alteradoPor: null,
  origem: "banco",
};
const PADRAO: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  assistente: { modelo: "gpt-5.4-mini", esforco: "high" },
  versao: null,
  criadoEm: null,
  alteradoPor: null,
  origem: "padrao",
};

const LINHA_IMOVEL = {
  ...(fixtures.imoveis[0] as Record<string, unknown>),
  id: IMOVEL_ID,
  user_id: USUARIO_ID,
  notas: [],
  tentativas: [],
  retirado: false,
  texto_anuncio: null,
};

/** Supabase falso para as consultas de carregarDadosReais. */
function supabaseFalso(): SupabaseClient {
  return {
    from: (tabela: string) => {
      let unica = false;
      const resolver = () => {
        if (tabela === "imoveis") return { data: unica ? LINHA_IMOVEL : [LINHA_IMOVEL], error: null };
        if (tabela === "avaliacoes_imoveis") return { data: null, error: null };
        if (tabela === "agenda") return { data: [], error: null };
        if (tabela === "protocolos") return { data: [], error: null };
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
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
  // Saída estruturalmente inválida nas duas: força a nova tentativa, que é
  // exatamente o cenário de duas chamadas numa mesma execução.
  mocks.create.mockReset();
  mocks.create.mockImplementation(async () => ({
    id: "chatcmpl-analise",
    object: "chat.completion",
    created: 1,
    model: "modelo-servido",
    choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: "{quebrado", refusal: null } }],
    usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
  }));
  mocks.registrarUsoDaResposta.mockReset();
  mocks.registrarEvento.mockReset();
  mocks.carregarConfiguracaoIa.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function analiseCom(configuracao: VersaoConfiguracaoIa) {
  mocks.carregarConfiguracaoIa.mockResolvedValue(configuracao);
  const erro = vi.spyOn(console, "error").mockImplementation(() => {});
  const inicioUso = mocks.registrarUsoDaResposta.mock.calls.length;
  const inicioCreate = mocks.create.mock.calls.length;
  await expect(executarAnaliseAprofundada(
    { tipo: "analise_aprofundada", imovelId: IMOVEL_ID, incluirAtendimento: false, sessaoId: "sessao-teste-1" },
    supabaseFalso(),
    USUARIO_ID,
    new AbortController().signal,
  )).rejects.toThrow("Resposta estruturalmente inválida");
  erro.mockRestore();
  const usos = mocks.registrarUsoDaResposta.mock.calls.slice(inicioUso);
  const corpos = mocks.create.mock.calls.slice(inicioCreate).map(([corpo]) => corpo as { reasoning_effort: string });
  expect(usos).toHaveLength(2);
  expect(corpos).toHaveLength(2);
  return usos.map((chamada, i) => ({
    usuario: chamada[0] as string,
    tipo: chamada[1] as string,
    modelo: chamada[2] as string,
    esforcoEnviado: corpos[i].reasoning_effort,
    metadados: chamada[4] as MetadadosUsoIa,
  }));
}

describe("F11: metadados de configuração e correlação, comportamentais", () => {
  it("as duas chamadas carregam rota assistente, a versão/origem carregadas, o esforço usado e um só execucaoId", async () => {
    const chamadas = await analiseCom(DO_BANCO);
    for (const chamada of chamadas) {
      expect(chamada.usuario).toBe(USUARIO_ID);
      expect(chamada.tipo).toBe("analise-aprofundada-imovel");
      expect(chamada.modelo).toBe("gpt-5.6-sol");
      expect(chamada.esforcoEnviado).toBe("medium");
      expect(chamada.metadados).toMatchObject({
        rota: "assistente",
        configOrigem: "banco",
        configVersao: 9,
        esforco: "medium",
        modeloServido: "modelo-servido",
      });
    }
    const ids = chamadas.map((c) => c.metadados.execucaoId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(UUID);
  });

  it("uma segunda análise, com outra configuração, tem um novo execucaoId e segue a configuração carregada", async () => {
    const primeira = await analiseCom(DO_BANCO);
    const segunda = await analiseCom(PADRAO);
    for (const chamada of segunda) {
      expect(chamada.modelo).toBe("gpt-5.4-mini");
      expect(chamada.esforcoEnviado).toBe("high");
      expect(chamada.metadados).toMatchObject({ rota: "assistente", configOrigem: "padrao", configVersao: null, esforco: "high" });
    }
    const idsPrimeira = new Set(primeira.map((c) => c.metadados.execucaoId));
    const idsSegunda = new Set(segunda.map((c) => c.metadados.execucaoId));
    expect(idsPrimeira.size).toBe(1);
    expect(idsSegunda.size).toBe(1);
    expect([...idsSegunda][0]).toMatch(UUID);
    expect([...idsSegunda][0]).not.toBe([...idsPrimeira][0]);
  });
});

describe("F11: falha do provedor na segunda tentativa (IA-M1c-B)", () => {
  it("a primeira chamada grava uso, a segunda falha: mesmo execucaoId, mesma exceção e o evento legado de sempre", async () => {
    mocks.carregarConfiguracaoIa.mockResolvedValue(DO_BANCO);
    const timeout = new OpenAI.APIConnectionTimeoutError();
    const invalida = mocks.create.getMockImplementation()!;
    mocks.create.mockReset();
    mocks.create.mockImplementationOnce(invalida).mockImplementationOnce(async () => {
      throw timeout;
    });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(executarAnaliseAprofundada(
      { tipo: "analise_aprofundada", imovelId: IMOVEL_ID, incluirAtendimento: false, sessaoId: "sessao-teste-2" },
      supabaseFalso(),
      USUARIO_ID,
      new AbortController().signal,
    )).rejects.toBe(timeout);
    erro.mockRestore();

    expect(mocks.create).toHaveBeenCalledTimes(2);
    const usos = mocks.registrarUsoDaResposta.mock.calls;
    expect(usos).toHaveLength(1);
    const execucaoDoSucesso = (usos[0][4] as MetadadosUsoIa).execucaoId;
    expect(execucaoDoSucesso).toMatch(UUID);

    const eventos = mocks.registrarEvento.mock.calls.map(([e]) => e as { evento: string; nivel: string; detalhe: string });
    const falhas = eventos.filter((e) => e.evento === "ia-chamada-falhou");
    expect(falhas).toHaveLength(1);
    expect(falhas[0].nivel).toBe("aviso");
    expect(JSON.parse(falhas[0].detalhe)).toMatchObject({
      tipo: "analise-aprofundada-imovel",
      execucao_id: execucaoDoSucesso,
      rota: "assistente",
      esforco: "medium",
      config_origem: "banco",
      config_versao: 9,
      modelo: "gpt-5.6-sol",
      categoria: "timeout",
      status_http: null,
      requisicao_provedor_id: null,
    });
    const legados = eventos.filter((e) => e.evento === "ia-assistente-respondido");
    expect(legados).toHaveLength(1);
    expect(legados[0].nivel).toBe("erro");
    expect(JSON.parse(legados[0].detalhe)).toMatchObject({ resultado: "erro", motivo: "falha-controlada", chamadasModelo: 2 });
  });
});

/* ================================================================
   IA-M1c-C: REJEIÇÃO POR TENTATIVA NO F11
   ================================================================ */

/** Uma saída que a validação aceita: lacunas sem fonte em todas as seções. */
const SAIDA_ACEITA = JSON.stringify({
  secoes: SECOES_ANALISE_APROFUNDADA.map((id) => ({
    id,
    afirmacoes: [{
      natureza: "lacuna",
      texto: "Não há evidência suficiente para uma conclusão forte.",
      fontes: [],
      confianca: "baixa",
      temporalidade: "desconhecida",
    }],
  })),
  protocolosAplicados: [],
});
/** JSON válido que a validação reprova: fato sem fonte. */
const SAIDA_REPROVADA = JSON.stringify({
  secoes: SECOES_ANALISE_APROFUNDADA.map((id) => ({
    id,
    afirmacoes: [{ natureza: "fato", texto: "O imóvel está cadastrado.", fontes: [], confianca: "alta", temporalidade: "atual" }],
  })),
  protocolosAplicados: [],
});

function respostaF11(
  conteudo: string | null,
  extra: { finish?: string; refusal?: string | null; requestId?: string } = {},
) {
  const c = {
    id: "chatcmpl-analise",
    object: "chat.completion",
    created: 1,
    model: "modelo-servido",
    choices: [{ index: 0, finish_reason: extra.finish ?? "stop", logprobs: null, message: { role: "assistant", content: conteudo, refusal: extra.refusal ?? null } }],
    usage: { prompt_tokens: 900, completion_tokens: 40, total_tokens: 940 },
  };
  Object.defineProperty(c, "_request_id", { value: extra.requestId ?? "req_f11", enumerable: false });
  return c;
}

async function analisar(...respostas: ReturnType<typeof respostaF11>[]) {
  mocks.carregarConfiguracaoIa.mockResolvedValue(DO_BANCO);
  mocks.create.mockReset();
  for (const r of respostas) mocks.create.mockImplementationOnce(async () => r);
  const erro = vi.spyOn(console, "error").mockImplementation(() => {});
  let resultado: unknown;
  let lancado: unknown = null;
  try {
    resultado = await executarAnaliseAprofundada(
      { tipo: "analise_aprofundada", imovelId: IMOVEL_ID, incluirAtendimento: false, sessaoId: "sessao-teste-3" },
      supabaseFalso(),
      USUARIO_ID,
      new AbortController().signal,
    );
  } catch (e) {
    lancado = e;
  }
  erro.mockRestore();
  const eventos = mocks.registrarEvento.mock.calls.map(([e]) => e as { evento: string; nivel: string; categoria: string; userId: string; detalhe: string });
  const rejeicoes = eventos.filter((e) => e.evento === "ia-resposta-rejeitada");
  const usos = mocks.registrarUsoDaResposta.mock.calls.map((c) => (c[4] as MetadadosUsoIa).execucaoId);
  return { resultado, lancado, eventos, rejeicoes, detalhes: rejeicoes.map((e) => JSON.parse(e.detalhe) as Record<string, unknown>), usos };
}

describe("F11: rejeição pela aplicação, por tentativa (IA-M1c-C)", () => {
  it("tentativa 1 rejeitada e tentativa 2 aceita: a execução é sucesso e há UM evento, da tentativa 1", async () => {
    const r = await analisar(respostaF11("{quebrado", { requestId: "req_t1" }), respostaF11(SAIDA_ACEITA, { requestId: "req_t2" }));
    expect(r.lancado).toBeNull();
    expect(r.resultado).toMatchObject({ mensagem: { blocos: [{ tipo: "analise_aprofundada" }] } });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(r.usos).toHaveLength(2);
    expect(new Set(r.usos).size).toBe(1);
    expect(r.rejeicoes).toHaveLength(1);
    expect(r.rejeicoes[0]).toMatchObject({ userId: USUARIO_ID, categoria: "ia", nivel: "aviso" });
    expect(Object.keys(r.detalhes[0])).toEqual(["tipo", "execucao_id", "requisicao_provedor_id", "tentativa", "categoria", "motivo", "codigos"]);
    expect(r.detalhes[0]).toEqual({
      tipo: "analise-aprofundada-imovel",
      execucao_id: r.usos[0],
      requisicao_provedor_id: "req_t1",
      tentativa: 1,
      categoria: "resposta-invalida",
      motivo: "json-invalido",
      codigos: ["estrutura-invalida"],
    });
    // O evento final de sempre continua um só, e de sucesso.
    const finais = r.eventos.filter((e) => e.evento === "ia-assistente-respondido");
    expect(finais).toHaveLength(1);
    expect(finais[0].nivel).toBe("info");
  });

  it("as duas tentativas reprovadas pela validação: dois eventos, tentativas 1 e 2, códigos fechados", async () => {
    const r = await analisar(respostaF11(SAIDA_REPROVADA), respostaF11(SAIDA_REPROVADA));
    expect(r.lancado).toBeInstanceOf(Error);
    expect(String((r.lancado as Error).message)).toContain("Resposta estruturalmente inválida");
    expect(r.detalhes.map((d) => d.tentativa)).toEqual([1, 2]);
    for (const d of r.detalhes) {
      expect(d).toMatchObject({ categoria: "reprovada-pela-validacao", motivo: "validacao-reprovada", execucao_id: r.usos[0] });
      expect(d.codigos).toContain("fato-sem-fonte");
      for (const codigo of d.codigos as string[]) expect(CODIGOS_VALIDACAO_ANALISE.has(codigo)).toBe(true);
    }
    const finais = r.eventos.filter((e) => e.evento === "ia-assistente-respondido");
    expect(finais).toHaveLength(1);
    expect(finais[0].nivel).toBe("erro");
  });

  it.each([
    { nome: "JSON válido fora do contrato", resposta: () => respostaF11(JSON.stringify({ outra: "coisa" })), categoria: "fora-do-contrato", motivo: "estrutura-invalida" },
    { nome: "recusa", resposta: () => respostaF11(null, { refusal: "não posso" }), categoria: "resposta-invalida", motivo: "recusa" },
    { nome: "truncada", resposta: () => respostaF11(SAIDA_ACEITA, { finish: "length" }), categoria: "resposta-invalida", motivo: "truncada" },
    { nome: "vazia", resposta: () => respostaF11("   "), categoria: "resposta-invalida", motivo: "vazia" },
  ])("$nome → $motivo", async ({ resposta, categoria, motivo }) => {
    const r = await analisar(resposta(), resposta());
    expect(r.lancado).toBeInstanceOf(Error);
    expect(r.detalhes).toHaveLength(2);
    for (const d of r.detalhes) expect(d).toMatchObject({ categoria, motivo, execucao_id: r.usos[0] });
  });

  it("sucesso na primeira tentativa: nenhum evento de rejeição", async () => {
    const r = await analisar(respostaF11(SAIDA_ACEITA));
    expect(r.lancado).toBeNull();
    expect(r.rejeicoes).toHaveLength(0);
  });

  it("nenhum conteúdo da resposta vai para o evento", async () => {
    const r = await analisar(respostaF11("{SEGREDO Maria (43) 99999-0000"), respostaF11(SAIDA_REPROVADA));
    const serializado = JSON.stringify(r.rejeicoes);
    for (const trecho of ["SEGREDO", "Maria", "99999", "cadastrado"]) expect(serializado).not.toContain(trecho);
  });
});
