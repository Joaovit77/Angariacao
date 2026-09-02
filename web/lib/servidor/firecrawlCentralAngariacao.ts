import { gzipSync, gunzipSync } from "node:zlib";
import { chaveCanonicaConsultaPortal } from "./planejadorColetaMercados";
import { getCache } from "@vercel/functions";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { dataPublicacaoOlx, dentroDoPeriodo } from "@/lib/datas";
import {
  idDoAnuncio,
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";

export const LIMITE_RESULTADOS = 50;
const TIMEOUT_FIRECRAWL_MS = 55_000;
export const CACHE_FIRECRAWL_TTL_SEGUNDOS = 20 * 60;
const CACHE_FIRECRAWL_TTL_MS = CACHE_FIRECRAWL_TTL_SEGUNDOS * 1000;
const consultasEmAndamento = new Map<string, Promise<string>>();

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
  constructor(mensagem: string, readonly codigo: CodigoErroFirecrawl = "firecrawl_indisponivel") {
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

function extrairOlx($: CheerioAPI, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
  return $("section.olx-adcard").slice(0, LIMITE_RESULTADOS).toArray().flatMap((elemento, indice) => {
    const card = $(elemento);
    const link = card.find('a[data-testid="adcard-link"]').first();
    const url = link.attr("href") || "";
    const titulo = link.attr("title") || texto(link);
    if (!url || !titulo || !/\d{6,}(?:\?|$)/.test(url)) return [];
    const local = cidadeBairro(texto(card.find(".olx-adcard__location").first()));
    const publicadoTexto = texto(card.find(".olx-adcard__date").first());
    const publicadoEm = dataPublicacaoOlx(publicadoTexto)?.toISOString() || null;
    if (filtros.diasPublicacao && !dentroDoPeriodo(publicadoEm, filtros.diasPublicacao)) return [];
    return [{
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
    }];
  });
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

function extrairChaves($: CheerioAPI): AnuncioCentralAngariacao[] {
  const vistos = new Set<string>();
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
      return [{
        idExterno: idDoAnuncio("chaves-na-mao", url, indice),
        portal: "chaves-na-mao" as const,
        titulo,
        preco: dinheiro(precoTexto),
        cidade: local.cidade,
        estado,
        bairro: local.bairro,
        endereco: endereco || null,
        imagem: imagemDe(link),
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
): AnuncioCentralAngariacao[] {
  const $ = load(html);
  switch (filtros.portal) {
    case "olx": return extrairOlx($, filtros)
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
export type CodigoErroFirecrawl = "firecrawl_429" | "firecrawl_timeout" | "firecrawl_indisponivel" | "parser_falhou";

async function coletarHtmlFirecrawl(urlPesquisa: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new FirecrawlIndisponivel("Firecrawl não configurado.");
  let resposta: Response;
  try {
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
      signal: AbortSignal.timeout(TIMEOUT_FIRECRAWL_MS + 5_000),
    });
  } catch (erro) {
    const timeout = erro instanceof Error && ["AbortError", "TimeoutError"].includes(erro.name);
    throw new FirecrawlIndisponivel("Consulta Firecrawl indisponível.",
      timeout ? "firecrawl_timeout" : "firecrawl_indisponivel");
  }
  const corpo = await resposta.json().catch(() => null) as RespostaFirecrawl | null;
  if (!resposta.ok || !corpo?.success || !corpo.data?.rawHtml) {
    throw new FirecrawlIndisponivel("Firecrawl não retornou uma página utilizável.",
      resposta.status === 429 ? "firecrawl_429" : "firecrawl_indisponivel");
  }
  const statusPortal = corpo.data.metadata?.statusCode;
  if (statusPortal && statusPortal >= 400) {
    throw new FirecrawlIndisponivel("Portal indisponível.",
      statusPortal === 429 ? "firecrawl_429" : "firecrawl_indisponivel");
  }
  return corpo.data.rawHtml;
}

function extrairComProtecao(html: string, filtros: FiltrosCentralAngariacao) {
  try {
    return extrairAnunciosFirecrawl(html, filtros);
  } catch {
    throw new FirecrawlIndisponivel("Não foi possível interpretar a listagem.", "parser_falhou");
  }
}

export async function buscarComFirecrawlAoVivo(
  filtros: FiltrosCentralAngariacao, urlPesquisa: string,
): Promise<AnuncioCentralAngariacao[]> {
  return extrairComProtecao(await coletarHtmlFirecrawl(urlPesquisa), filtros);
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
): Promise<AnuncioCentralAngariacao[]> {
  const chave = chaveCanonicaConsultaPortal(filtros.portal, urlPesquisa);
  const existente = consultasEmAndamento.get(chave);
  if (existente) {
    registrarOrigem?.("em_andamento");
    return extrairComProtecao(await existente, filtros);
  }

  const consulta = (async () => {
    const cache = getCache({ namespace: "central-firecrawl-html-v2" });
    try {
      const armazenado = await cache.get(chave);
      if (typeof armazenado === "string") {
        const html = gunzipSync(Buffer.from(armazenado, "base64")).toString("utf8");
        registrarOrigem?.("cache");
        return html;
      }
    } catch {
      console.warn("[central-angariacao] cache regional indisponível");
    }

    registrarOrigem?.("firecrawl");
    const html = await coletarHtmlFirecrawl(urlPesquisa);
    try {
      await cache.set(chave, gzipSync(html).toString("base64"), {
        ttl: CACHE_FIRECRAWL_TTL_SEGUNDOS,
        tags: ["central-firecrawl", `central-firecrawl:${filtros.portal}`],
        name: `Central: ${filtros.portal}`,
      });
    } catch {
      console.warn("[central-angariacao] consulta não armazenada no cache regional");
    }
    return html;
  })().finally(() => consultasEmAndamento.delete(chave));

  consultasEmAndamento.set(chave, consulta);
  return extrairComProtecao(await consulta, filtros);
}
