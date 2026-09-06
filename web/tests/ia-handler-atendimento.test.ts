import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { erroExternoSintetico } from "./fixtures/erroExterno";

const cenario = vi.hoisted(() => ({
  mensagemAtual: "Qual é a taxa?",
  perfilComunicacao: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/calculo/notas", () => ({
  corpoDaMensagemEnviada: () => "",
  corpoDaResposta: () => cenario.mensagemAtual,
  ehNotaDeMensagemEnviada: () => false,
  ehNotaRecebidaNaConversa: () => true,
  ehNotaDeResposta: () => true,
  ehSoMidia: () => false,
}));

vi.mock("@/lib/calculo/respostas", () => ({
  respostasDoImovel: () => [{ texto: `wa: ${cenario.mensagemAtual}` }],
}));

vi.mock("@/lib/persistencia/mapeadores", () => ({
  fromDbImovel: () => ({
    id: "imovel-1",
    status: "Em negociação",
    proprietarioNome: "Marta",
    endereco: "Rua A, 10",
    tentativas: [],
    notas: [{
      id: "wa:1",
      texto: `Resposta pelo WhatsApp: ${cenario.mensagemAtual}`,
      data: "2026-08-17T09:00",
    }],
  }),
  fromDbAbordagem: (valor: unknown) => valor,
  fromDbProtocolo: (valor: unknown) => valor,
}));

vi.mock("@/lib/servidor/registro", () => ({
  registrarEvento: vi.fn(),
}));

import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";
import { definirSchemaFeedbackSugestoesIaProntoParaTeste } from "@/lib/servidor/ia/feedback-config";
import { registrarEvento } from "@/lib/servidor/registro";

const inserirSugestao = vi.fn((linha: Record<string, unknown>) => ({
  select: () => ({
    single: async () => ({ data: { id: "sugestao-1" }, error: null }),
  }),
  linha,
}));

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
                  id: "protocolo-taxa",
                  tipo: "informacao_comercial",
                  titulo: "Taxa",
                  conteudo: "A taxa é de 10%.",
                  arquivado: false,
                },
                {
                  id: "conduta-nao-repetir",
                  tipo: "regra_conduta",
                  titulo: "Não repetir informações",
                  conteudo: "Analise o histórico e não repita informações já explicadas.",
                  arquivado: false,
                },
                {
                  id: "conduta-arquivada",
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
            maybeSingle: async () => ({
              data: cenario.perfilComunicacao
                ? { perfil_comunicacao: cenario.perfilComunicacao }
                : null,
              error: null,
            }),
          }),
        };
      }
      if (tabela === "ia_sugestoes") {
        return { insert: inserirSugestao };
      }
      throw new Error(`Tabela inesperada: ${tabela}`);
    }),
  } as unknown as SupabaseClient;
}

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
  evidencias: [{
    id: "evidencia_1",
    fonteId: "fonte_4",
    fato: "a taxa é de 10%",
    temporalidade: "atemporal",
    evento: "",
  }],
  obrigacoesResposta: [{
    id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria",
  }],
  informacoesFaltantes: [],
  nivelConfianca: "alta",
  precisaIntervencaoHumana: false,
  podeResponderComSeguranca: true,
};
const afirmacaoTaxa = {
  descricao: "a taxa é de 10%",
  tipo: "fato",
  evidencias: ["evidencia_1"],
  lacunas: [],
  temporalidade: "atual",
  evento: "",
};
const geracaoTaxa = {
  mensagem: "A taxa é de 10%.",
  protocolosUsados: ["Taxa"],
  obrigacoesCobertas: ["obrigacao_1"],
  afirmacoes: [afirmacaoTaxa],
};
const geracaoConfirmacao = {
  ...geracaoTaxa,
};
const decisaoSocialComRuido = {
  ...decisaoTaxa,
  intencao: "cortesia",
  tipoResposta: "social",
  estadoConversacional: "encerramento",
  acaoEsperada: "encerrar",
  proximoPassoPermitido: "responder somente à cortesia",
};
const geracaoSocial = {
  mensagem: "Perfeito, fico à disposição.",
  protocolosUsados: [],
  obrigacoesCobertas: [],
  afirmacoes: [],
};

describe("handler especializado de atendimento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");
    definirSchemaFeedbackSugestoesIaProntoParaTeste(true);
    cenario.mensagemAtual = "Qual é a taxa?";
    cenario.perfilComunicacao = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    definirSchemaFeedbackSugestoesIaProntoParaTeste(null);
  });

  it("preserva a falha de atendimento sem logar credenciais nem gravar sugestão", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const executar = vi.fn().mockRejectedValueOnce(erroExternoSintetico());
    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta", corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(), userId: "usuario-1", executor: { executar },
    });
    expect(resposta.status).toBe(502);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "falha-ia" });
    expect(inserirSugestao).not.toHaveBeenCalled();
    expect(executar).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith("IA: falha ao decidir o atendimento:", {
      provider: "openai", operation: "gerar_texto", error_code: "text_request_failed", status: 403,
    });
  });

  it("preserva o contrato da UI e exatamente três chamadas no caminho feliz", async () => {
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(decisaoTaxa),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(geracaoTaxa),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ problemas: [] }),
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
      fallbackAplicado: false,
      sugestaoId: "sugestao-1",
    });
    expect(inserirSugestao).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "usuario-1",
      imovel_id: "imovel-1",
      tipo: "resposta",
      texto_sugerido: "A taxa é de 10%.",
      origem: "outro",
      contexto: expect.objectContaining({
        versao: 1,
        protocolosAplicados: ["protocolo-taxa"],
      }),
    }));
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

  it("gera o mesmo rascunho sem acessar ia_sugestoes quando o feedback está desativado", async () => {
    definirSchemaFeedbackSugestoesIaProntoParaTeste(false);
    vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(decisaoTaxa),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(geracaoTaxa),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ problemas: [] }),
      });
    const supabase = supabaseFalso();

    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta",
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase,
      userId: "usuario-1",
      executor: { executar },
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      ok: true,
      rascunho: "A taxa é de 10%.",
      protocolosUsados: ["Taxa"],
      fallbackAplicado: false,
    });
    expect(vi.mocked(supabase.from).mock.calls.map(([tabela]) => tabela))
      .not.toContain("ia_sugestoes");
    expect(inserirSugestao).not.toHaveBeenCalled();
  });

  it("regenera do zero quando a primeira geração declara protocolo não autorizado", async () => {
    const validacao = { problemas: [] };
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      // A primeira geração cita um protocolo que não foi autorizado.
      .mockResolvedValueOnce({ conclusao: {} as never, texto: JSON.stringify(decisaoTaxa) })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ ...geracaoTaxa, protocolosUsados: ["Inventado"] }),
      })
      // O fallback não repete a decisão nem recebe a frase inválida.
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(geracaoConfirmacao),
      })
      .mockResolvedValueOnce({ conclusao: {} as never, texto: JSON.stringify(validacao) });
    const entrada = {
      tipo: "rascunhar-resposta" as const,
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(),
      userId: "usuario-1",
      executor: { executar },
    };

    const resposta = await atenderProprietario(entrada);

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({
      ok: true,
      rascunho: "A taxa é de 10%.",
      protocolosUsados: ["Taxa"],
      fallbackAplicado: true,
      sugestaoId: "sugestao-1",
    });
    expect(executar.mock.calls.map(([pedido]) => pedido.tipo)).toEqual([
      "rascunhar-resposta-decisao",
      "rascunhar-resposta-geracao",
      "rascunhar-resposta-geracao-fallback",
      "rascunhar-resposta-validacao-fallback",
    ]);
    expect(executar.mock.calls[2][0].mensagens[1].content).not.toContain('"Inventado"');
    expect(registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "ia-atendimento-sugerido",
        detalhe: expect.stringContaining('"motivo":"aprovada-apos-fallback"'),
      }),
    );
    const detalhe = vi.mocked(registrarEvento).mock.calls.at(-1)?.[0].detalhe || "";
    expect(detalhe).toContain('"motivoFallback":"protocolo-inadequado"');
    expect(detalhe).toContain(
      '"contextoFingerprint":"',
    );
    expect(detalhe).toContain(
      '"protocolosAplicados":["protocolo-taxa"]',
    );
    expect(detalhe).toContain(
      '"protocolosConsiderados":["protocolo-taxa"]',
    );
    expect(detalhe).not.toContain(
      "conduta-arquivada",
    );
    expect(detalhe).not.toContain(
      "Qual é a taxa?",
    );
  });

  it("mantém o 422 quando também o fallback viola as fontes permitidas", async () => {
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(decisaoTaxa),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ ...geracaoTaxa, mensagem: "A taxa é de 8%.", protocolosUsados: ["Inventado"] }),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ ...geracaoTaxa, mensagem: "A taxa é de 7%.", protocolosUsados: ["Outro"] }),
      });

    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta",
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(),
      userId: "usuario-1",
      executor: { executar },
    });

    expect(resposta.status).toBe(422);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "protocolo-inadequado" });
    expect(executar).toHaveBeenCalledTimes(3);
    expect(registrarEvento).toHaveBeenCalledWith(
      expect.objectContaining({
        evento: "ia-atendimento-bloqueado",
        detalhe: expect.stringContaining('"motivoFallback":"protocolo-inadequado"'),
      }),
    );
  });

  it("LD-247 controlado: cortesia social ignora protocolos e obrigações artificiais", async () => {
    cenario.mensagemAtual = "Obrigado!";
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(decisaoSocialComRuido),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(geracaoSocial),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ problemas: [] }),
      });

    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta",
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(),
      userId: "usuario-1",
      executor: { executar },
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      ok: true,
      rascunho: geracaoSocial.mensagem,
      protocolosUsados: [],
      fallbackAplicado: false,
    });
    expect(executar.mock.calls.map(([pedido]) => pedido.tipo)).toEqual([
      "rascunhar-resposta-decisao",
      "rascunhar-resposta-geracao",
      "rascunhar-resposta-validacao",
    ]);
    const promptGeracao = executar.mock.calls[1][0].mensagens[1].content;
    expect(promptGeracao).toContain('"tipoResposta":"social"');
    expect(promptGeracao).toContain('"protocolosAplicaveis":[]');
    expect(promptGeracao).toContain('"evidencias":[]');
    expect(promptGeracao).toContain('"obrigacoesResposta":[]');
    expect(promptGeracao).toContain("INFORMAÇÕES OFICIAIS DA IMOBILIÁRIA:\n[]");
  });

  it("LD-164 controlado: fallback remove emoji e preserva resposta social sem obrigação factual", async () => {
    cenario.mensagemAtual = "Certo, muito obrigado pela atenção.";
    cenario.perfilComunicacao = {
      formalidade: "natural",
      tamanho: "curto",
      emojis: "nenhum",
      tratamento: "voce",
      expressoesPreferidas: [],
      expressoesEvitar: [],
    };
    const executar = vi
      .fn<ExecutorOpenAI["executar"]>()
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(decisaoSocialComRuido),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ ...geracaoSocial, mensagem: "Perfeito! 😊" }),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify(geracaoSocial),
      })
      .mockResolvedValueOnce({
        conclusao: {} as never,
        texto: JSON.stringify({ problemas: [] }),
      });

    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta",
      corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
      supabase: supabaseFalso(),
      userId: "usuario-1",
      executor: { executar },
    });

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({
      ok: true,
      rascunho: geracaoSocial.mensagem,
      protocolosUsados: [],
      fallbackAplicado: true,
    });
    expect(executar.mock.calls.map(([pedido]) => pedido.tipo)).toEqual([
      "rascunhar-resposta-decisao",
      "rascunhar-resposta-geracao",
      "rascunhar-resposta-geracao-fallback",
      "rascunhar-resposta-validacao-fallback",
    ]);
    const detalhe = vi.mocked(registrarEvento).mock.calls.at(-1)?.[0].detalhe || "";
    expect(detalhe).toContain('"tipoResposta":"social"');
    expect(detalhe).toContain('"obrigacoesResposta":0');
    expect(detalhe).toContain('"motivoFallback":"perfil-incompativel"');
  });
});
