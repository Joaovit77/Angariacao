import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";

vi.mock("@/lib/calculo/notas", () => ({
  corpoDaResposta: () => "Qual é a taxa?",
  ehSoMidia: () => false,
}));

vi.mock("@/lib/calculo/respostas", () => ({
  respostasDoImovel: () => [{ texto: "wa: Qual é a taxa?" }],
}));

vi.mock("@/lib/persistencia/mapeadores", () => ({
  fromDbImovel: () => ({
    id: "imovel-1",
    status: "Em negociação",
    proprietarioNome: "Marta",
    endereco: "Rua A, 10",
    tentativas: [],
  }),
  fromDbAbordagem: (valor: unknown) => valor,
  fromDbProtocolo: (valor: unknown) => valor,
}));

import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";

function supabaseFalso(): SupabaseClient {
  return {
    from: vi.fn((tabela: string) => {
      if (tabela === "imoveis") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "imovel-1" }, error: null }),
            }),
          }),
        };
      }
      if (tabela === "protocolos") {
        return {
          select: () => ({
            order: async () => ({
              data: [{ titulo: "Taxa", conteudo: "A taxa é de 10%.", arquivado: false }],
              error: null,
            }),
          }),
        };
      }
      throw new Error(`Tabela inesperada: ${tabela}`);
    }),
  } as unknown as SupabaseClient;
}

describe("handler especializado de atendimento", () => {
  it("preserva o contrato da UI e exatamente três chamadas no caminho feliz", async () => {
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({
          intencao: "taxa",
          contextoRelevante: "pergunta direta",
          protocolosAplicaveis: ["Taxa"],
          informacoesFaltantes: [],
          nivelConfianca: "alta",
          precisaIntervencaoHumana: false,
          podeResponderComSeguranca: true,
        }),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({
          mensagem: "A taxa é de 10%.",
          protocolosUsados: ["Taxa"],
        }),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({
          aprovada: true,
          respondeAMensagem: true,
          coerenteComHistorico: true,
          semProtocoloDesnecessario: true,
          somenteFatosComFonte: true,
          semDesvioDeAssunto: true,
          informacaoSuficienteParaEstaResposta: true,
          seguraParaSugerir: true,
        }),
      });

    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta",
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(),
      userId: "usuario-1",
      executor: { executar },
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      ok: true,
      rascunho: "A taxa é de 10%.",
      protocolosUsados: ["Taxa"],
    });
    expect(executar).toHaveBeenCalledTimes(3);
    expect(executar.mock.calls.map(([pedido]) => pedido.tipo)).toEqual([
      "rascunhar-resposta-decisao",
      "rascunhar-resposta-geracao",
      "rascunhar-resposta-validacao",
    ]);
  });
});
