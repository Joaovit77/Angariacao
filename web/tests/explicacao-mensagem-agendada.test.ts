/* M5 — o que o corretor lê sobre uma mensagem agendada. O módulo puro
   transforma só campos estruturados em linguagem operacional: motivo de
   cancelamento, reprogramação, inclusão em outra mensagem, imóveis
   consultados e o significado do código de erro. Nenhum código técnico
   chega à tela normal, e uma mensagem `livre` não ganha semântica que os
   seus campos não provem. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  explicarMensagemAgendada,
  resumirExplicacao,
  traduzirErroMensagem,
} from "@/lib/calculo/explicacaoMensagemAgendada";
import type { MensagemAgendada } from "@/lib/mensagensAgendadas";

function mensagem(extra: Partial<MensagemAgendada> = {}): MensagemAgendada {
  return {
    id: "m1",
    userId: "u1",
    imovelId: "im-1",
    tipo: "verificacao-disponibilidade",
    agendaId: null,
    nomeProprietario: "Maria",
    telefone: "43 99999-2525",
    mensagem: "Olá, Maria! Passando para confirmar…",
    dataEnvio: "2026-09-22T11:00:00.000Z",
    status: "agendada",
    enviadoEm: null,
    erro: null,
    cancelamentoMotivo: null,
    cancelamentoOrigem: null,
    canceladaEm: null,
    imoveisConsultados: null,
    consolidadaEmMensagemId: null,
    reservadaParaMensagemId: null,
    reagendadaEm: null,
    reagendamentoMotivo: null,
    dataEnvioOriginal: null,
    ...extra,
  };
}

const CODIGOS_TECNICOS = [
  "consolidacao-interrompida", "processamento-interrompido", "consolidacao-resultado-incerto",
  "efetivacao-falhou", "evolution-http", "janela-expirada", "revalidacao-falhou", "transicao-falhou",
  "reservada_para_mensagem_id", "consolidada_em_mensagem_id", "RPC", "claim", "trigger", "SQL", "PostgREST",
];

function semTermoTecnico(texto: string) {
  for (const termo of CODIGOS_TECNICOS) expect(texto).not.toContain(termo);
}

describe("explicarMensagemAgendada — cancelamentos", () => {
  it("1. cancelamento manual: 'Cancelada pelo usuário' com a data", () => {
    const e = explicarMensagemAgendada(mensagem({ status: "cancelada", cancelamentoMotivo: "usuario", cancelamentoOrigem: "usuario", canceladaEm: "2026-09-20T14:00:00.000Z" }));
    expect(e.rotulo).toBe("Cancelada");
    expect(e.tom).toBe("neutro");
    expect(e.detalhes).toEqual(["Cancelada pelo usuário em 20/09/2026."]);
    expect(e.incluidaEmOutraMensagem).toBe(false);
  });

  it("2. imóvel indisponível: explica o motivo em vez de só 'Cancelada'", () => {
    const e = explicarMensagemAgendada(mensagem({ status: "cancelada", cancelamentoMotivo: "imovel-indisponivel", cancelamentoOrigem: "worker", canceladaEm: "2026-09-26T11:00:00.000Z" }));
    expect(e.detalhes).toEqual(["Cancelada em 26/09/2026 porque o imóvel não está mais disponível."]);
    expect(explicarMensagemAgendada(mensagem({ status: "cancelada", cancelamentoMotivo: "imovel-excluido" })).detalhes)
      .toEqual(["Cancelada porque o imóvel foi excluído."]);
    expect(explicarMensagemAgendada(mensagem({ status: "cancelada", cancelamentoMotivo: "disponibilidade-confirmada", canceladaEm: "2026-09-10T12:00:00.000Z" })).detalhes)
      .toEqual(["Cancelada em 10/09/2026 porque a disponibilidade já havia sido confirmada."]);
  });

  it("cancelada legada sem motivo continua 'Cancelada', sem inventar razão", () => {
    const e = explicarMensagemAgendada(mensagem({ status: "cancelada" }));
    expect(e.rotulo).toBe("Cancelada");
    expect(e.detalhes).toEqual(["Cancelada."]);
  });
});

describe("explicarMensagemAgendada — reprogramação e consolidação", () => {
  it("3. reprogramada pelo sistema: informa as duas datas só quando os campos provam", () => {
    const e = explicarMensagemAgendada(mensagem({
      dataEnvio: "2026-10-31T11:00:00.000Z", dataEnvioOriginal: "2026-09-22T11:00:00.000Z",
      reagendadaEm: "2026-09-22T11:00:05.000Z", reagendamentoMotivo: "disponibilidade-confirmada",
    }));
    expect(e.rotulo).toBe("Agendada");
    expect(e.reprogramada).toEqual({ de: "22/09/2026", para: "31/10/2026" });
    expect(e.detalhes).toEqual(["Reprogramada de 22/09/2026 para 31/10/2026 após confirmação de disponibilidade."]);
    // Sem a data original (campo ausente), nada é afirmado.
    expect(explicarMensagemAgendada(mensagem({ reagendadaEm: "2026-09-22T11:00:05.000Z", reagendamentoMotivo: "disponibilidade-confirmada" })).detalhes).toEqual([]);
  });

  it("4. absorvida por consolidação: 'Incluída em outra mensagem', nunca só 'Cancelada'", () => {
    const comAncora = explicarMensagemAgendada(mensagem({
      status: "cancelada", cancelamentoMotivo: "contato-consolidado", cancelamentoOrigem: "worker",
      canceladaEm: "2026-09-22T11:00:45.000Z", consolidadaEmMensagemId: "m-ancora",
    }));
    expect(comAncora.rotulo).toBe("Incluída em outra mensagem");
    expect(comAncora.incluidaEmOutraMensagem).toBe(true);
    expect(comAncora.tom).toBe("neutro");
    expect(comAncora.detalhes).toEqual(["Incluída em outra mensagem enviada ao proprietário em 22/09/2026."]);
    expect(JSON.stringify(comAncora)).not.toContain("m-ancora");
    // Âncora excluída depois (FK set null): sem afirmar envio da outra.
    const semAncora = explicarMensagemAgendada(mensagem({ status: "cancelada", cancelamentoMotivo: "contato-consolidado" }));
    expect(semAncora.rotulo).toBe("Incluída em outra mensagem");
    expect(semAncora.detalhes).toEqual(["Incluída em outra mensagem."]);
  });

  it("5. âncora com vários imóveis: quantidade, e os códigos quando todos estão carregados; nunca UUID", () => {
    const enviada = mensagem({ status: "enviada", enviadoEm: "2026-09-22T11:00:45.000Z", imoveisConsultados: ["im-1", "im-2", "im-3"] });
    const codigos: Record<string, string> = { "im-1": "LD-200", "im-2": "LD-201", "im-3": "LD-202" };
    const completa = explicarMensagemAgendada(enviada, { codigoDoImovel: (id) => codigos[id] ?? null });
    expect(completa.rotulo).toBe("Enviada");
    expect(completa.imoveisConsultados).toBe(3);
    expect(completa.detalhes).toEqual(["Perguntou pela disponibilidade de 3 imóveis (LD-200, LD-201, LD-202)."]);
    // Um imóvel sem código carregado: só a quantidade (sem lista parcial, sem id).
    const parcial = explicarMensagemAgendada(enviada, { codigoDoImovel: (id) => (id === "im-2" ? null : codigos[id]) });
    expect(parcial.detalhes).toEqual(["Perguntou pela disponibilidade de 3 imóveis."]);
    expect(JSON.stringify(parcial)).not.toContain("im-2");
    // Um imóvel só: nada a dizer.
    expect(explicarMensagemAgendada(mensagem({ status: "enviada", imoveisConsultados: ["im-1"] })).detalhes).toEqual([]);
  });

  it("reservada para sair junto (processando com reserva) não é 'Enviando' próprio", () => {
    const e = explicarMensagemAgendada(mensagem({ status: "processando", reservadaParaMensagemId: "m-ancora" }));
    expect(e.rotulo).toBe("Em envio conjunto");
    expect(e.detalhes).toEqual(["Está sendo enviada junto com outra mensagem ao proprietário."]);
    expect(explicarMensagemAgendada(mensagem({ status: "processando" })).rotulo).toBe("Enviando");
  });
});

describe("explicarMensagemAgendada — erros e interrupções", () => {
  it("6. resultado incerto: orientação de conferir o histórico, sem código", () => {
    const e = explicarMensagemAgendada(mensagem({ status: "erro", erro: "consolidacao-resultado-incerto", reservadaParaMensagemId: "m-ancora" }));
    expect(e.rotulo).toBe("Envio não confirmado");
    expect(e.tom).toBe("atencao");
    expect(e.detalhes).toEqual(["Não foi possível confirmar se a mensagem foi enviada. Confira o histórico do imóvel antes de realizar novo contato."]);
    expect(e.tecnico).toBe("consolidacao-resultado-incerto");
    semTermoTecnico(e.rotulo + e.detalhes.join(" "));
  });

  it("7. consolidação interrompida e 8. processamento interrompido: 'interrompido antes de ser confirmado'", () => {
    for (const codigo of ["consolidacao-interrompida", "processamento-interrompido"]) {
      const e = explicarMensagemAgendada(mensagem({ status: "erro", erro: codigo }));
      expect(e.rotulo).toBe("Envio não confirmado");
      expect(e.detalhes[0]).toBe("O envio foi interrompido antes de ser confirmado. Confira o histórico do imóvel antes de realizar novo contato.");
      semTermoTecnico(e.rotulo + e.detalhes.join(" "));
    }
  });

  it("9. falha real de envio (HTTP da Evolution): 'Falha no envio' sem o código HTTP", () => {
    const e = explicarMensagemAgendada(mensagem({ status: "erro", erro: "evolution-http-503" }));
    expect(e.rotulo).toBe("Falha no envio");
    expect(e.tom).toBe("falha");
    expect(e.detalhes).toEqual(["Falha ao enviar a mensagem."]);
    expect(e.tecnico).toBe("evolution-http-503");
    semTermoTecnico(e.rotulo + e.detalhes.join(" "));
  });

  it("não enviadas por motivo conhecido: janela, revalidação, transição, instância, número", () => {
    const casos: Array<[string, string]> = [
      ["janela-expirada", "Não foi enviada: o horário programado passou sem que o sistema conseguisse enviar."],
      ["revalidacao-falhou", "Não foi enviada: não foi possível conferir a situação do imóvel antes do envio."],
      ["transicao-falhou:imovel-nao-encontrado", "Não foi enviada: a mensagem precisava ser cancelada ou reprogramada e o sistema não conseguiu concluir isso."],
      ["sem-instancia", "Não foi enviada: o WhatsApp conectado não estava disponível."],
      ["instancia-nao-conectada", "Não foi enviada: o WhatsApp conectado não estava disponível."],
      ["numero-invalido", "Não foi enviada: o telefone do proprietário é inválido."],
    ];
    for (const [codigo, texto] of casos) {
      const e = explicarMensagemAgendada(mensagem({ status: "erro", erro: codigo }));
      expect(e.rotulo).toBe("Não enviada");
      expect(e.detalhes).toEqual([texto]);
    }
    const registro = explicarMensagemAgendada(mensagem({ status: "erro", erro: "efetivacao-falhou:connection reset" }));
    expect(registro.rotulo).toBe("Enviada (registro incompleto)");
    expect(registro.detalhes).toEqual(["A mensagem foi enviada, mas o registro não pôde ser concluído. Confira o histórico do imóvel."]);
  });

  it("guarda: `efetivacao-falhou:*` é sempre 'Enviada (registro incompleto)', porque o worker só o lança depois de o envio ter sido aceito", () => {
    for (const sufixo of ["connection reset", "ancora-nao-processando", "imovel-de-outra-conta", "desconhecido", ""]) {
      const e = explicarMensagemAgendada(mensagem({ status: "erro", erro: `efetivacao-falhou:${sufixo}` }));
      expect(e.rotulo).toBe("Enviada (registro incompleto)");
      expect(e.tom).toBe("atencao");
      expect(e.detalhes).toEqual(["A mensagem foi enviada, mas o registro não pôde ser concluído. Confira o histórico do imóvel."]);
      expect(traduzirErroMensagem(`efetivacao-falhou:${sufixo}`).familia).toBe("registro-incompleto");
    }
    // A premissa, comprovada no worker: o único lançamento desse código vem
    // depois do `await enviarMensagemAgendada(...)` que devolveu sucesso.
    const worker = readFileSync(join(process.cwd(), "app/api/cron/mensagens/route.ts"), "utf8");
    const lancamentos = [...worker.matchAll(/efetivacao-falhou/g)].map((m) => m.index!);
    expect(lancamentos).toHaveLength(1);
    const envio = worker.indexOf("const envio = await enviarMensagemAgendada(");
    expect(envio).toBeGreaterThan(0);
    expect(lancamentos[0]).toBeGreaterThan(envio);
    // E entre o envio aceito e esse lançamento não há outro `throw`: o único
    // erro possível ali é o da efetivação, já com a mensagem entregue.
    const trecho = worker.slice(envio, lancamentos[0]);
    expect(trecho.split("throw new Error(")).toHaveLength(2);
  });

  it("10. erro desconhecido cai no fallback conservador: não afirma que saiu nem que não saiu", () => {
    for (const erro of ["TypeError: fetch failed", "TimeoutError", "algo-que-nao-existe", "42501 permission denied"]) {
      const e = explicarMensagemAgendada(mensagem({ status: "erro", erro }));
      expect(e.rotulo).toBe("Envio não confirmado");
      expect(e.detalhes).toEqual(["Não foi possível confirmar se a mensagem foi enviada. Confira o histórico do imóvel antes de realizar novo contato."]);
      expect(e.detalhes.join(" ")).not.toContain(erro);
      expect(e.tecnico).toBe(erro);
    }
    expect(traduzirErroMensagem("").familia).toBe("falha-envio");
    expect(explicarMensagemAgendada(mensagem({ status: "erro", erro: null })).detalhes).toEqual(["Falha ao enviar a mensagem."]);
  });
});

describe("explicarMensagemAgendada — mensagem livre", () => {
  it("11. livre agendada/enviada/cancelada pelo usuário recebe só o que os campos provam; nada de disponibilidade", () => {
    const livre = (extra: Partial<MensagemAgendada>) => explicarMensagemAgendada(mensagem({ tipo: "livre", ...extra }));
    expect(livre({})).toMatchObject({ rotulo: "Agendada", detalhes: [], imoveisConsultados: null, reprogramada: null, incluidaEmOutraMensagem: false });
    expect(livre({ status: "enviada", enviadoEm: "2026-09-22T11:00:00.000Z" })).toMatchObject({ rotulo: "Enviada", detalhes: [] });
    expect(livre({ status: "cancelada", cancelamentoMotivo: "usuario", canceladaEm: "2026-09-20T12:00:00.000Z" }).detalhes).toEqual(["Cancelada pelo usuário em 20/09/2026."]);
    // LD-163: livre, agendada, imóvel Perdido — a explicação não sabe nem diz nada sobre o imóvel.
    const legada = livre({ mensagem: "Passando para confirmar se o seu imóvel continua disponível" });
    expect(legada.rotulo).toBe("Agendada");
    expect(legada.detalhes).toEqual([]);
    for (const frase of [legada, livre({ status: "erro", erro: "processamento-interrompido" })].map(resumirExplicacao)) {
      expect(frase).not.toContain("disponibilidade");
    }
  });
});

describe("guarda: a tela normal não expõe termos técnicos", () => {
  const arquivos = [
    "lib/calculo/explicacaoMensagemAgendada.ts",
    "components/mensagens/MensagensAgendadasView.tsx",
    "components/agenda/ItemAgenda.tsx",
    "lib/servidor/assistente/conhecimento.ts",
  ];
  const TERMOS_PROIBIDOS_EM_TEXTO = ["RPC", "SKIP LOCKED", "reservada_para_mensagem_id", "trg_", "claim_mensagens", "efetivar_consolidacao"];

  it("12. nenhum texto exibido cita RPC, claim, trigger, coluna de reserva ou código interno", () => {
    for (const arquivo of arquivos) {
      const fonte = readFileSync(join(process.cwd(), arquivo), "utf8");
      // Só o que vira texto para o usuário: literais de string, sem comentários.
      const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      const literais = [...semComentarios.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
      for (const literal of literais) {
        for (const termo of TERMOS_PROIBIDOS_EM_TEXTO) expect(literal, `${arquivo}: "${literal}"`).not.toContain(termo);
      }
    }
    // A view nunca mostra `item.erro` cru.
    const view = readFileSync(join(process.cwd(), "components/mensagens/MensagensAgendadasView.tsx"), "utf8");
    expect(view).not.toMatch(/\{item\.erro\}/);
    expect(view).not.toContain("title={item.erro}");
    expect(view).toContain("explicarMensagemAgendada(item");
    expect(view).toContain("{explicacao.rotulo}");
  });
});
