import { describe, expect, it } from "vitest";
import { criarAtividadesIa, normalizarTipoAtividadeIa } from "@/lib/calculo/atividadeIa";

function evento(id: number, nome: string, metadados: Record<string, unknown>) {
  return {
    id,
    evento: nome,
    criado_em: `2026-08-27T12:${String(id).padStart(2, "0")}:00.000Z`,
    detalhe: JSON.stringify(metadados),
  };
}

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

  it("mostra a criação de compromisso no Cérebro IA sem expor conteúdo", () => {
    const [atividade] = criarAtividadesIa([], 8, [{
      id: 12,
      evento: "ia-assistente-acao-executada",
      criado_em: "2026-08-27T12:05:00.000Z",
      detalhe: JSON.stringify({
        operacao: "criar_compromisso",
        fontesDeDados: ["assistente_acoes", "agenda"],
        validacoesAplicadas: ["sessao-da-conversa", "payload-congelado"],
        resultado: "respondido",
        motivo: "succeeded",
      }),
    }]);

    expect(atividade).toMatchObject({
      titulo: "Compromisso criado pelo Assistente",
      tipo: "criar_compromisso",
      estado: "concluido",
      detalhesObservados: true,
    });
    expect(atividade.etapas.map((etapa) => etapa.titulo)).toContain("Agenda identificada como destino da operação");
    expect(JSON.stringify(atividade)).not.toContain("Reunião de alinhamento");
  });

  it("projeta preparação e execução de status sem resposta sem chamar isso de visita", () => {
    const atividades = criarAtividadesIa([], 8, [
      evento(13, "ia-assistente-acao-preparada", {
        operacao: "alterar_status_sem_resposta_em_lote",
        fontesDeDados: ["assistente_acoes", "imoveis", "status_history"],
        resultado: "sugerido",
        motivo: "aguardando-confirmacao",
      }),
      evento(14, "ia-assistente-acao-executada", {
        operacao: "alterar_status_sem_resposta_em_lote",
        fontesDeDados: ["assistente_acoes", "imoveis", "status_history"],
        resultado: "respondido",
        motivo: "succeeded",
      }),
    ]);

    expect(atividades.map((atividade) => atividade.titulo)).toEqual([
      "Status alterado para Sem resposta pelo Assistente",
      "Mudança para Sem resposta preparada",
    ]);
    expect(atividades[1].estado).toBe("aguardando");
    expect(atividades.flatMap((atividade) => atividade.etapas.map((etapa) => etapa.titulo)))
      .toContain("Consultou o histórico de status");
    expect(JSON.stringify(atividades).toLowerCase()).not.toContain("visita");
  });

  it("projeta tentativa e operações de follow-up conforme o resultado observado", () => {
    const operacoes = [
      [15, "registrar_tentativa", "Tentativa de contato registrada pelo Assistente"],
      [16, "criar_followup", "Follow-up criado pelo Assistente"],
      [17, "reagendar_followup", "Follow-up reagendado pelo Assistente"],
      [18, "concluir_followup", "Follow-up concluído pelo Assistente"],
    ] as const;
    const atividades = criarAtividadesIa([], 8, operacoes.map(([id, operacao]) => evento(
      id,
      "ia-assistente-acao-executada",
      {
        operacao,
        fontesDeDados: operacao === "registrar_tentativa"
          ? ["assistente_acoes", "imoveis", "tentativas"]
          : ["assistente_acoes", "agenda", "imoveis"],
        resultado: "respondido",
        motivo: "succeeded",
      },
    )));

    expect(atividades.map((atividade) => atividade.titulo)).toEqual(
      [...operacoes].reverse().map(([, , titulo]) => titulo),
    );
    expect(atividades.find((atividade) => atividade.tipo === "registrar_tentativa")?.etapas
      .map((etapa) => etapa.titulo)).toContain("Consultou tentativas de contato");
    expect(JSON.stringify(atividades).toLowerCase()).not.toContain("visita");
  });

  it("distingue ferramentas que preparam confirmação das que executam follow-ups", () => {
    const [atividade] = criarAtividadesIa([], 8, [evento(19, "ia-assistente-respondido", {
      operacao: "assistente-chat",
      ferramentasChamadas: [
        "preparar_alteracao_status_sem_resposta",
        "registrar_tentativa_contato",
        "criar_followup",
        "reagendar_followup",
        "concluir_followup",
      ],
      resultado: "respondido",
      motivo: "resposta-gerada",
    })]);

    expect(atividade.etapas).toEqual(expect.arrayContaining([
      expect.objectContaining({ titulo: "Preparou mudança para Sem resposta", categoria: "acao", estado: "aguardando" }),
      expect.objectContaining({ titulo: "Preparou o registro de uma tentativa de contato", categoria: "acao", estado: "aguardando" }),
      expect.objectContaining({ titulo: "Criou um follow-up", categoria: "acao", estado: "concluido" }),
      expect.objectContaining({ titulo: "Reagendou um follow-up", categoria: "acao", estado: "concluido" }),
      expect.objectContaining({ titulo: "Concluiu um follow-up", categoria: "acao", estado: "concluido" }),
    ]));
  });

  it("representa os blocos e fontes de contexto realmente observados", () => {
    const [atividade] = criarAtividadesIa([], 8, [evento(20, "ia-assistente-respondido", {
      operacao: "assistente-chat",
      blocosContexto: ["imovel", "pipeline", "agenda", "protocolos"],
      fontesContexto: [
        "imoveis",
        "imoveis.status+status_history+notas+tentativas",
        "agenda",
        "protocolos",
      ],
      fontesDeDados: [
        "imoveis",
        "imoveis.status+status_history+notas+tentativas",
        "agenda",
        "protocolos",
      ],
      resultado: "respondido",
      motivo: "resposta-gerada",
      contextoBruto: "telefone +55 11 99999-9999 e nota sigilosa",
    })]);

    expect(atividade.etapas).toEqual(expect.arrayContaining([
      expect.objectContaining({ titulo: "Contexto do imóvel carregado", categoria: "consulta" }),
      expect.objectContaining({ titulo: "Pipeline consultado", categoria: "consulta" }),
      expect.objectContaining({ titulo: "Agenda consultada", categoria: "consulta" }),
      expect.objectContaining({ titulo: "Protocolos considerados", categoria: "regra" }),
    ]));
    expect(atividade.etapas.filter((etapa) => etapa.titulo === "Agenda consultada")).toHaveLength(1);
    expect(JSON.stringify(atividade)).not.toContain("99999-9999");
    expect(JSON.stringify(atividade)).not.toContain("nota sigilosa");
  });

  it("humaniza os usos de embeddings sem inventar um percurso detalhado", () => {
    const atividades = criarAtividadesIa([
      { id: 21, tipo: "embedding-consulta-avaliacao", criado_em: "2026-08-27T12:21:00.000Z" },
      { id: 22, tipo: "embedding-comparavel-mercado", criado_em: "2026-08-27T12:22:00.000Z" },
    ]);

    expect(atividades.map((atividade) => atividade.titulo)).toEqual([
      "Comparável preparado para busca semântica",
      "Busca semântica da Avaliação realizada",
    ]);
    expect(atividades.every((atividade) => atividade.detalhesObservados === false)).toBe(true);
  });

  it("projeta capacidade indisponível como bloqueio com linguagem segura", () => {
    const [atividade] = criarAtividadesIa([], 8, [evento(23, "ia-assistente-respondido", {
      operacao: "assistente-chat",
      resultado: "respondido",
      motivo: "capacidade-indisponivel:enviar_mensagem_externa",
    })]);

    expect(atividade).toMatchObject({
      titulo: "Envio direto de mensagem não disponível",
      estado: "bloqueado",
    });
    expect(atividade.etapas.at(-1)).toMatchObject({ estado: "bloqueado" });
    expect(JSON.stringify(atividade)).not.toContain("capacidade-indisponivel");
    expect(JSON.stringify(atividade)).not.toContain("enviar_mensagem_externa");
  });

  it("aproveita ia-falhou somente quando o detalhe legado é reconhecido e seguro", () => {
    const atividades = criarAtividadesIa([], 8, [
      {
        id: 24,
        evento: "ia-falhou",
        criado_em: "2026-08-27T12:24:00.000Z",
        detalhe: "gerar-anuncio: limite-excedido",
      },
      {
        id: 25,
        evento: "ia-falhou",
        criado_em: "2026-08-27T12:25:00.000Z",
        detalhe: "operação interna: telefone +55 11 99999-9999",
      },
    ]);

    expect(atividades).toHaveLength(1);
    expect(atividades[0]).toMatchObject({
      titulo: "Geração do anúncio não concluída",
      estado: "erro",
    });
    expect(JSON.stringify(atividades)).not.toContain("limite-excedido");
    expect(JSON.stringify(atividades)).not.toContain("99999-9999");
  });

  it("mantém fallbacks desconhecidos neutros, sem convertê-los em visita ou consulta", () => {
    const [atividade] = criarAtividadesIa([], 8, [evento(26, "ia-assistente-acao-executada", {
      operacao: "acao_futura",
      ferramentasChamadas: ["ferramenta_futura"],
      resultado: "respondido",
      motivo: "succeeded",
    })]);

    expect(atividade).toMatchObject({ titulo: "Ação executada pelo Assistente", estado: "concluido" });
    expect(atividade.etapas).toContainEqual(expect.objectContaining({
      titulo: "Ferramenta autorizada utilizada",
      categoria: "processamento",
    }));
    expect(JSON.stringify(atividade).toLowerCase()).not.toMatch(/visita|consulta autorizada/);
    expect(JSON.stringify(atividade)).not.toContain("acao_futura");
    expect(JSON.stringify(atividade)).not.toContain("ferramenta_futura");
  });
  it("mantém cancelamento e bloqueio como desfechos distintos", () => {
    const atividades = criarAtividadesIa([], 8, [
      evento(27, "ia-assistente-acao-cancelada", {
        operacao: "registrar_tentativa",
        resultado: "bloqueado",
        motivo: "cancelled",
      }),
      evento(28, "ia-assistente-acao-bloqueada", {
        operacao: "alterar_status_sem_resposta_em_lote",
        resultado: "bloqueado",
        motivo: "stale",
      }),
    ]);

    expect(atividades).toEqual([
      expect.objectContaining({
        titulo: "Mudança para Sem resposta não executada",
        estado: "bloqueado",
      }),
      expect.objectContaining({
        titulo: "Registro da tentativa de contato cancelado",
        estado: "bloqueado",
      }),
    ]);
    expect(atividades[0].etapas.at(-1)?.titulo).toBe("Execução interrompida com segurança");
    expect(atividades[1].etapas.at(-1)?.titulo).toBe("Ação cancelada");
  });
});
