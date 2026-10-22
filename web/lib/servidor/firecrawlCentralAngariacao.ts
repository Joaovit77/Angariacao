import { exigirTempoFaseRadar, type TempoRodadaRadar, type OrcamentoRodadaRadar } from "./orcamentoRadar";
import { gzipSync, gunzipSync } from "node:zlib";
import { randomUUID, createHash } from "node:crypto";
import type { AquisicaoPortalRadar, TransportePaginaRadar } from "./coberturaRadar";
import { chaveCanonicaConsultaPortal } from "./planejadorColetaMercados";
import { getCache } from "@vercel/functions";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import { anuncioAdmitidoRecorteRadar, filtrosRadarSaoLegados, finalidadeContextoRadar } from "@/lib/calculo/aquisicaoRadar";
import { exigirCapacidadeAquisicaoRadar } from "./centralAngariacao";
import type { AnyNode } from "domhandler";
import { tituloWimoveis } from "./tituloWimoveis";
import { extrairZap, type DiagnosticoZap } from "./parserZap";
import { extrairVivaRealLocacao } from "./parserVivaReal";
import { extrairVendaRadar } from "./parserVendaRadar";
import { extrairOlxVenda, extrairWimoveisVenda } from "./parserVendaOlxWimoveis";
import { extrairOlxLocacao } from "./parserOlx";
import { agoraISOString, agoraTimestamp, dataPublicacaoOlx, dentroDoPeriodo, timestampDeIso } from "@/lib/datas";
import { segundosRetryAfter } from "@/lib/calculo/retryAfter";
import {
  decidirRetryFirecrawl,
  type MotivoRetryFirecrawl,
} from "@/lib/calculo/retryFirecrawl";
import { classificarErroFetch } from "./investigadorObservabilidade";
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
  origemRadar?: AquisicaoPortalRadar;
};
type EstadoConsulta = {
  aquisicao: "cache" | "firecrawl" | "desconhecida";
  statusHttp: number | null;
  /** Tentativa Firecrawl em curso (R5); null antes da primeira ou no cache. */
  tentativa: number | null;
};
const consultasEmAndamento = new Map<string, {
  coletaId: string;
  promessa: Promise<HtmlColetado>;
  estado: EstadoConsulta;
}>();

interface RespostaFirecrawl {
  success?: boolean;
  warning?: string;
  error?: string;
  data?: {
    rawHtml?: string;
    metadata?: { statusCode?: number; title?: string; sourceURL?: string; url?: string };
  };
}

export class FirecrawlIndisponivel extends Error {
  /** Status HTTP da própria API Firecrawl, quando houve resposta. */
  readonly statusHttp: number | null;
  /** `cause.code` curto do fetch (ECONNRESET...), já sanitizado. */
  readonly causaRede: string | null;
  /** `Retry-After` de um 429, em ms; o header bruto não é guardado. */
  readonly retryAfterMs: number | null;

  constructor(
    mensagem: string,
    readonly codigo: CodigoErroFirecrawl = "firecrawl_indisponivel",
    readonly statusPortalHttp: number | null = null,
    sinais: { statusHttp?: number; causaRede?: string; retryAfterMs?: number } = {},
  ) {
    super(mensagem);
    this.statusHttp = sinais.statusHttp ?? null;
    this.causaRede = sinais.causaRede ?? null;
    this.retryAfterMs = sinais.retryAfterMs ?? null;
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
  if (!filtrosRadarSaoLegados(filtros)) return extrairVivaRealLocacao($, filtros, LIMITE_RESULTADOS);
  const vistos = new Set<string>();
  return $('a[href*="vivareal.com.br/imovel/"][href*="-id-"]').slice(0, LIMITE_RESULTADOS).toArray()
    .flatMap((elemento, indice) => {
      const link = $(elemento);
      const url = link.attr("href") || "";
      const titulo = texto(link.find("h2").first());
      if (!url || !titulo || vistos.has(url)) return [];
      vistos.add(url);
      const paragrafos = link.find("p").toArray().map((p) => texto($(p))).filter(Boolean);
      // Na estrutura comprovada do Viva Real, a posição do R$ não identifica o aluguel.
      const preco: number | null = null;
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

function extrairChaves($: CheerioAPI, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
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
      const apartamentoExplicito = filtros.finalidade === "locacao" && filtros.tipoRecorte === "apartamento";
      // Os números visuais ficam isolados; os rótulos acessíveis publicam as unidades.
      const rotulos = apartamentoExplicito ? link.find('p[aria-label]').toArray()
        .map((p) => $(p).attr("aria-label") || "").filter((v) => /quartos?|banheiros?|vagas?/i.test(v)) : [];
      const precoPublicado = apartamentoExplicito
        ? dinheiro(texto(link.find('p[aria-label="Preço"] b').first()))
        : dinheiro(precoTexto);
      if (apartamentoExplicito && (!url.includes("-para-alugar-") || precoPublicado == null)) return [];
      return [{
        idExterno,
        portal: "chaves-na-mao" as const,
        titulo,
        preco: precoPublicado,
        cidade: local.cidade,
        estado,
        bairro: local.bairro,
        endereco: endereco || null,
        imagem: imagemDe(link) || fotosJsonLd.get(idExterno) || null,
        url,
        descricao: [...textos, ...rotulos].join(" · ") || null,
        anunciante: "incerto" as const,
      }];
    });
}

/** RentAction prova a finalidade do card pelo ID nativo da sua própria URL.
 * Nunca associa pela posição nem usa a descrição comercial como preço. */
function idsLocacaoWimoveis($: CheerioAPI): Map<string, string | null> {
  const ids = new Map<string, string | null>();
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const no = JSON.parse($(script).html() || "") as { "@type"?: string; object?: { url?: string; address?: { addressRegion?: string } } };
      if (no["@type"] !== "RentAction" || typeof no.object?.url !== "string") return;
      const url = new URL(no.object.url);
      if (url.protocol !== "https:" || url.hostname !== "www.wimoveis.com.br") return;
      const id = url.pathname.match(/-(\d{6,})\.html$/)?.[1];
      if (id) ids.set(id, no.object.address?.addressRegion || null);
    } catch { /* JSON-LD inválido não comprova finalidade. */ }
  });
  return ids;
}

function extrairWimoveis($: CheerioAPI, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
  const vistos = new Set<string>();
  const casaExplicita = filtros.finalidade === "locacao" && filtros.tipoRecorte === "casa";
  const idsLocacao = casaExplicita ? idsLocacaoWimoveis($) : new Map<string, string | null>();
  return $('[data-qa="posting PROPERTY"], [data-to-posting*="/propriedades/"]')
    .slice(0, LIMITE_RESULTADOS).toArray().flatMap((elemento, indice) => {
      const card = $(elemento);
      const urlParcial = card.attr("data-to-posting") || "";
      const titulo = tituloWimoveis(card.find('img[alt]:not([alt=""])').first().attr("alt") || "");
      if (!urlParcial || !titulo) return [];
      const preco = dinheiro(texto(card.find('[data-qa="POSTING_CARD_PRICE"]').first()));
      const idNativo = card.attr("data-id") || "";
      if (casaExplicita && (!idsLocacao.has(idNativo) || preco == null
        || new URL(urlParcial, "https://www.wimoveis.com.br").pathname.match(/-(\d{6,})\.html$/)?.[1] !== idNativo)) return [];
      const features = card.find('[data-qa="POSTING_CARD_FEATURES"]').first();
      const caracteristicas = casaExplicita && features.children().length
        ? features.children().toArray().map((e) => texto($(e))).join(" · ") : texto(features);
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
        estado: local.estado || (casaExplicita ? idsLocacao.get(idNativo) : null),
        bairro: local.bairro,
        endereco: texto(card.find('[class*="location-address"]').first()) || null,
        imagem: imagemDe(card.find('[data-qa="POSTING_CARD_GALLERY"]').first()),
        url,
        descricao: caracteristicas || null,
        anunciante: "incerto" as const,
      }];
    });
}

export function extrairAnunciosFirecrawl(
  html: string,
  filtros: FiltrosCentralAngariacao,
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void,
  registrarDiagnosticoZap?: (diagnostico: DiagnosticoZap) => void,
): AnuncioCentralAngariacao[] {
  if (!filtrosRadarSaoLegados(filtros)) exigirCapacidadeAquisicaoRadar(filtros);
  const normalizar = (anuncio: AnuncioCentralAngariacao): AnuncioCentralAngariacao => ({
    ...comCaracteristicasDoAnuncio(anuncio, filtros.tipo), finalidade: finalidadeContextoRadar(filtros),
    ...((filtros.portal === "chaves-na-mao" && filtros.tipoRecorte === "apartamento")
      || (filtros.portal === "wimoveis" && filtros.tipoRecorte === "casa")
      ? { tipoRecorte: filtros.tipoRecorte } : {}),
  });
  const admitir = (anuncio: AnuncioCentralAngariacao) => anuncioAdmitidoRecorteRadar(anuncio, filtros);
  const $ = load(html);
  if (filtros.finalidade === "venda") return (filtros.portal === "olx" ? extrairOlxVenda($, filtros, LIMITE_RESULTADOS)
    : filtros.portal === "wimoveis" ? extrairWimoveisVenda($, filtros, LIMITE_RESULTADOS)
      : extrairVendaRadar($, filtros, LIMITE_RESULTADOS))
    .map(anuncio => comCaracteristicasDoAnuncio(anuncio, filtros.tipo)).filter(admitir);
  switch (filtros.portal) {
    case "olx": {
      if (filtrosRadarSaoLegados(filtros)) return extrairOlx($, filtros, registrarDiagnosticoOlx).map(normalizar);
      const anuncios = extrairOlxLocacao($, filtros, LIMITE_RESULTADOS).map(normalizar).filter(admitir);
      try { registrarDiagnosticoOlx?.({ cardsPagina: $("section.olx-adcard").length, noPeriodoAntesCidade: anuncios.length }); } catch { /* Observabilidade não interrompe coleta. */ }
      return anuncios;
    }
    case "chaves-na-mao": return extrairChaves($, filtros)
      .map(normalizar).filter(admitir);
    case "wimoveis": return extrairWimoveis($, filtros)
      .map(normalizar).filter(admitir);
    case "viva-real": return extrairVivaReal($, filtros)
      .map(normalizar).filter(admitir);
    case "zap": return extrairZap($, filtros, LIMITE_RESULTADOS, registrarDiagnosticoZap, html.length)
      .map(normalizar);
  }
  // Portal conhecido e inativo (ou valor sem tipo) nunca vira lista vazia silenciosa.
  throw new Error("Portal não ativo para coleta.");
}

/** Origem da coleta antes do parsing: permite medir custo mesmo se houver falha. */
export type OrigemConsultaFirecrawl = "cache" | "em_andamento" | "firecrawl";
export type CodigoErroFirecrawl = "firecrawl_429" | "firecrawl_timeout" | "firecrawl_indisponivel"
  | "firecrawl_http_falhou" | "firecrawl_resposta_invalida" | "firecrawl_resposta_falhou"
  | "firecrawl_html_invalido" | "portal_http_falhou" | "parser_falhou";
export type FaseConsultaFirecrawl = "cache_hit" | "single_flight" | "caminho_escolhido"
  | "fetch_iniciado" | "resposta_recebida" | "resultado_interpretado" | "falha"
  | "fallback" | "coleta_compartilhada_concluida" | "retry_agendado";
export interface EventoConsultaFirecrawl {
  fase: FaseConsultaFirecrawl;
  aquisicao: "cache" | "firecrawl" | "http_direto" | "desconhecida";
  coletaId: string;
  statusHttp?: number;
  statusPortalHttp?: number;
  codigo?: CodigoErroFirecrawl | MotivoRetryFirecrawl | import("./fallbackHttpChaves").CodigoErroHttpChaves;
  /** Tentativa Firecrawl a que a fase pertence (R5): 1, ou 2 depois de um retry. */
  tentativa?: number;
  /** Só em `retry_agendado`: espera antes da próxima tentativa. */
  backoffMs?: number;
  /** Só no `resultado_interpretado` do ZAP: contagens agregadas do parser. */
  diagnosticoZap?: DiagnosticoZap;
}

/**
 * Habilita a segunda tentativa da aquisição (R5). Sem política, a aquisição
 * faz 1 chamada, como antes. `restanteMs` é o orçamento do chamador;
 * `reservaPosAquisicaoMs`, o que ele precisa depois de receber o HTML.
 * `aleatorio` e `esperar` só existem para testes determinísticos.
 */
export interface PoliticaRetryFirecrawl {
  restanteMs: () => number;
  reservaPosAquisicaoMs: number;
  aleatorio?: () => number;
  esperar?: (ms: number) => Promise<void>;
}

function esperarMs(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
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
  exigirNova = false,
): Promise<{ html: string; statusHttp: number; transporte?: TransportePaginaRadar }> {
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
        // Sem escalada de proxy nem paginação; a única segunda tentativa
        // possível (R5) é decidida por `decidirRetryFirecrawl`, fora daqui.
        proxy: "basic",
        location: { country: "BR", languages: ["pt-BR"] },
        timeout: TIMEOUT_FIRECRAWL_MS,
        storeInCache: true,
        maxAge: exigirNova ? 0 : CACHE_FIRECRAWL_TTL_MS,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_FIRECRAWL_FETCH_MS),
    });
  } catch (erro) {
    if (erroDeTimeout(erro)) throw new FirecrawlIndisponivel("Consulta Firecrawl indisponível.", "firecrawl_timeout");
    const causaRede = classificarErroFetch(erro).codigo;
    throw new FirecrawlIndisponivel("Consulta Firecrawl indisponível.", "firecrawl_indisponivel", null,
      causaRede ? { causaRede } : {});
  }
  try { observar?.("resposta_recebida", resposta.status); } catch { /* telemetria acessória */ }
  if (!resposta.ok) {
    const retryAfter = resposta.status === 429 ? segundosRetryAfter(resposta.headers.get("retry-after")) : undefined;
    throw new FirecrawlIndisponivel("Firecrawl não concluiu a consulta.",
      resposta.status === 429 ? "firecrawl_429" : "firecrawl_http_falhou", null, {
        statusHttp: resposta.status,
        ...(retryAfter != null ? { retryAfterMs: retryAfter * 1000 } : {}),
      });
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
  const efetiva = typeof corpo.data.metadata?.url === "string" ? corpo.data.metadata.url : null;
  return { html: corpo.data.rawHtml, statusHttp: resposta.status, transporte: {
    urlSolicitada: urlPesquisa, urlEfetiva: efetiva, statusHttp: resposta.status,
    statusPortalHttp: statusPortal ?? null, redirecionada: efetiva === null ? null : efetiva !== urlPesquisa,
    urlFonte: typeof corpo.data.metadata?.sourceURL === "string" ? corpo.data.metadata.sourceURL : null,
  } };
}
function extrairComProtecao(
  html: string,
  filtros: FiltrosCentralAngariacao,
  registrarDiagnosticoOlx?: (diagnostico: DiagnosticoPaginaOlx) => void,
  registrarDiagnosticoZap?: (diagnostico: DiagnosticoZap) => void,
) {
  try {
    return extrairAnunciosFirecrawl(html, filtros, registrarDiagnosticoOlx, registrarDiagnosticoZap);
  } catch {
    throw new FirecrawlIndisponivel("Não foi possível interpretar a listagem.", "parser_falhou");
  }
}

export async function buscarComFirecrawlAoVivo(
  filtros: FiltrosCentralAngariacao, urlPesquisa: string,
): Promise<AnuncioCentralAngariacao[]> {
  exigirCapacidadeAquisicaoRadar(filtros);
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
  politicaRetry?: PoliticaRetryFirecrawl,
  registrarAquisicao?: (aquisicao: AquisicaoPortalRadar) => void,
  orcamentoRadar?: OrcamentoRodadaRadar,
  tempoRadar?: TempoRodadaRadar,
): Promise<AnuncioCentralAngariacao[]> {
  exigirCapacidadeAquisicaoRadar(filtros);
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  const existente = consultasEmAndamento.get(chave);
  if (existente) {
    registrarOrigem?.("em_andamento");
    notificarConsulta(observar, {
      fase: "single_flight", aquisicao: "desconhecida", coletaId: existente.coletaId,
    });
    try {
      const compartilhado = await existente.promessa;
      if (compartilhado.origemRadar) registrarAquisicao?.(compartilhado.origemRadar);
      notificarConsulta(observar, {
        fase: "coleta_compartilhada_concluida", aquisicao: compartilhado.aquisicao,
        coletaId: existente.coletaId,
        ...(compartilhado.statusHttp != null ? { statusHttp: compartilhado.statusHttp } : {}),
      });
      let diagnosticoCompartilhado: DiagnosticoZap | undefined;
      const anuncios = extrairComProtecao(compartilhado.html, filtros, registrarDiagnosticoOlx, (d) => { diagnosticoCompartilhado = d; });
      notificarConsulta(observar, {
        fase: "resultado_interpretado", aquisicao: compartilhado.aquisicao, coletaId: existente.coletaId,
        ...(diagnosticoCompartilhado ? { diagnosticoZap: diagnosticoCompartilhado } : {}),
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
  let diagnosticoZap: DiagnosticoZap | undefined;
  const registrarDiagnosticoZap = (diagnostico: DiagnosticoZap) => { diagnosticoZap = diagnostico; };
  const estado: EstadoConsulta = { aquisicao: "desconhecida", statusHttp: null, tentativa: null };
  const consulta = (async () => {
    const cache = getCache({ namespace: "central-firecrawl-html-v2" });
    try {
      const armazenado = await cache.get(chave);
      if (typeof armazenado === "string") {
        const html = gunzipSync(Buffer.from(armazenado, "base64")).toString("utf8");
        registrarOrigem?.("cache");
        estado.aquisicao = "cache";
        notificarConsulta(observar, { fase: "cache_hit", aquisicao: "cache", coletaId });
        let origemRadar: AquisicaoPortalRadar | undefined;
        if (registrarAquisicao) {
          const origem = await cache.get(`${chave}:origem-radar`) as { id?: string; em?: string; hash?: string; transporte?: TransportePaginaRadar } | null;
          if (origem?.id && origem.em && origem.hash === createHash("sha256").update(html).digest("hex")) {
            origemRadar = { id: origem.id, em: origem.em, html, origem: "firecrawl", confiavel: true,
              ...(filtros.portal === "chaves-na-mao" ? { transporte: origem.transporte } : {}) };
          }
        }
        return { html, aquisicao: "cache" as const, statusHttp: null, origemRadar };
      }
    } catch {
      console.warn("[central-angariacao] cache regional indisponível");
    }

    registrarOrigem?.("firecrawl");
    estado.aquisicao = "firecrawl";
    notificarConsulta(observar, { fase: "caminho_escolhido", aquisicao: "firecrawl", coletaId });
    const tentar = (tentativa: number) => {
      // Reconfere após cache/esperas e antes de reservar crédito ou enviar cada tentativa.
      if (tempoRadar) exigirTempoFaseRadar(tempoRadar, TIMEOUT_FIRECRAWL_FETCH_MS);
      estado.tentativa = tentativa;
      estado.statusHttp = null;
      orcamentoRadar?.reservarChamadaPaga();
      return coletarHtmlFirecrawl(urlPesquisa, (fase, statusHttp) => {
        if (statusHttp != null) estado.statusHttp = statusHttp;
        notificarConsulta(observar, {
          fase, aquisicao: "firecrawl", coletaId, tentativa,
          ...(statusHttp != null ? { statusHttp } : {}),
        });
      }, !!registrarAquisicao);
    };
    // R5: no máximo uma segunda tentativa, só da aquisição. O parser roda
    // depois, uma vez, sobre o HTML final; quem aguarda no single-flight
    // recebe esse mesmo resultado sem tentativas próprias.
    let coletado: Awaited<ReturnType<typeof coletarHtmlFirecrawl>>;
    try {
      coletado = await tentar(1);
    } catch (erro) {
      if (!(erro instanceof FirecrawlIndisponivel)) throw erro;
      const decisao = decidirRetryFirecrawl({
        falha: erro,
        portal: filtros.portal,
        politicaHabilitada: !!politicaRetry,
        tentativa: 1,
        restanteMs: politicaRetry ? politicaRetry.restanteMs() : 0,
        duracaoMaximaTentativaMs: TIMEOUT_FIRECRAWL_FETCH_MS,
        reservaPosAquisicaoMs: politicaRetry?.reservaPosAquisicaoMs ?? 0,
        jitter: (politicaRetry?.aleatorio ?? Math.random)(),
      });
      if (!decisao.retentar) throw erro;
      notificarConsulta(observar, {
        fase: "retry_agendado", aquisicao: "firecrawl", coletaId, tentativa: 1,
        codigo: decisao.motivo, backoffMs: decisao.esperaMs,
        ...(erro.statusHttp != null ? { statusHttp: erro.statusHttp } : {}),
      });
      await (politicaRetry?.esperar ?? esperarMs)(decisao.esperaMs);
      coletado = await tentar(2);
    }
    const origemRadar: AquisicaoPortalRadar | undefined = registrarAquisicao ? {
      id: coletaId, em: agoraISOString(), html: coletado.html, origem: "firecrawl", confiavel: true,
      ...(filtros.portal === "chaves-na-mao" ? { transporte: coletado.transporte } : {}),
    } : undefined;
    // O HTML só entra no cache após uma interpretação sem exceção.
    const anunciosProdutor = extrairComProtecao(coletado.html, filtros, registrarDiagnosticoOlx, registrarDiagnosticoZap);
    try {
      await cache.set(chave, gzipSync(coletado.html).toString("base64"), {
        ttl: CACHE_FIRECRAWL_TTL_SEGUNDOS,
        tags: ["central-firecrawl", `central-firecrawl:${filtros.portal}`],
        name: `Central: ${filtros.portal}`,
      });
      if (origemRadar) await cache.set(`${chave}:origem-radar`, {
        id: origemRadar.id, em: origemRadar.em, hash: createHash("sha256").update(coletado.html).digest("hex"),
        ...(origemRadar.transporte ? { transporte: origemRadar.transporte } : {}),
      }, { ttl: CACHE_FIRECRAWL_TTL_SEGUNDOS, tags: ["central-firecrawl"] });
    } catch {
      console.warn("[central-angariacao] consulta não armazenada no cache regional");
    }
    return {
      html: coletado.html, aquisicao: "firecrawl" as const,
      statusHttp: coletado.statusHttp, anunciosProdutor, origemRadar,
    };
  })().finally(() => consultasEmAndamento.delete(chave));

  consultasEmAndamento.set(chave, { coletaId, promessa: consulta, estado });
  try {
    const coletado = await consulta;
    if (coletado.origemRadar) registrarAquisicao?.(coletado.origemRadar);
    const anuncios = coletado.anunciosProdutor
      ?? extrairComProtecao(coletado.html, filtros, registrarDiagnosticoOlx, registrarDiagnosticoZap);
    notificarConsulta(observar, {
      fase: "resultado_interpretado", aquisicao: coletado.aquisicao, coletaId,
      ...(diagnosticoZap ? { diagnosticoZap } : {}),
    });
    return anuncios;
  } catch (erro) {
    notificarConsulta(observar, {
      fase: "falha", aquisicao: estado.aquisicao, coletaId,
      ...(estado.tentativa != null ? { tentativa: estado.tentativa } : {}),
      ...(estado.statusHttp != null ? { statusHttp: estado.statusHttp } : {}),
      ...(erro instanceof FirecrawlIndisponivel ? {
        codigo: erro.codigo,
        ...(erro.statusPortalHttp != null ? { statusPortalHttp: erro.statusPortalHttp } : {}),
      } : {}),
    });
    throw erro;
  }
}
