import { describe, expect, it } from "vitest";
import type { BlocoAssistente, ItemHistoricoAssistente } from "@/lib/assistente/tipos";
import { blocosComItens, compactarBlocosParaHistorico } from "@/lib/assistente/historico";
import { conteudoMensagemHistorico, normalizarPedidoAssistente, sanitizarTextoAssistente } from "@/lib/servidor/assistente/orquestrador";
import { resolverReferenciaImovelHistorico } from "@/lib/assistente/referencias";

const blocoImoveis: BlocoAssistente = {
  tipo: "imoveis",
  titulo: "Mais recentes",
  itens: [{ id: "uuid-1", codigo: "LD-226", endereco: "Rua que nao precisa ir ao historico", bairro: "California", status: "Novo contato", responsavel: "Dado desnecessario" }],
};

const blocoConversas: BlocoAssistente = {
  tipo: "conversas_respondidas",
  titulo: "Proprietários que responderam",
  itens: [{
    imovelId: "uuid-conversa-1",
    codigo: "LD-310",
    proprietario: "Marina",
    status: "Em negociação",
    ultimaResposta: "Pode me explicar como funciona?",
    ultimaRespostaEm: "2026-08-27T09:00:00",
    aguardandoCorretor: true,
    naoLidas: 1,
    rascunhoDisponivel: true,
  }],
};

describe("historico estruturado da sessao", () => {
  it("nao mantem bloco vazio para renderizacao", () => {
    expect(blocosComItens([{ tipo: "imoveis", titulo: "Vazio", itens: [] }, blocoImoveis])).toEqual([blocoImoveis]);
  });

  it("compacta somente identificadores e campos necessarios dos cards", () => {
    const resultado = compactarBlocosParaHistorico([blocoImoveis]);
    expect(resultado).toEqual([{ tipo: "imoveis", itens: [{ id: "uuid-1", codigo: "LD-226", bairro: "California", status: "Novo contato" }] }]);
    expect(JSON.stringify(resultado)).not.toContain("Rua que nao precisa");
    expect(JSON.stringify(resultado)).not.toContain("Dado desnecessario");
  });

  it("preserva o resultado compacto validado no pedido e no texto para o modelo", () => {
    const pedido = normalizarPedidoAssistente({
      mensagem: "Qual desses fica no California?",
      contexto: { rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" },
      historico: [{ papel: "assistente", texto: "Aqui estao.", resultados: [{ tipo: "imoveis", itens: [{ id: "uuid-1", codigo: "LD-226", bairro: "California", status: "Novo contato", segredo: "nao" }] }] }],
    });
    expect(pedido?.historico[0].resultados).toEqual([{ tipo: "imoveis", itens: [{ id: "uuid-1", codigo: "LD-226", bairro: "California", status: "Novo contato" }] }]);
    const conteudo = conteudoMensagemHistorico(pedido!.historico[0]);
    expect(conteudo).toContain("RESULTADOS ESTRUTURADOS");
    expect(conteudo).toContain("LD-226");
    expect(conteudo).not.toContain("segredo");
    expect(conteudo).not.toContain("<div");
  });

  it("mantém a referência da conversa sem copiar o conteúdo privado para o histórico do chat", () => {
    const resultado = compactarBlocosParaHistorico([blocoConversas]);
    expect(resultado).toEqual([{ tipo: "conversas_respondidas", itens: [{
      imovelId: "uuid-conversa-1",
      codigo: "LD-310",
      proprietario: "Marina",
      ultimaRespostaEm: "2026-08-27T09:00:00",
      aguardandoCorretor: true,
    }] }]);
    expect(JSON.stringify(resultado)).not.toContain("Pode me explicar");
  });

  it("remove referencias estruturadas internas se o modelo tentar reproduzi-las", () => {
    expect(sanitizarTextoAssistente('A próxima mensagem é para Susan.\n\nRESULTADOS ESTRUTURADOS DESTA RESPOSTA: [{"tipo":"mensagem_agendada"}]')).toBe("A próxima mensagem é para Susan.");
  });
});

describe("referencia conversacional de imovel", () => {
  const lista: ItemHistoricoAssistente = {
    papel: "assistente",
    texto: "LD-228, LD-227, LD-226, LD-221 e LD-220.",
    resultados: [{ tipo: "imoveis", itens: [
      { id: "id-228", codigo: "LD-228", bairro: "Vila Larsen 1", status: "Novo contato" },
      { id: "id-227", codigo: "LD-227", bairro: "Santa Izabel", status: "Novo contato" },
      { id: "id-226", codigo: "LD-226", bairro: "Jardim Itaparica", status: "Perdido" },
      { id: "id-221", codigo: "LD-221", bairro: "Jardim Padovani", status: "Novo contato" },
      { id: "id-220", codigo: "LD-220", bairro: "Ricardo", status: "Perdido" },
    ] }],
  };

  it("mantem o mesmo imovel inequivocamente resolvido em varios turnos", () => {
    const historico: ItemHistoricoAssistente[] = [
      lista,
      { papel: "usuario", texto: "Qual desses fica na Vila Larsen 1?" },
      { papel: "assistente", texto: "O imóvel é o **LD-228**." },
      { papel: "usuario", texto: "Quem é o proprietário dele?" },
      { papel: "assistente", texto: "O proprietário do **LD-228** é Carolina." },
      { papel: "usuario", texto: "Qual a situação dele?" },
      { papel: "assistente", texto: "A situação do **LD-228** é Novo contato." },
    ];
    expect(resolverReferenciaImovelHistorico("Ele precisa de follow-up?", historico)).toEqual({
      estado: "resolvida", id: "id-228", codigo: "LD-228", origem: "conversa",
    });
  });

  it("resolve ordinal e permite trocar a referencia por codigo explicito", () => {
    expect(resolverReferenciaImovelHistorico("O segundo precisa de follow-up?", [lista])).toMatchObject({ id: "id-227", codigo: "LD-227", origem: "ordinal" });
    expect(resolverReferenciaImovelHistorico("LD-224 precisa de follow-up?", [lista])).toEqual({ estado: "resolvida", codigo: "LD-224", origem: "explicita" });
  });

  it("resolve o primeiro proprietário de uma lista de conversas respondidas", () => {
    const historico: ItemHistoricoAssistente[] = [{
      papel: "assistente",
      texto: "Marina respondeu no LD-310.",
      resultados: compactarBlocosParaHistorico([blocoConversas]),
    }];
    expect(resolverReferenciaImovelHistorico("Prepare uma resposta para a primeira", historico)).toEqual({
      estado: "resolvida",
      id: "uuid-conversa-1",
      codigo: "LD-310",
      origem: "ordinal",
    });
  });

  it("nao escolhe aleatoriamente quando a lista continua ambigua", () => {
    expect(resolverReferenciaImovelHistorico("Ele precisa de follow-up?", [lista])).toMatchObject({ estado: "ambigua" });
  });

  it("nao conserva referencia depois de limpar o historico", () => {
    expect(resolverReferenciaImovelHistorico("E ele precisa de follow-up?", [])).toEqual({ estado: "ausente", candidatos: [] });
  });
});
