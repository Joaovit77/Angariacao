import { describe, expect, it } from "vitest";
import {
  resumirPendenciasRadar,
  type BuscaRadar,
  type CandidatoPendenteRadar,
} from "@/lib/calculo/radarAngariacao";
import type { Imovel } from "@/lib/tipos";

const buscas: Array<Pick<BuscaRadar, "id" | "filtros">> = [
  { id: "busca-olx", filtros: { portal: "olx", cidade: "Londrina", estado: "PR" } },
  { id: "busca-chaves", filtros: { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", tipo: "Casa" } },
];

function candidato(id: string, parcial: Partial<CandidatoPendenteRadar["anuncio"]> = {}, buscaId = "busca-olx"): CandidatoPendenteRadar {
  return {
    id,
    buscaId,
    anuncio: {
      portal: buscaId === "busca-chaves" ? "chaves-na-mao" : "olx",
      idExterno: `ext-${id}`,
      url: `https://pr.olx.com.br/imoveis/anuncio-${id}`,
      titulo: "Alugo apartamento",
      descricao: null,
      endereco: null,
      cidade: "Londrina",
      estado: null,
      ...parcial,
    },
  };
}

const imovel = (parcial: Partial<Imovel>): Imovel => ({
  id: "imovel-1",
  endereco: "",
  cidade: "Londrina",
  status: "Novo contato",
  ...parcial,
});

describe("pendências do Radar: regra única de tela e monitor (R4)", () => {
  it("anúncio nunca aberto e fora do pipeline conta", () => {
    const resumo = resumirPendenciasRadar([candidato("a1")], buscas, []);
    expect(resumo.total).toBe(1);
    expect([...resumo.ids]).toEqual(["a1"]);
  });

  it("aberto não é candidato: sem candidato, nada conta", () => {
    // A exclusão do visualizado acontece na RPC; a regra só conta o que recebe.
    expect(resumirPendenciasRadar([], buscas, []).total).toBe(0);
  });

  it("anúncio cuja URL já está no texto de um imóvel não conta (url-na-carteira)", () => {
    const pipeline = imovel({ textoAnuncio: "Link original: https://pr.olx.com.br/imoveis/anuncio-a1?utm=x" });
    expect(resumirPendenciasRadar([candidato("a1"), candidato("a2")], buscas, [pipeline]).total).toBe(1);
  });

  it("casa com o mesmo endereço numerado de um imóvel não conta (casa-no-pipeline)", () => {
    const casa = candidato("c1", {
      titulo: "Casa com 3 quartos para alugar",
      endereco: "Rua João Wanderley, 72",
    }, "busca-chaves");
    const pipeline = imovel({ endereco: "Rua João Wanderley, 72", tipo: "Casa" });
    expect(resumirPendenciasRadar([casa], buscas, [pipeline]).total).toBe(0);
    expect(resumirPendenciasRadar([casa], buscas, []).total).toBe(1);
  });

  it("apartamento no mesmo endereço continua contando, como continua visível na lista", () => {
    const apto = candidato("p1", { titulo: "Apartamento 2 quartos", endereco: "Rua Pará, 100" }, "busca-chaves");
    const pipeline = imovel({ endereco: "Rua Pará, 100", unidade: "12" });
    expect(resumirPendenciasRadar([apto], buscas, [pipeline]).total).toBe(1);
  });

  it("anúncio fora do mercado da busca ou de busca inexistente não conta", () => {
    const resumo = resumirPendenciasRadar([
      candidato("m1", { cidade: "Cambé" }),
      candidato("m2", {}, "busca-apagada"),
      candidato("m3"),
    ], buscas, []);
    expect(resumo.total).toBe(1);
  });

  it("recém-chegado incrementa", () => {
    const antes = resumirPendenciasRadar([candidato("n1")], buscas, []);
    const depois = resumirPendenciasRadar([candidato("n1"), candidato("n2")], buscas, []);
    expect(depois.total).toBe(antes.total + 1);
  });

  it("não depende da janela de 120: 150 candidatos contam 150", () => {
    const muitos = Array.from({ length: 150 }, (_, i) => candidato(`x${i}`));
    expect(resumirPendenciasRadar(muitos, buscas, []).total).toBe(150);
  });

  it("OLX e Chaves na Mão usam a mesma regra e são separados por busca", () => {
    const resumo = resumirPendenciasRadar([
      candidato("o1"),
      candidato("o2"),
      candidato("k1", { titulo: "Casa para alugar" }, "busca-chaves"),
    ], buscas, []);
    expect(resumo.total).toBe(3);
    expect(resumo.porBusca.get("busca-olx")).toBe(2);
    expect(resumo.porBusca.get("busca-chaves")).toBe(1);
  });

  it("mesmas entradas produzem o mesmo número (tela e monitor chamam esta função)", () => {
    const entrada = [candidato("s1"), candidato("s2", { cidade: "Cambé" })];
    expect(resumirPendenciasRadar(entrada, buscas, []).total)
      .toBe(resumirPendenciasRadar(entrada, buscas, []).total);
  });
});
