/* Detecção de imóvel já cadastrado (pós-migração, sem oráculo do app antigo).
   O contrato: o endereço identifica o imóvel apesar da grafia, mas a unidade
   separa dois imóveis no mesmo prédio. */
import { describe, it, expect } from "vitest";
import { descreverDuplicados, imoveisDuplicados } from "@/lib/calculo/duplicidade";
import type { Imovel } from "@/lib/tipos";

const imovel = (p: Partial<Imovel>): Imovel =>
  ({ id: "x", endereco: "", status: "Novo contato", ...p }) as Imovel;

const base = [
  imovel({ id: "a", codigo: "LD-01", endereco: "Rua Souza Naves, 100", cidade: "Londrina" }),
  imovel({ id: "b", codigo: "LD-02", endereco: "Av. Higienópolis, 500", cidade: "Londrina", unidade: "101", bloco: "A" }),
];

describe("imoveisDuplicados", () => {
  it("acha o mesmo endereço escrito de outro jeito", () => {
    const achados = imoveisDuplicados({ endereco: "r souza naves 100", cidade: "londrina" }, base);
    expect(achados.map((i) => i.id)).toEqual(["a"]);
  });

  it("cidade diferente não é duplicata", () => {
    expect(imoveisDuplicados({ endereco: "Rua Souza Naves, 100", cidade: "Maringá" }, base)).toEqual([]);
  });

  it("mesmo prédio, unidade diferente NÃO é duplicata", () => {
    const achados = imoveisDuplicados(
      { endereco: "Av. Higienópolis, 500", cidade: "Londrina", unidade: "202", bloco: "A" },
      base,
    );
    expect(achados).toEqual([]);
  });

  it("mesmo prédio e mesma unidade É duplicata", () => {
    const achados = imoveisDuplicados(
      { endereco: "avenida higienopolis 500", cidade: "Londrina", unidade: "101", bloco: "a" },
      base,
    );
    expect(achados.map((i) => i.id)).toEqual(["b"]);
  });

  it("na edição, o próprio imóvel não conta como duplicata", () => {
    expect(imoveisDuplicados({ endereco: "Rua Souza Naves, 100", cidade: "Londrina" }, base, "a")).toEqual([]);
  });

  it("sem endereço não afirma duplicata", () => {
    expect(imoveisDuplicados({ endereco: "  ", cidade: "Londrina" }, base)).toEqual([]);
  });
});

describe("descreverDuplicados", () => {
  it("nomeia o imóvel repetido e o status", () => {
    expect(descreverDuplicados([base[0]])).toBe(
      'Este endereço já está cadastrado em LD-01 — status "Novo contato".',
    );
  });
  it("sem duplicados, texto vazio", () => expect(descreverDuplicados([])).toBe(""));
});
