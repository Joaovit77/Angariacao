import { load } from "cheerio";
import { continuacaoHidratacaoChavesRadar } from "./hidratacaoChavesRadar";
import { CONTRATO_JANELA_CHAVES_RADAR } from "../calculo/coberturaJanelaRadar";
import { telemetriaJanelaChavesRadar } from "./telemetriaJanelaChavesRadar";
import "server-only";
import { classificarPaginaChavesRadar, lerEvidenciaPaginaRadar, type PaginaPortalRadar } from "./coberturaRadar";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";

/** Outros portais aguardam página 1/2 e terminalidade reais; pistas históricas não certificam. */
export function adapterCoberturaRadar(portal: FiltrosCentralAngariacao["portal"]) {
  return portal === "chaves-na-mao" ? "chaves_itemlist_publicado_v1" : "evidencia_real_pendente";
}

/** Compõe Flight somente no adapter resumível; o leitor publicado continua intacto. */
export function lerEvidenciaPaginaResumivelRadar(html: string, url: string, base: string) {
  const evidencia = lerEvidenciaPaginaRadar(html, url, base);
  if (!evidencia) return null;
  const $ = load(html);
  const hidratacao = continuacaoHidratacaoChavesRadar($("script:not([src])").map((_, el) => $(el).text()).get(), url, base, evidencia.numero);
  if (hidratacao.conflito || (evidencia.proxima && hidratacao.proxima && evidencia.proxima !== hidratacao.proxima)) return null;
  return { ...evidencia, proxima: evidencia.proxima ?? hidratacao.proxima };
}

/** Presenças publicadas contam para cobertura; as três classes decidem admissão separadamente.
 * ids_fora_universo conserva o nome serializado anterior para os não qualificados de negócio. */
export function normalizarPaginaResumivelRadar(pagina: PaginaPortalRadar, base: string, filtros: FiltrosCentralAngariacao,
  contrato: "universo_observado_v2" | typeof CONTRATO_JANELA_CHAVES_RADAR = "universo_observado_v2") {
  const e = filtros.portal === "chaves-na-mao" ? lerEvidenciaPaginaResumivelRadar(pagina.html, pagina.url, base) : null;
  const p = e ? classificarPaginaChavesRadar(pagina, base, filtros) : null;
  return {
    contrato_cobertura: contrato,
    ...(contrato === CONTRATO_JANELA_CHAVES_RADAR ? { telemetria_portal: telemetriaJanelaChavesRadar(pagina.html) } : {}),
    numero: e?.numero ?? Number(new URL(pagina.url).searchParams.get("pg") || 1), url: pagina.url,
    total: e?.total ?? null, proxima: !!e?.proxima, proxima_url: e?.proxima ?? null,
    ids_observados: e?.ids ?? [], ids_qualificados: p?.qualificados ?? [],
    ids_fora_universo: p?.fora ?? [], ids_indeterminados: p?.indeterminados ?? [],
    criterios_exclusao: p?.exclusoes ?? {}, avisos: e?.avisos ?? [],
    url_documento: e?.urlDocumento ?? null, url_canonical: e?.urlCanonical ?? null,
    transporte: pagina.transporte ?? null, aquisicao_id: pagina.id, em: pagina.em,
    confiavel: pagina.confiavel && !!e && !!p,
  };
}
