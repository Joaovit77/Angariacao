/* Agenda — partes puras (lib/calculo/agenda).
   O foco aqui é a separação do dia em dois modos de trabalho: a faixa de
   horários e a lista sem hora. Misturados, a visita das 10h vira mais uma
   linha no meio de sete follow-ups. */
import { describe, expect, it } from "vitest";
import { separarPorHorario } from "@/lib/calculo/agenda";
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
