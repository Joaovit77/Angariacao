import { createHash } from "node:crypto";
import { PORTAIS_ATIVOS, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { normalizarUf, ufValida } from "@/lib/calculo/geografia";
import { capacidadeGeograficaPortal, urlDaPesquisa } from "./centralAngariacao";
import type { TipoRecorteRadar } from "@/lib/calculo/aquisicaoRadar";

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

interface MercadoParaPlanejamento {
  cidade: string; estado: string; finalidade: string; segmento: string; tipoRecorte?: TipoRecorteRadar;
}

function planejar(mercado: MercadoParaPlanejamento, legado: boolean) {
  if (mercado.finalidade !== "locacao" || mercado.segmento !== "residencial") {
    return { consultas: [], erro: "mercado_nao_suportado" as const };
  }
  if (!legado && !mercado.tipoRecorte) {
    return { consultas: [], erro: "mercado_nao_suportado" as const };
  }
  const estado = normalizarUf(mercado.estado);
  const cidade = mercado.cidade.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!cidade || !ufValida(estado)) {
    return { consultas: [], erro: "sem_portal_suportado" as const };
  }
  const consultas = deduplicarConsultasPortal(PORTAIS_ATIVOS.map((portal) => ({
    portal, cidade, estado,
    ...(!legado ? { finalidade: "locacao" as const, tipoRecorte: mercado.tipoRecorte } : {}),
  })));
  return { consultas, erro: consultas.length ? null : "sem_portal_suportado" as const };
}

/** Novo contrato: ausência de tipo não solicita uma aquisição ampla implícita. */
export function planejarColetaMercado(mercado: MercadoParaPlanejamento) {
  return planejar(mercado, false);
}

/** Adaptador exclusivo do worker de mercados monitorados já persistidos.
 * Preserva as consultas amplas anteriores, sem promover capacidade por tipo. */
export function planejarColetaMercadoLegado(mercado: MercadoParaPlanejamento) {
  return planejar(mercado, true);
}
