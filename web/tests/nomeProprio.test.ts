/* Caixa de nome próprio (lib/normalizacao.nomeProprio).
   Nome colado de portal/contrato vem em CAIXA ALTA e vaza para a saudação das
   mensagens ("Olá, JOÃO DA SILVA!"). Os testes fixam as duas decisões que
   fazem a função valer a pena: as partículas do nome brasileiro e o respeito
   à caixa mista. */
import { describe, expect, it } from "vitest";
import { nomeProprio } from "@/lib/normalizacao";

describe("nomeProprio", () => {
  it("converte CAIXA ALTA em nome próprio", () => {
    expect(nomeProprio("JOÃO VITOR PINTO")).toBe("João Vitor Pinto");
    expect(nomeProprio("MARIA")).toBe("Maria");
  });

  it("converte tudo minúsculo também — a caixa ali também não informa nada", () => {
    expect(nomeProprio("joão vitor pinto")).toBe("João Vitor Pinto");
  });

  it("mantém as partículas em minúsculas no meio do nome", () => {
    expect(nomeProprio("JOÃO DA SILVA")).toBe("João da Silva");
    expect(nomeProprio("MARIA DOS SANTOS DE OLIVEIRA")).toBe("Maria dos Santos de Oliveira");
    expect(nomeProprio("SILVA E FILHOS")).toBe("Silva e Filhos");
  });

  it("capitaliza a partícula quando ela ABRE o nome", () => {
    expect(nomeProprio("DA SILVA IMÓVEIS")).toBe("Da Silva Imóveis");
  });

  it("não toca em caixa mista — ali a caixa é escolha de quem digitou", () => {
    expect(nomeProprio("Maria McDonald")).toBe("Maria McDonald");
    expect(nomeProprio("Imóveis MEI")).toBe("Imóveis MEI");
    // Inclusive quando está "errado": corrigir seria adivinhar.
    expect(nomeProprio("joão Da SILVA")).toBe("joão Da SILVA");
  });

  it("é idempotente: rodar de novo não estraga o resultado", () => {
    const uma = nomeProprio("JOÃO DA SILVA");
    expect(nomeProprio(uma)).toBe(uma);
  });

  it("capitaliza depois de hífen e apóstrofo", () => {
    expect(nomeProprio("ANA-MARIA D'ÁVILA")).toBe("Ana-Maria D'Ávila");
    expect(nomeProprio("O'BRIEN")).toBe("O'Brien");
  });

  it("preserva iniciais abreviadas", () => {
    expect(nomeProprio("J. P. SILVA")).toBe("J. P. Silva");
    expect(nomeProprio("ANA C SOUZA")).toBe("Ana C Souza");
  });

  it("colapsa espaços e apara as pontas, como o resto do módulo", () => {
    expect(nomeProprio("  JOÃO   DA  SILVA  ")).toBe("João da Silva");
  });

  it("aceita vazio e nulo sem reclamar", () => {
    expect(nomeProprio("")).toBe("");
    expect(nomeProprio(null)).toBe("");
    expect(nomeProprio(undefined)).toBe("");
  });
});
