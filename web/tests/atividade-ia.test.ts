import { describe, expect, it } from "vitest";
import { criarAtividadesIa, normalizarTipoAtividadeIa } from "@/lib/calculo/atividadeIa";

describe("atividade da IA", () => {
  it("traduz as operações conhecidas para linguagem de produto", () => {
    const atividades = criarAtividadesIa([
      { id: 1, tipo: "assistente-chat", criado_em: "2026-08-27T12:00:00.000Z" },
      { id: 2, tipo: "analisar-dashboard", criado_em: "2026-08-27T11:00:00.000Z" },
      { id: 3, tipo: "transcricao", criado_em: "2026-08-27T10:00:00.000Z" },
    ]);

    expect(atividades.map((atividade) => atividade.titulo)).toEqual([
      "Conversa com o Assistente",
      "Indicadores do Dashboard analisados",
      "Áudio do WhatsApp transcrito",
    ]);
  });

  it("une as etapas técnicas próximas de um mesmo rascunho", () => {
    const atividades = criarAtividadesIa([
      { id: 3, tipo: "rascunhar-resposta-validacao", criado_em: "2026-08-27T12:00:30.000Z" },
      { id: 2, tipo: "rascunhar-resposta-geracao", criado_em: "2026-08-27T12:00:15.000Z" },
      { id: 1, tipo: "rascunhar-resposta-decisao", criado_em: "2026-08-27T12:00:00.000Z" },
    ]);

    expect(normalizarTipoAtividadeIa("rascunhar-resposta-validacao")).toBe("rascunhar-resposta");
    expect(atividades).toHaveLength(1);
    expect(atividades[0]).toMatchObject({
      titulo: "Resposta ao proprietário preparada",
      concluidaEm: "2026-08-27T12:00:30.000Z",
    });
  });

  it("mantém interações separadas fora da janela técnica e ignora linhas inválidas", () => {
    const atividades = criarAtividadesIa([
      { id: 3, tipo: "assistente-chat", criado_em: "data inválida" },
      { id: 2, tipo: "assistente-chat", criado_em: "2026-08-27T12:02:00.000Z" },
      { id: 1, tipo: "assistente-chat", criado_em: "2026-08-27T12:00:00.000Z" },
    ]);

    expect(atividades).toHaveLength(2);
    expect(criarAtividadesIa([], 0)).toEqual([]);
  });

  it("não propaga o tipo interno desconhecido para a interface", () => {
    const atividades = criarAtividadesIa([
      { id: 1, tipo: "operacao-interna-nova", criado_em: "2026-08-27T12:00:00.000Z" },
    ]);

    expect(atividades[0]).toMatchObject({
      titulo: "Interação com a IA",
      percurso: ["contexto", "analise", "resposta"],
      detalhesObservados: false,
    });
    expect(JSON.stringify(atividades)).not.toContain("operacao-interna-nova");
  });

  it("projeta somente fatos seguros de uma execução detalhada", () => {
    const atividades = criarAtividadesIa(
      [{ id: 7, tipo: "assistente-chat", criado_em: "2026-08-27T12:00:00.000Z" }],
      8,
      [{
        id: 9,
        evento: "ia-assistente-respondido",
        criado_em: "2026-08-27T12:00:10.000Z",
        detalhe: JSON.stringify({
          operacao: "assistente-chat",
          protocolosConsiderados: ["protocolo-secreto-1"],
          protocolosAplicados: ["protocolo-secreto-1"],
          ferramentasChamadas: ["consultar_imovel"],
          entidadesUtilizadas: ["imovel-secreto-1"],
          fontesDeDados: ["protocolos", "ferramenta:consultar_imovel"],
          validacoesAplicadas: ["sanitizacao-da-saida"],
          resultado: "respondido",
          motivo: "resposta-gerada",
        }),
      }],
    );

    expect(atividades).toHaveLength(1);
    expect(atividades[0]).toMatchObject({
      detalhesObservados: true,
      percurso: ["contexto", "analise", "protocolos", "imoveis", "validacoes", "resposta"],
    });
    expect(atividades[0].etapas.map((etapa) => etapa.titulo)).toContain("Consultou um imóvel");
    expect(JSON.stringify(atividades)).not.toContain("protocolo-secreto-1");
    expect(JSON.stringify(atividades)).not.toContain("imovel-secreto-1");
    expect(JSON.stringify(atividades)).not.toContain("sanitizacao-da-saida");
  });

  it("diferencia uma ação proposta de uma alteração executada", () => {
    const [atividade] = criarAtividadesIa([], 8, [{
      id: 11,
      evento: "ia-assistente-acao-preparada",
      criado_em: "2026-08-27T12:00:00.000Z",
      detalhe: JSON.stringify({
        operacao: "agendar_visita",
        fontesDeDados: ["agenda", "imoveis"],
        validacoesAplicadas: ["payload-congelado"],
        resultado: "sugerido",
        motivo: "aguardando-confirmacao",
      }),
    }]);

    expect(atividade.estado).toBe("aguardando");
    expect(atividade.resumo).toContain("nenhuma alteração foi executada");
    expect(atividade.etapas.at(-1)).toMatchObject({
      categoria: "acao",
      titulo: "Aguardando confirmação",
      estado: "aguardando",
    });
  });
});
