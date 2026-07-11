/* Testes de caracterização — mapeadores camelCase <-> snake_case (Etapa 3).
   Valores esperados capturados executando os mapeadores do app.js ANTIGO
   (scripts/gera-oraculo-mapeadores.mjs -> oracle-mapeadores.json), incluindo
   as assimetrias intencionais de ida-e-volta (null <-> "", null -> 0). */
import { describe, it, expect } from "vitest";
import { toDbImovel, fromDbImovel, toDbAgenda, fromDbAgenda, type DbImovelRow, type DbAgendaRow } from "@/lib/persistencia/mapeadores";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import fixturesJson from "./fixtures.json";
import dbJson from "./fixtures-db.json";
import oracle from "./oracle-mapeadores.json";

const USER_ID = oracle.userId;
const imoveisCamel = fixturesJson.imoveis as unknown as Imovel[];
const imoveisRows = dbJson.imoveisRows as unknown as DbImovelRow[];
const agendaRows = dbJson.agendaRows as unknown as DbAgendaRow[];
const agendaCamel = dbJson.agendaCamel as unknown as AgendaItem[];

describe("toDbImovel (camelCase -> snake_case)", () => {
  for (const im of imoveisCamel) {
    it(`fixture ${im.id}`, () => {
      expect(toDbImovel(im, USER_ID)).toEqual(oracle.toDbImovel[im.id as keyof typeof oracle.toDbImovel]);
    });
  }
});

describe("fromDbImovel (snake_case -> camelCase)", () => {
  for (const r of imoveisRows) {
    it(`linha ${r.id}`, () => {
      expect(fromDbImovel(r)).toEqual(oracle.fromDbImovel[r.id as keyof typeof oracle.fromDbImovel]);
    });
  }
  it("numeric vindo como string passa por Number() (r1: '3500.5' -> 3500.5)", () => {
    expect(fromDbImovel(imoveisRows.find((r) => r.id === "r1")!).valorAluguel).toBe(3500.5);
  });
  it("status_history null vira [] (r2)", () => {
    expect(fromDbImovel(imoveisRows.find((r) => r.id === "r2")!).statusHistory).toEqual([]);
  });
  it("quartos/banheiros/vagas preservam 0; textos '' continuam '' (r3)", () => {
    const r3 = fromDbImovel(imoveisRows.find((r) => r.id === "r3")!);
    expect(r3.quartos).toBe(0);
    expect(r3.vagas).toBe(0);
    expect(r3.codigo).toBe("");
  });
});

describe("ida-e-volta imóvel: fromDb(toDb(x)) reproduz o app antigo", () => {
  for (const im of imoveisCamel) {
    it(`fixture ${im.id}`, () => {
      expect(fromDbImovel(toDbImovel(im, USER_ID) as DbImovelRow)).toEqual(
        oracle.roundTripImovel[im.id as keyof typeof oracle.roundTripImovel],
      );
    });
  }
  it("assimetria intencional: bairro null vira '' na volta (f03)", () => {
    const f03 = imoveisCamel.find((i) => i.id === "f03")!;
    expect(f03.bairro).toBeNull();
    expect(fromDbImovel(toDbImovel(f03, USER_ID) as DbImovelRow).bairro).toBe("");
  });
  it("assimetria intencional: valorAluguel null vira 0 na ida (f03)", () => {
    const f03 = imoveisCamel.find((i) => i.id === "f03")!;
    expect(toDbImovel(f03, USER_ID).valor_aluguel).toBe(0);
  });
});

describe("toDbAgenda / fromDbAgenda / ida-e-volta", () => {
  for (const a of agendaCamel) {
    it(`toDbAgenda ${a.id}`, () => {
      expect(toDbAgenda(a, USER_ID)).toEqual(oracle.toDbAgenda[a.id as keyof typeof oracle.toDbAgenda]);
    });
    it(`ida-e-volta ${a.id}`, () => {
      expect(fromDbAgenda(toDbAgenda(a, USER_ID) as DbAgendaRow)).toEqual(
        oracle.roundTripAgenda[a.id as keyof typeof oracle.roundTripAgenda],
      );
    });
  }
  for (const r of agendaRows) {
    it(`fromDbAgenda ${r.id}`, () => {
      expect(fromDbAgenda(r)).toEqual(oracle.fromDbAgenda[r.id as keyof typeof oracle.fromDbAgenda]);
    });
  }
  it("done/is_verificacao null viram false (a2)", () => {
    const a2 = fromDbAgenda(agendaRows.find((r) => r.id === "a2")!);
    expect(a2.done).toBe(false);
    expect(a2.isVerificacaoDisponibilidade).toBe(false);
  });

  it("hora: preserva 'HH:MM' e coage vazio para null na ida", () => {
    const base: AgendaItem = {
      id: "h1", title: "Visita", type: "Visita", date: "2026-07-14",
      done: false, isVerificacaoDisponibilidade: false,
    };
    expect(toDbAgenda({ ...base, hora: "14:30" }, USER_ID).hora).toBe("14:30");
    expect(toDbAgenda({ ...base, hora: "" }, USER_ID).hora).toBeNull();
    expect(toDbAgenda(base, USER_ID).hora).toBeNull();
  });

  it("hora: null no banco vira null; 'HH:MM' passa intacto na volta", () => {
    const row = agendaRows.find((r) => r.id === "a1")!;
    expect(fromDbAgenda({ ...row, hora: null }).hora).toBeNull();
    expect(fromDbAgenda({ ...row, hora: "09:00" }).hora).toBe("09:00");
  });
});
