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

import type { SupabaseClient } from "@supabase/supabase-js";
import fixtures from "./fixtures-baseline.json";
import { executarAnaliseAprofundada } from "@/lib/servidor/assistente/analiseAprofundada";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
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
