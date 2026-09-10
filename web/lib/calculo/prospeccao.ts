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
