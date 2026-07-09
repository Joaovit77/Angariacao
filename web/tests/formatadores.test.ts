/* Testes de caracterização — formatadores (Etapa 2).
   Valores esperados capturados do app.js antigo (oracle-expected.json). */
import { describe, it, expect } from "vitest";
import { fmtDate, fmtDateLong, fmtMoney, fmtMoneyFull } from "@/lib/formatadores";
import oracle from "./oracle-expected.json";

describe("fmtDate", () => {
  it("null vira travessão", () => expect(fmtDate(null)).toBe(oracle.formatadores.fmtDate.null));
  it("formata dd/mm/aaaa", () => expect(fmtDate("2026-07-09")).toBe(oracle.formatadores.fmtDate["2026-07-09"]));
});

describe("fmtDateLong", () => {
  it("null vira travessão", () => expect(fmtDateLong(null)).toBe(oracle.formatadores.fmtDateLong.null));
  it("formato longo pt-BR", () => {
    expect(fmtDateLong("2026-07-09")).toBe(oracle.formatadores.fmtDateLong["2026-07-09"]);
    expect(fmtDateLong("2026-01-02")).toBe(oracle.formatadores.fmtDateLong["2026-01-02"]);
  });
});

describe("fmtMoney (sem centavos)", () => {
  it("null e NaN viram travessão", () => {
    expect(fmtMoney(null)).toBe(oracle.formatadores.fmtMoney.null);
    expect(fmtMoney(NaN)).toBe(oracle.formatadores.fmtMoney.nan);
  });
  it("zero é formatado (não vira travessão)", () => expect(fmtMoney(0)).toBe(oracle.formatadores.fmtMoney.zero));
  it("inteiros e milhares", () => {
    expect(fmtMoney(1800)).toBe(oracle.formatadores.fmtMoney["1800"]);
    expect(fmtMoney(9500000)).toBe(oracle.formatadores.fmtMoney["9500000"]);
  });
  it("arredonda centavos", () => expect(fmtMoney(1234.56)).toBe(oracle.formatadores.fmtMoney["1234.56"]));
});

describe("fmtMoneyFull (com centavos)", () => {
  it("null vira travessão", () => expect(fmtMoneyFull(null)).toBe(oracle.formatadores.fmtMoneyFull.null));
  it("mantém centavos", () => {
    expect(fmtMoneyFull(1234.56)).toBe(oracle.formatadores.fmtMoneyFull["1234.56"]);
    expect(fmtMoneyFull(1800)).toBe(oracle.formatadores.fmtMoneyFull["1800"]);
  });
});
