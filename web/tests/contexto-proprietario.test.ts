/* Contexto do proprietário com vários imóveis (lib/calculo/contextoProprietario).
   Caso real: LD-200, LD-201, LD-202 e LD-334 são da mesma pessoa (mesmo
   telefone canônico, nome grafado de dois jeitos) e a Agenda chegou a
   programar três verificações para ela. Estes testes fixam: quem é "a mesma
   pessoa" (telefone canônico dentro da conta, nunca nome), que os estados
   por imóvel continuam independentes, e que a duplicidade de contato é
   DETECTADA sem que nada seja cancelado. */
import { describe, expect, it } from "vitest";
import {
  agruparImoveisPorProprietario,
  agruparVerificacoesPorProprietario,
  chaveProprietario,
  contextoDosProprietarios,
} from "@/lib/calculo/contextoProprietario";
import { telefoneCanonico } from "@/lib/calculo/webhookWhatsapp";
import type { MensagemAgendada } from "@/lib/mensagensAgendadas";
import type { AgendaItem, Imovel } from "@/lib/tipos";

const CONTA_A = "user-a";
const CONTA_B = "user-b";

function imovel(id: string, extra: Partial<Imovel> = {}): Imovel {
  return {
    id,
    codigo: id,
    endereco: `Rua ${id}, 1`,
    status: "Publicado",
    proprietarioNome: "José Carlos dos Santos Júnior",
    proprietarioTelefone: "(43) 99999-2525",
    statusHistory: [{ status: "Angariado", date: "2026-08-01" }, { status: "Publicado", date: "2026-08-10" }],
    tentativas: [],
    ...extra,
  };
}

function mensagem(id: string, imovelId: string, extra: Partial<MensagemAgendada> = {}): MensagemAgendada {
  return {
    id,
    userId: CONTA_A,
    imovelId,
    tipo: "verificacao-disponibilidade",
    agendaId: null,
    nomeProprietario: "José",
    telefone: "(43) 99999-2525",
    mensagem: "Olá! Passando para confirmar se o seu imóvel segue disponível.",
    dataEnvio: "2026-10-05T11:00:00+00:00",
    status: "agendada",
    enviadoEm: null,
    erro: null,
    cancelamentoMotivo: null,
    cancelamentoOrigem: null,
    canceladaEm: null,
    imoveisConsultados: null,
    consolidadaEmMensagemId: null,
    reagendadaEm: null,
    reagendamentoMotivo: null,
    dataEnvioOriginal: null,
    ...extra,
  };
}

function lembrete(id: string, imovelId: string, done = false): AgendaItem {
  return {
    id, title: `Verificar disponibilidade — ${imovelId}`, type: "Follow-up", date: "2026-10-05",
    imovelId, done, isVerificacaoDisponibilidade: true, origem: "usuario",
  };
}

const quatro = ["LD-200", "LD-201", "LD-202", "LD-334"].map((id, indice) => ({
  userId: CONTA_A,
  // O caso real grafa "santos" e "Santos": a identidade não pode vir do nome.
  imovel: imovel(id, { proprietarioNome: indice % 2 ? "José Carlos dos santos Júnior" : "José Carlos dos Santos Júnior" }),
}));

describe("identidade do proprietário", () => {
  it("1. quatro imóveis com o mesmo telefone canônico são um proprietário com quatro imóveis", () => {
    const grupos = agruparImoveisPorProprietario(quatro);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]).toMatchObject({
      userId: CONTA_A,
      identidade: "telefone-canonico",
      telefoneCanonico: telefoneCanonico("(43) 99999-2525"),
      chave: `${CONTA_A}|tel:4399992525`,
    });
    expect(grupos[0].imoveis.map((i) => i.codigo)).toEqual(["LD-200", "LD-201", "LD-202", "LD-334"]);
    expect(grupos[0].nomes).toEqual(["José Carlos dos Santos Júnior", "José Carlos dos santos Júnior"]);
  });

  it("3. proprietários com telefones diferentes nunca são agrupados", () => {
    const grupos = agruparImoveisPorProprietario([
      { userId: CONTA_A, imovel: imovel("A", { proprietarioTelefone: "43 99999-2525" }) },
      { userId: CONTA_A, imovel: imovel("B", { proprietarioTelefone: "43 98888-1111" }) },
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("4. mesmo nome com telefone diferente (ou sem telefone) não agrupa", () => {
    const grupos = agruparImoveisPorProprietario([
      { userId: CONTA_A, imovel: imovel("A", { proprietarioTelefone: "43 99999-2525" }) },
      { userId: CONTA_A, imovel: imovel("B", { proprietarioTelefone: "43 97777-0000" }) },
      { userId: CONTA_A, imovel: imovel("C", { proprietarioTelefone: null }) },
      { userId: CONTA_A, imovel: imovel("D", { proprietarioTelefone: "" }) },
    ]);
    expect(grupos).toHaveLength(4);
    expect(grupos[2]).toMatchObject({ identidade: "sem-identidade", telefoneCanonico: null, chave: `${CONTA_A}|imovel:C` });
    expect(grupos[3]).toMatchObject({ identidade: "sem-identidade", chave: `${CONTA_A}|imovel:D` });
  });

  it("5. o telefone canônico é a identidade confiável do modelo: com e sem o nono dígito, com e sem DDI, é a mesma pessoa", () => {
    const grupos = agruparImoveisPorProprietario([
      { userId: CONTA_A, imovel: imovel("A", { proprietarioTelefone: "+55 (43) 99999-2525" }) },
      { userId: CONTA_A, imovel: imovel("B", { proprietarioTelefone: "43 9999 2525" }) },
      { userId: CONTA_A, imovel: imovel("C", { proprietarioTelefone: "554399992525" }) },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].telefoneCanonico).toBe("4399992525");
    // Telefone que a regra não reconhece como brasileiro plausível não vira
    // identidade: cada imóvel fica sozinho.
    expect(chaveProprietario(CONTA_A, imovel("X", { proprietarioTelefone: "12345" })).identidade).toBe("sem-identidade");
  });

  it("10. agrupamento entre contas é impossível: o mesmo telefone em duas contas são dois grupos", () => {
    const grupos = agruparImoveisPorProprietario([
      { userId: CONTA_A, imovel: imovel("A") },
      { userId: CONTA_B, imovel: imovel("B") },
    ]);
    expect(grupos.map((g) => g.chave)).toEqual([`${CONTA_A}|tel:4399992525`, `${CONTA_B}|tel:4399992525`]);
  });
});

describe("estados por imóvel continuam independentes", () => {
  const itens = [
    { userId: CONTA_A, imovel: imovel("LD-200", { tentativas: [{ id: "t1", data: "2026-09-01T10:00", resultado: "agendou" }] }) },
    { userId: CONTA_A, imovel: imovel("LD-201", {
      status: "Perdido", motivoPerda: "Angariado, mas locado por outra imobiliária ou pelo proprietário",
      statusHistory: [{ status: "Angariado", date: "2026-08-01" }, { status: "Perdido", date: "2026-09-02" }],
    }) },
    { userId: CONTA_A, imovel: imovel("LD-202") },
    { userId: CONTA_A, imovel: imovel("LD-334", { tentativas: [{ id: "t2", data: "2026-09-03T10:00", resultado: "agendou" }] }) },
  ];

  it("6. um disponível e outro indisponível do mesmo proprietário: cada um com o próprio estado", () => {
    const [contexto] = contextoDosProprietarios(itens);
    const estados = Object.fromEntries(contexto.porImovel.map((p) => [p.imovel.codigo, p.avaliacao.estado]));
    expect(estados).toEqual({ "LD-200": "disponivel", "LD-201": "indisponivel", "LD-202": "sem-evidencia", "LD-334": "disponivel" });
    expect(contexto.resumo).toMatchObject({ imoveis: 4, disponiveis: 2, indisponiveis: 1, semEvidencia: 1, conflitantes: 0 });
  });

  it("7. evidência positiva de um imóvel não contamina os demais", () => {
    const [contexto] = contextoDosProprietarios(itens);
    const ld202 = contexto.porImovel.find((p) => p.imovel.codigo === "LD-202")!;
    expect(ld202.avaliacao.evidencias).toEqual([]);
    expect(ld202.avaliacao.dataEvidenciaPositiva).toBeNull();
  });

  it("8. evidência negativa de um imóvel não contamina os demais", () => {
    const [contexto] = contextoDosProprietarios(itens);
    const ld200 = contexto.porImovel.find((p) => p.imovel.codigo === "LD-200")!;
    expect(ld200.avaliacao.negativaMaisRecente).toBeNull();
    expect(ld200.avaliacao.estado).toBe("disponivel");
  });
});

describe("duplicidade de contato", () => {
  it("2 e 9. três mensagens pendentes para três imóveis do mesmo proprietário: uma pessoa com três verificações, detectadas e intocadas", () => {
    const mensagens = [mensagem("m1", "LD-200"), mensagem("m2", "LD-201"), mensagem("m3", "LD-202")];
    const contextos = agruparVerificacoesPorProprietario(quatro, [], mensagens);
    expect(contextos).toHaveLength(1);
    const [contexto] = contextos;
    expect(contexto.contatoDuplicado).toBe(true);
    expect(contexto.resumo.mensagensPendentes).toBe(3);
    expect(contexto.verificacoesPendentes.map((v) => [v.tipo, v.imovelId])).toEqual([
      ["mensagem", "LD-200"], ["mensagem", "LD-201"], ["mensagem", "LD-202"],
    ]);
    // Nada foi decidido: as mensagens de entrada continuam como estavam.
    expect(mensagens.every((m) => m.status === "agendada" && m.cancelamentoMotivo === null)).toBe(true);
  });

  it("uma mensagem pendente não é contato duplicado; lembretes abertos entram na lista mas não contam como mensagem", () => {
    const contextos = agruparVerificacoesPorProprietario(quatro, [lembrete("l1", "LD-200"), lembrete("l2", "LD-334"), lembrete("l3", "LD-202", true)], [mensagem("m1", "LD-202")]);
    const [contexto] = contextos;
    expect(contexto.contatoDuplicado).toBe(false);
    expect(contexto.resumo).toMatchObject({ mensagensPendentes: 1, lembretesAbertos: 2 });
    expect(contexto.verificacoesPendentes.map((v) => v.id)).toEqual(["l1", "m1", "l2"]);
  });

  it("mensagens 'livre', canceladas ou enviadas não são verificações pendentes; proprietário sem pendência não aparece", () => {
    const mensagens = [
      mensagem("m1", "LD-200", { tipo: "livre" }),
      mensagem("m2", "LD-201", { status: "cancelada" }),
      mensagem("m3", "LD-202", { status: "enviada" }),
    ];
    expect(agruparVerificacoesPorProprietario(quatro, [], mensagens)).toEqual([]);
    const [contexto] = contextoDosProprietarios(quatro, [], mensagens);
    expect(contexto.contatoDuplicado).toBe(false);
    expect(contexto.resumo.mensagensPendentes).toBe(0);
  });

  it("10b. mensagem de outra conta apontando para um imóvel do grupo é ignorada", () => {
    const contextos = contextoDosProprietarios(quatro, [], [mensagem("m-alheia", "LD-200", { userId: CONTA_B }), mensagem("m1", "LD-201")]);
    expect(contextos[0].resumo.mensagensPendentes).toBe(1);
    expect(contextos[0].verificacoesPendentes.map((v) => v.id)).toEqual(["m1"]);
  });

  it("a ordem das verificações segue a ordem dos imóveis do grupo, por imóvel", () => {
    const contextos = contextoDosProprietarios(quatro, [lembrete("l-334", "LD-334")], [mensagem("m-201", "LD-201")]);
    expect(contextos[0].verificacoesPendentes.map((v) => v.id)).toEqual(["m-201", "l-334"]);
  });
});
