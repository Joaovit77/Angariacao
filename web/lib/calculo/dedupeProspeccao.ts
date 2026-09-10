/* Deduplicação conservadora: unidade veta; texto e geografia apenas avisam. */
import type { Imovel } from "../tipos";
import { chaveEndereco, chaveImovel, imoveisDuplicados } from "./duplicidade";
import type { TipoImovelProspeccao } from "./prospeccao";

const RAIO_TERRA_METROS = 6_371_000;
const ACURACIA_MAXIMA_UTIL_METROS = 100;
const DISTANCIA_PROVAVEL_METROS = 25;
const DISTANCIA_POSSIVEL_METROS = 60;
const TIPOS_VERTICAIS = new Set<TipoImovelProspeccao>([
  "Apartamento",
  "Kitnet/Studio",
  "Sala Comercial",
]);

export interface IdentidadeParaDedupe {
  id: string;
  logradouro?: string | null;
  numero?: string | null;
  cidade?: string | null;
  unidade?: string | null;
  bloco?: string | null;
  tipo?: TipoImovelProspeccao | null;
  latitude?: number | null;
  longitude?: number | null;
  acuraciaMetros?: number | null;
}

export type GrauDuplicidadeProspeccao = "exata" | "provavel" | "possivel" | "inconclusiva";

export interface ResultadoDedupeProspeccao {
  candidatoId: string;
  grau: GrauDuplicidadeProspeccao;
  origem: "texto" | "geografia";
  distanciaMetros: number | null;
  motivo: "identidade-textual" | "proximidade" | "precisao-nao-separa" | "unidade-desconhecida";
}

function enderecoComNumero(imovel: IdentidadeParaDedupe): string {
  return [imovel.logradouro?.trim(), imovel.numero?.trim()].filter(Boolean).join(", ");
}

export function chaveImovelIdentificado(imovel: IdentidadeParaDedupe): string {
  return chaveImovel({
    endereco: enderecoComNumero(imovel),
    cidade: imovel.cidade || "",
    unidade: imovel.unidade || "",
    bloco: imovel.bloco || "",
  });
}

function unidadeDivergente(a: IdentidadeParaDedupe, b: IdentidadeParaDedupe): boolean {
  const unidadeA = chaveEndereco(a.unidade);
  const unidadeB = chaveEndereco(b.unidade);
  return !!unidadeA && !!unidadeB && unidadeA !== unidadeB;
}

function unidadeDesconhecidaEmTipoVertical(imovel: IdentidadeParaDedupe): boolean {
  return !!imovel.tipo && TIPOS_VERTICAIS.has(imovel.tipo) && !chaveEndereco(imovel.unidade);
}

function coordenadasValidas(imovel: IdentidadeParaDedupe): imovel is IdentidadeParaDedupe & {
  latitude: number;
  longitude: number;
} {
  return imovel.latitude != null
    && imovel.longitude != null
    && Number.isFinite(imovel.latitude)
    && Number.isFinite(imovel.longitude)
    && imovel.latitude >= -90
    && imovel.latitude <= 90
    && imovel.longitude >= -180
    && imovel.longitude <= 180;
}

function grausParaRadianos(graus: number): number {
  return graus * Math.PI / 180;
}

export function distanciaHaversineMetros(
  a: Pick<IdentidadeParaDedupe, "latitude" | "longitude">,
  b: Pick<IdentidadeParaDedupe, "latitude" | "longitude">,
): number | null {
  const pontoA: IdentidadeParaDedupe = { id: "a", ...a };
  const pontoB: IdentidadeParaDedupe = { id: "b", ...b };
  if (!coordenadasValidas(pontoA) || !coordenadasValidas(pontoB)) return null;
  const deltaLatitude = grausParaRadianos(pontoB.latitude - pontoA.latitude);
  const deltaLongitude = grausParaRadianos(pontoB.longitude - pontoA.longitude);
  const latitudeA = grausParaRadianos(pontoA.latitude);
  const latitudeB = grausParaRadianos(pontoB.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * RAIO_TERRA_METROS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export interface CaixaBuscaGeografica {
  latitudeMinima: number;
  latitudeMaxima: number;
  longitudeMinima: number;
  longitudeMaxima: number;
}

/** Bounding box para reduzir candidatos antes do haversine exato. */
export function caixaBuscaGeografica(
  latitude: number,
  longitude: number,
  raioMetros = DISTANCIA_POSSIVEL_METROS,
): CaixaBuscaGeografica {
  const deltaLatitude = raioMetros / 111_320;
  const cosseno = Math.max(0.000001, Math.abs(Math.cos(grausParaRadianos(latitude))));
  const deltaLongitude = raioMetros / (111_320 * cosseno);
  return {
    latitudeMinima: Math.max(-90, latitude - deltaLatitude),
    latitudeMaxima: Math.min(90, latitude + deltaLatitude),
    longitudeMinima: Math.max(-180, longitude - deltaLongitude),
    longitudeMaxima: Math.min(180, longitude + deltaLongitude),
  };
}

function limitarPorUnidadeDesconhecida(
  resultado: ResultadoDedupeProspeccao,
  a: IdentidadeParaDedupe,
  b: IdentidadeParaDedupe,
): ResultadoDedupeProspeccao {
  if ((unidadeDesconhecidaEmTipoVertical(a) || unidadeDesconhecidaEmTipoVertical(b))
    && (resultado.grau === "exata" || resultado.grau === "provavel")) {
    return { ...resultado, grau: "possivel", motivo: "unidade-desconhecida" };
  }
  return resultado;
}

export function avaliarDuplicidadeProspeccao(
  alvo: IdentidadeParaDedupe,
  candidato: IdentidadeParaDedupe,
): ResultadoDedupeProspeccao | null {
  if (alvo.id === candidato.id || unidadeDivergente(alvo, candidato)) return null;

  const enderecoAlvo = chaveEndereco(enderecoComNumero(alvo));
  const enderecoCandidato = chaveEndereco(enderecoComNumero(candidato));
  if (enderecoAlvo && enderecoCandidato
    && chaveImovelIdentificado(alvo) === chaveImovelIdentificado(candidato)) {
    return limitarPorUnidadeDesconhecida({
      candidatoId: candidato.id,
      grau: "exata",
      origem: "texto",
      distanciaMetros: distanciaHaversineMetros(alvo, candidato),
      motivo: "identidade-textual",
    }, alvo, candidato);
  }

  if (!coordenadasValidas(alvo) || !coordenadasValidas(candidato)) return null;
  const acuraciaAlvo = alvo.acuraciaMetros;
  const acuraciaCandidato = candidato.acuraciaMetros;
  if (acuraciaAlvo == null || acuraciaCandidato == null
    || !Number.isFinite(acuraciaAlvo) || !Number.isFinite(acuraciaCandidato)
    || acuraciaAlvo <= 0 || acuraciaCandidato <= 0
    || acuraciaAlvo > ACURACIA_MAXIMA_UTIL_METROS
    || acuraciaCandidato > ACURACIA_MAXIMA_UTIL_METROS) return null;

  const distancia = distanciaHaversineMetros(alvo, candidato)!;
  let resultado: ResultadoDedupeProspeccao | null = null;
  if (distancia <= acuraciaAlvo + acuraciaCandidato) {
    resultado = {
      candidatoId: candidato.id,
      grau: "inconclusiva",
      origem: "geografia",
      distanciaMetros: distancia,
      motivo: "precisao-nao-separa",
    };
  } else if (distancia <= DISTANCIA_PROVAVEL_METROS) {
    resultado = {
      candidatoId: candidato.id,
      grau: "provavel",
      origem: "geografia",
      distanciaMetros: distancia,
      motivo: "proximidade",
    };
  } else if (distancia <= DISTANCIA_POSSIVEL_METROS) {
    resultado = {
      candidatoId: candidato.id,
      grau: "possivel",
      origem: "geografia",
      distanciaMetros: distancia,
      motivo: "proximidade",
    };
  }
  return resultado ? limitarPorUnidadeDesconhecida(resultado, alvo, candidato) : null;
}

export function encontrarDuplicatasProspeccao(
  alvo: IdentidadeParaDedupe,
  candidatos: readonly IdentidadeParaDedupe[],
): ResultadoDedupeProspeccao[] {
  return candidatos
    .map((candidato) => avaliarDuplicidadeProspeccao(alvo, candidato))
    .filter((resultado): resultado is ResultadoDedupeProspeccao => resultado !== null)
    .sort((a, b) => (a.distanciaMetros ?? Number.POSITIVE_INFINITY)
      - (b.distanciaMetros ?? Number.POSITIVE_INFINITY));
}

/** Quarta camada: consulta a carteira usando exatamente a identidade já existente. */
export function duplicatasDoIdentificadoNaCarteira(
  alvo: IdentidadeParaDedupe,
  carteira: Imovel[],
): Imovel[] {
  return imoveisDuplicados({
    endereco: enderecoComNumero(alvo),
    cidade: alvo.cidade || "",
    unidade: alvo.unidade || "",
    bloco: alvo.bloco || "",
  }, carteira);
}
