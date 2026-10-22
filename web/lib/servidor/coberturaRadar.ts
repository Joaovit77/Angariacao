import { chaveNormalizada } from "@/lib/normalizacao";
import { anuncioPertenceAoMercado } from "@/lib/calculo/centralAngariacao";
import { tipoRecorteObservadoRadar } from "@/lib/calculo/aquisicaoRadar";
import { extrairAnunciosFirecrawl } from "./firecrawlCentralAngariacao";
import { qualificarOfertaRadar } from "./qualificacaoOfertaRadar";
import { chaveBairroRadar, rotaBairroUniversoRadar } from "@/lib/calculo/bairroUniversoRadar";
import { urlPaginaChavesRadar } from "./urlPaginaRadar";
export { urlPaginaChavesRadar } from "./urlPaginaRadar";
import "server-only";
import { load } from "cheerio";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { identidadeVendaRadar } from "@/lib/calculo/identidadeVendaRadar";

/** Proveniência do transporte. HTML nunca é persistido na ponte global. */
export interface FontePaginaRadar {
  id: string;
  em: string;
  origem: "firecrawl" | "http_direto";
  html: string;
  confiavel: boolean;
  transporte?: TransportePaginaRadar;
}
/** Fatos da resposta da própria aquisição; URL documental não substitui URL efetiva. */
export interface TransportePaginaRadar {
  urlSolicitada: string;
  urlEfetiva: string | null;
  statusHttp: number;
  statusPortalHttp: number | null;
  redirecionada: boolean | null;
  urlFonte?: string | null;
}
export type MotivoTerminoRadar = "fim_comprovado" | "limite_paginas" | "limite_chamadas_pagas" | "limite_tempo"
  | "bairro_sem_rota_canonica" | "falha_pagina" | "sem_proveniencia" | "evidencia_inconsistente" | "total_incompleto" | "formato_desconhecido";
export interface PaginaPortalRadar extends FontePaginaRadar { url: string }
export interface AquisicaoPortalRadar extends FontePaginaRadar {
  paginas?: PaginaPortalRadar[];
  motivoTermino?: MotivoTerminoRadar;
  paginasLidas?: number;
}
export interface CoberturaColetaRadar {
  cobertura: "completa" | "parcial" | "desconhecida" | "truncada";
  total: number | null;
  evidencia: "itemlist_total_integral_v1" | "itemlist_paginado_integral_v1" | "itemlist_paginado_qualificado_v1" | null;
}

/** Bairro continua vinculado à rota qualificada; o ordinal do Chaves usa a prova combinada. */
export function rotaBairroComprovadaRadar(a: AquisicaoPortalRadar | undefined,
  filtros: FiltrosCentralAngariacao, base: string | null): boolean {
  if (!chaveBairroRadar(filtros.bairro)) return true;
  if (!a?.confiavel || !base || filtros.portal !== "chaves-na-mao" || rotaBairroUniversoRadar(filtros) !== base) return false;
  if (a.paginas) return !!avaliarSequenciaChavesRadar(a.paginas, base, filtros);
  return !!lerEvidenciaPaginaRadar(a.html, base, base);
}

/** Contrato comprovável na aquisição existente do Chaves: total da listagem
 * RealEstateListing.offers, associado à URL consultada. Outros formatos
 * permanecem desconhecidos até terem adaptador de cobertura próprio. */
export function avaliarCoberturaRadar(
  aquisicao: AquisicaoPortalRadar | undefined,
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string | null,
  anuncios: AnuncioCentralAngariacao[],
): CoberturaColetaRadar {
  const desconhecida: CoberturaColetaRadar = { cobertura: "desconhecida", total: null, evidencia: null };
  if (!urlPesquisa || !rotaBairroComprovadaRadar(aquisicao, filtros, urlPesquisa)) return desconhecida;
  if (aquisicao?.paginas) return avaliarPaginasRadar(aquisicao, filtros, urlPesquisa, anuncios);
  if (!aquisicao?.confiavel || filtros.portal !== "chaves-na-mao") return desconhecida;
  const $ = load(aquisicao.html);
  if (/captcha|access denied|acesso negado/i.test($("title").text())) return desconhecida;
  const listas: Record<string, unknown>[] = [];
  function visitar(valor: unknown) {
    if (Array.isArray(valor)) { valor.forEach(visitar); return; }
    if (!valor || typeof valor !== "object") return;
    const objeto = valor as Record<string, unknown>;
    if (objeto["@type"] === "RealEstateListing" && objeto.url === urlPesquisa) listas.push(objeto);
    if (objeto["@graph"]) visitar(objeto["@graph"]);
  }
  $("script[type='application/ld+json']").each((_, elemento) => {
    try { visitar(JSON.parse($(elemento).text())); } catch { /* Sem evidência não há novidade. */ }
  });
  if (listas.length !== 1) return desconhecida;
  const ofertas = listas[0].offers as Record<string, unknown> | undefined;
  if (ofertas?.["@type"] !== "ItemList" || !Number.isInteger(ofertas.numberOfItems)
    || Number(ofertas.numberOfItems) <= 0 || !Array.isArray(ofertas.itemListElement)) return desconhecida;
  const total = Number(ofertas.numberOfItems);
  const insuficiente = (cobertura: "parcial" | "truncada"): CoberturaColetaRadar => ({ cobertura, total, evidencia: null });
  if (total > 50 || $("a[rel~='next'][href],link[rel~='next'][href]").length) return insuficiente("truncada");
  const ids = new Set<string>();
  for (const entrada of ofertas.itemListElement) {
    if (!entrada || typeof entrada !== "object" || entrada["@type"] !== "Offer") return insuficiente("parcial");
    const identidade = identidadeVendaRadar(filtros.portal, entrada.url);
    if (!identidade) return insuficiente("parcial");
    ids.add(identidade.id);
  }
  const admitidos = new Set(anuncios.map((a) => a.idExterno));
  if (ids.size !== total || admitidos.size !== total || [...ids].some((id) => !admitidos.has(id))) return insuficiente("parcial");
  return { cobertura: "completa", total, evidencia: "itemlist_total_integral_v1" };
}

/** Lê listagem e navegação do Chaves; URL documental não atribui identidade ordinal. */
export interface EvidenciaPaginaRadar {
  total: number; ids: string[]; proxima: string | null; numero: number;
  urlDocumento: string; urlCanonical: string | null;
  avisos: Array<"portal_document_url_not_pagination_aware">;
}
export function lerEvidenciaPaginaRadar(html: string, url: string, base: string): EvidenciaPaginaRadar | null {
  const atual = new URL(url), origem = new URL(base);
  const numero = Number(atual.searchParams.get("pg") || 1);
  if (!Number.isSafeInteger(numero) || numero < 1 || url !== urlPaginaChavesRadar(base, numero)
    || origem.origin !== "https://www.chavesnamao.com.br") return null;
  const $ = load(html);
  if (/captcha|access denied|acesso negado/i.test($("title").text())) return null;
  const listas: Record<string, unknown>[] = [];
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visitar); return; }
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (o["@type"] === "RealEstateListing") listas.push(o);
    if (o["@graph"]) visitar(o["@graph"]);
  };
  $("script[type='application/ld+json']").each((_, el) => {
    try { visitar(JSON.parse($(el).text())); } catch { /* Evidência inválida fecha o gate. */ }
  });
  if (listas.length !== 1 || (listas[0].url !== url && !(numero > 1 && listas[0].url === base))) return null;
  const canonicas = $("link[rel~='canonical'][href]");
  const canonical = canonicas.attr("href") ?? null;
  if (canonicas.length > 1 || (canonical !== null && canonical !== base && canonical !== url)) return null;
  const urlDocumento = String(listas[0].url);
  const avisos: EvidenciaPaginaRadar["avisos"] = numero > 1 && (urlDocumento === base || canonical === base)
    ? ["portal_document_url_not_pagination_aware"] : [];
  const ofertas = listas[0].offers as Record<string, unknown> | undefined;
  if (ofertas?.["@type"] !== "ItemList" || !Number.isSafeInteger(ofertas.numberOfItems)
    || Number(ofertas.numberOfItems) <= 0 || !Array.isArray(ofertas.itemListElement)
    || ofertas.itemListElement.length === 0 || ofertas.itemListElement.length > 50) return null;
  const ids: string[] = [];
  for (const v of ofertas.itemListElement) {
    const o = v as Record<string, unknown> | null;
    const identidade = o?.["@type"] === "Offer" ? identidadeVendaRadar("chaves-na-mao", o.url) : null;
    if (!identidade || ids.includes(identidade.id)) return null;
    ids.push(identidade.id);
  }
  const proximas = new Set<string>();
  let invalida = false;
  $("a[href],link[rel~='next'][href]").each((_, el) => {
    const rel = ($(el).attr("rel") || "").split(/\s+/).includes("next");
    const rotulo = [$(el).text(), $(el).attr("aria-label"), $(el).attr("title")].join(" ").trim();
    const href = $(el).attr("href") || "";
    let destino: URL;
    try { destino = new URL(href, url); } catch { if (rel) invalida = true; return; }
    const navegacao = rel || /^(?:Próxim[ao](?: página)?|Página \d+)$/i.test(rotulo)
      || (destino.origin === atual.origin && destino.pathname === atual.pathname && destino.searchParams.has("pg"));
    if (!navegacao) return;
    if (destino.username || destino.password || destino.hash || destino.origin !== atual.origin || destino.pathname !== atual.pathname) {
      invalida = true; return;
    }
    const pg = Number(destino.searchParams.get("pg") || 1);
    if (rel && pg !== numero + 1) { invalida = true; return; }
    if (pg <= numero) return;
    if (destino.toString() !== urlPaginaChavesRadar(base, pg) || !Number.isSafeInteger(pg)) { invalida = true; return; }
    proximas.add(destino.toString());
  });
  if (invalida) return null;
  const seguinte = urlPaginaChavesRadar(base, numero + 1);
  if (proximas.size && !proximas.has(seguinte)) return null;
  return { total: Number(ofertas.numberOfItems), ids, proxima: proximas.size ? seguinte : null, numero, urlDocumento, urlCanonical: canonical, avisos };
}
/** Classifica cada ID observado sem completar campos com os filtros da busca. */
export function classificarPaginaChavesRadar(pagina: PaginaPortalRadar, base: string, filtros?: FiltrosCentralAngariacao) {
  const e = lerEvidenciaPaginaRadar(pagina.html, pagina.url, base);
  if (!e) return null;
  const qualificados: string[] = [], fora: string[] = [], indeterminados: string[] = [];
  const exclusoes: Record<string, string[]> = {};
  if (!filtros) return { qualificados: e.ids, fora, indeterminados, exclusoes };
  const anuncios = extrairAnunciosFirecrawl(pagina.html, filtros);
  for (const id of e.ids) {
    const encontrados = anuncios.filter((a) => a.idExterno === id);
    if (encontrados.length !== 1) { indeterminados.push(id); continue; }
    const a = encontrados[0], motivos: string[] = [];
    if (a.portal !== filtros.portal) motivos.push("portal");
    const acao = /(?:para-alugar|aluguel|locacao)/i.test(a.url) ? "locacao"
      : /(?:a-venda|para-venda|venda)/i.test(a.url) ? "venda" : a.finalidadeObservada;
    if (acao && acao !== filtros.finalidade) motivos.push("finalidade");
    const tipo = tipoRecorteObservadoRadar(a);
    if (tipo && tipo !== filtros.tipoRecorte) motivos.push("tipo");
    if (a.cidade && chaveNormalizada(a.cidade) !== chaveNormalizada(filtros.cidade)) motivos.push("cidade");
    if (a.estado && a.estado.toUpperCase() !== filtros.estado.toUpperCase()) motivos.push("uf");
    const bairro = chaveBairroRadar(a.bairro), desejado = chaveBairroRadar(filtros.bairro);
    if (desejado && bairro && bairro !== desejado) motivos.push("bairro");
    if (motivos.length) { fora.push(id); exclusoes[id] = motivos; }
    else if (!acao || !tipo || !a.estado || !anuncioPertenceAoMercado(a, filtros.cidade, filtros.estado)
      || (desejado && !bairro) || !qualificarOfertaRadar(a, filtros)) indeterminados.push(id);
    else qualificados.push(id);
  }
  return { qualificados, fora, indeterminados, exclusoes };
}

/** O progresso usa IDs brutos; o total declarado usa a população do universo. */
export function avaliarSequenciaChavesRadar(paginas: PaginaPortalRadar[], base: string, filtros?: FiltrosCentralAngariacao) {
  if (!paginas.length || paginas.length > 100) return null;
  const idsBrutos = new Set<string>(), ids = new Set<string>(), fora = new Set<string>(), indeterminados = new Set<string>();
  const classes = new Map<string, string>();
  const provas: Array<EvidenciaPaginaRadar & { idsNovos: string[]; idsQualificadosNovos: string[];
    populacao: NonNullable<ReturnType<typeof classificarPaginaChavesRadar>>; seguinte: string | null }> = [];
  let total: number | null = null, esperada: string | null = base;
  for (const [indice, pagina] of paginas.entries()) {
    if (!pagina.confiavel || pagina.url !== esperada) return null;
    const e = lerEvidenciaPaginaRadar(pagina.html, pagina.url, base);
    const populacao = classificarPaginaChavesRadar(pagina, base, filtros);
    if (!e || !populacao || e.numero !== indice + 1 || (total !== null && total !== e.total)) return null;
    const t = pagina.transporte;
    if (e.numero > 1 && (!t || t.urlSolicitada !== pagina.url || t.urlEfetiva !== pagina.url
      || t.redirecionada !== false || !Number.isInteger(t.statusHttp) || t.statusHttp < 200 || t.statusHttp >= 300
      || t.statusPortalHttp == null || !Number.isInteger(t.statusPortalHttp) || t.statusPortalHttp < 200 || t.statusPortalHttp >= 300
      || (t.urlFonte != null && t.urlFonte !== pagina.url))) return null;
    if (t && ((t.urlEfetiva != null && t.urlEfetiva !== pagina.url) || t.redirecionada === true)) return null;
    const idsNovos = e.ids.filter((id) => !idsBrutos.has(id));
    if (!idsNovos.length) return null;
    for (const [nome, conjunto] of [["qualificado", populacao.qualificados], ["fora", populacao.fora], ["indeterminado", populacao.indeterminados]] as const) {
      for (const id of conjunto) {
        if (classes.has(id) && classes.get(id) !== nome) return null;
        classes.set(id, nome);
      }
    }
    const idsQualificadosNovos = populacao.qualificados.filter((id) => !ids.has(id));
    idsNovos.forEach((id) => idsBrutos.add(id));
    populacao.qualificados.forEach((id) => ids.add(id)); populacao.fora.forEach((id) => fora.add(id));
    populacao.indeterminados.forEach((id) => indeterminados.add(id)); total = e.total;
    if (ids.size > total) return null;
    const seguinte = e.proxima ?? (ids.size < total ? urlPaginaChavesRadar(base, e.numero + 1) : null);
    provas.push({ ...e, idsNovos, idsQualificadosNovos, populacao, seguinte }); esperada = seguinte;
  }
  return { paginas: provas, ids, idsBrutos, total: total!, proxima: esperada,
    contagens: { raw_count: idsBrutos.size, qualified_count: ids.size, out_of_scope_count: fora.size,
      indeterminate_count: indeterminados.size, declared_total: total! } };
}
function avaliarPaginasRadar(a: AquisicaoPortalRadar, filtros: FiltrosCentralAngariacao, base: string,
  anuncios: AnuncioCentralAngariacao[]): CoberturaColetaRadar {
  const insuficiente: CoberturaColetaRadar = { cobertura: "parcial", total: null, evidencia: null };
  if (!a.confiavel || filtros.portal !== "chaves-na-mao") return insuficiente;
  const prova = avaliarSequenciaChavesRadar(a.paginas!, base, filtros);
  if (!prova) return insuficiente;
  const { ids, total } = prova;
  const admitidos = new Set(anuncios.filter((oferta) => ids.has(oferta.idExterno)).map((oferta) => oferta.idExterno));
  if (a.motivoTermino !== "fim_comprovado" || prova.proxima || prova.contagens.indeterminate_count > 0 || ids.size !== total || admitidos.size !== total
    || [...ids].some((id) => !admitidos.has(id))) return { ...insuficiente, total };
  return { cobertura: "completa", total, evidencia: prova.contagens.out_of_scope_count > 0
    ? "itemlist_paginado_qualificado_v1" : "itemlist_paginado_integral_v1" };
}
