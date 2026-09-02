import { createHash } from "node:crypto";
import { PORTAIS_ANGARIACAO, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { normalizarUf, ufValida } from "@/lib/calculo/geografia";
import { capacidadeGeograficaPortal, urlDaPesquisa } from "./centralAngariacao";

export const LIMITE_CONSULTAS_MERCADO = 4;

/** A URL expressa somente parâmetros efetivamente consumidos pelo adaptador.
 * Filtros locais (por exemplo tipo na OLX) não criam uma segunda coleta paga. */
export function chaveCanonicaConsultaPortal(portal: string, urlPesquisa: string): string {
  const url = new URL(urlPesquisa);
  url.hash = "";
  url.searchParams.sort();
  return createHash("sha256").update(`${portal}:${url.toString()}`).digest("hex");
}

export function deduplicarConsultasPortal(filtros: FiltrosCentralAngariacao[]) {
  const consultas = new Map<string, { chave: string; filtros: FiltrosCentralAngariacao; url: string }>();
  for (const filtro of filtros) {
    if (!capacidadeGeograficaPortal(filtro).suportado) continue;
    const url = urlDaPesquisa(filtro);
    const chave = chaveCanonicaConsultaPortal(filtro.portal, url);
    if (!consultas.has(chave)) consultas.set(chave, { chave, filtros: filtro, url });
  }
  return [...consultas.values()].slice(0, LIMITE_CONSULTAS_MERCADO);
}

export function planejarColetaMercado(mercado: {
  cidade: string; estado: string; finalidade: string; segmento: string;
}) {
  if (mercado.finalidade !== "locacao" || mercado.segmento !== "residencial") {
    return { consultas: [], erro: "mercado_nao_suportado" as const };
  }
  const estado = normalizarUf(mercado.estado);
  const cidade = mercado.cidade.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!cidade || !ufValida(estado)) {
    return { consultas: [], erro: "sem_portal_suportado" as const };
  }
  const consultas = deduplicarConsultasPortal(PORTAIS_ANGARIACAO.map((portal) => ({
    portal, cidade, estado,
  })));
  return { consultas, erro: consultas.length ? null : "sem_portal_suportado" as const };
}
