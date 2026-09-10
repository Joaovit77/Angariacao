/* ================================================================
   REGIÃO DO IGAPÓ NA AVALIAÇÃO RÁPIDA

   "Igapó" é o bairro postal dos Correios para a Av. Inglaterra e ruas
   vizinhas (CEP 86046-xxx); não consta na Lei 13.718/2023 porque a área
   pertence ao bairro oficial Inglaterra, Região Sul 1. Sem essa
   equivalência, o motor só chegava à região pela coordenada do Nominatim
   — e, sem coordenada, tratava o Igapó como região desconhecida.

   Caso real: Avenida Inglaterra, 700 — Igapó, Londrina/PR.
   ================================================================ */
import { describe, expect, it } from "vitest";
import {
  avaliarImovel,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";
import {
  planejarColetaPorZonasLondrina,
  regiaoDeBairroLondrina,
  regiaoPorCoordenadasLondrina,
  REGIOES_LONDRINA,
} from "@/lib/calculo/regioesLondrina";

const HOJE = "2026-09-10";

/** Coordenada real da Av. Inglaterra à altura do nº 700 (OSM). */
const COORDENADA_AV_INGLATERRA_700 = { latitude: -23.3456, longitude: -51.1472 };

/** Entrada como o formulário a monta quando a geocodificação não responde:
    bairro vindo do ViaCEP e nenhuma coordenada. */
const ENTRADA_SEM_COORDENADA: EntradaAvaliacao = {
  finalidade: "locacao",
  endereco: "Avenida Inglaterra, 700",
  bairro: "Igapó",
  cidade: "Londrina",
  estado: "PR",
  edificio: null,
  tipo: "Apartamento",
  areaM2: 55,
  quartos: 3,
  banheiros: 1,
  vagas: 1,
  conservacao: "Bom",
  latitude: null,
  longitude: null,
};

function comparavel(
  id: string,
  endereco: string,
  bairro: string,
  parcial: Partial<ComparavelAvaliacao> = {},
): ComparavelAvaliacao {
  return {
    origem: "externo",
    id,
    idExterno: id.toUpperCase(),
    codigo: "chaves-na-mao",
    endereco,
    bairro,
    cidade: "Londrina",
    estado: "PR",
    regiao: null,
    edificio: null,
    tipo: "Apartamento",
    areaM2: 55,
    quartos: 3,
    banheiros: null,
    vagas: null,
    conservacao: null,
    latitude: null,
    longitude: null,
    valorAnunciado: 1400,
    dataInformacao: "2026-08-22",
    url: `https://exemplo.test/${id}`,
    status: "Anunciado",
    similaridadeVetorial: null,
    historico: null,
    ...parcial,
  };
}

/** Somente dois no próprio bairro: abaixo do mínimo de três. */
const LOCAIS_IGAPO = [
  comparavel("igapo-inglaterra-537", "Avenida Inglaterra, 537", "Igapó"),
  comparavel("igapo-china-225", "Rua China, 225", "Igapó", { valorAnunciado: 1050 }),
];

/** Estruturalmente idênticos ao alvo; só a região os separa. */
const MESMA_ZONA_SUL = comparavel("sul-bela-suica", "Rua Bela Suíça, 100", "Bela Suíça", {
  valorAnunciado: 1600,
});
const OUTRAS_ZONAS = [
  comparavel("norte-cinco-conjuntos", "Rua Cinco Conjuntos, 10", "Cinco Conjuntos", {
    valorAnunciado: 900,
  }),
  comparavel("leste-california", "Rua Califórnia, 20", "Califórnia", {
    regiao: "Zona Leste", valorAnunciado: 950,
  }),
  comparavel("oeste-palhano", "Rua Palhano, 30", "Palhano 2", {
    latitude: -23.3312, longitude: -51.1897, valorAnunciado: 2600,
  }),
];
/** Rótulo comercial sem bairro oficial, sem coordenada: mesma cidade não
    é evidência de mesma região. */
const REGIAO_DESCONHECIDA = comparavel("aurora", "Rua Aurora, 40", "Aurora", {
  valorAnunciado: 1500,
});

describe("Igapó como denominação postal do bairro oficial Inglaterra", () => {
  it("resolve a Zona Sul pelo nome como ele chega do ViaCEP e dos portais", () => {
    expect(regiaoDeBairroLondrina("Igapó")).toBe("Zona Sul");
    expect(regiaoDeBairroLondrina("igapo")).toBe("Zona Sul");
    expect(regiaoDeBairroLondrina("Jardim Igapó")).toBe("Zona Sul");
    expect(regiaoDeBairroLondrina("Inglaterra")).toBe("Zona Sul");
  });

  it("concorda com os polígonos do SIGLON ao longo de toda a Av. Inglaterra", () => {
    expect(regiaoPorCoordenadasLondrina(-23.3393, -51.1472)).toBe("Zona Sul");
    expect(regiaoPorCoordenadasLondrina(
      COORDENADA_AV_INGLATERRA_700.latitude,
      COORDENADA_AV_INGLATERRA_700.longitude,
    )).toBe("Zona Sul");
    expect(regiaoPorCoordenadasLondrina(-23.3506, -51.1470)).toBe("Zona Sul");
  });

  it("não altera a lista oficial nem o plano de coleta paga", () => {
    expect(REGIOES_LONDRINA["Zona Sul"]).not.toContain("Igapó");
    expect(REGIOES_LONDRINA["Zona Sul"]).toHaveLength(13);
    const plano = planejarColetaPorZonasLondrina(25);
    expect(plano).toHaveLength(100);
    expect(plano.some((item) => item.bairro === "Igapó")).toBe(false);
  });

  it("continua sem inventar região para rótulos que a fonte oficial não sustenta", () => {
    expect(regiaoDeBairroLondrina("Aurora")).toBeNull();
    expect(regiaoDeBairroLondrina("Lago Igapó")).toBeNull();
  });
});

describe("Avaliação Rápida de um imóvel do Igapó com poucos comparáveis locais", () => {
  const candidatos = [...LOCAIS_IGAPO, MESMA_ZONA_SUL, ...OUTRAS_ZONAS, REGIAO_DESCONHECIDA];

  it("amplia a amostra somente dentro da Zona Sul mesmo sem coordenada", () => {
    const resultado = avaliarImovel(ENTRADA_SEM_COORDENADA, candidatos, HOJE);

    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Sul");
    expect(resultado.metodologia.modoAmostra).toBe("regional");
    expect(resultado.comparaveis.map((item) => item.id).sort())
      .toEqual([...LOCAIS_IGAPO.map((item) => item.id), MESMA_ZONA_SUL.id].sort());
    expect(resultado.metodologia.comparaveisLocaisAprovados).toBe(2);
  });

  it("nunca complementa com Zona Norte, Leste, Oeste ou região desconhecida", () => {
    const resultado = avaliarImovel(ENTRADA_SEM_COORDENADA, candidatos, HOJE);
    const ids = new Set(resultado.comparaveis.map((item) => item.id));

    for (const fora of [...OUTRAS_ZONAS, REGIAO_DESCONHECIDA]) {
      expect(ids.has(fora.id)).toBe(false);
    }
  });

  it("mantém a amostra regional como referência preliminar de confiança baixa", () => {
    const resultado = avaliarImovel(ENTRADA_SEM_COORDENADA, candidatos, HOJE);

    expect(resultado.situacao).toBe("preliminar");
    expect(resultado.nivelConfianca).toBe("Baixa");
    expect(resultado.estrategias).toHaveLength(0);
  });

  it("chega à mesma região quando a coordenada geocodificada está presente", () => {
    const resultado = avaliarImovel(
      { ...ENTRADA_SEM_COORDENADA, ...COORDENADA_AV_INGLATERRA_700 },
      candidatos,
      HOJE,
    );

    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Sul");
    expect(resultado.comparaveis.map((item) => item.id).sort())
      .toEqual([...LOCAIS_IGAPO.map((item) => item.id), MESMA_ZONA_SUL.id].sort());
  });

  it("fica só com a evidência local quando o bairro não tem região conhecida", () => {
    // Mesmo cenário, mas com um rótulo que a fonte oficial não sustenta:
    // sem região, o motor não amplia para lugar nenhum.
    const resultado = avaliarImovel(
      { ...ENTRADA_SEM_COORDENADA, bairro: "Aurora", endereco: "Rua Aurora, 41" },
      candidatos,
      HOJE,
    );

    expect(resultado.metodologia.regiaoReferencia).toBeNull();
    expect(resultado.metodologia.modoAmostra).toBe("local");
    expect(resultado.comparaveis.map((item) => item.id)).toEqual([REGIAO_DESCONHECIDA.id]);
  });
});
