// @vitest-environment jsdom

/* Imóvel de venda, IV-3A: o Pipeline mostra o valor certo para a finalidade.
   Regressão principal: um imóvel de venda nunca aparece com o aluguel antigo
   como preço (o smoke do IV-2 viu "R$ 0" e "R$ 1.200" no card). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { linhasValoresDrawer, ValoresImovelCompacto } from "@/components/pipeline/ValoresImovelPipeline";
import { exibicaoValoresImovel, fmtValorImovel } from "@/lib/calculo/valoresImovel";
import { ROTULO_FINALIDADE_IMOVEL } from "@/lib/constantes";
import { fmtMoney } from "@/lib/formatadores";
import type { Imovel } from "@/lib/tipos";

type Valores = Pick<Imovel, "finalidade" | "valorAluguel" | "valorVenda">;
const PIPELINE = readFileSync(resolve("components/pipeline/PipelineView.tsx"), "utf8").replace(/\r\n/g, "\n");
const MODAL = readFileSync(resolve("components/modais/ModalImovel.tsx"), "utf8");
const COMPONENTE = readFileSync(resolve("components/pipeline/ValoresImovelPipeline.tsx"), "utf8");
/** O Intl separa "R$" do número com espaço não separável; os literais dos
    testes usam o espaço comum. */
const sp = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ");

/* Os casos do smoke do IV-2 e os do checkpoint. */
const LOCACAO: Valores = { finalidade: "locacao", valorAluguel: 1500 };
const VENDA: Valores = { finalidade: "venda", valorAluguel: 0, valorVenda: 450000.55 };
const VENDA_COM_ALUGUEL_ANTIGO: Valores = { finalidade: "venda", valorAluguel: 1200, valorVenda: 500000 };
const AMBOS: Valores = { finalidade: "locacao_venda", valorAluguel: 2000, valorVenda: 300000 };
const LEGADO: Valores = { finalidade: null, valorAluguel: 1200 };

afterEach(() => cleanup());

describe("regra pura: exibicaoValoresImovel", () => {
  const valores = (i: Valores) => exibicaoValoresImovel(i).valores.map((v) => [v.tipo, v.valor]);

  it("1. locação mostra o aluguel", () => {
    expect(valores(LOCACAO)).toEqual([["aluguel", 1500]]);
    expect(exibicaoValoresImovel(LOCACAO).rotuloFinalidade).toBe("Locação");
  });
  it("2. venda mostra o valor de venda", () => {
    expect(valores(VENDA)).toEqual([["venda", 450000.55]]);
  });
  it("3. venda com aluguel antigo ignora o aluguel na apresentação", () => {
    expect(valores(VENDA_COM_ALUGUEL_ANTIGO)).toEqual([["venda", 500000]]);
  });
  it("4. locação e venda mostra os dois, aluguel antes", () => {
    expect(valores(AMBOS)).toEqual([["aluguel", 2000], ["venda", 300000]]);
    expect(exibicaoValoresImovel(AMBOS).rotuloFinalidade).toBe("Locação e venda");
  });
  it("5. sem finalidade (null ou sem a chave) mostra o aluguel e não classifica", () => {
    for (const i of [LEGADO, { valorAluguel: 1200 }]) {
      expect(valores(i)).toEqual([["aluguel", 1200]]);
      expect(exibicaoValoresImovel(i)).toMatchObject({ finalidade: null, rotuloFinalidade: null });
    }
  });
  it("6. valor de venda null é 'não informado', nunca 0", () => {
    expect(valores({ finalidade: "venda", valorAluguel: 0, valorVenda: null })).toEqual([["venda", null]]);
    expect(valores({ finalidade: "venda", valorAluguel: 0 })).toEqual([["venda", null]]);
  });
  it("7. valor de venda 0 é zero de verdade", () => {
    expect(valores({ finalidade: "venda", valorAluguel: 0, valorVenda: 0 })).toEqual([["venda", 0]]);
  });
  it("8. aluguel 0 de imóvel antigo continua 0, como hoje", () => {
    expect(valores({ finalidade: null, valorAluguel: 0 })).toEqual([["aluguel", 0]]);
  });
  it("finalidade desconhecida é tratada como sem finalidade", () => {
    expect(exibicaoValoresImovel({ finalidade: "ambos" as never, valorAluguel: 900 })).toMatchObject({ finalidade: null, valores: [{ tipo: "aluguel", valor: 900 }] });
  });
});

describe("card do Kanban e célula da lista (ValoresImovelCompacto)", () => {
  const texto = (i: Valores) => render(createElement("span", null, createElement(ValoresImovelCompacto, { imovel: i }))).container.textContent;
  const linhas = (i: Valores) =>
    [...render(createElement("span", null, createElement(ValoresImovelCompacto, { imovel: i }))).container.querySelectorAll(".valor-imovel-linha")].map((l) => l.textContent);

  it("A. locação: aluguel com rótulo", () => expect(linhas(LOCACAO)).toEqual([`Aluguel ${fmtMoney(1500)}`]));
  it("B. venda com aluguel 0 mostra a venda, não R$ 0", () => {
    expect(linhas(VENDA).map(sp)).toEqual(["Venda R$ 450.000,55"]);
    expect(texto(VENDA)).not.toContain(fmtMoney(0));
  });
  it("C. venda com aluguel antigo mostra a venda, não o aluguel antigo", () => {
    expect(linhas(VENDA_COM_ALUGUEL_ANTIGO)).toEqual([`Venda ${fmtMoney(500000)}`]);
    expect(texto(VENDA_COM_ALUGUEL_ANTIGO)).not.toContain(fmtMoney(1200));
  });
  it("D. locação e venda: as duas linhas", () => {
    expect(linhas(AMBOS)).toEqual([`Aluguel ${fmtMoney(2000)}`, `Venda ${fmtMoney(300000)}`]);
  });
  it("E. sem finalidade: exatamente o texto de antes (o aluguel, sem rótulo)", () => {
    expect(texto(LEGADO)).toBe(fmtMoney(1200));
    expect(linhas(LEGADO)).toEqual([]);
    expect(texto({ finalidade: null, valorAluguel: 0 })).toBe(fmtMoney(0));
  });
  it("venda sem valor informado mostra o traço de 'não informado'", () => {
    expect(linhas({ finalidade: "venda", valorAluguel: 0, valorVenda: null })).toEqual([`Venda ${fmtMoney(null)}`]);
  });
});

describe("painel lateral (linhasValoresDrawer)", () => {
  it("mostra a finalidade e os valores dela, explícitos", () => {
    expect(linhasValoresDrawer(LOCACAO)).toEqual([
      { label: "Finalidade", value: "Locação" },
      { label: "Valor do aluguel", value: fmtMoney(1500) },
    ]);
    expect(linhasValoresDrawer(AMBOS)).toEqual([
      { label: "Finalidade", value: "Locação e venda" },
      { label: "Valor do aluguel", value: fmtMoney(2000) },
      { label: "Valor de venda", value: fmtMoney(300000) },
    ]);
  });
  it("venda com aluguel antigo: só o valor de venda", () => {
    const linhas = linhasValoresDrawer(VENDA_COM_ALUGUEL_ANTIGO);
    expect(linhas).toEqual([
      { label: "Finalidade", value: "Venda" },
      { label: "Valor de venda", value: fmtMoney(500000) },
    ]);
    expect(linhas.map((l) => l.value)).not.toContain(fmtMoney(1200));
  });
  it("sem finalidade: 'Não informado' e o 'Valor' de antes (o aluguel)", () => {
    expect(linhasValoresDrawer(LEGADO)).toEqual([
      { label: "Finalidade", value: "Não informado" },
      { label: "Valor", value: fmtMoney(1200) },
    ]);
  });
});

describe("IV-3A.2: centavos só quando existem (fmtValorImovel)", () => {
  const f = (v: number | null | undefined) => sp(fmtValorImovel(v));

  it("A. 500000 → R$ 500.000", () => expect(f(500000)).toBe("R$ 500.000"));
  it("B. 450000.55 → R$ 450.000,55, nunca R$ 450.001", () => {
    expect(f(450000.55)).toBe("R$ 450.000,55");
    expect(f(450000.55)).not.toBe("R$ 450.001");
  });
  it("C. 1500.5 → R$ 1.500,50", () => expect(f(1500.5)).toBe("R$ 1.500,50"));
  it("D. 0 → R$ 0 (zero é valor, não 'não informado')", () => expect(f(0)).toBe("R$ 0"));
  it("E. null e ausente → —", () => {
    expect(f(null)).toBe("—");
    expect(f(undefined)).toBe("—");
  });
  it("1500 continua R$ 1.500, sem ',00'", () => expect(f(1500)).toBe("R$ 1.500"));
  it("resíduo de ponto flutuante abaixo do centavo não vira ',00'", () => {
    expect(f(1500.004)).toBe("R$ 1.500");
    expect(f(0.1 + 0.2)).toBe("R$ 0,30");
  });

  it("F. locação e venda com um inteiro e um decimal: cada um no seu formato", () => {
    const imovel: Valores = { finalidade: "locacao_venda", valorAluguel: 2000, valorVenda: 450000.55 };
    expect(exibicaoValoresImovel(imovel).valores.map((v) => sp(v.texto))).toEqual(["R$ 2.000", "R$ 450.000,55"]);
    const { container } = render(createElement("span", null, createElement(ValoresImovelCompacto, { imovel })));
    expect([...container.querySelectorAll(".valor-imovel-linha")].map((l) => sp(l.textContent))).toEqual([
      "Aluguel R$ 2.000",
      "Venda R$ 450.000,55",
    ]);
  });

  it("depende do valor, não da finalidade: aluguel com centavos também os mostra", () => {
    expect(exibicaoValoresImovel({ finalidade: "locacao", valorAluguel: 1500.5 }).valores.map((v) => sp(v.texto))).toEqual([
      "R$ 1.500,50",
    ]);
    expect(sp(linhasValoresDrawer({ finalidade: null, valorAluguel: 1500.5 })[1].value)).toBe("R$ 1.500,50");
  });

  it("card, lista e painel mostram o mesmo texto para 450000.55", () => {
    const { container } = render(createElement("span", null, createElement(ValoresImovelCompacto, { imovel: VENDA })));
    // card e lista são o mesmo componente; o painel vem de linhasValoresDrawer
    expect(sp(container.textContent)).toBe("Venda R$ 450.000,55");
    expect(linhasValoresDrawer(VENDA).map((l) => ({ ...l, value: sp(l.value) }))).toEqual([
      { label: "Finalidade", value: "Venda" },
      { label: "Valor de venda", value: "R$ 450.000,55" },
    ]);
  });

  it("os componentes não formatam por conta própria: o texto vem do helper", () => {
    expect(COMPONENTE).not.toMatch(/fmtMoney|fmtMoneyFull|Number\.isInteger/);
    expect(COMPONENTE).toContain("v.texto");
  });
});

describe("as três superfícies usam a mesma regra", () => {
  it("o PipelineView não mostra mais valorAluguel direto em lugar nenhum", () => {
    expect(PIPELINE).not.toMatch(/fmtMoney\(\s*(i|imovel)\.valorAluguel\s*\)/);
    expect(PIPELINE.match(/<ValoresImovelCompacto imovel=\{i\} \/>/g)).toHaveLength(2); // card e lista
    expect(PIPELINE).toContain("linhasValoresDrawer(imovel).map(");
    expect(PIPELINE).toContain('<th className="col-aluguel">Valor</th>');
  });
  it("o cadastro e o Pipeline usam os mesmos rótulos", () => {
    expect(ROTULO_FINALIDADE_IMOVEL).toEqual({ locacao: "Locação", venda: "Venda", locacao_venda: "Locação e venda" });
    expect(MODAL).toContain("ROTULO_FINALIDADE_IMOVEL[f]");
    expect(MODAL).not.toMatch(/const ROTULO_FINALIDADE\b/);
  });
});
