import { describe, expect, it } from "vitest";
import { validarEtiquetasClassificadas } from "@/lib/calculo/etiquetasProspeccao";

const semPlaca = (evidencia?: string) => ({
  categoria: "sinal-de-prospeccao",
  codigo: "sem-placa-visivel",
  confianca: 90,
  evidencia,
});

describe("evidência explícita e ausência", () => {
  it("não transforma falta de menção em ausência observada", () => {
    const resultado = validarEtiquetasClassificadas(
      [semPlaca()],
      "Casa fechada, jardim alto.",
    );
    expect(resultado.etiquetas).toEqual([]);
    expect(resultado.contadores.semEvidencia).toBe(1);
  });

  it("aceita a afirmação negativa quando o trecho está literalmente na observação", () => {
    const resultado = validarEtiquetasClassificadas(
      [semPlaca("não havia placa")],
      "Na visita, NÃO HAVIA PLACA visível.",
    );
    expect(resultado.etiquetas.map((item) => item.codigo)).toEqual(["sem-placa-visivel"]);
  });

  it("rejeita evidência inventada e conta o descarte", () => {
    const resultado = validarEtiquetasClassificadas(
      [semPlaca("não havia placa")],
      "Casa fechada, jardim alto.",
    );
    expect(resultado.etiquetas).toEqual([]);
    expect(resultado.contadores.semEvidencia).toBe(1);
  });

  it("não exige evidência para código positivo e fecha catálogo e piso", () => {
    const resultado = validarEtiquetasClassificadas([
      { categoria: "estado-visual", codigo: "aparenta-vago", confianca: 85 },
      { categoria: "estado-visual", codigo: "aparenta-ocupado", confianca: 69 },
      { categoria: "estado-visual", codigo: "codigo-inventado", confianca: 99 },
    ], "Fachada observada.");
    expect(resultado.etiquetas.map((item) => item.codigo)).toEqual(["aparenta-vago"]);
    expect(resultado.contadores).toMatchObject({
      sugeridas: 3,
      aplicadas: 1,
      abaixoDoPiso: 1,
      foraDoCatalogo: 1,
    });
  });
});
