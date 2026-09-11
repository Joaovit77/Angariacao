/* ================================================================
   LOCALIZAÇÃO HONESTA NA AVALIAÇÃO RÁPIDA

   Duas fontes de verdade sobre onde o imóvel está:
   - a coordenada do geocoder, que só vale como distância fina quando
     veio do endereço ou da rua — um centroide de bairro não é o ponto
     do imóvel;
   - o bairro oficial do ViaCEP, dado dos Correios, que resolve a região
     antes de qualquer inferência espacial e conta como evidência local.
   ================================================================ */
import { describe, expect, it } from "vitest";
import {
  avaliarImovel,
  calcularSimilaridade,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";

const HOJE = "2026-09-10";

/** Centro de Londrina. */
const CENTRO = { latitude: -23.3105, longitude: -51.1696 };
/** ~300 m ao sul do ponto acima. */
const A_300_METROS = { latitude: -23.3132, longitude: -51.1696 };

const ENTRADA_CENTRO: EntradaAvaliacao = {
  finalidade: "locacao",
  endereco: "Rua Paranaguá, 300",
  bairro: "Centro",
  cidade: "Londrina",
  estado: "PR",
  tipo: "Apartamento",
  areaM2: 70,
  quartos: 2,
  banheiros: 1,
  vagas: 1,
  conservacao: "Bom",
  ...CENTRO,
};

function comparavel(id: string, parcial: Partial<ComparavelAvaliacao> = {}): ComparavelAvaliacao {
  return {
    origem: "externo",
    id,
    idExterno: id.toUpperCase(),
    codigo: "chaves-na-mao",
    endereco: "Rua Pernambuco, 500",
    bairro: "Vila Ipiranga",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    valorAnunciado: 1800,
    dataInformacao: "2026-08-20",
    status: "Anunciado",
    ...parcial,
  };
}

/** Três anúncios a 300 m, em outra rua e outro bairro da mesma zona. Só a
    distância pode torná-los evidência local. */
const VIZINHOS_A_300_METROS = [
  comparavel("vizinho-1", { ...A_300_METROS, valorAnunciado: 1750 }),
  comparavel("vizinho-2", { ...A_300_METROS, valorAnunciado: 1800 }),
  comparavel("vizinho-3", { ...A_300_METROS, valorAnunciado: 1850 }),
];

describe("precisão da coordenada do imóvel-alvo", () => {
  it("não transforma o centroide do bairro em proximidade fina", () => {
    const entrada: EntradaAvaliacao = { ...ENTRADA_CENTRO, precisaoLocalizacao: "bairro" };
    const avaliado = calcularSimilaridade(entrada, VIZINHOS_A_300_METROS[0], HOJE);
    const resultado = avaliarImovel(entrada, VIZINHOS_A_300_METROS, HOJE);

    expect(avaliado.distanciaKm).toBeNull();
    expect(avaliado.componentes.localizacao).toBeLessThan(88);
    // Sem distância fina e sem mesmo bairro/rua, não há evidência local:
    // a amostra só pode ser regional e preliminar.
    expect(resultado.metodologia.modoAmostra).toBe("regional");
    expect(resultado.situacao).toBe("preliminar");
  });

  it("também não transforma o centroide da cidade em proximidade fina", () => {
    // Sem bairro, a última tentativa do geocoder cai em "cidade, Brasil".
    // Esse ponto é ainda mais grosseiro que o do bairro e recebe o mesmo
    // tratamento: nenhum bônus de distância e nenhuma evidência local.
    const entrada: EntradaAvaliacao = { ...ENTRADA_CENTRO, precisaoLocalizacao: "cidade" };
    const avaliado = calcularSimilaridade(entrada, VIZINHOS_A_300_METROS[0], HOJE);
    const resultado = avaliarImovel(entrada, VIZINHOS_A_300_METROS, HOJE);

    expect(avaliado.distanciaKm).toBeNull();
    expect(avaliado.componentes.localizacao).toBeLessThan(88);
    expect(resultado.metodologia.modoAmostra).toBe("regional");
    expect(resultado.situacao).toBe("preliminar");
    expect(resultado.metodologia.comparaveisLocaisAprovados).toBe(0);
  });

  it("mantém a proximidade fina quando a coordenada veio do endereço", () => {
    const entrada: EntradaAvaliacao = { ...ENTRADA_CENTRO, precisaoLocalizacao: "endereco" };
    const avaliado = calcularSimilaridade(entrada, VIZINHOS_A_300_METROS[0], HOJE);
    const resultado = avaliarImovel(entrada, VIZINHOS_A_300_METROS, HOJE);

    expect(avaliado.distanciaKm).toBe(0.3);
    expect(avaliado.componentes.localizacao).toBe(94);
    expect(resultado.metodologia.modoAmostra).toBe("local");
  });

  it("trata coordenada sem precisão declarada como antes, sem regressão", () => {
    const legado = calcularSimilaridade(ENTRADA_CENTRO, VIZINHOS_A_300_METROS[0], HOJE);
    const preciso = calcularSimilaridade(
      { ...ENTRADA_CENTRO, precisaoLocalizacao: "endereco" },
      VIZINHOS_A_300_METROS[0],
      HOJE,
    );
    expect(legado.distanciaKm).toBe(0.3);
    expect(legado.componentes.localizacao).toBe(preciso.componentes.localizacao);
    expect(legado.similaridade).toBe(preciso.similaridade);
  });

  it("ainda resolve a região pelo centroide quando não há outra fonte", () => {
    const entrada: EntradaAvaliacao = {
      ...ENTRADA_CENTRO,
      bairro: "Nome Popular Fora do Mapa",
      precisaoLocalizacao: "bairro",
    };
    const resultado = avaliarImovel(entrada, VIZINHOS_A_300_METROS, HOJE);
    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Central");
  });
});

describe("bairro oficial do ViaCEP", () => {
  const SEM_COORDENADA = { latitude: null, longitude: null };

  it("resolve a região sem coordenada mesmo com bairro digitado fora do mapa", () => {
    const entrada: EntradaAvaliacao = {
      ...ENTRADA_CENTRO,
      ...SEM_COORDENADA,
      bairro: "Nome Popular Qualquer",
      bairroOficial: "Inglaterra",
    };
    const resultado = avaliarImovel(entrada, [], HOJE);
    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Sul");
  });

  it("prevalece sobre a coordenada precisa na resolução da região", () => {
    const entrada: EntradaAvaliacao = {
      ...ENTRADA_CENTRO,
      bairroOficial: "Inglaterra",
      precisaoLocalizacao: "endereco",
    };
    const resultado = avaliarImovel(entrada, [], HOJE);
    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Sul");
  });

  it("conta como mesmo bairro na evidência local", () => {
    const entrada: EntradaAvaliacao = {
      ...ENTRADA_CENTRO,
      ...SEM_COORDENADA,
      endereco: "Avenida Inglaterra, 700",
      bairro: "Igapó",
      bairroOficial: "Inglaterra",
    };
    const oficiais = [
      comparavel("oficial-1", { ...SEM_COORDENADA, bairro: "Inglaterra", endereco: "Rua Bélgica, 10", valorAnunciado: 1700 }),
      comparavel("oficial-2", { ...SEM_COORDENADA, bairro: "Inglaterra", endereco: "Rua China, 20", valorAnunciado: 1800 }),
      comparavel("oficial-3", { ...SEM_COORDENADA, bairro: "Inglaterra", endereco: "Rua Polônia, 30", valorAnunciado: 1900 }),
    ];
    const resultado = avaliarImovel(entrada, oficiais, HOJE);

    expect(resultado.situacao).toBe("calculada");
    expect(resultado.metodologia.modoAmostra).toBe("local");
    expect(resultado.comparaveis).toHaveLength(3);
    expect(resultado.comparaveis.every((item) => item.componentes.localizacao === 82)).toBe(true);
  });

  it("não deixa comparável de outra região entrar por causa do bairro oficial", () => {
    const entrada: EntradaAvaliacao = {
      ...ENTRADA_CENTRO,
      ...SEM_COORDENADA,
      bairro: "Igapó",
      bairroOficial: "Inglaterra",
    };
    const outraZona = [
      comparavel("leste-1", { ...SEM_COORDENADA, bairro: "Califórnia", regiao: "Zona Leste", endereco: "Rua A, 1" }),
      comparavel("leste-2", { ...SEM_COORDENADA, bairro: "Califórnia", regiao: "Zona Leste", endereco: "Rua B, 2" }),
      comparavel("leste-3", { ...SEM_COORDENADA, bairro: "Califórnia", regiao: "Zona Leste", endereco: "Rua C, 3" }),
    ];
    const resultado = avaliarImovel(entrada, outraZona, HOJE);
    expect(resultado.situacao).toBe("insuficiente");
    expect(resultado.comparaveis).toHaveLength(0);
  });
});
