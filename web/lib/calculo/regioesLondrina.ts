import type { PortalAngariacao } from "./centralAngariacao";
import { chaveNormalizada } from "../normalizacao";

// Regiões e bairros conforme IPPUL/Lei Municipal 13.718/2023:
// https://ippul.londrina.pr.gov.br/index.php/mapas-tematicos/bairros-e-regioes.html

export const REGIOES_LONDRINA = {
  "Zona Sul": [
    "Bela Suíça", "Cafezal", "Guanabara", "Industrial 4", "Inglaterra",
    "Jamile Dequech", "Nova Esperança", "Piza", "São Lourenço", "São Miguel",
    "Tucanos", "União da Vitória", "Vivendas do Arvoredo",
  ],
  "Zona Leste": [
    "Abussafe", "Aeroporto", "Antares", "Califórnia", "Ernani", "Fraternidade",
    "Ideal", "Interlagos", "Lindóia", "Pioneiros", "Parque das Indústrias Leves",
    "Vila Siam",
  ],
  "Zona Oeste": [
    "Bandeirantes", "Cilo 2", "Cilo 3", "Colúmbia", "Leonor", "Olímpico",
    "Palhano 1", "Palhano 2", "Presidente", "Royal", "Sabará", "Tókio",
  ],
  "Zona Norte": [
    "Alpes", "Alto Primavera", "Carnascialli", "Cidade Industrial 1",
    "Cinco Conjuntos", "Coliseu", "Heimtal", "Maria Celina", "Milton Gavetti",
    "Novo Amparo", "Ouro Verde", "Parigot", "Paris", "Perobinha", "Primavera",
    "São Jorge", "Terra Nova", "Vista Bela", "Vivi Xavier",
  ],
} as const;

export type RegiaoLondrina = keyof typeof REGIOES_LONDRINA;

const REGIAO_POR_BAIRRO = new Map(
  (Object.entries(REGIOES_LONDRINA) as [RegiaoLondrina, readonly string[]][])
    .flatMap(([regiao, bairros]) => bairros.map((bairro) => [chaveNormalizada(bairro), regiao] as const)),
);

export function regiaoDeBairroLondrina(bairro: string | null | undefined): RegiaoLondrina | null {
  return REGIAO_POR_BAIRRO.get(chaveNormalizada(bairro)) || null;
}

export interface ConsultaPlanejadaLondrina {
  regiao: RegiaoLondrina;
  bairro: string;
  portal: PortalAngariacao;
}

const PORTAIS_PRIORIZADOS: PortalAngariacao[] = [
  "chaves-na-mao",
  "wimoveis",
  "viva-real",
];

/** Distribui um teto exato por zona, priorizando os portais que historicamente
 * mais renderam comparáveis. Cada combinação portal+bairro aparece uma vez. */
export function planejarColetaPorZonasLondrina(
  limitePorZona = 25,
): ConsultaPlanejadaLondrina[] {
  if (!Number.isInteger(limitePorZona) || limitePorZona < 1) {
    throw new Error("O limite por zona deve ser um número inteiro positivo.");
  }

  return (Object.entries(REGIOES_LONDRINA) as [RegiaoLondrina, readonly string[]][])
    .flatMap(([regiao, bairros]) => {
      const capacidade = bairros.length * PORTAIS_PRIORIZADOS.length;
      if (limitePorZona > capacidade) {
        throw new Error(`A ${regiao} admite no máximo ${capacidade} consultas únicas.`);
      }
      return PORTAIS_PRIORIZADOS.flatMap((portal) =>
        bairros.map((bairro) => ({ regiao, bairro, portal })),
      ).slice(0, limitePorZona);
    });
}
