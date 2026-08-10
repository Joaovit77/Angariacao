import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { dataPublicacaoOlx, dentroDoPeriodo } from "@/lib/datas";
import {
  idDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";

const LIMITE_RESULTADOS = 50;
const TIMEOUT_FIRECRAWL_MS = 55_000;

interface RespostaFirecrawl {
  success?: boolean;
  warning?: string;
  error?: string;
  data?: {
    rawHtml?: string;
    metadata?: { statusCode?: number; title?: string };
  };
}

export class FirecrawlIndisponivel extends Error {}

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

function cidadeBairroWimoveis(valor: string): { cidade: string | null; bairro: string | null } {
  const partes = valor.split(",").map((parte) => parte.trim()).filter(Boolean);
  if (partes.length < 2) return { cidade: partes[0] || null, bairro: null };
  const ultimo = partes.at(-1)?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (ultimo === "parana" || ultimo === "pr") return { cidade: partes[0], bairro: null };
  return { cidade: partes.at(-1) || null, bairro: partes.slice(0, -1).join(", ") || null };
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
        descricao: null,
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
      const localidade = textos.find((valor) => /,\s*[^/]+\/PR/i.test(valor));
      const endereco = textos.find((valor) => valor !== localidade
        && !/R\$|m²|^\d+$|Endereço indisponível/i.test(valor));
      const local = cidadeBairro(localidade?.replace(/\/PR.*$/, "").split(",").reverse().join(", ") || "");
      return [{
        idExterno: idDoAnuncio("chaves-na-mao", url, indice),
        portal: "chaves-na-mao" as const,
        titulo,
        preco: dinheiro(precoTexto),
        cidade: local.cidade,
        bairro: local.bairro,
        endereco: endereco || null,
        imagem: imagemDe(link),
        url,
        descricao: null,
        anunciante: "incerto" as const,
      }];
    });
}

function extrairWimoveis($: CheerioAPI, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao[] {
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
      return [{
        idExterno: card.attr("data-id") || idDoAnuncio("wimoveis", url, indice),
        portal: "wimoveis" as const,
        titulo,
        preco,
        cidade: local.cidade,
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
    case "olx": return extrairOlx($, filtros);
    case "chaves-na-mao": return extrairChaves($);
    case "wimoveis": return extrairWimoveis($, filtros);
    case "viva-real": return extrairVivaReal($, filtros);
  }
}

export async function buscarComFirecrawl(
  filtros: FiltrosCentralAngariacao,
  urlPesquisa: string,
): Promise<AnuncioCentralAngariacao[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new FirecrawlIndisponivel("FIRECRAWL_API_KEY não configurada.");
  const resposta = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: urlPesquisa,
      formats: ["rawHtml"],
      proxy: "auto",
      location: { country: "BR", languages: ["pt-BR"] },
      timeout: TIMEOUT_FIRECRAWL_MS,
      storeInCache: false,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_FIRECRAWL_MS + 5_000),
  });
  const corpo = await resposta.json().catch(() => null) as RespostaFirecrawl | null;
  if (!resposta.ok || !corpo?.success || !corpo.data?.rawHtml) {
    throw new FirecrawlIndisponivel(
      `Firecrawl respondeu ${resposta.status}: ${corpo?.error || "conteúdo indisponível"}`,
    );
  }
  const anuncios = extrairAnunciosFirecrawl(corpo.data.rawHtml, filtros);
  console.info("[central-angariacao] consulta Firecrawl concluída", {
    portal: filtros.portal,
    anuncios: anuncios.length,
    statusPortal: corpo.data.metadata?.statusCode,
    warning: corpo.warning || undefined,
  });
  return anuncios;
}
