/* Decisão antes do envio de uma verificação de disponibilidade (M3) e a
   consolidação por proprietário. Fixa os casos obrigatórios do checkpoint:
   indisponível cancela; disponível recente reagenda para E + cadência;
   no-show não move E; IA-only não é evidência; conflitante não vira nada;
   mensagem livre fica de fora; e as constantes SQL são gêmeas das TS. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planejarConsolidacaoContato } from "@/lib/calculo/consolidacaoContatoDisponibilidade";
import { DISPONIBILIDADE_STATUS_ALVO, textoBaseDisponibilidade, textoFollowUp } from "@/lib/calculo/followup";
import {
  decidirMensagemDisponibilidade,
  diaDaProximaVerificacao,
  diaOperacionalDoEnvio,
  moverEnvioParaDia,
} from "@/lib/calculo/decisaoMensagemDisponibilidade";
import {
  avaliarEvidenciaTemporalDisponibilidade,
  MOTIVO_AGENDA_PRAZO_IA,
  MOTIVO_AGENDA_VISITA_CONFIRMADA,
  type AgendaItemComCriacao,
} from "@/lib/calculo/evidenciaDisponibilidade";
import { mensagemConfirmacaoDisponibilidadeConsolidada } from "@/lib/calculo/whatsapp";
import { VERIFICACAO_DISPONIBILIDADE_DIAS } from "@/lib/constantes";
import type { MensagemAgendada } from "@/lib/mensagensAgendadas";
import type { Imovel } from "@/lib/tipos";

function imovel(extra: Partial<Imovel> = {}): Imovel {
  return {
    id: "im-1",
    codigo: "LD-1",
    endereco: "Rua A, 1",
    bairro: "Centro",
    status: "Publicado",
    proprietarioNome: "Maria",
    proprietarioTelefone: "43 99999-2525",
    statusHistory: [{ status: "Angariado", date: "2026-07-02" }, { status: "Publicado", date: "2026-07-05" }],
    tentativas: [],
    ...extra,
  };
}

function mensagem(extra: Partial<MensagemAgendada> = {}): MensagemAgendada {
  const imovelId = extra.imovelId ?? "im-1";
  return {
    id: "m-1",
    userId: "u1",
    imovelId,
    tipo: "verificacao-disponibilidade",
    agendaId: null,
    nomeProprietario: "Maria",
    telefone: "43 99999-2525",
    mensagem: "texto",
    // 08:00 em São Paulo no dia 22/09/2026
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

function visitaConfirmada(criadoEm: string, extra: Partial<AgendaItemComCriacao> = {}): AgendaItemComCriacao {
  return {
    id: "ag-1", title: "Visita — LD-1", type: "Visita", date: "2026-09-05", hora: "10:00", imovelId: "im-1",
    done: false, isVerificacaoDisponibilidade: false, origem: "evento_whatsapp",
    motivoCodigo: MOTIVO_AGENDA_VISITA_CONFIRMADA, criadoEm, ...extra,
  };
}

function decidir(im: Imovel, agenda: AgendaItemComCriacao[] = [], msg = mensagem()) {
  return decidirMensagemDisponibilidade({ mensagem: msg, imovel: im, avaliacao: avaliarEvidenciaTemporalDisponibilidade(im, agenda) });
}

describe("A. imóvel ficou indisponível", () => {
  it("Perdido depois do agendamento (LD-163): cancela com motivo e evidência", () => {
    const ld163 = imovel({
      status: "Perdido", motivoPerda: "Angariado, mas locado por outra imobiliária ou pelo proprietário",
      statusHistory: [{ status: "Angariado", date: "2026-07-28" }, { status: "Publicado", date: "2026-08-10" }, { status: "Perdido", date: "2026-08-12" }],
    });
    const decisao = decidir(ld163);
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel" });
    if (decisao.acao === "cancelar") {
      expect(decisao.evidencia?.codigo).toBe("status-perdido");
      expect(decisao.fato).toContain("locado por outra imobiliária");
    }
  });

  it("Locado, retirado e Cancelado também cancelam; imóvel excluído cancela como imovel-excluido", () => {
    expect(decidir(imovel({ status: "Locado", locadoEm: "2026-09-01" })).acao).toBe("cancelar");
    expect(decidir(imovel({ retirado: true })).acao).toBe("cancelar");
    expect(decidir(imovel({ status: "Cancelado" })).acao).toBe("cancelar");
    expect(decidirMensagemDisponibilidade({ mensagem: mensagem(), imovel: null, avaliacao: null }))
      .toMatchObject({ acao: "cancelar", motivo: "imovel-excluido" });
  });

  it("fora da fase de disponibilidade (Novo contato) cancela pela régua do lembrete, mesmo sem evidência negativa", () => {
    const decisao = decidir(imovel({ status: "Novo contato", statusHistory: [] }));
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel", evidencia: null });
  });
});

describe("B. disponibilidade confirmada mais recentemente", () => {
  it("visita confirmada em E com E + 60 > data da mensagem: reagenda para E + 60, mesma hora do dia", () => {
    // Confirmada em 01/09 10:15 (13:15Z); mensagem em 22/09; E + 60 = 31/10.
    const decisao = decidir(imovel(), [visitaConfirmada("2026-09-01T13:15:00+00:00")]);
    expect(decisao).toMatchObject({
      acao: "reagendar",
      motivo: "disponibilidade-confirmada",
      dataEvidencia: "2026-09-01T10:15:00",
      novoDiaEnvio: "2026-10-31",
      novaDataEnvio: "2026-10-31T11:00:00.000Z",
    });
    expect(diaDaProximaVerificacao("2026-09-01T10:15:00")).toBe(`2026-10-31`);
    expect(VERIFICACAO_DISPONIBILIDADE_DIAS).toBe(60);
  });

  it("tentativa 'agendou' também reinicia a cadência", () => {
    const decisao = decidir(imovel({ tentativas: [{ id: "t1", data: "2026-08-20T09:00", resultado: "agendou" }] }));
    expect(decisao).toMatchObject({ acao: "reagendar", novoDiaEnvio: "2026-10-19" });
  });

  it("E + 60 já passou ou coincide com a data da mensagem: envia (cadência cumprida)", () => {
    expect(decidir(imovel(), [visitaConfirmada("2026-07-20T13:15:00+00:00")]))
      .toMatchObject({ acao: "enviar", estado: "disponivel", motivo: "cadencia-cumprida" });
    // Exatamente no dia: 24/07 + 60 = 22/09.
    expect(decidir(imovel(), [visitaConfirmada("2026-07-24T13:15:00+00:00")]))
      .toMatchObject({ acao: "enviar", motivo: "cadencia-cumprida" });
  });

  it("a mesma decisão duas vezes produz o mesmo resultado (idempotência do núcleo)", () => {
    const a = decidir(imovel(), [visitaConfirmada("2026-09-01T13:15:00+00:00")]);
    const b = decidir(imovel(), [visitaConfirmada("2026-09-01T13:15:00+00:00")]);
    expect(b).toEqual(a);
    // Depois de reagendada para 31/10, reavaliar não empurra de novo.
    const reavaliada = decidir(imovel(), [visitaConfirmada("2026-09-01T13:15:00+00:00")], mensagem({ dataEnvio: "2026-10-31T11:00:00.000Z" }));
    expect(reavaliada).toMatchObject({ acao: "enviar", motivo: "cadencia-cumprida" });
  });

  it("moverEnvioParaDia preserva a hora civil operacional", () => {
    expect(moverEnvioParaDia("2026-09-22T11:02:00.000Z", "2026-10-31")).toBe("2026-10-31T11:02:00.000Z");
    expect(diaOperacionalDoEnvio("2026-09-22T02:30:00.000Z")).toBe("2026-09-21"); // 23:30 do dia anterior em SP
    expect(moverEnvioParaDia("2026-09-22T02:30:00.000Z", "2026-10-31")).toBe("2026-11-01T02:30:00.000Z");
  });
});

describe("C. no-show", () => {
  it("visita confirmada em 01/09 e não realizada em 05/09: E continua 01/09 e a cadência não reinicia no no-show", () => {
    const combinada = visitaConfirmada("2026-09-01T13:15:00+00:00");
    const naoRealizada = visitaConfirmada("2026-09-01T13:15:00+00:00", { done: true, concluidoEm: "2026-09-05T18:00:00+00:00" });
    const a = decidir(imovel(), [combinada]);
    const b = decidir(imovel(), [naoRealizada]);
    expect(a).toMatchObject({ acao: "reagendar", dataEvidencia: "2026-09-01T10:15:00", novoDiaEnvio: "2026-10-31" });
    expect(b).toEqual(a);
  });
});

describe("D. IA-only e outros não-fatos", () => {
  it("visita classificada só pela IA não reagenda: envia como sem evidência", () => {
    const porIa = visitaConfirmada("2026-09-01T13:15:00+00:00", { motivoCodigo: MOTIVO_AGENDA_PRAZO_IA });
    expect(decidir(imovel(), [porIa])).toMatchObject({ acao: "enviar", estado: "sem-evidencia" });
  });

  it("visita confirmada sem created_at (criadoEm) não vira evidência", () => {
    const semCriacao = visitaConfirmada("2026-09-01T13:15:00+00:00", { criadoEm: null });
    expect(decidir(imovel(), [semCriacao])).toMatchObject({ acao: "enviar", estado: "sem-evidencia" });
  });

  it("mensagem livre nunca entra na regra", () => {
    const decisao = decidirMensagemDisponibilidade({
      mensagem: mensagem({ tipo: "livre" }),
      imovel: imovel({ status: "Perdido" }),
      avaliacao: avaliarEvidenciaTemporalDisponibilidade(imovel({ status: "Perdido" })),
    });
    expect(decisao).toMatchObject({ acao: "enviar" });
  });
});

describe("E. conflito", () => {
  it("positiva e negativa indistinguíveis no dia: só o status atual decide, e ele está fora do alvo", () => {
    // O M2 devolve `conflitante` (Perdido em 01/09 e visita confirmada em 01/09).
    const im = imovel({ status: "Perdido", statusHistory: [{ status: "Angariado", date: "2026-07-02" }, { status: "Perdido", date: "2026-09-01" }] });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im, [visitaConfirmada("2026-09-01T13:15:00+00:00")]);
    expect(avaliacao.estado).toBe("conflitante");
    const decisao = decidirMensagemDisponibilidade({ mensagem: mensagem(), imovel: im, avaliacao });
    // Cancela pela régua do lembrete (status Perdido), não por inferir indisponível do conflito.
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel" });
    expect(avaliacao.dataEvidenciaPositiva).toBeNull();
  });

  it("conflitante com status no alvo (hipotético) não vira disponível nem indisponível: envia sem transição", () => {
    const im = imovel();
    const avaliacao = { ...avaliarEvidenciaTemporalDisponibilidade(im), estado: "conflitante" as const, dataEvidenciaPositiva: null };
    expect(decidirMensagemDisponibilidade({ mensagem: mensagem(), imovel: im, avaliacao }))
      .toMatchObject({ acao: "enviar", estado: "conflitante", motivo: "conflitante" });
  });
});

describe("F/G/H. consolidação por proprietário", () => {
  const base = textoBaseDisponibilidade();
  const dono = (id: string, extra: Partial<Imovel> = {}) => imovel({ id, codigo: id, endereco: `Rua ${id}, 10`, ...extra });
  const padrao = (id: string, im: Imovel, extra: Partial<MensagemAgendada> = {}) =>
    mensagem({ id, imovelId: im.id, mensagem: textoFollowUp(base, im), ...extra });

  it("F. três verificações do mesmo proprietário no mesmo dia viram uma mensagem com a lista dos imóveis", () => {
    const a = dono("LD-200"), b = dono("LD-201"), c = dono("LD-202");
    const plano = planejarConsolidacaoContato(
      { mensagem: padrao("m1", a), imovel: a },
      [
        { mensagem: padrao("m2", b, { dataEnvio: "2026-09-22T11:02:00.000Z" }), imovel: b },
        { mensagem: padrao("m3", c, { dataEnvio: "2026-09-22T11:04:00.000Z" }), imovel: c },
      ],
    );
    expect(plano.imoveisConsultados).toEqual(["LD-200", "LD-201", "LD-202"]);
    expect(plano.absorvidas.map((x) => x.mensagem.id)).toEqual(["m2", "m3"]);
    expect(plano.recusadas).toEqual([]);
    expect(plano.texto).toBe(mensagemConfirmacaoDisponibilidadeConsolidada([a, b, c]));
    expect(plano.texto).toContain("• Rua LD-200, 10, Centro");
    expect(plano.texto).toContain("• Rua LD-202, 10, Centro");
    expect(plano.texto).toContain("indicando qual deles");
  });

  it("F. os estados dos imóveis não entram no plano: quem decide cada um é a decisão individual", () => {
    const a = dono("LD-200");
    const b = dono("LD-201", { status: "Perdido" });
    // O servidor só passa candidatas que continuam elegíveis; a função pura
    // não infere nada sobre b a partir de a.
    const plano = planejarConsolidacaoContato({ mensagem: padrao("m1", a), imovel: a }, []);
    expect(plano.imoveisConsultados).toEqual(["LD-200"]);
    expect(plano.texto).toBeNull();
    expect(decidir(b).acao).toBe("cancelar");
    expect(decidir(a).acao).toBe("enviar");
  });

  it("G. dois proprietários (telefones diferentes) nunca são consolidados", () => {
    const a = dono("LD-200");
    const outro = dono("LD-900", { proprietarioTelefone: "43 98888-1111" });
    const plano = planejarConsolidacaoContato({ mensagem: padrao("m1", a), imovel: a }, [{ mensagem: padrao("m9", outro), imovel: outro }]);
    expect(plano.absorvidas).toEqual([]);
    expect(plano.recusadas).toEqual([{ mensagemId: "m9", motivo: "outro-proprietario" }]);
  });

  it("H. outra conta com o mesmo telefone nunca é consolidada", () => {
    const a = dono("LD-200");
    const b = dono("LD-201");
    const plano = planejarConsolidacaoContato({ mensagem: padrao("m1", a), imovel: a }, [{ mensagem: padrao("m2", b, { userId: "u2" }), imovel: b }]);
    expect(plano.absorvidas).toEqual([]);
    expect(plano.recusadas).toEqual([{ mensagemId: "m2", motivo: "outra-conta" }]);
  });

  it("outro dia, mensagem livre, não pendente e texto editado ficam de fora, cada um com o seu motivo", () => {
    const a = dono("LD-200"), b = dono("LD-201"), c = dono("LD-202"), d = dono("LD-334"), e = dono("LD-335");
    const plano = planejarConsolidacaoContato({ mensagem: padrao("m1", a), imovel: a }, [
      { mensagem: padrao("m2", b, { dataEnvio: "2026-09-23T11:00:00.000Z" }), imovel: b },
      { mensagem: padrao("m3", c, { tipo: "livre" }), imovel: c },
      { mensagem: padrao("m4", d, { status: "enviada" }), imovel: d },
      { mensagem: padrao("m5", e, { mensagem: "Oi, o imóvel ainda está disponível?" }), imovel: e },
    ]);
    expect(plano.absorvidas).toEqual([]);
    expect(plano.recusadas).toEqual([
      { mensagemId: "m2", motivo: "outro-dia" },
      { mensagemId: "m3", motivo: "tipo-livre" },
      { mensagemId: "m4", motivo: "nao-pendente" },
      { mensagemId: "m5", motivo: "texto-editado" },
    ]);
  });

  it("virada do dia: 23:59 e 00:01 (America/Sao_Paulo) são dias civis diferentes e não se consolidam; a janela não é 24h móveis", () => {
    const a = dono("LD-200"), b = dono("LD-201"), c = dono("LD-202");
    // 22/09 23:59 em São Paulo = 23/09 02:59Z; 23/09 00:01 em São Paulo = 23/09 03:01Z.
    const ancora = padrao("m1", a, { dataEnvio: "2026-09-23T02:59:00.000Z" });
    expect(diaOperacionalDoEnvio(ancora.dataEnvio)).toBe("2026-09-22");
    const plano = planejarConsolidacaoContato({ mensagem: ancora, imovel: a }, [
      // dois minutos depois, mas já no dia 23: fica de fora
      { mensagem: padrao("m2", b, { dataEnvio: "2026-09-23T03:01:00.000Z" }), imovel: b },
      // 22/09 08:00 em São Paulo: quase 16 h antes, mas mesmo dia civil: entra
      { mensagem: padrao("m3", c, { dataEnvio: "2026-09-22T11:00:00.000Z" }), imovel: c },
    ]);
    expect(plano.recusadas).toEqual([{ mensagemId: "m2", motivo: "outro-dia" }]);
    expect(plano.absorvidas.map((x) => x.mensagem.id)).toEqual(["m3"]);
    expect(plano.imoveisConsultados).toEqual(["LD-200", "LD-202"]);
  });

  it("virada do dia: o dia civil é o de São Paulo, não o UTC (22:30 e 21:30 locais são o mesmo dia mesmo cruzando a meia-noite UTC)", () => {
    const a = dono("LD-200"), b = dono("LD-201");
    // 22/09 22:30 em SP = 23/09 01:30Z; 22/09 21:30 em SP = 23/09 00:30Z; ambos dia 22 em SP.
    const plano = planejarConsolidacaoContato(
      { mensagem: padrao("m1", a, { dataEnvio: "2026-09-23T01:30:00.000Z" }), imovel: a },
      [{ mensagem: padrao("m2", b, { dataEnvio: "2026-09-23T00:30:00.000Z" }), imovel: b }],
    );
    expect(plano.absorvidas.map((x) => x.mensagem.id)).toEqual(["m2"]);
    // e 23/09 00:01 em SP (03:01Z) contra 22/09 20:00 em SP (23:00Z): dias diferentes
    const outro = planejarConsolidacaoContato(
      { mensagem: padrao("m1", a, { dataEnvio: "2026-09-22T23:00:00.000Z" }), imovel: a },
      [{ mensagem: padrao("m2", b, { dataEnvio: "2026-09-23T03:01:00.000Z" }), imovel: b }],
    );
    expect(outro.recusadas).toEqual([{ mensagemId: "m2", motivo: "outro-dia" }]);
  });

  it("âncora com texto editado pelo corretor não absorve nada: a máquina não reescreve o texto dele", () => {
    const a = dono("LD-200"), b = dono("LD-201");
    const plano = planejarConsolidacaoContato({ mensagem: padrao("m1", a, { mensagem: "Texto meu" }), imovel: a }, [{ mensagem: padrao("m2", b), imovel: b }]);
    expect(plano.absorvidas).toEqual([]);
    expect(plano.texto).toBeNull();
  });

  it("segunda mensagem do MESMO imóvel no dia é absorvida sem mudar o texto nem repetir o imóvel", () => {
    const a = dono("LD-200");
    const plano = planejarConsolidacaoContato({ mensagem: padrao("m1", a), imovel: a }, [{ mensagem: padrao("m1b", a, { dataEnvio: "2026-09-22T11:02:00.000Z" }), imovel: a }]);
    expect(plano.absorvidas.map((x) => x.mensagem.id)).toEqual(["m1b"]);
    expect(plano.imoveisConsultados).toEqual(["LD-200"]);
    expect(plano.texto).toBeNull();
  });
});

describe("constantes gêmeas TS/SQL", () => {
  const migration = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20260921120000_transicao_disponibilidade.sql"),
    "utf8",
  );

  it("DISPONIBILIDADE_STATUS_ALVO é a mesma lista de private.disponibilidade_status_alvo()", () => {
    const sql = migration.match(/select array\[([^\]]+)\]::text\[\];/)?.[1] ?? "";
    const lista = [...sql.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(lista).toEqual([...DISPONIBILIDADE_STATUS_ALVO]);
  });

  it("VERIFICACAO_DISPONIBILIDADE_DIAS é o mesmo número de private.verificacao_disponibilidade_dias()", () => {
    const dias = migration.match(/verificacao_disponibilidade_dias\(\)[\s\S]*?select (\d+);/)?.[1];
    expect(Number(dias)).toBe(VERIFICACAO_DISPONIBILIDADE_DIAS);
  });

  it("o trigger usa NEW.id e NEW.user_id e a mesma função interna das RPCs", () => {
    expect(migration).toMatch(/new\.id, new\.user_id, 'encerrar'/);
    expect((migration.match(/private\.aplicar_transicao_disponibilidade\(/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(migration).not.toMatch(/reagir_transicao_disponibilidade_imovel[\s\S]*auth\.uid\(\)/);
  });
});
