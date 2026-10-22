import "server-only";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { chaveBairroRadar, rotaBairroUniversoRadar } from "@/lib/calculo/bairroUniversoRadar";
import { urlDaPesquisa } from "./centralAngariacao";

/** Sem bairro conserva a aquisição da cidade. Bairro desconhecido nunca cai na cidade inteira. */
export function urlUniversoRadar(filtros: FiltrosCentralAngariacao): string | null {
  return chaveBairroRadar(filtros.bairro) ? rotaBairroUniversoRadar(filtros) : urlDaPesquisa(filtros);
}
