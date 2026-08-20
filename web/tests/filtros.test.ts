/* Testes de caracterização — filtros do pipeline (Etapa 2).
   Cada cenário replica exatamente uma combinação de globals do app
   antigo (pipelineFilters/pipelineViewMode/pipelineColFilters) e
   compara com a saída real capturada no oráculo. */
import { describe, it, expect } from "vitest";
import {
  filtrarImoveis, filtrosPipelineVazios, ordenarPipelineLista, pipelineColFiltersVazios,
  pipelineColDistinct, pipelineUniqueSorted, temTelefone, semAcento, PIPELINE_COL_EMPTY,
  PIPELINE_COL_ACCESSOR, TELEFONE_COM, TELEFONE_SEM, identificacaoExibidaNoPipeline,
  referenciaCrmDisponivelNoPipeline,
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

describe("identificação exibida no Pipeline", () => {
  const interno = (over: Partial<Imovel>): Imovel => ({
    id: "id",
    codigo: "LD-247",
    endereco: "Rua A, 1",
    status: "Novo contato",
    referenciaCrm: "03280.001",
    ...over,
  }) as Imovel;

  it("o modo Código do sistema prioriza o código interno", () => {
    expect(identificacaoExibidaNoPipeline(interno({ status: "Publicado" }), "codigo")).toBe("LD-247");
  });

  it("o modo CRM usa a referência somente depois da captação", () => {
    expect(identificacaoExibidaNoPipeline(interno({ status: "Publicado" }), "referenciaCrm")).toBe(
      "03280.001",
    );
    expect(identificacaoExibidaNoPipeline(interno({ status: "Angariado" }), "referenciaCrm")).toBe(
      "03280.001",
    );
  });

  it("lead ainda não angariado ignora referência indevida e mantém o código", () => {
    const lead = interno({ status: "Novo contato" });
    expect(referenciaCrmDisponivelNoPipeline(lead)).toBe("");
    expect(identificacaoExibidaNoPipeline(lead, "referenciaCrm")).toBe("LD-247");
    expect(
      filtrarImoveis(
        [lead],
        { ...filtrosPipelineVazios(), search: "03280.001" },
        "lista",
        pipelineColFiltersVazios(),
      ),
    ).toEqual([]);
  });

  it("sem a identificação preferida, usa a outra para a linha não ficar anônima", () => {
    expect(
      identificacaoExibidaNoPipeline(interno({ status: "Publicado", referenciaCrm: "" }), "referenciaCrm"),
    ).toBe("LD-247");
    expect(identificacaoExibidaNoPipeline(interno({ status: "Publicado", codigo: "" }), "codigo")).toBe(
      "03280.001",
    );
  });
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
    const esperado = [...codigos(imoveis)].sort((a, b) =>
      (a || "").localeCompare(b || "", "pt-BR", { numeric: true, sensitivity: "base" }));
    expect(asc).toEqual(esperado);
  });

  it("ordem natural: LD-100 vem depois de LD-99, não depois de LD-10", () => {
    const amostra = ["LD-9", "LD-100", "LD-10", "LD-99", "LD-1"].map(
      (codigo, n) => ({ id: String(n), codigo }) as Imovel,
    );
    expect(codigos(ordenarPipelineLista(amostra, { key: "codigo", dir: "asc" })))
      .toEqual(["LD-1", "LD-9", "LD-10", "LD-99", "LD-100"]);
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

/* ---------------------------------------------------------------
   ABA RETIRADOS
   O imóvel que o proprietário tirou da carteira sai do Pipeline ativo.
   Sem esse corte a aba seria decorativa: a Lista e o Kanban continuariam
   contando como em jogo algo que já saiu — na carteira da supervisora,
   189 de 640.
   --------------------------------------------------------------- */
describe("aba Retirados", () => {
  const ativo = { id: "at", endereco: "Rua A, 1", status: "Angariado" } as Imovel;
  const saiu = { id: "sa", endereco: "Rua B, 2", status: "Angariado", retirado: true } as Imovel;
  const filtra = (mode: PipelineViewMode, lista: Imovel[] = [ativo, saiu]) =>
    filtrarImoveis(lista, filtrosPipelineVazios(), mode, pipelineColFiltersVazios()).map((i) => i.id);

  it("some da Lista e do Kanban", () => {
    expect(filtra("lista")).toEqual(["at"]);
    expect(filtra("kanban")).toEqual(["at"]);
  });

  it("a aba mostra só os retirados", () => {
    expect(filtra("retirados")).toEqual(["sa"]);
  });

  it("carteira sem nenhum retirado não muda de comportamento", () => {
    expect(filtra("lista", [ativo])).toEqual(["at"]);
    expect(filtra("retirados", [ativo])).toEqual([]);
  });

  it("os filtros normais continuam valendo dentro da aba", () => {
    const outro = { id: "ou", endereco: "Rua C, 3", status: "Angariado", retirado: true, bairro: "Centro" } as Imovel;
    const r = filtrarImoveis(
      [ativo, saiu, outro],
      { ...filtrosPipelineVazios(), bairro: "Centro" },
      "retirados",
      pipelineColFiltersVazios(),
    );
    expect(r.map((i) => i.id)).toEqual(["ou"]);
  });
});

/* ---------------------------------------------------------------
   COLUNA TELEFONE
   Sem número não há WhatsApp, follow-up nem lote de disponibilidade — o
   imóvel ocupa linha e não pode ser tocado. A coluna existe para isso
   aparecer sem abrir o cadastro, e para dar pra filtrar por ele.
   --------------------------------------------------------------- */
describe("coluna Telefone", () => {
  const com = { id: "c", endereco: "Rua A, 1", status: "Angariado", proprietarioTelefone: "(43) 99999-0000" } as Imovel;
  const sem = { id: "s", endereco: "Rua B, 2", status: "Angariado" } as Imovel;
  const branco = { id: "b", endereco: "Rua C, 3", status: "Angariado", proprietarioTelefone: "   " } as Imovel;

  it("classifica pelos dois rótulos, nunca em branco", () => {
    const acc = PIPELINE_COL_ACCESSOR.telefone;
    expect(acc(com)).toBe(TELEFONE_COM);
    expect(acc(sem)).toBe(TELEFONE_SEM);
    // string só de espaços é ausência, não número
    expect(acc(branco)).toBe(TELEFONE_SEM);
  });

  it("filtra por ter ou não ter", () => {
    const filtra = (valores: string[]) =>
      filtrarImoveis(
        [com, sem, branco],
        filtrosPipelineVazios(),
        "lista",
        { ...pipelineColFiltersVazios(), telefone: valores },
      ).map((i) => i.id);

    expect(filtra([TELEFONE_COM])).toEqual(["c"]);
    expect(filtra([TELEFONE_SEM])).toEqual(["s", "b"]);
    expect(filtra([])).toEqual(["c", "s", "b"]);
  });

  it("temTelefone não confunde espaço com número", () => {
    expect(temTelefone(com)).toBe(true);
    expect(temTelefone(sem)).toBe(false);
    expect(temTelefone(branco)).toBe(false);
  });
});


/* ---------------------------------------------------------------
   BUSCA INSENSÍVEL A ACENTO
   "Jose" tem que achar "José". A normalização é só da PESQUISA — o
   cadastro continua guardando e exibindo "Rua José Francisco Pereira".
   --------------------------------------------------------------- */
describe("busca sem acento", () => {
  const jose = { id: "j", endereco: "Rua José Francisco Pereira, 800", status: "Angariado" } as Imovel;
  const joao = { id: "a", endereco: "Avenida João Miguel Caram, 1250", status: "Angariado",
                 proprietarioNome: "Júlia Andrade" } as Imovel;
  const busca = (termo: string) =>
    filtrarImoveis([jose, joao], { ...filtrosPipelineVazios(), search: termo }, "lista",
      pipelineColFiltersVazios()).map((i) => i.id);

  it("acha com e sem acento", () => {
    expect(busca("José")).toEqual(["j"]);
    expect(busca("Jose")).toEqual(["j"]);
    expect(busca("João")).toEqual(["a"]);
    expect(busca("Joao")).toEqual(["a"]);
    expect(busca("Júlia")).toEqual(["a"]);
    expect(busca("Julia")).toEqual(["a"]);
  });

  it("continua ignorando maiúscula/minúscula", () => {
    for (const t of ["JOSE", "jose", "JoSe", "JOSÉ"]) expect(busca(t)).toEqual(["j"]);
  });

  it("não altera o dado cadastrado — só a pesquisa normaliza", () => {
    expect(jose.endereco).toBe("Rua José Francisco Pereira, 800");
    expect(semAcento("Rua José Francisco Pereira")).toBe("rua jose francisco pereira");
  });
});

/* ---------------------------------------------------------------
   FILTROS DE APARTAMENTO E BLOCO
   A carteira dela é cheia de apartamento: sem estes filtros a Lista
   mostra dezenas de linhas iguais do mesmo prédio.
   --------------------------------------------------------------- */
describe("filtros de apartamento e bloco", () => {
  const ap101 = { id: "a1", endereco: "Rua André Gallo, 101", unidade: "101", bloco: "04", status: "Angariado" } as Imovel;
  const ap202 = { id: "a2", endereco: "Rua André Gallo, 101", unidade: "202", bloco: "04", status: "Angariado" } as Imovel;
  const casa = { id: "c", endereco: "Rua Butiá, 77", status: "Angariado" } as Imovel;
  const todos = [ap101, ap202, casa];
  const filtra = (col: "unidade" | "bloco", valores: string[]) =>
    filtrarImoveis(todos, filtrosPipelineVazios(), "lista",
      { ...pipelineColFiltersVazios(), [col]: valores }).map((i) => i.id);

  it("reusa os campos que já existem no cadastro", () => {
    expect(PIPELINE_COL_ACCESSOR.unidade(ap101)).toBe("101");
    expect(PIPELINE_COL_ACCESSOR.bloco(ap101)).toBe("04");
  });

  it("filtra por apartamento", () => {
    expect(filtra("unidade", ["202"])).toEqual(["a2"]);
  });

  it("filtra por bloco", () => {
    expect(filtra("bloco", ["04"])).toEqual(["a1", "a2"]);
  });

  it("quem não tem unidade dá para filtrar pelo vazio", () => {
    // O valor do filtro é "" — `PIPELINE_COL_EMPTY` é só o rótulo que a tela
    // exibe no menu. Mesma convenção da coluna Bairro.
    expect(filtra("unidade", [""])).toEqual(["c"]);
    expect(PIPELINE_COL_EMPTY).toBe("(vazio)");
  });
});
