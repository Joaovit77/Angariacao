import type { FinalidadeAvaliacao, OrigemExternaAvaliacao } from "./avaliacao";

export type OrigemContextoAvaliacao = "radar-anuncio" | "comparavel";

export interface ReferenciaContextoAvaliacao {
  origem: OrigemContextoAvaliacao;
  id: string;
}

export interface PrefillAvaliacao {
  finalidade: FinalidadeAvaliacao;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  tipo: string | null;
  areaM2: number | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
}

export interface ContextoExternoAvaliacao {
  origem: "central" | "radar";
  prefill: PrefillAvaliacao;
  origemExterna: OrigemExternaAvaliacao;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function contextoAvaliacaoIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor.trim());
}

const PARAMETRO_POR_ORIGEM: Record<OrigemContextoAvaliacao, string> = {
  "radar-anuncio": "radarAnuncio",
  comparavel: "comparavel",
};

export function parametrosDaReferenciaAvaliacao(
  referencia: ReferenciaContextoAvaliacao,
): URLSearchParams {
  return new URLSearchParams({ [PARAMETRO_POR_ORIGEM[referencia.origem]]: referencia.id });
}

export function urlAvaliacaoDaReferencia(referencia: ReferenciaContextoAvaliacao): string {
  return "/avaliacao?" + parametrosDaReferenciaAvaliacao(referencia);
}

export function urlAvaliacaoDoRadarAnuncio(radarAnuncioId: string): string {
  return urlAvaliacaoDaReferencia({ origem: "radar-anuncio", id: radarAnuncioId });
}

export function urlAvaliacaoDoComparavel(comparavelId: string): string {
  return urlAvaliacaoDaReferencia({ origem: "comparavel", id: comparavelId });
}
