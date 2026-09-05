import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlocoAssistente, PedidoAssistente } from "@/lib/assistente/tipos";

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

function blocoPublicado(id: string, codigo: string): Extract<BlocoAssistente, { tipo: "imoveis" }> {
  return {
    tipo: "imoveis",
    titulo: "Publicacoes",
    itens: [{
      id,
      codigo,
      endereco: "Rua Tijuca, 112",
      bairro: "Centro",
      status: "Publicado",
      responsavel: "Marina",
      marco: "publicado",
      marcoEm: "2026-08-17",
    }],
  };
}

function pedidoAnterior(id = "id-211", codigo = "LD-211"): PedidoAssistente {
  return {
    mensagem: "E o último publicado?",
    contexto: { rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" },
    historico: [
      { papel: "usuario", texto: "Qual foi minha última angariação?" },
      {
        papel: "assistente",
        texto: `O último foi o ${codigo}.`,
        resultados: [{
          tipo: "imoveis",
          itens: [{
            id,
            codigo,
            bairro: "Centro",
            status: "Publicado",
            marco: "angariado",
            marcoEm: "2026-08-17",
          }],
        }],
      },
    ],
  };
}

function respostaComFerramenta() {
  return {
    output: [{
      type: "function_call",
      id: "fc-1",
      call_id: "call-1",
      name: "buscar_marcos_imoveis",
      arguments: JSON.stringify({
        marco: "publicado",
        data_inicio: null,
        data_fim: null,
        somente_contagem: false,
        limite: 1,
      }),
      status: "completed",
    }],
    output_text: "",
    usage: null,
  };
}

function respostaFinalGenerica() {
  return {
    output: [],
    output_text: "O último imóvel publicado foi consultado.",
    usage: null,
  };
}

describe("orquestrador com continuidade de entidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "teste";
    mocks.criarResposta
      .mockResolvedValueOnce(respostaComFerramenta())
      .mockResolvedValueOnce(respostaFinalGenerica());
  });

  it("reconsulta, reconhece a mesma entidade e mantém texto e card alinhados", async () => {
    const bloco = blocoPublicado("id-211", "LD-211");
    mocks.executarFerramenta.mockResolvedValue({
      dados: { marco: "publicado", itensRetornados: 1, itens: bloco.itens },
      bloco,
    });

    const resposta = await responderComAssistente(
      pedidoAnterior(),
      {} as SupabaseClient,
      "user-1",
    );

    expect(mocks.executarFerramenta).toHaveBeenCalledTimes(1);
    expect(mocks.executarFerramenta).toHaveBeenCalledWith(
      "buscar_marcos_imoveis",
      expect.objectContaining({ marco: "publicado", limite: 1 }),
      expect.anything(),
      "user-1",
      expect.anything(),
      "E o último publicado?",
      expect.anything(),
      expect.objectContaining({ acertos: 0 }),
    );
    expect(resposta.mensagem.texto).toBe(
      "Foi o mesmo imóvel que mencionei acima: o LD-211. Ele foi publicado em 17/08/2026.",
    );
    expect(resposta.mensagem.blocos).toEqual([bloco]);
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      evento: "ia-assistente-respondido",
      detalhe: expect.stringContaining('"ferramentasChamadas":["buscar_marcos_imoveis"]'),
    }));
    expect(mocks.registrarEvento.mock.calls.at(-1)?.[0].detalhe).toContain(
      '"entidadesUtilizadas":["id-211"]',
    );
    expect(mocks.registrarEvento.mock.calls.at(-1)?.[0].detalhe).not.toContain(
      "E o último publicado?",
    );
  });

  it("formula mudança de entidade a partir do novo retorno, não do texto anterior", async () => {
    const bloco = blocoPublicado("id-218", "LD-218");
    mocks.executarFerramenta.mockResolvedValue({
      dados: { marco: "publicado", itensRetornados: 1, itens: bloco.itens },
      bloco,
    });

    const resposta = await responderComAssistente(
      // O texto anterior cita de propósito o código errado: a estrutura é a fonte.
      {
        ...pedidoAnterior(),
        historico: [
          { papel: "usuario", texto: "Qual foi minha última angariação?" },
          {
            papel: "assistente",
            texto: "O último foi o LD-999.",
            resultados: pedidoAnterior().historico[1].resultados,
          },
        ],
      },
      {} as SupabaseClient,
      "user-1",
    );

    expect(resposta.mensagem.texto).toBe(
      "Já o último publicado foi outro imóvel: o LD-218. Ele foi publicado em 17/08/2026.",
    );
    expect(resposta.mensagem.texto).not.toContain("LD-999");
    expect(resposta.mensagem.blocos?.[0]).toEqual(bloco);
  });
});
