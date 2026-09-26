import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { chaveCanonicaConsultaPortal } from "./planejadorColetaMercados";
import { getCache } from "@vercel/functions";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { agoraTimestamp, dataPublicacaoOlx, dentroDoPeriodo, timestampDeIso } from "@/lib/datas";
import {
  idDoAnuncio,
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";

export const LIMITE_RESULTADOS = 50;
export const TIMEOUT_FIRECRAWL_MS = 55_000;
export const TIMEOUT_FIRECRAWL_FETCH_MS = TIMEOUT_FIRECRAWL_MS + 5_000;
export const CACHE_FIRECRAWL_TTL_SEGUNDOS = 20 * 60;
const CACHE_FIRECRAWL_TTL_MS = CACHE_FIRECRAWL_TTL_SEGUNDOS * 1000;
type HtmlColetado = {
  html: string;
  aquisicao: "cache" | "firecrawl";
  statusHttp: number | null;
  anunciosProdutor?: AnuncioCentralAngariacao[];
};
const consultasEmAndamento = new Map<string, {
  coletaId: string;
  promessa: Promise<HtmlColetado>;
  estado: { aquisicao: "cache" | "firecrawl" | "desconhecida"; statusHttp: number | null };
}>();

interface RespostaFirecrawl {
  success?: boolean;
  warning?: string;
  error?: string;
  data?: {
    rawHtml?: string;
    metadata?: { statusCode?: number; title?: string };
  };
}

export class FirecrawlIndisponivel extends Error {
  constructor(
    mensagem: string,
    readonly codigo: CodigoErroFirecrawl = "firecrawl_indisponivel",
    readonly statusPortalHttp: number | null = null,
  ) {
    super(mensagem);
  }
}

function dinheiro(texto: string | null | undefined): number | null {
  const encontrado = texto?.match(/R\$\s*([\d.]+)/);
  if (!encontrado) return null;
  const valor = Number(encontrado[1].replace(/\./g, ""));
  return Number.isFinite(valor) ? valor : null;
}

function texto(elemento: Cheerio<AnyNode>): string {
  return elemento.text().replace(/\s+/g, " ").trim();
}

function imagemDe(elemento: Cheerio<AnyNode>): string | null {
  const imagem = elemento.find("img").first();
  return imagem.attr("src") || imagem.attr("data-src") || imagem.attr("data-lazy-src") || null;
}

function cidadeBairro(valor: string): { cidade: string | null; bairro: string | null } {
  const partes = valor.split(",").map((parte) => parte.trim()).filter(Boolean);
  if (partes.length < 2) return { cidade: partes[0] || null, bairro: null };
  return { cidade: partes[0], bairro: partes.slice(1).join(", ") };
}

function cidadeBairroWimoveis(valor: string): { cidade: string | null; bairro: string | null; estado: string | null } {
  const partes = valor.split(",").map((parte) => parte.trim()).filter(Boolean);
  if (partes.length < 2) return { cidade: partes[0] || null, bairro: null, estado: null };
  const ultimo = partes.at(-1)?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (ultimo === "parana" || ultimo === "pr") {
    return { cidade: partes[0], bairro: partes.length > 2 ? partes.slice(1, -1).join(", ") : null, estado: "PR" };
  }
  if (/^[a-z]{2}$/.test(ultimo || "")) {
    return { cidade: partes.at(-2) || null, bairro: partes.slice(0, -2).join(", ") || null, estado: ultimo!.toUpperCase() };
  }
  return { cidade: partes.at(-1) || null, bairro: partes.slice(0, -1).join(", ") || null, estado: null };
}

interface CardOlx {
  /** Posição 1-based na ordem original da página, contando todos os cards. */
  posicao: number;
  /** `null` quando o card não tem link/título/id de anúncio utilizável. */
  anuncio: AnuncioCentralAngariacao | null;
  noPeriodo: boolean;
  /** Fora do período, com data legível e mais antiga que `diasPublicacao`. */
  antigo: boolean;
}

interface PaginaOlx {
  cardsPagina: number;
  cards: CardOlx[];
}

/**
 * Lê os cards uma única vez. A extração e o diagnóstico derivam do mesmo
 * `noPeriodo` por card, então não podem divergir entre si. O filtro de período
 * é exatamente o de antes; só os primeiros LIMITE_RESULTADOS cards são
 * interpretados, como sempre foi.
 */
function lerPaginaOlx($: CheerioAPI, filtros: FiltrosCentralAngariacao): PaginaOlx {
  const agora = agoraTimestamp();
  const todos = $("section.olx-adcard");
  const cards = todos.slice(0, LIMITE_RESULTADOS).toArray().map((elemento, indice): CardOlx => {
    const posicao = indice + 1;
    const card = $(elemento);
    const link = card.find('a[data-testid="adcard-link"]').first();
    const url = link.attr("href") || "";
    const titulo = link.attr("title") || texto(link);
    if (!url || !titulo || !/\d{6,}(?:\?|$)/.test(url)) {
      return { posicao, anuncio: null, noPeriodo: false, antigo: false };
    }
    const local = cidadeBairro(texto(card.find(".olx-adcard__location").first()));
    const publicadoTexto = texto(card.find(".olx-adcard__date").first());
    const publicadoEm = dataPublicacaoOlx(publicadoTexto)?.toISOString() || null;
    const dias = filtros.diasPublicacao;
    const noPeriodo = !dias || dentroDoPeriodo(publicadoEm, dias);
    const publicado = timestampDeIso(publicadoEm);
    const antigo = !!dias && !noPeriodo && publicado != null
      && agora - publicado > dias * 24 * 60 * 60 * 1000;
    return {
      posicao,
      noPeriodo,
      antigo,
      anuncio: {
        idExterno: idDoAnuncio("olx", url, indice),
        portal: "olx" as const,
        titulo,
        preco: dinheiro(texto(card.find(".olx-adcard__price").first())),
        cidade: local.cidade,
        bairro: local.bairro,
        endereco: null,
        imagem: imagemDe(card),
        url,
        descricao: texto(card.find(".olx-adcard__details").first()) || null,
        publicadoEm,
        publicadoTexto: publicadoTexto || null,
        anunciante: "incerto" as const,
      },
    };
  });
  return { cardsPagina: todos.length, cards };
}

function anunciosDaPaginaOlx(pagina: PaginaOlx): AnuncioCentralAngariacao[] {
  return pagina.cards.flatMap((card) => (card.anuncio && card.noPeriodo ? [card.anuncio] : []));
}

/**
 * Diagnóstico da página da OLX para a observabilidade do Radar (R3.1).
 * Não altera a coleta: descreve a mesma página que a extração acabou de ler.
 *
 * - `cardsPagina`: todos os `section.olx-adcard` do HTML, antes de qualquer
 *   filtro, inclusive os além do limite de LIMITE_RESULTADOS e os inválidos.
 * - `noPeriodoAntesCidade`: anúncios válidos dos primeiros LIMITE_RESULTADOS
 *   cards que passaram por `diasPublicacao`. Na OLX é o mesmo número que a
 *   extração devolve (`coletados`), ainda antes do filtro de cidade/UF.
 * - `indiceUltimoNoPeriodo`: posição 1-based, na ordem original da página, do
 *   último card dentro do período; `null` se nenhum estiver.
 * - `cardsAntigosAntesDeRecente`: cards com data legível mais antiga que o
 *   período posicionados antes de `indiceUltimoNoPeriodo`. Numa página
 *   ordenada por recência é 0. Cards sem data legível ou inválidos não contam.
 *
 * Os dois últimos campos só existem quando a busca tem `diasPublicacao`.
 */
export interface DiagnosticoPaginaOlx {
  cardsPagina: number;
  noPeriodoAntesCidade: number;
  indiceUltimoNoPeriodo?: number | null;
  cardsAntigosAntesDeRecente?: number;
}

function diagnosticarPaginaOlx(pagina: PaginaOlx, filtros: FiltrosCentralAngariacao): DiagnosticoPaginaOlx {
  const noPeriodo = pagina.cards.filter((card) => card.anuncio && card.noPeriodo);
  const diagnostico: DiagnosticoPaginaOlx = {
    cardsPagina: pagina.cardsPagina,
    noPeriodoAntesCidade: noPeriodo.length,
  };
  if (!filtros.diasPublicacao) return diagnostico;
  const ultimo = noPeriodo.at(-1)?.posicao ?? null;
  return {
    ...diagnostico,
    indiceUltimoNoPeriodo: ultimo,
    cardsAntigosAntesDeRecente: ultimo == null
      ? 0
      : pagina.cards.filter((card) => card.anuncio && card.antigo && card.posicao < ultimo).length,
  };
}

function extrairOlx(
  $: CheerioAPI,
  filtros: FiltrosCentralAngariacao,
  registrarDiagnostico?: (diagnostico: DiagnosticoPaginaOlx) => void,
): AnuncioCentralAngariacao[] {
  const pagina = lerPaginaOlx($, filtros);
  if (registrarDiagnostico) {
    // Observabilidade nunca interrompe a coleta.
    try { registrarDiagnostico(diagnosticarPaginaOlx(pagina, filtros)); } catch { /* ignora */ }
  }
  return anunciosDaPaginaOlx(pagina);
}

function extrairVivaReal($: CheerioAPI, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
  const vistos = new Set<string>();
  return $('a[href*="vivareal.com.br/imovel/"][href*="-id-"]').slice(0, LIMITE_RESULTADOS).toArray()
    .flatMap((elemento, indice) => {
      const link = $(elemento);
      const url = link.attr("href") || "";
      const titulo = texto(link.find("h2").first());
      if (!url || !titulo || vistos.has(url)) return [];
      vistos.add(url);
      const paragrafos = link.find("p").toArray().map((p) => texto($(p))).filter(Boolean);
      const preco = dinheiro(paragrafos.find((valor) => /R\$\s*[\d.]+/.test(valor)));
      if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return [];
      if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return [];
      const quartos = Number(titulo.match(/(\d+)\s+quartos?/i)?.[1]);
      if (filtros.dormitorios != null && (!Number.isFinite(quartos) || quartos < filtros.dormitorios)) return [];
      const local = titulo.match(/\bem\s+(.+),\s*([^,]+)$/i);
      const endereco = paragrafos.find((valor) => /^(Rua|Avenida|Alameda|Travessa|Rodovia|Estrada)\b/i.test(valor));
      return [{
        idExterno: idDoAnuncio("viva-real", url, indice),
        portal: "viva-real" as const,
        titulo,
        preco,
        cidade: local?.[2]?.trim() || filtros.cidade,
        bairro: local?.[1]?.trim() || null,
        endereco: endereco || null,
        imagem: imagemDe(link),
        url,
        descricao: paragrafos.join(" · ") || null,
        anunciante: "incerto" as const,
      }];
    });
}

const HOST_IMAGEM_CHAVES = "www.chavesnamao.com.br";

/** ID do anúncio no endereço do detalhe do Chaves (`/imovel/.../id-43083373/`). */
function idDoDetalheChaves(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  try {
    return new URL(valor, `https://${HOST_IMAGEM_CHAVES}`).pathname.match(/\/id-(\d+)\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Foto do próprio anúncio: https, host do Chaves e o id no segmento
    `/imoveis/<pasta>/<id>/` do caminho, comparado por igualdade exata. */
function fotoDoAnuncioChaves(valor: unknown, id: string): string | null {
  if (typeof valor !== "string") return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== HOST_IMAGEM_CHAVES) return null;
  const partes = url.pathname.split("/");
  const indice = partes.indexOf("imoveis");
  if (indice < 0 || !/^\d+$/.test(partes[indice + 1] || "") || partes[indice + 2] !== id) return null;
  return url.toString();
}

/**
 * R4.1b.1: o Chaves só desenha `<img>` nos primeiros cards (as demais fotos
 * entram por lazy loading), mas publica a foto de todos no JSON-LD da página
 * (`offers.itemListElement[].itemOffered`, com `@id` do anúncio e `image`).
 * Monta uma vez por página o mapa id → foto. JSON malformado ou fora desse
 * formato é ignorado: o fallback nunca interrompe a coleta.
 */
function fotosJsonLdChaves($: CheerioAPI): Map<string, string> {
  const fotos = new Map<string, string>();
  const visitar = (no: unknown) => {
    if (!no || typeof no !== "object") return;
    if (Array.isArray(no)) {
      no.forEach(visitar);
      return;
    }
    const objeto = no as Record<string, unknown>;
    const id = idDoDetalheChaves(objeto["@id"]) ?? idDoDetalheChaves(objeto.url);
    if (id && !fotos.has(id)) {
      const candidatas = Array.isArray(objeto.image) ? objeto.image : [objeto.image];
      const foto = candidatas.map((candidata) => fotoDoAnuncioChaves(candidata, id)).find(Boolean);
      if (foto) fotos.set(id, foto);
    }
    Object.values(objeto).forEach(visitar);
  };
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      visitar(JSON.parse($(script).html() || ""));
    } catch {
      // bloco malformado: segue sem ele
    }
  });
  return fotos;
}

function extrairChaves($: CheerioAPI): AnuncioCentralAngariacao[] {
  const vistos = new Set<string>();
  const fotosJsonLd = fotosJsonLdChaves($);
  return $('a[href*="/imovel/"][href*="/id-"]').slice(0, LIMITE_RESULTADOS).toArray()
    .flatMap((elemento, indice) => {
      const link = $(elemento);
      const url = link.attr("href") || "";
      const titulo = texto(link.find("h2").first()) || link.attr("title") || "";
      if (!url || !titulo || vistos.has(url)) return [];
      vistos.add(url);
      const textos = link.find("p").toArray().map((p) => texto($(p))).filter(Boolean);
      const precoTexto = [...textos].reverse().find((valor) => /R\$\s*[\d.]+/.test(valor));
      const localidade = textos.find((valor) => /,\s*[^/]+\/[A-Z]{2}\b/i.test(valor));
      const endereco = textos.find((valor) => valor !== localidade
        && !/R\$|m²|^\d+$|Endereço indisponível/i.test(valor));
      const estado = localidade?.match(/\/([A-Z]{2})\b/i)?.[1]?.toUpperCase() || null;
      const local = cidadeBairro(localidade?.replace(/\/[A-Z]{2}.*$/i, "").split(",").reverse().join(", ") || "");
      const idExterno = idDoAnuncio("chaves-na-mao", url, indice);
      return [{
        idExterno,
        portal: "chaves-na-mao" as const,
        titulo,
        preco: dinheiro(precoTexto),
        cidade: local.cidade,
        estado,
        bairro: local.bairro,
        endereco: endereco || null,
        imagem: imagemDe(link) || fotosJsonLd.get(idExterno) || null,
        url,
        descricao: textos.join(" · ") || null,
        anunciante: "incerto" as const,
      }];
    });
}

function extrairWimoveis($: CheerioAPI, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
  const vistos = new Set<string>();
  return $('[data-qa="posting PROPERTY"], [data-to-posting*="/propriedades/"]')
    .slice(0, LIMITE_RESULTADOS).toArray().flatMap((elemento, indice) => {
      const card = $(elemento);
      const urlParcial = card.attr("data-to-posting") || "";
      const titulo = card.find('img[alt]:not([alt=""])').first().attr("alt") || "";
      if (!urlParcial || !titulo) return [];
      const preco = dinheiro(texto(card.find('[data-qa="POSTING_CARD_PRICE"]').first()));
      const caracteristicas = texto(card.find('[data-qa="POSTING_CARD_FEATURES"]').first());
      if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return [];
      if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return [];
      const quartos = Number(caracteristicas.match(/(\d+)\s+quartos?/i)?.[1]);
      if (filtros.dormitorios != null && (!Number.isFinite(quartos) || quartos < filtros.dormitorios)) return [];
      const local = cidadeBairroWimoveis(texto(card.find('[data-qa="POSTING_CARD_LOCATION"]').first()));
      const url = new URL(urlParcial, "https://www.wimoveis.com.br").toString();
      const identidade = card.attr("data-id") || url;
      if (vistos.has(identidade)) return [];
      vistos.add(identidade);
      return [{
        idExterno: card.attr("data-id") || idDoAnuncio("wimoveis", url, indice),
        portal: "wimoveis" as const,
        titulo,
        preco,
        cidade: local.cidade,
        estado: local.estado,
        bairro: local.bairro,
        endereco: texto(card.find('[class*="location-address"]').first()) || null,
        imagem: imagemDe(card.find('[data-qa="POSTING_CARD_GALLERY"]').first()),
        url,
        descricao: caracteristicas || null,
        anunciante: filtros.somenteProprietario ? "proprietario" as const : "incerto" as const,
      }];
    });
}

export function extrairAnunciosFirecrawl(
  html: string,
  filtros: FiltrosCentralAngariacao,
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void,
): AnuncioCentralAngariacao[] {
  const $ = load(html);
  switch (filtros.portal) {
    case "olx": return extrairOlx($, filtros, registrarDiagnosticoOlx)
      .map((anuncio) => comCaracteristicasDoAnuncio(anuncio, filtros.tipo));
    case "chaves-na-mao": return extrairChaves($)
      .map((anuncio) => comCaracteristicasDoAnuncio(anuncio, filtros.tipo));
    case "wimoveis": return extrairWimoveis($, filtros)
      .map((anuncio) => comCaracteristicasDoAnuncio(anuncio, filtros.tipo));
    case "viva-real": return extrairVivaReal($, filtros)
      .map((anuncio) => comCaracteristicasDoAnuncio(anuncio, filtros.tipo));
  }
}

/** Origem da coleta antes do parsing: permite medir custo mesmo se houver falha. */
export type OrigemConsultaFirecrawl = "cache" | "em_andamento" | "firecrawl";
export type CodigoErroFirecrawl = "firecrawl_429" | "firecrawl_timeout" | "firecrawl_indisponivel"
  | "firecrawl_http_falhou" | "firecrawl_resposta_invalida" | "firecrawl_resposta_falhou"
  | "firecrawl_html_invalido" | "portal_http_falhou" | "parser_falhou";
export type FaseConsultaFirecrawl = "cache_hit" | "single_flight" | "caminho_escolhido"
  | "fetch_iniciado" | "resposta_recebida" | "resultado_interpretado" | "falha"
  | "fallback" | "coleta_compartilhada_concluida";
export interface EventoConsultaFirecrawl {
  fase: FaseConsultaFirecrawl;
  aquisicao: "cache" | "firecrawl" | "http_direto" | "desconhecida";
  coletaId: string;
  statusHttp?: number;
  statusPortalHttp?: number;
  codigo?: CodigoErroFirecrawl | import("./fallbackHttpChaves").CodigoErroHttpChaves;
}

function notificarConsulta(
  observar: ((evento: EventoConsultaFirecrawl) => void) | undefined,
  evento: EventoConsultaFirecrawl,
): void {
  try { observar?.(evento); } catch { /* instrumentação nova nunca altera a coleta */ }
}

function erroDeTimeout(erro: unknown): boolean {
  return erro instanceof Error && ["AbortError", "TimeoutError"].includes(erro.name);
}

async function coletarHtmlFirecrawl(
  urlPesquisa: string,
  observar?: (fase: "fetch_iniciado" | "resposta_recebida", statusHttp?: number) => void,
): Promise<{ html: string; statusHttp: number }> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new FirecrawlIndisponivel("Firecrawl não configurado.");
  let resposta: Response;
  try {
    try { observar?.("fetch_iniciado"); } catch { /* telemetria acessória */ }
    resposta = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: urlPesquisa, formats: ["rawHtml"],
        // Sem escalada de proxy, retries ou paginação.
        proxy: "basic",
        location: { country: "BR", languages: ["pt-BR"] },
        timeout: TIMEOUT_FIRECRAWL_MS,
        storeInCache: true,
        maxAge: CACHE_FIRECRAWL_TTL_MS,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_FIRECRAWL_FETCH_MS),
    });
  } catch (erro) {
    throw new FirecrawlIndisponivel("Consulta Firecrawl indisponível.",
      erroDeTimeout(erro) ? "firecrawl_timeout" : "firecrawl_indisponivel");
  }
  try { observar?.("resposta_recebida", resposta.status); } catch { /* telemetria acessória */ }
  if (!resposta.ok) {
    throw new FirecrawlIndisponivel("Firecrawl não concluiu a consulta.",
      resposta.status === 429 ? "firecrawl_429" : "firecrawl_http_falhou");
  }

  let corpo: RespostaFirecrawl;
  try {
    corpo = await resposta.json() as RespostaFirecrawl;
  } catch (erro) {
    throw new FirecrawlIndisponivel("Resposta Firecrawl inválida.",
      erroDeTimeout(erro) ? "firecrawl_timeout" : "firecrawl_resposta_invalida");
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    throw new FirecrawlIndisponivel("Resposta Firecrawl inválida.", "firecrawl_resposta_invalida");
  }
  if (corpo.success === false) {
    throw new FirecrawlIndisponivel("Firecrawl não concluiu a consulta.", "firecrawl_resposta_falhou");
  }
  if (corpo.success !== true || !corpo.data || typeof corpo.data !== "object") {
    throw new FirecrawlIndisponivel("Resposta Firecrawl inválida.", "firecrawl_resposta_invalida");
  }

  const statusPortal = corpo.data.metadata?.statusCode;
  if (statusPortal != null && (!Number.isInteger(statusPortal) || statusPortal < 100 || statusPortal > 599)) {
    throw new FirecrawlIndisponivel("Resposta Firecrawl inválida.", "firecrawl_resposta_invalida");
  }
  if (statusPortal != null && statusPortal >= 400) {
    throw new FirecrawlIndisponivel("Portal indisponível.", "portal_http_falhou", statusPortal);
  }
  if (typeof corpo.data.rawHtml !== "string" || !corpo.data.rawHtml.trim()) {
    throw new FirecrawlIndisponivel("Firecrawl não retornou uma página utilizável.", "firecrawl_html_invalido");
  }
  return { html: corpo.data.rawHtml, statusHttp: resposta.status };
}
function extrairComProtecao(
  html: string,
  filtros: FiltrosCentralAngariacao,
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void,
) {
  try {
    return extrairAnunciosFirecrawl(html, filtros, registrarDiagnosticoOlx);
  } catch {
    throw new FirecrawlIndisponivel("Não foi possível interpretar a listagem.", "parser_falhou");
  }
}

export async function buscarComFirecrawlAoVivo(
  filtros: FiltrosCentralAngariacao, urlPesquisa: string,
): Promise<AnuncioCentralAngariacao[]> {
  return extrairComProtecao((await coletarHtmlFirecrawl(urlPesquisa)).html, filtros);
}

/**
 * Cache regional de HTML comprimido, anterior aos filtros locais. TTL preservado.
 * O Map evita coletas simultâneas equivalentes na mesma instância; não é um lock
 * distribuído entre Functions/regiões. O namespace muda pelo novo formato do valor.
 */
export async function buscarComFirecrawl(
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string,
  registrarOrigem?: (origem: OrigemConsultaFirecrawl) => void,
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void,
  observar?: (evento: EventoConsultaFirecrawl) => void,
): Promise<AnuncioCentralAngariacao[]> {
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  const existente = consultasEmAndamento.get(chave);
  if (existente) {
    registrarOrigem?.("em_andamento");
    notificarConsulta(observar, {
      fase: "single_flight", aquisicao: "desconhecida", coletaId: existente.coletaId,
    });
    try {
      const compartilhado = await existente.promessa;
      notificarConsulta(observar, {
        fase: "coleta_compartilhada_concluida", aquisicao: compartilhado.aquisicao,
        coletaId: existente.coletaId,
        ...(compartilhado.statusHttp != null ? { statusHttp: compartilhado.statusHttp } : {}),
      });
      const anuncios = extrairComProtecao(compartilhado.html, filtros, registrarDiagnosticoOlx);
      notificarConsulta(observar, {
        fase: "resultado_interpretado", aquisicao: compartilhado.aquisicao, coletaId: existente.coletaId,
      });
      return anuncios;
    } catch (erro) {
      notificarConsulta(observar, {
        fase: "falha", aquisicao: existente.estado.aquisicao,
        coletaId: existente.coletaId,
        ...(existente.estado.statusHttp != null ? { statusHttp: existente.estado.statusHttp } : {}),
        ...(erro instanceof FirecrawlIndisponivel ? {
          codigo: erro.codigo,
          ...(erro.statusPortalHttp != null ? { statusPortalHttp: erro.statusPortalHttp } : {}),
        } : {}),
      });
      throw erro;
    }
  }

  const coletaId = randomUUID();
  const estado: { aquisicao: "cache" | "firecrawl" | "desconhecida"; statusHttp: number | null } = {
    aquisicao: "desconhecida", statusHttp: null,
  };
  const consulta = (async () => {
    const cache = getCache({ namespace: "central-firecrawl-html-v2" });
    try {
      const armazenado = await cache.get(chave);
      if (typeof armazenado === "string") {
        const html = gunzipSync(Buffer.from(armazenado, "base64")).toString("utf8");
        registrarOrigem?.("cache");
        estado.aquisicao = "cache";
        notificarConsulta(observar, { fase: "cache_hit", aquisicao: "cache", coletaId });
        return { html, aquisicao: "cache" as const, statusHttp: null };
      }
    } catch {
      console.warn("[central-angariacao] cache regional indisponível");
    }

    registrarOrigem?.("firecrawl");
    estado.aquisicao = "firecrawl";
    notificarConsulta(observar, { fase: "caminho_escolhido", aquisicao: "firecrawl", coletaId });
    const coletado = await coletarHtmlFirecrawl(urlPesquisa, (fase, statusHttp) => {
      if (statusHttp != null) estado.statusHttp = statusHttp;
      notificarConsulta(observar, {
        fase, aquisicao: "firecrawl", coletaId,
        ...(statusHttp != null ? { statusHttp } : {}),
      });
    });
    // O HTML só entra no cache após uma interpretação sem exceção.
    const anunciosProdutor = extrairComProtecao(coletado.html, filtros, registrarDiagnosticoOlx);
    try {
      await cache.set(chave, gzipSync(coletado.html).toString("base64"), {
        ttl: CACHE_FIRECRAWL_TTL_SEGUNDOS,
        tags: ["central-firecrawl", `central-firecrawl:${filtros.portal}`],
        name: `Central: ${filtros.portal}`,
      });
    } catch {
      console.warn("[central-angariacao] consulta não armazenada no cache regional");
    }
    return {
      html: coletado.html, aquisicao: "firecrawl" as const,
      statusHttp: coletado.statusHttp, anunciosProdutor,
    };
  })().finally(() => consultasEmAndamento.delete(chave));

  consultasEmAndamento.set(chave, { coletaId, promessa: consulta, estado });
  try {
    const coletado = await consulta;
    const anuncios = coletado.anunciosProdutor
      ?? extrairComProtecao(coletado.html, filtros, registrarDiagnosticoOlx);
    notificarConsulta(observar, {
      fase: "resultado_interpretado", aquisicao: coletado.aquisicao, coletaId,
    });
    return anuncios;
  } catch (erro) {
    notificarConsulta(observar, {
      fase: "falha", aquisicao: estado.aquisicao, coletaId,
      ...(estado.statusHttp != null ? { statusHttp: estado.statusHttp } : {}),
      ...(erro instanceof FirecrawlIndisponivel ? {
        codigo: erro.codigo,
        ...(erro.statusPortalHttp != null ? { statusPortalHttp: erro.statusPortalHttp } : {}),
      } : {}),
    });
    throw erro;
  }
}
