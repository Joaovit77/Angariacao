import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PedidoAssistente } from "@/lib/assistente/tipos";

const mocks = vi.hoisted(() => ({
  criarResposta: vi.fn(),
  executarFerramenta: vi.fn(),
  registrarUso: vi.fn(),
  registrarEvento: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIFalso {
    responses = { create: mocks.criarResposta };
  },
}));

vi.mock("@/lib/servidor/assistente/ferramentas", () => ({
  DEFINICOES_FERRAMENTAS: [],
  executarFerramenta: mocks.executarFerramenta,
}));

vi.mock("@/lib/servidor/registro", () => ({
  registrarUsoDaResponsesApi: mocks.registrarUso,
  registrarEvento: mocks.registrarEvento,
}));

import { responderComAssistente } from "@/lib/servidor/assistente/orquestrador";

function pedido(mensagem: string): PedidoAssistente {
  return {
    mensagem,
    contexto: {
      rota: "/pipeline",
      pagina: "Pipeline",
      superficie: "drawer",
      entidade: { tipo: "imovel", id: "imovel-privado" },
    },
    historico: [],
  };
}

describe("limite Mercado do Assistente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    "Como está o mercado para este imóvel?",
    "Tem muita oferta parecida nessa região?",
    "Como estão os preços dos concorrentes?",
  ])("não usa Pipeline ou ferramenta operacional para: %s", async (mensagem) => {
    const resposta = await responderComAssistente(
      pedido(mensagem),
      {} as SupabaseClient,
      "user-1",
    );

    expect(resposta.modelo).toBe("catalogo-capacidades");
    expect(resposta.mensagem.texto).toContain("não possui uma leitura integrada");
    expect(resposta.mensagem.texto).not.toContain("movimentação moderada");
    expect(resposta.mensagem.blocos).toBeUndefined();
    expect(mocks.criarResposta).not.toHaveBeenCalled();
    expect(mocks.executarFerramenta).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith("[assistente-contexto]", {
      operacao: "assistente_contexto",
      blocos: [],
      fontes: [],
      consultas: 0,
      consultas_reutilizadas: 0,
      duracao_ms: expect.any(Number),
      tamanho_aproximado: expect.any(Number),
      tokens_aproximados: expect.any(Number),
    });
    const detalhe = mocks.registrarEvento.mock.calls.at(-1)?.[0].detalhe as string;
    expect(detalhe).toContain('"motivo":"capacidade-indisponivel:consultar_mercado"');
    expect(detalhe).toContain('"consultasExecutadas":0');
    expect(detalhe).not.toContain(mensagem);
    expect(detalhe).not.toContain("imovel-privado");
  });
});
