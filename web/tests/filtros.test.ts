/* Testes de caracterização — filtros do pipeline (Etapa 2).
   Cada cenário replica exatamente uma combinação de globals do app
   antigo (pipelineFilters/pipelineViewMode/pipelineColFilters) e
   compara com a saída real capturada no oráculo. */
import { describe, it, expect } from "vitest";
import {
  filtrarImoveis, filtrosPipelineVazios, ordenarPipelineLista, pipelineColFiltersVazios,
  pipelineColDistinct, pipelineUniqueSorted,
  type FiltrosPipeline, type PipelineColFilters, type PipelineViewMode,
} from "@/lib/calculo/filtros";
import type { Imovel } from "@/lib/tipos";
import fixturesJson from "./fixtures.json";
import oracle from "./oracle-expected.json";

const imoveis = fixturesJson.imoveis as unknown as Imovel[];

function cenario(
  filters: Partial<FiltrosPipeline> = {},
  mode: PipelineViewMode = "lista",
  colFilters: Partial<PipelineColFilters> = {},
): string[] {
  return filtrarImoveis(
    imoveis,
    { ...filtrosPipelineVazios(), ...filters },
    mode,
    { ...pipelineColFiltersVazios(), ...colFilters },
  ).map((i) => i.id);
}

describe("filtrarImoveis (port de filteredImoveisEnhanced)", () => {
  it("sem filtros retorna tudo", () => expect(cenario()).toEqual(oracle.filtros.semFiltro_lista));
  it("busca alcança a cidade", () => expect(cenario({ search: "osasco" })).toEqual(oracle.filtros.busca_cidade_osasco));
  it("busca alcança o telefone", () => expect(cenario({ search: "98888-0002" })).toEqual(oracle.filtros.busca_telefone));
  it("busca ignora espaços nas pontas", () => expect(cenario({ search: "  Haddock  " })).toEqual(oracle.filtros.busca_com_espacos));
  it("filtro de tipo", () => expect(cenario({ tipo: "Apartamento" })).toEqual(oracle.filtros.tipo_apartamento));
  it("filtro de cidade", () => expect(cenario({ cidade: "Osasco" })).toEqual(oracle.filtros.cidade_osasco));
  it("filtro de status", () => expect(cenario({ status: "Locado" })).toEqual(oracle.filtros.status_locado));
  it("filtro de captador", () => expect(cenario({ responsavel: "Maria" })).toEqual(oracle.filtros.responsavel_maria));
  it("busca + tipo combinados (AND)", () => expect(cenario({ search: "rua", tipo: "Casa" })).toEqual(oracle.filtros.busca_e_tipo));
});

describe("filtros de coluna (estilo Explorer)", () => {
  it("'(vazio)' seleciona bairros null/'' na Lista", () => {
    expect(cenario({}, "lista", { bairro: [""] })).toEqual(oracle.filtros.col_bairro_vazio_lista);
  });
  it("valor único na Lista", () => {
    expect(cenario({}, "lista", { bairro: ["Pinheiros"] })).toEqual(oracle.filtros.col_bairro_pinheiros_lista);
  });
  it("no Kanban os filtros de coluna são IGNORADOS", () => {
    expect(cenario({}, "kanban", { bairro: ["Pinheiros"] })).toEqual(oracle.filtros.col_bairro_pinheiros_kanban);
  });
  it("OR dentro da coluna, AND entre colunas", () => {
    expect(cenario({}, "lista", { bairro: ["Pinheiros", "Lapa"], captador: ["João"] })).toEqual(oracle.filtros.col_combinado_lista);
  });
});

describe("pipelineColDistinct / pipelineUniqueSorted", () => {
  it("valores distintos por coluna, com '' para vazios, ordenação pt-BR", () => {
    expect(pipelineColDistinct(imoveis, "bairro")).toEqual(oracle.pipelineColDistinct.bairro);
    expect(pipelineColDistinct(imoveis, "captador")).toEqual(oracle.pipelineColDistinct.captador);
  });
  it("uniqueSorted apara espaços, remove vazios/duplicatas e ordena pt-BR", () => {
    expect(pipelineUniqueSorted(imoveis.map((i) => i.bairro))).toEqual(oracle.pipelineUniqueSorted.bairros);
    expect(pipelineUniqueSorted([" a", "a ", "", null, "B", "á"])).toEqual(oracle.pipelineUniqueSorted.comEspacosEDuplicatas);
  });
});

describe("ordenarPipelineLista — ordenação por código (pós-migração)", () => {
  const codigos = (arr: Imovel[]) => arr.map((i) => i.codigo);

  it("crescente por código (A→Z, pt-BR)", () => {
    const asc = codigos(ordenarPipelineLista(imoveis, { key: "codigo", dir: "asc" }));
    const esperado = [...codigos(imoveis)].sort((a, b) => (a || "").localeCompare(b || "", "pt-BR"));
    expect(asc).toEqual(esperado);
  });

  it("decrescente é o inverso do crescente", () => {
    const asc = codigos(ordenarPipelineLista(imoveis, { key: "codigo", dir: "asc" }));
    const desc = codigos(ordenarPipelineLista(imoveis, { key: "codigo", dir: "desc" }));
    expect(desc).toEqual([...asc].reverse());
  });

  it("sem sort ativo mantém o padrão (mais recentes por data de cadastro)", () => {
    const padrao = codigos(ordenarPipelineLista(imoveis, { key: null, dir: null }));
    const esperado = codigos([...imoveis].sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || "")));
    expect(padrao).toEqual(esperado);
  });
});
