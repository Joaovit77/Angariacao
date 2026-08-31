import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  avaliarImovel,
  calcularSimilaridade,
  compararPretensao,
  descricaoSemanticaComDiferenciais,
  extrairAreaM2,
  internalComparablesProvider,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";
import type { Imovel } from "@/lib/tipos";

const HOJE = "2026-08-21";

const ENTRADA: EntradaAvaliacao = {
  imovelId: "alvo",
  finalidade: "locacao",
  endereco: "Rua Paranaguá, 300",
  bairro: "Centro",
  cidade: "Londrina",
  estado: "PR",
  edificio: "Edifício Aurora",
  tipo: "Apartamento",
  areaM2: 70,
  quartos: 2,
  banheiros: 2,
  vagas: 1,
  conservacao: "Bom",
  latitude: -23.3105,
  longitude: -51.1696,
};

function comparavel(id: string, valor: number, parcial: Partial<ComparavelAvaliacao> = {}): ComparavelAvaliacao {
  return {
    origem: "interno",
    id,
    codigo: `LD-${id}`,
    endereco: `Rua Paranaguá, ${310 + Number(id.replace(/\D/g, "") || 0)}`,
    bairro: "Centro",
    cidade: "Londrina",
    edificio: "Edifício Aurora",
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 2,
    vagas: 1,
    conservacao: "Bom",
    latitude: -23.311,
    longitude: -51.17,
    valorAnunciado: valor,
    dataInformacao: "2026-08-01",
    status: "Locado",
    ...parcial,
  };
}

const BASE_COMPARAVEIS = [
  comparavel("1", 2200),
  comparavel("2", 2300),
  comparavel("3", 2400),
  comparavel("4", 2500),
  comparavel("5", 2600),
];

describe("similaridade da avaliação", () => {
  it("prioriza localização acima das demais características", () => {
    const perto = calcularSimilaridade(ENTRADA, comparavel("1", 2300), HOJE);
    const longe = calcularSimilaridade(ENTRADA, comparavel("2", 2300, {
      endereco: "Rua das Flores, 10",
      bairro: "Zona 8",
      cidade: "Maringá",
      edificio: null,
      latitude: null,
      longitude: null,
    }), HOJE);
    expect(perto.componentes.localizacao).toBe(100);
    expect(longe.componentes.localizacao).toBe(0);
    expect(perto.similaridade - longe.similaridade).toBeGreaterThanOrEqual(30);
  });

  it("penaliza diferença grande de área sem eliminar dado ausente como se fosse zero", () => {
    const compativel = calcularSimilaridade(ENTRADA, comparavel("1", 2300, { areaM2: 72 }), HOJE);
    const muitoMaior = calcularSimilaridade(ENTRADA, comparavel("2", 2300, { areaM2: 180 }), HOJE);
    const semArea = calcularSimilaridade(ENTRADA, comparavel("3", 2300, { areaM2: null }), HOJE);
    expect(compativel.componentes.area).toBeGreaterThan(90);
    expect(muitoMaior.componentes.area).toBe(0);
    expect(semArea.componentes.area).toBe(45);
  });
});

describe("faixa robusta e confiança", () => {
  it("remove valor extremo antes de calcular a recomendação", () => {
    const resultado = avaliarImovel(ENTRADA, [
      ...BASE_COMPARAVEIS.slice(0, 4),
      comparavel("99", 20000),
    ], HOJE);
    expect(resultado.situacao).toBe("calculada");
    expect(resultado.metodologia.outliersRemovidos).toBe(1);
    expect(resultado.valorRecomendado).toBeLessThan(3000);
    expect(resultado.comparaveis.some((item) => item.valorAnunciado === 20000)).toBe(false);
  });

  it("mantém o recomendado dentro de uma faixa válida", () => {
    const resultado = avaliarImovel(ENTRADA, BASE_COMPARAVEIS, HOJE);
    expect(resultado.situacao).toBe("calculada");
    expect(resultado.valorMinimo).not.toBeNull();
    expect(resultado.valorRecomendado).not.toBeNull();
    expect(resultado.valorMaximo).not.toBeNull();
    expect(resultado.valorMinimo!).toBeLessThanOrEqual(resultado.valorRecomendado!);
    expect(resultado.valorRecomendado!).toBeLessThanOrEqual(resultado.valorMaximo!);
    expect(resultado.scoreConfianca).toBeGreaterThanOrEqual(45);
    expect(resultado.estrategias).toHaveLength(3);
  });

  it("mostra referência preliminar, ampla e sem estratégias quando há só dois comparáveis", () => {
    const resultado = avaliarImovel(ENTRADA, BASE_COMPARAVEIS.slice(0, 2), HOJE);
    expect(resultado.situacao).toBe("preliminar");
    expect(resultado.valorMinimo).toBeLessThan(resultado.valorRecomendado!);
    expect(resultado.valorRecomendado).not.toBeNull();
    expect(resultado.valorMaximo).toBeGreaterThan(resultado.valorRecomendado!);
    expect(resultado.nivelConfianca).toBe("Baixa");
    expect(resultado.scoreConfianca).toBeLessThan(45);
    expect(resultado.estrategias).toEqual([]);
  });

  it("só deixa de apresentar valor quando nenhum preço observado é compatível", () => {
    const resultado = avaliarImovel(ENTRADA, [], HOJE);
    expect(resultado.situacao).toBe("insuficiente");
    expect(resultado.valorMinimo).toBeNull();
    expect(resultado.valorRecomendado).toBeNull();
    expect(resultado.valorMaximo).toBeNull();
    expect(resultado.scoreConfianca).toBe(0);
  });

  it("amplia a amostra para a mesma cidade sem promover a referência a avaliação completa", () => {
    const mesmaCidade = BASE_COMPARAVEIS.slice(0, 4).map((item, indice) => ({
      ...item,
      id: `cidade-${indice}`,
      edificio: null,
      endereco: `Rua Distante ${indice}, 100`,
      bairro: `Bairro ${indice}`,
      latitude: null,
      longitude: null,
    }));
    const resultado = avaliarImovel({ ...ENTRADA, edificio: null }, mesmaCidade, HOJE);
    expect(resultado.situacao).toBe("preliminar");
    expect(resultado.valorRecomendado).not.toBeNull();
    expect(resultado.metodologia.modoAmostra).toBe("ampliada");
    expect(resultado.metodologia.comparaveisLocaisAprovados).toBe(0);
    expect(resultado.scoreConfianca).toBeLessThan(45);
  });
  it("não deixa casa, imóvel sem área ou bairro distante distorcer um apartamento de um quarto", () => {
    const entradaRoma: EntradaAvaliacao = {
      ...ENTRADA,
      endereco: "Rua Roma, 575",
      bairro: "Parque Residencial Joaquim Toledo Piza",
      edificio: null,
      areaM2: 30,
      quartos: 1,
      vagas: 0,
    };
    const fortes = [
      comparavel("roma-1", 900, { edificio: null, bairro: entradaRoma.bairro, areaM2: 29, quartos: 1, vagas: 0 }),
      comparavel("roma-2", 950, { edificio: null, bairro: entradaRoma.bairro, areaM2: 30, quartos: 1, vagas: 0 }),
      comparavel("roma-3", 1000, { edificio: null, bairro: entradaRoma.bairro, areaM2: 32, quartos: 1, vagas: 0 }),
    ];
    const resultado = avaliarImovel(entradaRoma, [
      ...fortes,
      comparavel("casa", 2500, { edificio: null, bairro: entradaRoma.bairro, tipo: "Casa", areaM2: 30, quartos: 1 }),
      comparavel("sem-area", 2200, { edificio: null, bairro: entradaRoma.bairro, areaM2: null, quartos: 1 }),
      comparavel("distante", 3000, { edificio: null, bairro: "Centro", areaM2: 30, quartos: 1, latitude: null, longitude: null }),
    ], HOJE);

    expect(resultado.situacao).toBe("calculada");
    expect(resultado.valorRecomendado).toBe(950);
    expect(resultado.comparaveis).toHaveLength(3);
    expect(resultado.comparaveis.map((item) => item.id).sort()).toEqual(fortes.map((item) => item.id).sort());
  });

  it("prioriza três comparáveis da mesma rua sobre imóveis de outras ruas do bairro", () => {
    const mesmaRua = [
      comparavel("rua-1", 2500, { edificio: null, endereco: "Rua Ernâni Lacerda de Athayde, 1100" }),
      comparavel("rua-2", 2700, { edificio: null, endereco: "Rua Ernani Lacerda de Athayde, 1200" }),
      comparavel("rua-3", 2900, { edificio: null, endereco: "Rua Ernâni Lacerda de Athayde" }),
    ];
    const resultado = avaliarImovel({
      ...ENTRADA,
      edificio: null,
      endereco: "Rua Ernâni Lacerda de Athayde, 1200",
    }, [
      ...mesmaRua,
      comparavel("outra-1", 5000, { edificio: null, endereco: "Rua Caracas, 10" }),
      comparavel("outra-2", 5500, { edificio: null, endereco: "Rua Caracas, 20" }),
      comparavel("outra-3", 6000, { edificio: null, endereco: "Rua Caracas, 30" }),
    ], HOJE);

    expect(resultado.valorRecomendado).toBe(2700);
    expect(resultado.comparaveis.map((item) => item.id).sort())
      .toEqual(mesmaRua.map((item) => item.id).sort());
  });

  it("não classifica uma base composta apenas por preços pedidos como confiança alta", () => {
    const externos = BASE_COMPARAVEIS.map((item) => ({ ...item, origem: "externo" as const, status: "Anunciado" }));
    const resultado = avaliarImovel(ENTRADA, externos, HOJE);
    expect(resultado.situacao).toBe("calculada");
    expect(resultado.scoreConfianca).toBeLessThanOrEqual(74);
    expect(resultado.nivelConfianca).not.toBe("Alta");
  });

  it("reduz o peso de anúncio não encontrado ou removido sem apagar sua evidência histórica", () => {
    const ativo = calcularSimilaridade(ENTRADA, {
      ...BASE_COMPARAVEIS[0], origem: "externo", status: "Anunciado",
    }, HOJE);
    const naoEncontrado = calcularSimilaridade(ENTRADA, {
      ...BASE_COMPARAVEIS[0], origem: "externo", status: "Não encontrado",
    }, HOJE);
    const removido = calcularSimilaridade(ENTRADA, {
      ...BASE_COMPARAVEIS[0], origem: "externo", status: "Removido",
    }, HOJE);
    expect(naoEncontrado.pesoCalculo).toBeLessThan(ativo.pesoCalculo);
    expect(removido.pesoCalculo).toBeLessThan(naoEncontrado.pesoCalculo);
    expect(removido.valorAnunciado).toBe(ativo.valorAnunciado);
  });


  it("a expectativa do proprietário nunca altera o cálculo", () => {
    const antes = avaliarImovel(ENTRADA, BASE_COMPARAVEIS, HOJE);
    const comparacao = compararPretensao(5000, antes.valorRecomendado);
    const depois = avaliarImovel(ENTRADA, BASE_COMPARAVEIS, HOJE);
    expect(comparacao?.direcao).toBe("acima");
    expect(depois).toEqual(antes);
  });
});

describe("provedor interno", () => {
  const carteira: Imovel[] = [
    {
      id: "alvo",
      codigo: "LD-001",
      endereco: "Rua Paranaguá, 300",
      bairro: "Centro",
      cidade: "Londrina",
      tipo: "Apartamento",
      quartos: 2,
      banheiros: 2,
      vagas: 1,
      valorAluguel: 2500,
      textoAnuncio: "Apartamento com 70 m² e ótima localização.",
      status: "Publicado",
    },
    {
      id: "comp",
      codigo: "LD-002",
      endereco: "Rua Paranaguá, 350",
      bairro: "Centro",
      cidade: "Londrina",
      tipo: "Apartamento",
      quartos: 2,
      banheiros: 2,
      vagas: 1,
      valorAluguel: 2400,
      textoAnuncio: "Área privativa: 68,5 m2.",
      status: "Locado",
      locadoEm: "2026-08-01",
    },
  ];

  it("extrai somente área acompanhada da unidade", () => {
    expect(extrairAreaM2("Apartamento 12, bloco 2, com 84 m²")).toBe(84);
    expect(extrairAreaM2("Apartamento 84 no bloco 2")).toBeNull();
  });

  it("exclui o próprio imóvel e preserva a procedência do comparável", async () => {
    const itens = await internalComparablesProvider.buscar(ENTRADA, { imoveis: carteira });
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ id: "comp", origem: "interno", areaM2: 68.5, valorAnunciado: 2400 });
  });

  it("para venda, declara ausência de fonte em vez de reaproveitar aluguel", async () => {
    const itens = await internalComparablesProvider.buscar({ ...ENTRADA, finalidade: "venda" }, { imoveis: carteira });
    expect(itens).toEqual([]);
  });
});

describe("diferenciais da avaliação", () => {
  it("acrescenta os diferenciais ao texto semântico sem inventar prêmio de preço", () => {
    const texto = descricaoSemanticaComDiferenciais(
      "Apartamento iluminado.",
      ["moveis-planejados", "box-banheiros"],
    );
    expect(texto).toContain("Apartamento iluminado.");
    expect(texto).toContain("Móveis planejados");
    expect(texto).toContain("Box nos banheiros");
  });

  it("não aplica prêmio fixo aos diferenciais depois que os comparáveis foram escolhidos", () => {
    const semDiferenciais = avaliarImovel(ENTRADA, BASE_COMPARAVEIS, HOJE);
    const comDiferenciais = avaliarImovel({
      ...ENTRADA,
      diferenciais: ["moveis-planejados", "box-banheiros"],
    }, BASE_COMPARAVEIS, HOJE);
    expect(comDiferenciais.valorMinimo).toBe(semDiferenciais.valorMinimo);
    expect(comDiferenciais.valorRecomendado).toBe(semDiferenciais.valorRecomendado);
    expect(comDiferenciais.valorMaximo).toBe(semDiferenciais.valorMaximo);
  });
});

describe("segurança e integração estrutural", () => {
  const schema = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
  const tela = readFileSync(new URL("../components/avaliacao/AvaliacaoRapidaView.tsx", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../components/modais/ModalImovel.tsx", import.meta.url), "utf8");

  it("mantém histórico imutável com RLS e vínculo ao imóvel do próprio usuário", () => {
    expect(schema).toContain("alter table avaliacoes_imoveis enable row level security");
    expect(schema).toContain('create policy "select_own_avaliacoes_imoveis"');
    expect(schema).toContain('create policy "insert_own_avaliacoes_imoveis"');
    expect(schema).toContain("imovel.user_id = (select auth.uid())");
    expect(schema).toContain("grant select, insert on table avaliacoes_imoveis to authenticated");
    expect(schema).toContain("grant select, insert on table avaliacoes_imoveis to service_role");
    expect(schema).not.toContain("grant select, insert, update on table avaliacoes_imoveis to authenticated");
  });
  it("compartilha a leitura do catálogo e mantém a escrita por usuário, sem exclusão", () => {
    expect(schema).toContain("alter table comparaveis_mercado enable row level security");
    expect(schema).toContain('create policy "select_catalogo_comparaveis_mercado"');
    expect(schema).toContain("for select to authenticated using (true)");
    expect(schema).toContain('create policy "insert_own_comparaveis_mercado"');
    expect(schema).toContain('create policy "update_own_comparaveis_mercado"');
    expect(schema).toContain("grant select, insert, update on table comparaveis_mercado to authenticated");
    expect(schema).not.toContain("grant select, insert, update, delete on table comparaveis_mercado");
    expect(tela).toContain("buscarComparaveisMercado");
  });


  it("grava antes de publicar o resultado e oferece o atalho no imóvel", () => {
    const gravacao = tela.indexOf("await registrarAvaliacao");
    const publicacao = tela.indexOf("setAvaliacao({");
    expect(gravacao).toBeGreaterThan(0);
    expect(publicacao).toBeGreaterThan(gravacao);
    expect(modal).toContain("/avaliacao?imovel=");
    expect(modal).toContain("Avaliar imóvel");
  });

  it("oferece diferenciais relevantes sem aplicar acréscimo fixo ao preço", () => {
    expect(tela).toContain("Diferenciais do imóvel");
    expect(tela).toContain("DIFERENCIAIS_AVALIACAO.map");
    expect(tela).toContain("descricaoSemanticaComDiferenciais");
  });
});
