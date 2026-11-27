import { describe, expect, it } from "vitest";
import {
  avaliarImovel,
  calcularSimilaridade,
  entradaDeImovel,
  internalComparablesProvider,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";
import { mapearComparaveisMercado } from "@/lib/persistencia/comparaveisMercado";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import type { Imovel } from "@/lib/tipos";
import dbJson from "./fixtures-db.json";

const HOJE = "2026-11-27";
const linhaBase = (dbJson.imoveisRows as unknown as DbImovelRow[])[0];

describe("Área útil e Área total — mapeadores de Imóvel", () => {
  it("lê e grava area_util_m2 e area_total_m2 preservando compatibilidade retroativa", () => {
    const semColunas = fromDbImovel(linhaBase);
    expect(Object.hasOwn(semColunas, "areaUtilM2")).toBe(false);
    expect(Object.hasOwn(semColunas, "areaTotalM2")).toBe(false);

    const comAreas = fromDbImovel({
      ...linhaBase,
      area_util_m2: "120.5",
      area_total_m2: 280,
    });
    expect(comAreas.areaUtilM2).toBe(120.5);
    expect(comAreas.areaTotalM2).toBe(280);

    const invalidos = fromDbImovel({
      ...linhaBase,
      area_util_m2: 0,
      area_total_m2: -10,
    });
    expect(invalidos.areaUtilM2).toBeNull();
    expect(invalidos.areaTotalM2).toBeNull();

    const paraBanco = toDbImovel(comAreas, "user-1");
    expect(paraBanco.area_util_m2).toBe(120.5);
    expect(paraBanco.area_total_m2).toBe(280);

    const paraBancoSemAreas = toDbImovel(semColunas, "user-1") as Record<string, unknown>;
    expect(Object.hasOwn(paraBancoSemAreas, "area_util_m2")).toBe(false);
    expect(Object.hasOwn(paraBancoSemAreas, "area_total_m2")).toBe(false);
  });
});

describe("Área útil e Área total — motor de Avaliação e comparáveis", () => {
  const casaAlvo: EntradaAvaliacao = {
    imovelId: "casa-alvo",
    finalidade: "locacao",
    endereco: "Rua das Palmeiras, 200",
    bairro: "Gleba Palhano",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Casa",
    areaM2: 120,
    areaTotalM2: 300,
    baseArea: "util",
    quartos: 3,
    banheiros: 2,
    vagas: 2,
    conservacao: "Bom",
  };

  function casaComparavel(id: string, parcial: Partial<ComparavelAvaliacao> = {}): ComparavelAvaliacao {
    return {
      origem: "externo",
      id,
      endereco: "Rua das Palmeiras, 210",
      bairro: "Gleba Palhano",
      cidade: "Londrina",
      estado: "PR",
      tipo: "Casa",
      areaM2: 120,
      areaTotalM2: 300,
      quartos: 3,
      banheiros: 2,
      vagas: 2,
      conservacao: "Bom",
      valorAnunciado: 4500,
      dataInformacao: "2026-11-10",
      status: "Anunciado",
      ...parcial,
    };
  }

  it("entradaDeImovel e comparáveis internos usam areaUtilM2 cadastrada e expõem areaTotalM2", async () => {
    const imovel: Imovel = {
      id: "im-1",
      endereco: "Rua A, 100",
      bairro: "Centro",
      cidade: "Londrina",
      estado: "PR",
      tipo: "Casa",
      quartos: 3,
      banheiros: 2,
      vagas: 2,
      areaUtilM2: 145,
      areaTotalM2: 360,
      valorAluguel: 3800,
      status: "Publicado",
      textoAnuncio: "Casa com 99 m² no texto antigo",
    };

    const entrada = entradaDeImovel(imovel, "locacao");
    expect(entrada.areaM2).toBe(145);
    expect(entrada.areaTotalM2).toBe(360);

    const internos = await internalComparablesProvider.buscar(casaAlvo, { imoveis: [imovel] });
    expect(internos[0].areaM2).toBe(145);
    expect(internos[0].areaTotalM2).toBe(360);
  });

  it("na base útil (padrão), área total semelhante aumenta similaridade entre casas com mesma área útil", () => {
    const terrenoCompativel = calcularSimilaridade(casaAlvo, casaComparavel("c1", { areaTotalM2: 310 }), HOJE);
    const terrenoDistante = calcularSimilaridade(casaAlvo, casaComparavel("c2", { areaTotalM2: 750 }), HOJE);

    expect(terrenoCompativel.componentes.area).toBeGreaterThan(terrenoDistante.componentes.area);
    expect(terrenoCompativel.similaridadeEstrutural).toBeGreaterThan(terrenoDistante.similaridadeEstrutural);
  });

  it("na base total, calcula R$/m² e porte usando areaTotalM2 e marca baseAreaAplicada='total'", () => {
    const entradaTotal: EntradaAvaliacao = {
      ...casaAlvo,
      baseArea: "total",
      areaTotalM2: 300,
    };
    const resultado = avaliarImovel(entradaTotal, [
      casaComparavel("t1", { areaM2: 110, areaTotalM2: 300, valorAnunciado: 4500 }),
      casaComparavel("t2", { areaM2: 130, areaTotalM2: 300, valorAnunciado: 4800 }),
      casaComparavel("t3", { areaM2: 120, areaTotalM2: 300, valorAnunciado: 4200 }),
    ], HOJE);

    expect(resultado.situacao).toBe("calculada");
    expect(resultado.metodologia.baseAreaAplicada).toBe("total");
    // R$ 4500 / 300 m² = R$ 15/m² (e não 4500 / 120 = 38/m²).
    expect(resultado.metodologia.medianaValorM2).toBe(15);
    expect(resultado.explicacao.some((linha) => linha.includes("área total"))).toBe(true);
  });

  it("mapearComparaveisMercado preserva area_privativa_m2 e area_total_m2", () => {
    const mapeados = mapearComparaveisMercado([{
      id: "cmp-1",
      portal: "olx",
      id_externo: "ext-1",
      url: "https://olx.com.br/imovel/1",
      titulo: "Casa ampla",
      tipo: "Casa",
      endereco: "Rua B, 50",
      bairro: "Centro",
      cidade: "Londrina",
      estado: "PR",
      area_m2: 120,
      area_privativa_m2: 125,
      area_total_m2: 320,
      quartos: 3,
      banheiros: 2,
      vagas: 2,
      valor_anunciado: 4000,
      publicado_em: "2026-11-20T00:00:00Z",
      ultimo_visto_em: "2026-11-25T00:00:00Z",
    }]);

    expect(mapeados[0].areaM2).toBe(125);
    expect(mapeados[0].areaTotalM2).toBe(320);
  });
});
