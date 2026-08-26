import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";

vi.mock("@/lib/calculo/notas", () => ({
  corpoDaMensagemEnviada: () => "",
  corpoDaResposta: () => "Qual é a taxa?",
  ehNotaDeMensagemEnviada: () => false,
  ehNotaRecebidaNaConversa: () => true,
  ehNotaDeResposta: () => true,
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
    notas: [{ id: "wa:1", texto: "Resposta pelo WhatsApp: Qual é a taxa?", data: "2026-08-17T09:00" }],
  }),
  fromDbAbordagem: (valor: unknown) => valor,
  fromDbProtocolo: (valor: unknown) => valor,
}));

vi.mock("@/lib/servidor/registro", () => ({
  registrarEvento: vi.fn(),
}));

import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";
import { registrarEvento } from "@/lib/servidor/registro";

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
              data: [
                {
                  tipo: "informacao_comercial",
                  titulo: "Taxa",
                  conteudo: "A taxa é de 10%.",
                  arquivado: false,
                },
                {
                  tipo: "regra_conduta",
                  titulo: "Não repetir informações",
                  conteudo: "Analise o histórico e não repita informações já explicadas.",
                  arquivado: false,
                },
                {
                  tipo: "regra_conduta",
                  titulo: "Regra arquivada",
                  conteudo: "CONTEÚDO ARQUIVADO NÃO PODE SER USADO.",
                  arquivado: true,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (tabela === "user_config") {
        return {
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
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
    for (const [pedido] of executar.mock.calls) {
      expect(pedido.mensagens[0].content).toContain("REGRAS OBRIGATÓRIAS DE CONDUTA");
      expect(pedido.mensagens[0].content).toContain("não repita informações já explicadas");
      expect(pedido.mensagens[0].content).not.toContain("Não repetir informações");
      expect(pedido.mensagens[0].content).not.toContain("CONTEÚDO ARQUIVADO");
    }
    expect(executar.mock.calls[0][0].mensagens[1].content).toContain(
      "INFORMAÇÕES OFICIAIS DA IMOBILIÁRIA",
    );
    expect(executar.mock.calls[0][0].mensagens[1].content).toContain("A taxa é de 10%.");
    expect(executar.mock.calls[0][0].mensagens[1].content).not.toContain("não repita informações");
  });

  it("classifica a falha da geracao e repete o mesmo payload de decisao na nova tentativa", async () => {
    const decisao = {
      intencao: "taxa",
      contextoRelevante: "pergunta direta",
      protocolosAplicaveis: ["Taxa"],
      informacoesFaltantes: [],
      nivelConfianca: "alta",
      precisaIntervencaoHumana: false,
      podeResponderComSeguranca: true,
    };
    const validacao = {
      aprovada: true,
      respondeAMensagem: true,
      coerenteComHistorico: true,
      semProtocoloDesnecessario: true,
      somenteFatosComFonte: true,
      semDesvioDeAssunto: true,
      informacaoSuficienteParaEstaResposta: true,
      seguraParaSugerir: true,
    };
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      // Primeira tentativa: a geracao cita um protocolo que nao foi autorizado.
      .mockResolvedValueOnce({ conclusao: {} as never, texto: JSON.stringify(decisao) })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ mensagem: "A taxa é de 10%.", protocolosUsados: ["Inventado"] }),
      })
      // Segunda tentativa, com a mesma fonte: caminho feliz.
      .mockResolvedValueOnce({ conclusao: {} as never, texto: JSON.stringify(decisao) })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ mensagem: "A taxa é de 10%.", protocolosUsados: ["Taxa"] }),
      })
      .mockResolvedValueOnce({ conclusao: {} as never, texto: JSON.stringify(validacao) });
    const entrada = {
      tipo: "rascunhar-resposta" as const,
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(),
      userId: "usuario-1",
      executor: { executar },
    };

    const primeira = await atenderProprietario(entrada);
    const segunda = await atenderProprietario(entrada);

    expect(primeira.status).toBe(422);
    expect(await primeira.json()).toMatchObject({ ok: false, falha: "protocolo-inadequado" });
    expect(segunda.status).toBe(200);
    expect(executar.mock.calls[0][0]).toEqual(executar.mock.calls[2][0]);
    expect(registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "ia-atendimento-bloqueado",
        detalhe: expect.stringContaining('"etapaFinal":"geracao"'),
      }),
    );
    expect(registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "ia-atendimento-bloqueado",
        detalhe: expect.stringContaining('"motivo":"protocolo-inadequado"'),
      }),
    );
    expect(vi.mocked(registrarEvento).mock.calls.at(-1)?.[0].detalhe).toContain(
      '"contextoFingerprint":"',
    );
  });
});
