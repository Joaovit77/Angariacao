/* Testes de caracterização — helpers de data (Etapa 2).
   Os valores esperados vêm de tests/oracle-expected.json, gerado
   executando o app.js ANTIGO com relógio congelado. O port precisa
   reproduzir exatamente o comportamento legado. */
import { describe, it, expect } from "vitest";
import {
  todayISO, parseDate, daysBetween, addDaysISO, monthKey,
  monthLabel, monthLabelLong, currentMonthKey, shiftMonthKey, last6MonthKeys,
} from "@/lib/datas";
import { congelaRelogio } from "./setup-relogio";
import oracle from "./oracle-expected.json";

congelaRelogio();

describe("todayISO / currentMonthKey / last6MonthKeys (relógio congelado)", () => {
  it("todayISO", () => expect(todayISO()).toBe(oracle.datas.todayISO));
  it("currentMonthKey", () => expect(currentMonthKey()).toBe(oracle.datas.currentMonthKey));
  it("last6MonthKeys", () => expect(last6MonthKeys()).toEqual(oracle.datas.last6MonthKeys));
});

describe("parseDate", () => {
  it("null e vazio retornam null", () => {
    expect(parseDate(null)).toBe(oracle.datas.parseDate_null);
    expect(parseDate("")).toBe(oracle.datas.parseDate_vazio);
  });
  it("interpreta ISO como data LOCAL (não UTC)", () => {
    expect(parseDate("2026-07-09")!.toISOString()).toBe(oracle.datas.parseDate_iso_como_iso);
  });
});

describe("daysBetween", () => {
  const casos = oracle.datas.daysBetween;
  it("diferença positiva", () => expect(daysBetween("2026-07-01", "2026-07-09")).toBe(casos["2026-07-01__2026-07-09"]));
  it("diferença negativa (ordem invertida)", () => expect(daysBetween("2026-07-09", "2026-07-01")).toBe(casos["2026-07-09__2026-07-01"]));
  it("null em qualquer lado retorna null", () => {
    expect(daysBetween(null, "2026-07-09")).toBe(casos["null__2026-07-09"]);
    expect(daysBetween("2026-07-09", null)).toBe(casos["2026-07-09__null"]);
  });
  it("virada de ano", () => expect(daysBetween("2025-12-31", "2026-01-01")).toBe(casos["2025-12-31__2026-01-01"]));
  it("datas iguais = 0", () => expect(daysBetween("2026-07-09", "2026-07-09")).toBe(casos.iguais));
});

describe("addDaysISO", () => {
  const casos = oracle.datas.addDaysISO;
  it("virada de mês", () => expect(addDaysISO("2026-01-31", 1)).toBe(casos["2026-01-31_mais1"]));
  it("virada de ano", () => expect(addDaysISO("2026-12-31", 1)).toBe(casos["2026-12-31_mais1"]));
  it("ano bissexto", () => expect(addDaysISO("2024-02-28", 1)).toBe(casos["2024-02-28_mais1"]));
  it("+60 dias (prazo da verificação de disponibilidade)", () => expect(addDaysISO("2026-07-05", 60)).toBe(casos["2026-07-05_mais60"]));
  it("dias negativos", () => expect(addDaysISO("2026-07-09", -30)).toBe(casos["2026-07-09_menos30"]));
  it("null retorna null", () => expect(addDaysISO(null, 5)).toBe(casos.null_mais5));
});

describe("monthKey / monthLabel / monthLabelLong / shiftMonthKey", () => {
  it("monthKey", () => {
    expect(monthKey(null)).toBe(oracle.datas.monthKey.null);
    expect(monthKey("2026-07-09")).toBe(oracle.datas.monthKey["2026-07-09"]);
  });
  it("monthLabel (remove só o primeiro ponto da abreviação)", () => {
    expect(monthLabel("2026-07")).toBe(oracle.datas.monthLabel["2026-07"]);
    expect(monthLabel("2026-02")).toBe(oracle.datas.monthLabel["2026-02"]);
    expect(monthLabel("2025-12")).toBe(oracle.datas.monthLabel["2025-12"]);
  });
  it("monthLabelLong capitaliza a primeira letra", () => {
    expect(monthLabelLong("2026-07")).toBe(oracle.datas.monthLabelLong["2026-07"]);
    expect(monthLabelLong("2026-02")).toBe(oracle.datas.monthLabelLong["2026-02"]);
  });
  it("shiftMonthKey atravessa viradas de ano", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe(oracle.datas.shiftMonthKey["2026-01_menos1"]);
    expect(shiftMonthKey("2026-12", 1)).toBe(oracle.datas.shiftMonthKey["2026-12_mais1"]);
    expect(shiftMonthKey("2026-07", -6)).toBe(oracle.datas.shiftMonthKey["2026-07_menos6"]);
    expect(shiftMonthKey("2026-07", 0)).toBe(oracle.datas.shiftMonthKey["2026-07_mais0"]);
  });
});
