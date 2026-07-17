import { describe, it, expect } from "vitest";
import {
  chaveNormalizada,
  canonizarValor,
  distintosCanonizados,
  valorMaisUsado,
} from "@/lib/normalizacao";

describe("chaveNormalizada", () => {
  it("ignora acento, caixa e espaços extras", () => {
    expect(chaveNormalizada("  Imóbiliária  Silva ")).toBe("imobiliaria silva");
    expect(chaveNormalizada("IMOBILIARIA SILVA")).toBe("imobiliaria silva");
  });

  it("vazio/nulo vira string vazia", () => {
    expect(chaveNormalizada("   ")).toBe("");
    expect(chaveNormalizada(null)).toBe("");
    expect(chaveNormalizada(undefined)).toBe("");
  });
});

describe("canonizarValor", () => {
  it("adota a grafia já existente quando a chave casa", () => {
    expect(canonizarValor("imobiliaria silva", ["Imobiliária Silva"])).toBe("Imobiliária Silva");
    expect(canonizarValor("  joão  ", ["João"])).toBe("João");
  });

  it("escolhe a grafia mais frequente entre as variações existentes", () => {
    const existentes = ["Imob Prime", "Imob Prime", "imob prime"];
    expect(canonizarValor("IMOB PRIME", existentes)).toBe("Imob Prime");
  });

  it("sem correspondência, só limpa o próprio valor", () => {
    expect(canonizarValor("  Nova  Imob ", ["Outra Imob"])).toBe("Nova Imob");
  });

  it("valor vazio continua vazio", () => {
    expect(canonizarValor("  ", ["Imob Silva"])).toBe("");
  });
});

describe("distintosCanonizados", () => {
  it("colapsa variações em uma só grafia (a dominante) e ordena", () => {
    const valores = ["Imobiliária Silva", "imobiliaria silva", "Imobiliária  Silva", "Alfa Imóveis"];
    expect(distintosCanonizados(valores)).toEqual(["Alfa Imóveis", "Imobiliária Silva"]);
  });

  it("ignora vazios e nulos", () => {
    expect(distintosCanonizados(["", null, "  ", "Beta"])).toEqual(["Beta"]);
  });
});

describe("valorMaisUsado", () => {
  it("devolve o mais frequente, ignorando vazios", () => {
    expect(valorMaisUsado(["João Vitor", "Maria", "João Vitor", null, ""])).toBe("João Vitor");
  });

  it("agrupa variações da mesma grafia e devolve a dominante", () => {
    // "joao vitor" (2x) + "João Vitor" (1x) = 3 do mesmo captador, contra 2 de
    // Maria — e sai na grafia mais usada do grupo, não na primeira vista.
    const valores = ["Maria", "joao vitor", "João Vitor", "Maria", "joao vitor"];
    expect(valorMaisUsado(valores)).toBe("joao vitor");
  });

  it("sem nenhum valor, devolve vazio", () => {
    expect(valorMaisUsado([])).toBe("");
    expect(valorMaisUsado([null, "  ", undefined])).toBe("");
  });
});
