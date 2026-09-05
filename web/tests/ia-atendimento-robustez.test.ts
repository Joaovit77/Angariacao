import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ESQUEMA_DECISAO_ATENDIMENTO, MAX_MENSAGEM_CONTEXTO,
  PROBLEMAS_VALIDACAO_ATENDIMENTO, normalizarDecisaoAtendimento,
  normalizarGeracaoAtendimento, motivoReprovacaoValidacaoAtendimento,
  motivoBloqueioDecisaoAtendimento, podeRegenerarAtendimento,
  promptDecidirAtendimento, textoContextualAtendimento,
  type DecisaoAtendimento,
} from "@/lib/ia/atendimento";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";

vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: vi.fn() }));
vi.mock("@/lib/servidor/ia/feedback-config", () => ({ feedbackSugestoesIaHabilitado: () => false }));
import { registrarEvento } from "@/lib/servidor/registro";
import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";

const decisao: DecisaoAtendimento = {
  intencao: "consequência de locação por terceiro", objecao: "",
  estadoConversacional: "negociacao", contextoRelevante: "Sem exclusividade; consequência a confirmar",
  informacoesJaExplicadas: [], acaoEsperada: "responder", proximoPassoPermitido: "responder a parte conhecida",
  acoesProibidas: [], protocolosAplicaveis: ["Exclusividade"], mensagensEvidencia: ["wa:atual"],
  informacoesFaltantes: ["consequência da locação por terceiro"], nivelConfianca: "media",
  precisaIntervencaoHumana: false, podeResponderComSeguranca: true,
};
const protocolos = [{ id: "p-1", titulo: "Exclusividade", tipo: "informacao_comercial", arquivado: false,
  conteudo: "Não há exclusividade antes da locação. O proprietário pode anunciar com outras imobiliárias." }];
const parcial = { mensagem: "Você pode anunciar com outras imobiliárias, pois não há exclusividade antes da locação. Vou confirmar como fica se a locação ocorrer por outra empresa.", protocolosUsados: ["Exclusividade"] };

function banco(semImovel = false, erro = false): SupabaseClient {
  const dados: Record<string, unknown> = {
    imoveis: semImovel ? null : { id: "imovel-controlado", status: "Em negociação", endereco: "Rua de teste",
      notas: [{ id: "wa:atual", direcao: "recebida", data: "2026-09-04T09:37:06",
        texto: "Resposta pelo WhatsApp: Se por acaso a outra imobiliária conseguir alugar, como fica a situação?" }] },
    protocolos, user_config: null,
  };
  return { from(tabela: string) {
    if (!(tabela in dados)) throw new Error("Acesso não autorizado no teste");
    const resultado = { data: dados[tabela], error: erro ? { code: "indisponivel" } : null };
    const consulta = { select: () => consulta, eq: () => consulta,
      maybeSingle: async () => resultado, order: async () => resultado };
    return consulta;
  } } as unknown as SupabaseClient;
}
async function executarSaidas(saidas: unknown[], supabase = banco()) {
  const executar = vi.fn<ExecutorOpenAI["executar"]>();
  for (const saida of saidas) executar.mockResolvedValueOnce({ texto: JSON.stringify(saida), conclusao: {} as never });
  const resposta = await atenderProprietario({ tipo: "rascunhar-resposta", corpo: { imovelId: "imovel-controlado" },
    supabase, userId: "tenant-controlado", executor: { executar } });
  return { resposta, corpo: await resposta.json(), executar };
}

beforeEach(() => vi.clearAllMocks());

describe("contrato estrito e informação parcial", () => {
  it("permite a parte comprovada mesmo com uma lacuna explícita", () => {
    expect(normalizarDecisaoAtendimento(decisao, protocolos, ["wa:atual"])).toEqual(decisao);
    expect(motivoBloqueioDecisaoAtendimento(decisao)).toBeNull();
  });
  it.each(ESQUEMA_DECISAO_ATENDIMENTO.required)("rejeita decisão sem o campo obrigatório %s", (campo) => {
    const incompleta: Record<string, unknown> = { ...decisao };
    delete incompleta[campo];
    expect(normalizarDecisaoAtendimento(incompleta, protocolos)).toBeNull();
  });
  it("rejeita enums, tipos e propriedades não previstos no schema", () => {
    for (const valor of [null, [], { ...decisao, extra: true }, { ...decisao, acaoEsperada: "executar" },
      { ...decisao, acoesProibidas: ["nova-acao"] }, { ...decisao, informacoesFaltantes: [true] }]) {
      expect(normalizarDecisaoAtendimento(valor, protocolos)).toBeNull();
    }
  });
  it.each([null, [], {}, { mensagem: "Olá" }, { mensagem: "Olá", protocolosUsados: [1] },
    { mensagem: "Olá", protocolosUsados: [], extra: true }])("rejeita geração fora do schema: %j", (valor) => {
    expect(normalizarGeracaoAtendimento(valor)).toBeNull();
  });
  it("aceita saída válida e recusa auditoria estruturalmente incompatível", () => {
    expect(normalizarGeracaoAtendimento(parcial)).toEqual(parcial);
    expect(motivoReprovacaoValidacaoAtendimento({ problemas: [] })).toBeNull();
    for (const valor of [null, {}, { problemas: ["contexto-incompleto"] }, { problemas: [], extra: true }]) {
      expect(motivoReprovacaoValidacaoAtendimento(valor)).toBeUndefined();
    }
  });
  it.each(PROBLEMAS_VALIDACAO_ATENDIMENTO)("preserva o diagnóstico específico %s", (problema) => {
    expect(motivoReprovacaoValidacaoAtendimento({ problemas: [problema] })).toBe(problema);
    expect(podeRegenerarAtendimento(problema)).toBe(problema !== "intervencao-humana");
  });
  it("preserva o fim da mensagem longa e informa o trecho ausente", () => {
    const texto = "Início. " + "a".repeat(MAX_MENSAGEM_CONTEXTO + 100) + " Qual é a condição final?";
    const contexto = textoContextualAtendimento(texto);
    expect(contexto.truncado).toBe(true);
    expect(contexto.texto).toContain("Início.");
    expect(contexto.texto).toContain("Qual é a condição final?");
    expect(contexto.texto).toContain("[trecho intermediário omitido]");
  });
  it("preserva protocolo além do antigo corte e títulos exatos", () => {
    const titulo = "Título ".repeat(35);
    const conteudo = "Detalhe. ".repeat(90) + "A cobrança só ocorre na modalidade contratada.";
    const prompt = promptDecidirAtendimento("Qual a condição?", { proprietario: "", estagio: "", fatosImovel: [] },
      undefined, [{ titulo, conteudo }]);
    expect(prompt).toContain(titulo);
    expect(prompt).toContain("A cobrança só ocorre na modalidade contratada.");
  });
});

describe("contrato HTTP e limite de regeneração", () => {
  it("retorna 200 com resposta parcialmente suportada em três chamadas", async () => {
    const resultado = await executarSaidas([decisao, parcial, { problemas: [] }]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo.rascunho).toBe(parcial.mensagem);
    expect(resultado.executar).toHaveBeenCalledTimes(3);
  });
  it("não bloqueia confirmação de taxa por palavra isolada e exige auditoria", async () => {
    const limitada = { ...decisao, protocolosAplicaveis: [], acoesProibidas: ["explicar-condicoes"] };
    const resposta = { mensagem: "Entendi. Vou confirmar se existe essa taxa de cancelamento antes da locação e te retorno com a informação certa.", protocolosUsados: [] };
    const resultado = await executarSaidas([limitada, resposta, { problemas: [] }]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.executar.mock.calls.map(([pedido]) => pedido.tipo)).toEqual([
      "rascunhar-resposta-decisao", "rascunhar-resposta-geracao", "rascunhar-resposta-validacao",
    ]);
  });
  it("permite retomar condição comprovada e mantém a auditoria independente", async () => {
    const resultado = await executarSaidas([{ ...decisao, acoesProibidas: ["explicar-condicoes"] }, parcial, { problemas: [] }]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.executar).toHaveBeenCalledTimes(3);
  });
  it("continua reprovando oferta indevida pela auditoria semântica", async () => {
    const resultado = await executarSaidas([{ ...decisao, acoesProibidas: ["explicar-condicoes"] }, parcial,
      { problemas: ["acao-incompativel"] }, parcial, { problemas: ["acao-incompativel"] }]);
    expect(resultado.resposta.status).toBe(422);
    expect(resultado.executar).toHaveBeenCalledTimes(5);
  });
  it.each([
    ["cobranca-sem-fonte", "Se outra imobiliária alugar, não haverá nenhuma multa nem taxa."],
    ["entidade-sem-fonte", "O Departamento de Contratos Especiais vai resolver isso para você."],
    ["informacao-sem-fonte", "Se outra imobiliária alugar, eu encerro a divulgação automaticamente."],
  ])("reescreve %s sem entregar a afirmação recusada", async (problema, mensagem) => {
    const resultado = await executarSaidas([decisao, { mensagem, protocolosUsados: ["Exclusividade"] },
      { problemas: [problema] }, parcial, { problemas: [] }]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo.rascunho).toBe(parcial.mensagem);
    expect(resultado.corpo.rascunho).not.toBe(mensagem);
    expect(resultado.executar).toHaveBeenCalledTimes(5);
  });
  it("regenera uma vez após omissão e valida a segunda sugestão", async () => {
    const resultado = await executarSaidas([decisao, { mensagem: "Vou confirmar tudo.", protocolosUsados: [] },
      { problemas: ["omissao-parte-comprovada"] }, parcial, { problemas: [] }]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo.fallbackAplicado).toBe(true);
    expect(resultado.executar).toHaveBeenCalledTimes(5);
  });
  it("termina em 422 depois de duas rejeições sem sexta chamada ou terceira geração", async () => {
    const resultado = await executarSaidas([decisao, parcial, { problemas: ["cobranca-sem-fonte"] },
      parcial, { problemas: ["entidade-sem-fonte"] }]);
    expect(resultado.resposta.status).toBe(422);
    expect(resultado.corpo.falha).toBe("geracao-reprovada");
    expect(resultado.executar).toHaveBeenCalledTimes(5);
    expect(resultado.executar.mock.calls.filter(([p]) => p.tipo.includes("geracao"))).toHaveLength(2);
  });
  it("uma falha terminal não regenera mesmo acompanhada de falha corrigível", async () => {
    const resultado = await executarSaidas([decisao, parcial, { problemas: ["entidade-sem-fonte", "intervencao-humana"] }]);
    expect(resultado.resposta.status).toBe(422);
    expect(resultado.executar).toHaveBeenCalledTimes(3);
  });
  it.each([
    [null], [decisao, null], [decisao, { mensagem: "Sem protocolos" }],
    [decisao, parcial, { problemas: ["codigo-inventado"] }],
  ])("responde 502 para falha estrutural sem a transformar em 422", async (...saidas) => {
    const resultado = await executarSaidas(saidas);
    expect(resultado.resposta.status).toBe(502);
    expect(resultado.corpo.falha).toBe("falha-modelo");
    expect(resultado.executar).toHaveBeenCalledTimes(saidas.length);
  });
  it("ausência sob RLS não gera; erro de leitura é operacional", async () => {
    const ausente = await executarSaidas([], banco(true));
    expect(ausente.resposta.status).toBe(422);
    expect(ausente.executar).not.toHaveBeenCalled();
    const erro = await executarSaidas([], banco(false, true));
    expect(erro.resposta.status).toBe(500);
    expect(erro.executar).not.toHaveBeenCalled();
  });
  it("registra tentativa e código sem conversa, prompt ou rascunho", async () => {
    await executarSaidas([decisao, parcial, { problemas: [] }]);
    const logs = JSON.stringify(vi.mocked(registrarEvento).mock.calls);
    expect(logs).toContain("rascunhar_resposta");
    expect(logs).toContain("duracao_ms");
    expect(logs).not.toContain(parcial.mensagem);
    expect(logs).not.toContain("como fica a situação");
    expect(logs).not.toContain("DADOS_JSON");
  });
});

describe("regressão semântica no fluxo de rascunho", () => {
  it.each([
    ["omissao-parte-comprovada", "Vou verificar e te retorno."],
    ["informacao-sem-fonte", "Se outra imobiliária alugar, o imóvel pode seguir com a divulgação por lá também."],
  ])("recupera %s uma vez, preservando fontes e diagnóstico", async (codigo, mensagem) => {
    const resultado = await executarSaidas([decisao, { mensagem, protocolosUsados: ["Exclusividade"] },
      { problemas: [codigo] }, parcial, { problemas: [] }]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo.rascunho).toBe(parcial.mensagem);
    expect(resultado.corpo.fallbackAplicado).toBe(true);
    const pedidos = resultado.executar.mock.calls.map(([pedido]) => pedido);
    expect(pedidos.map(p => p.tipo)).toEqual([
      "rascunhar-resposta-decisao", "rascunhar-resposta-geracao", "rascunhar-resposta-validacao",
      "rascunhar-resposta-geracao-fallback", "rascunhar-resposta-validacao-fallback",
    ]);
    const fallback = String(pedidos[3].mensagens[1].content);
    expect(fallback).toContain(codigo);
    expect(fallback).not.toContain(mensagem);
    for (const indice of [1, 2, 3, 4]) {
      const conteudo = String(pedidos[indice].mensagens[1].content);
      expect(conteudo).toContain(protocolos[0].conteudo);
      expect(conteudo).toContain("Se por acaso a outra imobiliária conseguir alugar");
    }
    const logs = JSON.stringify(vi.mocked(registrarEvento).mock.calls);
    expect(logs).toContain(codigo);
    expect(logs).not.toContain(mensagem);
    expect(logs).not.toContain(parcial.mensagem);
    expect(logs).not.toContain("DADOS_JSON");
  });

  it.each([
    ["omissao-parte-comprovada", "Vou verificar e te retorno."],
    ["informacao-sem-fonte", "Se outra imobiliária alugar, o imóvel pode seguir com a divulgação por lá também."],
  ])("bloqueia a segunda ocorrência de %s sem entregar rascunho", async (codigo, mensagem) => {
    const ruim = { mensagem, protocolosUsados: ["Exclusividade"] };
    const resultado = await executarSaidas([decisao, ruim, { problemas: [codigo] }, ruim, { problemas: [codigo] }]);
    expect(resultado.resposta.status).toBe(422);
    expect(resultado.corpo.rascunho).toBeUndefined();
    expect(resultado.executar).toHaveBeenCalledTimes(5);
    expect(resultado.executar.mock.calls.filter(([p]) => p.tipo.includes("geracao"))).toHaveLength(2);
  });
});
