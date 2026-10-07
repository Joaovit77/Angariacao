import { describe, expect, it } from "vitest";
import { filtrarImoveis, filtrosPipelineVazios, pipelineColFiltersVazios, type PipelineViewMode } from "@/lib/calculo/filtros";
import { CARTEIRA_FINALIDADE, RETIRADOS_FINALIDADE } from "./fixtures/pipeline-finalidade";

const ids = (finalidade: string, modo: PipelineViewMode = "lista") => filtrarImoveis(
  [...CARTEIRA_FINALIDADE, ...RETIRADOS_FINALIDADE],
  { ...filtrosPipelineVazios(), finalidade }, modo, pipelineColFiltersVazios(),
).map((i) => i.id);

describe.each(["lista", "kanban", "retirados"] as const)("Finalidade exata em %s", (modo) => {
  const esperado = (valores: string[]) => modo === "retirados" ? valores.map((id) => "r-" + id) : valores;
  it("Todas mantém as três categorias e os dois legados", () => expect(ids("", modo)).toEqual(esperado(["alugar", "vender", "ambos", "nulo", "ausente"])));
  it("Locação não inclui ambos nem legado", () => expect(ids("locacao", modo)).toEqual(esperado(["alugar"])));
  it("Venda não inclui ambos", () => expect(ids("venda", modo)).toEqual(esperado(["vender"])));
  it("Locação e venda é uma categoria própria", () => expect(ids("locacao_venda", modo)).toEqual(esperado(["ambos"])));
  it("Não informado inclui null e campo ausente", () => expect(ids("nao_informado", modo)).toEqual(esperado(["nulo", "ausente"])));
});

describe("combinação AND com finalidade", () => {
  it.each([
    ["status", "Publicado", "Novo contato"], ["responsavel", "Beatriz", "Ana"],
    ["cidade", "Curitiba", "Londrina"], ["tipo", "Apartamento", "Casa"],
  ] as const)("finalidade + %s", (campo, corresponde, diferente) => {
    const carteira = [
      { ...CARTEIRA_FINALIDADE[1], id: "correto", [campo]: corresponde },
      { ...CARTEIRA_FINALIDADE[1], id: "outro", [campo]: diferente },
      { ...CARTEIRA_FINALIDADE[2], id: "duplo", [campo]: corresponde },
    ];
    expect(filtrarImoveis(carteira, { ...filtrosPipelineVazios(), finalidade: "venda", [campo]: corresponde }, "kanban", pipelineColFiltersVazios()).map((i) => i.id)).toEqual(["correto"]);
  });
  it("finalidade + busca preserva acentos e não procura categorias mágicas", () => {
    const filtra = (search: string) => filtrarImoveis(CARTEIRA_FINALIDADE, { ...filtrosPipelineVazios(), finalidade: "venda", search }, "lista", pipelineColFiltersVazios()).map((i) => i.id);
    expect(filtra("JOSE")).toEqual(["vender"]);
    expect(filtra("venda")).toEqual([]);
  });
  it("OR na coluna e AND entre colunas continuam funcionando", () => {
    const carteira = [
      { ...CARTEIRA_FINALIDADE[1], id: "um", status: "Publicado", responsavel: "Ana" },
      { ...CARTEIRA_FINALIDADE[1], id: "dois", status: "Angariado", responsavel: "Ana" },
      { ...CARTEIRA_FINALIDADE[1], id: "tres", status: "Novo contato", responsavel: "Ana" },
      { ...CARTEIRA_FINALIDADE[2], id: "quatro", status: "Publicado", responsavel: "Ana" },
    ];
    expect(filtrarImoveis(carteira, { ...filtrosPipelineVazios(), finalidade: "venda" }, "lista", { ...pipelineColFiltersVazios(), status: ["Publicado", "Angariado"], captador: ["Ana"] }).map((i) => i.id)).toEqual(["um", "dois"]);
  });
  it("filtrar nunca altera os imóveis ou acrescenta null ao legado ausente", () => {
    const antes = structuredClone(CARTEIRA_FINALIDADE);
    ids("nao_informado"); ids("locacao"); ids("");
    expect(CARTEIRA_FINALIDADE).toEqual(antes);
    expect(Object.hasOwn(CARTEIRA_FINALIDADE[4], "finalidade")).toBe(false);
  });
});
