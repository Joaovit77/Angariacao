/* Agenda — partes puras (lib/calculo/agenda).
   O foco aqui é a separação do dia em dois modos de trabalho: a faixa de
   horários e a lista sem hora. Misturados, a visita das 10h vira mais uma
   linha no meio de sete follow-ups. */
import { describe, expect, it } from "vitest";
import { rotuloAutomacaoLembrete, separarPorHorario } from "@/lib/calculo/agenda";
import { fmtDiaSemana } from "@/lib/formatadores";
import type { AgendaItem } from "@/lib/tipos";

function item(over: Partial<AgendaItem> & { id: string }): AgendaItem {
  return {
    title: "Compromisso",
    type: "Follow-up",
    date: "2026-07-27",
    done: false,
    isVerificacaoDisponibilidade: false,
    ...over,
  };
}

describe("separarPorHorario", () => {
  it("separa o que tem hora do que não tem", () => {
    const { comHora, semHora } = separarPorHorario([
      item({ id: "a", hora: "14:30" }),
      item({ id: "b" }),
      item({ id: "c", hora: "09:00" }),
    ]);
    expect(comHora.map((i) => i.id)).toEqual(["c", "a"]);
    expect(semHora.map((i) => i.id)).toEqual(["b"]);
  });

  it("ordena os com hora cronologicamente — é uma faixa de horários", () => {
    const { comHora } = separarPorHorario([
      item({ id: "tarde", hora: "16:00" }),
      item({ id: "cedo", hora: "08:15" }),
      item({ id: "meio", hora: "12:00" }),
    ]);
    expect(comHora.map((i) => i.hora)).toEqual(["08:15", "12:00", "16:00"]);
  });

  it("hora vazia ou só espaço conta como SEM hora", () => {
    // O modal grava null quando o campo fica em branco, mas dado antigo pode
    // ter "" — os dois têm que cair no mesmo balde, senão a faixa de horários
    // ganha uma linha fantasma sem horário nenhum.
    const { comHora, semHora } = separarPorHorario([
      item({ id: "vazio", hora: "" }),
      item({ id: "espaco", hora: "  " }),
      item({ id: "nulo", hora: null }),
    ]);
    expect(comHora).toHaveLength(0);
    expect(semHora).toHaveLength(3);
  });

  it("preserva a ordem de entrada dos sem hora", () => {
    // Eles chegam já ordenados por compararAgenda; reordenar aqui inventaria
    // uma prioridade que o dado não tem.
    const { semHora } = separarPorHorario([item({ id: "x" }), item({ id: "y" }), item({ id: "z" })]);
    expect(semHora.map((i) => i.id)).toEqual(["x", "y", "z"]);
  });

  it("lista vazia devolve os dois baldes vazios", () => {
    expect(separarPorHorario([])).toEqual({ comHora: [], semHora: [] });
  });
});

describe("fmtDiaSemana", () => {
  it("dá o nome do dia — '27 de jul.' não diz se cai num sábado", () => {
    expect(fmtDiaSemana("2026-07-27")).toBe("segunda-feira");
    expect(fmtDiaSemana("2026-07-25")).toBe("sábado");
  });

  it("sem data, string vazia (não '—') — é sufixo de um rótulo", () => {
    expect(fmtDiaSemana(null)).toBe("");
    expect(fmtDiaSemana("")).toBe("");
  });
});

describe("rotuloAutomacaoLembrete (M5)", () => {
  const verificacao = (over: Partial<AgendaItem>) => item({ id: "v", isVerificacaoDisponibilidade: true, title: "Verificar disponibilidade — LD-1", ...over });

  it("16. lembrete concluído pela transição de disponibilidade recebe o rótulo", () => {
    expect(rotuloAutomacaoLembrete(verificacao({ done: true, motivoConclusao: "disponibilidade-confirmada", origemConclusao: "automacao" })))
      .toBe("Concluído por confirmação de disponibilidade");
    // Pela RPC chamada com sessão a origem é "usuario", mas o motivo estruturado é o mesmo.
    expect(rotuloAutomacaoLembrete(verificacao({ done: true, motivoConclusao: "disponibilidade-confirmada", origemConclusao: "usuario" })))
      .toBe("Concluído por confirmação de disponibilidade");
  });

  it("17. lembrete criado/reposicionado pela automação recebe o rótulo de próxima verificação", () => {
    expect(rotuloAutomacaoLembrete(verificacao({ origem: "automacao", motivoCodigo: "disponibilidade-confirmada" })))
      .toBe("Próxima verificação programada automaticamente");
  });

  it("18. lembrete manual (concluído à mão ou criado à mão) continua sem rótulo; compromisso comum idem", () => {
    expect(rotuloAutomacaoLembrete(verificacao({}))).toBeNull();
    expect(rotuloAutomacaoLembrete(verificacao({ done: true }))).toBeNull();
    expect(rotuloAutomacaoLembrete(verificacao({ done: true, origemConclusao: "usuario", motivoConclusao: null }))).toBeNull();
    expect(rotuloAutomacaoLembrete(verificacao({ origem: "usuario", motivoCodigo: null }))).toBeNull();
    // Visita confirmada por escrito tem outro código: não é lembrete de verificação.
    expect(rotuloAutomacaoLembrete(item({ id: "vis", type: "Visita", origem: "evento_whatsapp", motivoCodigo: "visita_confirmada_pelo_proprietario" }))).toBeNull();
    expect(rotuloAutomacaoLembrete(item({ id: "c", done: true, motivoConclusao: "disponibilidade-confirmada" }))).toBeNull();
  });
});
