/* ================================================================
   GARIMPO EM CAMPO — contrato puro da memória longitudinal

   Este módulo nomeia os estados do domínio e concentra as regras que
   escolhem o avistamento corrente e a melhor localização observada.
   Não conhece React, Next, Supabase, Storage nem IA.
   ================================================================ */
import type { TIPOS_IMOVEL } from "../constantes";
import { timestampDeIso } from "../datas";

export const GRAUS_CERTEZA_PROSPECCAO = [
  "declarado",
  "observado",
  "derivado",
  "inferido",
  "hipotese",
  "confirmado",
  "desatualizado",
  "substituido",
  "desconhecido",
] as const;

export type GrauCertezaProspeccao = (typeof GRAUS_CERTEZA_PROSPECCAO)[number];
export type TipoImovelProspeccao = (typeof TIPOS_IMOVEL)[number];
export type SituacaoImovelIdentificado =
  | "identificado"
  | "investigando"
  | "promovendo"
  | "promovido"
  | "descartado"
  | "fundido";
export type PrecisaoLocalizacao = "gps" | "mapa" | "geocodificado" | "desconhecida";
export type EstadoClassificacaoAvistamento =
  | "pendente"
  | "concluida"
  | "indisponivel"
  | "nao_aplicavel";
export type EstadoFotoAvistamento = "reservada" | "ativa";
export type ModoClassificacaoProspeccao = "modelo" | "reuso";
export type OrigemEtiquetaProspeccao = "manual" | "ia-texto" | "ia-visao";
export type EstadoEtiquetaProspeccao =
  | "inferida"
  | "confirmada"
  | "contestada"
  | "substituida"
  | "desatualizada";

export interface LocalizacaoAvistamento {
  latitude: number | null;
  longitude: number | null;
  acuraciaMetros: number | null;
  precisaoLocalizacao: PrecisaoLocalizacao;
}

export interface AvistamentoProspeccao extends LocalizacaoAvistamento {
  id: string;
  imovelIdentificadoId: string;
  observadoEm: string;
  createdAt: string;
  observacao: string;
  observacaoRevisao: number;
  classificacaoEstado: EstadoClassificacaoAvistamento;
}

export interface ResumoAvistamentos {
  avistamentosTotal: number;
  primeiroAvistamentoEm: string | null;
  ultimoAvistamentoEm: string | null;
  avistamentoCorrenteId: string | null;
  melhorLocalizacao: (LocalizacaoAvistamento & { avistamentoId: string }) | null;
}

function compararIso(a: string, b: string): number {
  const instanteA = timestampDeIso(a);
  const instanteB = timestampDeIso(b);
  if (instanteA !== null && instanteB !== null && instanteA !== instanteB) {
    return instanteA - instanteB;
  }
  return a.localeCompare(b);
}

/** Ordenação canônica: data do evento, criação e id. */
export function compararAvistamentos(
  a: Pick<AvistamentoProspeccao, "observadoEm" | "createdAt" | "id">,
  b: Pick<AvistamentoProspeccao, "observadoEm" | "createdAt" | "id">,
): number {
  return compararIso(a.observadoEm, b.observadoEm)
    || compararIso(a.createdAt, b.createdAt)
    || a.id.localeCompare(b.id);
}

export function ordenarAvistamentosPorRecencia<T extends Pick<
  AvistamentoProspeccao,
  "observadoEm" | "createdAt" | "id"
>>(avistamentos: readonly T[]): T[] {
  return [...avistamentos].sort((a, b) => compararAvistamentos(b, a));
}

function coordenadasValidas(avistamento: LocalizacaoAvistamento): boolean {
  return avistamento.latitude !== null
    && avistamento.longitude !== null
    && Number.isFinite(avistamento.latitude)
    && Number.isFinite(avistamento.longitude)
    && avistamento.latitude >= -90
    && avistamento.latitude <= 90
    && avistamento.longitude >= -180
    && avistamento.longitude <= 180;
}

function pesoAcuracia(avistamento: LocalizacaoAvistamento): number {
  return avistamento.acuraciaMetros !== null
    && Number.isFinite(avistamento.acuraciaMetros)
    && avistamento.acuraciaMetros > 0
    ? avistamento.acuraciaMetros
    : Number.POSITIVE_INFINITY;
}

/**
 * Recalcula o snapshot a partir dos eventos completos. Avistamento retroativo
 * não vira corrente, e coordenada nova só vence quando é mais precisa.
 */
export function resumirAvistamentos(
  avistamentos: readonly AvistamentoProspeccao[],
): ResumoAvistamentos {
  if (!avistamentos.length) {
    return {
      avistamentosTotal: 0,
      primeiroAvistamentoEm: null,
      ultimoAvistamentoEm: null,
      avistamentoCorrenteId: null,
      melhorLocalizacao: null,
    };
  }

  const ordenados = [...avistamentos].sort(compararAvistamentos);
  const corrente = ordenados.at(-1)!;
  const comCoordenadas = ordenados.filter(coordenadasValidas).sort((a, b) =>
    pesoAcuracia(a) - pesoAcuracia(b) || compararAvistamentos(b, a));
  const melhor = comCoordenadas[0];

  return {
    avistamentosTotal: ordenados.length,
    primeiroAvistamentoEm: ordenados[0].observadoEm,
    ultimoAvistamentoEm: corrente.observadoEm,
    avistamentoCorrenteId: corrente.id,
    melhorLocalizacao: melhor ? {
      avistamentoId: melhor.id,
      latitude: melhor.latitude,
      longitude: melhor.longitude,
      acuraciaMetros: melhor.acuraciaMetros,
      precisaoLocalizacao: melhor.precisaoLocalizacao,
    } : null,
  };
}

/* ----------------------------------------------------------------
   LOCALIZAÇÃO (C6) — o que o aparelho mediu, o que o humano marcou, o
   que o endereço aproximou. `acuracia_metros` é cidadão de primeira
   classe: é por ela que o snapshot decide qual coordenada vale (a de
   menor raio), então cada origem precisa declarar a sua, honestamente.
   ---------------------------------------------------------------- */

/** Raio típico de um centroide do Nominatim por nível de acerto. Não são
    medidas: são a declaração de que "geocodificado" é aproximado, e de
    quanto — um fix de GPS pior que isso perde para o endereço, e um
    melhor vence. */
export const ACURACIA_GEOCODE_METROS = {
  endereco: 50,
  rua: 250,
  bairro: 1500,
  cidade: 5000,
} as const;

export type NivelGeocodificacao = keyof typeof ACURACIA_GEOCODE_METROS;

/** Pino posto à mão no zoom de rua: o humano acertou a casa, mas o dedo tem
    esta margem. Perde para um GPS de 10 m; vence um GPS de 300 m no carro. */
export const ACURACIA_MAPA_METROS = 25;

/** Acima disto o GPS ainda é guardado (o snapshot só melhora), mas a tela
    diz em voz alta que a leitura é imprecisa — dentro do carro, entre
    prédios, GPS frio. */
export const LIMIAR_GPS_IMPRECISO_METROS = 100;

export interface LocalizacaoCapturada {
  latitude: number;
  longitude: number;
  acuraciaMetros: number | null;
  precisaoLocalizacao: Exclude<PrecisaoLocalizacao, "desconhecida">;
}

export const LOCALIZACAO_DESCONHECIDA: LocalizacaoAvistamento = {
  latitude: null,
  longitude: null,
  acuraciaMetros: null,
  precisaoLocalizacao: "desconhecida",
};

export function localizacaoDoGps(
  posicao: { latitude: number; longitude: number; acuraciaMetros: number },
): LocalizacaoCapturada {
  return {
    latitude: posicao.latitude,
    longitude: posicao.longitude,
    acuraciaMetros: posicao.acuraciaMetros > 0 ? posicao.acuraciaMetros : null,
    precisaoLocalizacao: "gps",
  };
}

export function localizacaoDoGeocode(
  geo: { lat: number; lon: number; precisao: NivelGeocodificacao },
): LocalizacaoCapturada {
  return {
    latitude: geo.lat,
    longitude: geo.lon,
    acuraciaMetros: ACURACIA_GEOCODE_METROS[geo.precisao],
    precisaoLocalizacao: "geocodificado",
  };
}

export function localizacaoDoMapa(ponto: { latitude: number; longitude: number }): LocalizacaoCapturada {
  return {
    latitude: ponto.latitude,
    longitude: ponto.longitude,
    acuraciaMetros: ACURACIA_MAPA_METROS,
    precisaoLocalizacao: "mapa",
  };
}

const ORDEM_PREFERENCIA: Record<PrecisaoLocalizacao, number> = {
  gps: 0,
  mapa: 1,
  geocodificado: 2,
  desconhecida: 3,
};

/**
 * Entre candidatas, a de menor raio vence (é a mesma regra do trigger, então
 * a tela nunca promete uma coordenada que o banco vai preterir). Empate de
 * raio segue a preferência GPS → mapa → geocodificado. Sem candidata válida,
 * o resultado é "desconhecida" — nunca zero, nunca a última tentativa falha.
 */
export function escolherLocalizacao(
  candidatas: readonly (LocalizacaoCapturada | null | undefined)[],
): LocalizacaoAvistamento {
  const validas = candidatas
    .filter((candidata): candidata is LocalizacaoCapturada => Boolean(candidata))
    .filter(coordenadasValidas);
  if (!validas.length) return LOCALIZACAO_DESCONHECIDA;
  const [melhor] = [...validas].sort((a, b) =>
    pesoAcuracia(a) - pesoAcuracia(b)
    || ORDEM_PREFERENCIA[a.precisaoLocalizacao] - ORDEM_PREFERENCIA[b.precisaoLocalizacao]);
  return { ...melhor };
}

export function gpsImpreciso(localizacao: LocalizacaoAvistamento): boolean {
  return localizacao.precisaoLocalizacao === "gps"
    && (localizacao.acuraciaMetros === null || localizacao.acuraciaMetros > LIMIAR_GPS_IMPRECISO_METROS);
}

function raioLegivel(metros: number): string {
  return metros >= 1000 ? `${(metros / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(metros)} m`;
}

/** O texto que a tela mostra. Nunca vende aproximação como exatidão. */
export function descreverLocalizacao(localizacao: LocalizacaoAvistamento): string {
  if (localizacao.latitude === null || localizacao.longitude === null) return "Sem localização registrada";
  const raio = localizacao.acuraciaMetros !== null && localizacao.acuraciaMetros > 0
    ? raioLegivel(localizacao.acuraciaMetros)
    : null;
  switch (localizacao.precisaoLocalizacao) {
    case "gps":
      return raio
        ? `${gpsImpreciso(localizacao) ? "GPS impreciso" : "GPS"} · precisão aproximada: ${raio}`
        : "GPS · precisão desconhecida";
    case "mapa":
      return `Marcada no mapa${raio ? ` · até ${raio}` : ""}`;
    case "geocodificado":
      return `Aproximada pelo endereço${raio ? ` · pode variar ${raio}` : ""}`;
    default:
      return "Localização de origem desconhecida";
  }
}

/* ----------------------------------------------------------------
   FONTE DA LOCALIZAÇÃO — quem registra DEPOIS, de casa, tem GPS bom no
   lugar errado. O raio não denuncia isso; a distância até o endereço
   denuncia. Então, com GPS e endereço em mãos, a escolha é explícita, e
   o padrão muda para o endereço quando o GPS está longe dele.
   ---------------------------------------------------------------- */

/** Abaixo disto o GPS pode estar simplesmente do outro lado da rua ou a
    geocodificação ter errado a quadra; acima, a pessoa não está lá. */
export const DISTANCIA_GPS_LONGE_METROS = 1000;

export type EscolhaFonteLocalizacao = "auto" | "gps" | "endereco";
export type FonteLocalizacaoResolvida = "mapa" | "gps" | "endereco" | "nenhuma";

export interface LocalizacaoResolvida {
  localizacao: LocalizacaoAvistamento;
  fonte: FonteLocalizacaoResolvida;
  /** GPS e endereço existem e estão longe demais um do outro. */
  gpsLonge: boolean;
}

export function gpsLongeDoEndereco(
  endereco: LocalizacaoCapturada,
  distanciaMetros: number | null,
): boolean {
  if (distanciaMetros === null) return false;
  const tolerancia = Math.max(DISTANCIA_GPS_LONGE_METROS, 3 * (endereco.acuraciaMetros ?? 0));
  return distanciaMetros > tolerancia;
}

/**
 * Pino no mapa é decisão humana e vence tudo. Depois, a escolha explícita.
 * Em "auto": GPS longe do endereço ⇒ endereço; senão a regra do raio.
 */
export function resolverFonteLocalizacao(entrada: {
  gps: LocalizacaoCapturada | null;
  mapa: LocalizacaoCapturada | null;
  endereco: LocalizacaoCapturada | null;
  distanciaGpsEnderecoMetros: number | null;
  escolha: EscolhaFonteLocalizacao;
}): LocalizacaoResolvida {
  const { gps, mapa, endereco, escolha } = entrada;
  const gpsLonge = Boolean(gps && endereco) && gpsLongeDoEndereco(endereco!, entrada.distanciaGpsEnderecoMetros);
  const com = (localizacao: LocalizacaoCapturada, fonte: FonteLocalizacaoResolvida): LocalizacaoResolvida =>
    ({ localizacao: { ...localizacao }, fonte, gpsLonge });
  if (mapa) return com(mapa, "mapa");
  if (escolha === "gps" && gps) return com(gps, "gps");
  if (escolha === "endereco" && endereco) return com(endereco, "endereco");
  if (gps && endereco && gpsLonge) return com(endereco, "endereco");
  const melhor = escolherLocalizacao([gps, endereco]);
  if (melhor.latitude === null) return { localizacao: melhor, fonte: "nenhuma", gpsLonge };
  return { localizacao: melhor, fonte: melhor.precisaoLocalizacao === "gps" ? "gps" : "endereco", gpsLonge };
}
