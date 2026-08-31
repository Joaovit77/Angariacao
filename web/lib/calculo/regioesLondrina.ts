import type { PortalAngariacao } from "./centralAngariacao";
import { chaveNormalizada } from "../normalizacao";
import regioesGeoJson from "./regioesLondrinaGeojson.json";

// Regiões e bairros conforme IPPUL/Lei Municipal 13.718/2023:
// https://ippul.londrina.pr.gov.br/index.php/mapas-tematicos/bairros-e-regioes.html

export const REGIOES_LONDRINA = {
  "Zona Central": [
    "Centro", "Higienópolis", "Ipiranga", "Petrópolis", "Quebec",
    "Shangri-lá", "Vila Brasil", "Vila Casoni", "Vila Nova", "Vila Recreio",
  ],
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

export const REGIOES_COLETA_LONDRINA = [
  "Zona Sul", "Zona Leste", "Zona Oeste", "Zona Norte",
] as const satisfies readonly RegiaoLondrina[];

const REGIAO_POR_BAIRRO = new Map(
  (Object.entries(REGIOES_LONDRINA) as [RegiaoLondrina, readonly string[]][])
    .flatMap(([regiao, bairros]) => bairros.map((bairro) => [chaveNormalizada(bairro), regiao] as const)),
);

export function regiaoDeBairroLondrina(bairro: string | null | undefined): RegiaoLondrina | null {
  const chave = chaveNormalizada(bairro);
  if (!chave) return null;
  const direta = REGIAO_POR_BAIRRO.get(chave);
  if (direta) return direta;
  const semTipoLocal = chave.replace(
    /^(?:(?:jardim|jd|parque|residencial|conjunto habitacional|conjunto residencial)\s+)+/,
    "",
  );
  return REGIAO_POR_BAIRRO.get(semTipoLocal) || null;
}

export function normalizarRegiaoLondrina(
  regiao: string | null | undefined,
): RegiaoLondrina | null {
  const chave = chaveNormalizada(regiao).replace(/^zona\s+/, "");
  if (chave === "central" || chave === "centro") return "Zona Central";
  if (chave.startsWith("norte")) return "Zona Norte";
  if (chave.startsWith("leste")) return "Zona Leste";
  if (chave.startsWith("oeste")) return "Zona Oeste";
  if (chave.startsWith("sul")) return "Zona Sul";
  return null;
}

type PontoGeoJson = number[];
type PoligonoGeoJson = PontoGeoJson[][];

interface FeatureRegiaoSiglon {
  geometry: { type: "Polygon"; coordinates: PoligonoGeoJson };
  properties: { "REGIÃO": string };
}

function pontoNoAnel(longitude: number, latitude: number, anel: PontoGeoJson[]): boolean {
  let dentro = false;
  for (let atual = 0, anterior = anel.length - 1; atual < anel.length; anterior = atual++) {
    const [lonAtual, latAtual] = anel[atual];
    const [lonAnterior, latAnterior] = anel[anterior];
    const cruza = (latAtual > latitude) !== (latAnterior > latitude)
      && longitude < (lonAnterior - lonAtual) * (latitude - latAtual)
        / (latAnterior - latAtual) + lonAtual;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Resolve a região inteiramente no dispositivo usando uma cópia simplificada
 * dos polígonos públicos do SIGLON. Nenhum endereço ou coordenada é enviado
 * ao serviço municipal durante a avaliação.
 * Fonte: Lei 13.718/2023, camada "Regiões de Londrina" do SIGLON. */
export function regiaoPorCoordenadasLondrina(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): RegiaoLondrina | null {
  if (latitude == null || longitude == null
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const features = regioesGeoJson.features as FeatureRegiaoSiglon[];
  for (const feature of features) {
    const [externo, ...furos] = feature.geometry.coordinates;
    if (externo && pontoNoAnel(longitude, latitude, externo)
      && !furos.some((anel) => pontoNoAnel(longitude, latitude, anel))) {
      return normalizarRegiaoLondrina(feature.properties["REGIÃO"]);
    }
  }
  return null;
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

  return REGIOES_COLETA_LONDRINA.flatMap((regiao) => {
      const bairros = REGIOES_LONDRINA[regiao];
      const capacidade = bairros.length * PORTAIS_PRIORIZADOS.length;
      if (limitePorZona > capacidade) {
        throw new Error(`A ${regiao} admite no máximo ${capacidade} consultas únicas.`);
      }
      return PORTAIS_PRIORIZADOS.flatMap((portal) =>
        bairros.map((bairro) => ({ regiao, bairro, portal })),
      ).slice(0, limitePorZona);
    });
}
