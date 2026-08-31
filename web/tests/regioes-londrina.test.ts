import { describe, expect, it } from "vitest";
import {
  planejarColetaPorZonasLondrina,
  normalizarRegiaoLondrina,
  regiaoDeBairroLondrina,
  regiaoPorCoordenadasLondrina,
  REGIOES_COLETA_LONDRINA,
  REGIOES_LONDRINA,
} from "@/lib/calculo/regioesLondrina";

describe("planejamento de coleta por regiões de Londrina", () => {
  it("mantém os bairros oficiais separados nas cinco regiões", () => {
    expect(Object.keys(REGIOES_LONDRINA)).toEqual([
      "Zona Central", "Zona Sul", "Zona Leste", "Zona Oeste", "Zona Norte",
    ]);
    expect(REGIOES_LONDRINA["Zona Central"]).toHaveLength(10);
    expect(REGIOES_LONDRINA["Zona Sul"]).toHaveLength(13);
    expect(REGIOES_LONDRINA["Zona Leste"]).toHaveLength(12);
    expect(REGIOES_LONDRINA["Zona Oeste"]).toHaveLength(12);
    expect(REGIOES_LONDRINA["Zona Norte"]).toHaveLength(19);
  });

  it("gera exatamente 25 consultas únicas por zona e 100 no total", () => {
    const plano = planejarColetaPorZonasLondrina(25);
    expect(plano).toHaveLength(100);
    for (const regiao of REGIOES_COLETA_LONDRINA) {
      expect(plano.filter((item) => item.regiao === regiao)).toHaveLength(25);
    }
    expect(new Set(plano.map((item) => `${item.regiao}:${item.portal}:${item.bairro}`)).size)
      .toBe(100);
    expect(plano.slice(0, 13).every((item) => item.portal === "chaves-na-mao"))
      .toBe(true);
  });

  it("recusa limites que extrapolam as combinações únicas disponíveis", () => {
    expect(() => planejarColetaPorZonasLondrina(37)).toThrow(/Zona Leste/);
  });

  it("resolve a zona pelo bairro mesmo sem acento ou com variação de caixa", () => {
    expect(regiaoDeBairroLondrina("bela suica")).toBe("Zona Sul");
    expect(regiaoDeBairroLondrina("  LINDÓIA ")).toBe("Zona Leste");
    expect(regiaoDeBairroLondrina("Palhano 2")).toBe("Zona Oeste");
    expect(regiaoDeBairroLondrina("Vivi Xavier")).toBe("Zona Norte");
    expect(regiaoDeBairroLondrina("Centro")).toBe("Zona Central");
    expect(regiaoDeBairroLondrina("Jardim Higienópolis")).toBe("Zona Central");
  });

  it("normaliza região e resolve localmente as coordenadas pelos polígonos do SIGLON", () => {
    expect(normalizarRegiaoLondrina("Norte 2")).toBe("Zona Norte");
    expect(normalizarRegiaoLondrina("Central")).toBe("Zona Central");
    expect(regiaoPorCoordenadasLondrina(-23.2778414, -51.188041)).toBe("Zona Norte");
    expect(regiaoPorCoordenadasLondrina(null, null)).toBeNull();
  });
});
