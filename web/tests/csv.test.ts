/* Contrato do gerador de CSV (lib/csv). Feature nova da pós-migração —
   os testes fixam o escape (RFC 4180), o delimitador ';', o BOM UTF-8 e as
   quebras CRLF que fazem o arquivo abrir limpo no Excel em pt-BR. */
import { describe, expect, it } from "vitest";
import { CSV_DELIMITADOR, escaparCampoCsv, gerarCsv } from "@/lib/csv";

const BOM = "﻿";

describe("escaparCampoCsv", () => {
  it("deixa texto simples sem aspas", () => {
    expect(escaparCampoCsv("Apartamento")).toBe("Apartamento");
  });

  it("null/undefined viram célula vazia", () => {
    expect(escaparCampoCsv(null)).toBe("");
    expect(escaparCampoCsv(undefined)).toBe("");
  });

  it("números viram string", () => {
    expect(escaparCampoCsv(1500)).toBe("1500");
    expect(escaparCampoCsv(0)).toBe("0");
  });

  it("envolve em aspas quando há o delimitador", () => {
    expect(escaparCampoCsv("Rua A; 55")).toBe('"Rua A; 55"');
  });

  it("dobra as aspas internas e envolve em aspas", () => {
    expect(escaparCampoCsv('Ele disse "oi"')).toBe('"Ele disse ""oi"""');
  });

  it("envolve em aspas quando há quebra de linha", () => {
    expect(escaparCampoCsv("linha1\nlinha2")).toBe('"linha1\nlinha2"');
  });
});

describe("gerarCsv", () => {
  it("começa com BOM e usa ';' e CRLF", () => {
    const csv = gerarCsv(["A", "B"], [["1", "2"]]);
    expect(csv).toBe(`${BOM}A;B\r\n1;2`);
  });

  it("escapa células ao montar o documento", () => {
    const csv = gerarCsv(["Endereço", "Aluguel"], [["Rua A; 55", 1500]]);
    expect(csv).toBe(`${BOM}Endereço;Aluguel\r\n"Rua A; 55";1500`);
  });

  it("só o cabeçalho quando não há linhas", () => {
    expect(gerarCsv(["A", "B"], [])).toBe(`${BOM}A;B`);
  });

  it("o delimitador é ';'", () => {
    expect(CSV_DELIMITADOR).toBe(";");
  });
});
