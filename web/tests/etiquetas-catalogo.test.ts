import { describe, expect, it } from "vitest";
import {
  CATALOGO_ETIQUETAS,
  CATEGORIAS_ETIQUETAS,
  CATEGORIAS_ETIQUETAS_CLASSIFICADAS,
  VERSAO_CATALOGO_ETIQUETAS,
  etiquetaValida,
  etiquetasClassificaveisDoCatalogo,
  obterEtiquetaCatalogo,
} from "@/lib/calculo/catalogoEtiquetas";

describe("catálogo fechado de etiquetas do Garimpo em Campo", () => {
  it("tem cinco categorias, códigos únicos e versão inteira", () => {
    expect(CATEGORIAS_ETIQUETAS).toEqual([
      "estado-visual",
      "sinal-de-prospeccao",
      "localizacao",
      "qualidade-do-dado",
      "historico",
    ]);
    const codigos = Object.values(CATALOGO_ETIQUETAS).flat().map((item) => item.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(Number.isInteger(VERSAO_CATALOGO_ETIQUETAS)).toBe(true);
    expect(VERSAO_CATALOGO_ETIQUETAS).toBeGreaterThan(0);
  });

  it("gera do próprio catálogo os enums que a classificação usará", () => {
    const porCategoria = Object.groupBy(
      etiquetasClassificaveisDoCatalogo(),
      (etiqueta) => etiqueta.categoria,
    );
    expect(Object.keys(porCategoria)).toEqual([...CATEGORIAS_ETIQUETAS_CLASSIFICADAS]);
    expect(porCategoria["estado-visual"]?.map((item) => item.codigo))
      .toEqual(CATALOGO_ETIQUETAS["estado-visual"].map((item) => item.codigo));
    expect(porCategoria["sinal-de-prospeccao"]?.map((item) => item.codigo))
      .toEqual(CATALOGO_ETIQUETAS["sinal-de-prospeccao"].map((item) => item.codigo));
  });

  it("normaliza caixa e acento, mas rejeita categoria e código inventados", () => {
    expect(etiquetaValida("SINAL-DE-PROSPECÇÃO", "PLACA-DE-IMOBILIÁRIA")).toBe(true);
    expect(obterEtiquetaCatalogo("estado-visual", "aparenta-vago")?.codigo).toBe("aparenta-vago");
    expect(etiquetaValida("tipo", "apartamento")).toBe(false);
    expect(etiquetaValida("historico", "prioridade-alta")).toBe(false);
  });

  it("só exige evidência explícita numa afirmação negativa declarada", () => {
    const todas = Object.values(CATALOGO_ETIQUETAS).flat();
    const exigentes = todas.filter((item) => "exigeEvidenciaExplicita" in item
      && item.exigeEvidenciaExplicita);
    expect(exigentes.map((item) => item.codigo)).toEqual(["sem-placa-visivel"]);
    expect(exigentes.every((item) => "afirmacaoNegativa" in item && item.afirmacaoNegativa)).toBe(true);
  });
});
