/* ================================================================
   ZAP IMÓVEIS — parser da listagem (R4.2h)

   Contrato comprovado no discovery (R4.2f), e nada além dele:
   - o CARD define o conjunto visível: `li[data-testid="rp-property-cd"]`
     com um link `/imovel/{slug}-id-{n}/`; o ID sai desse link, nunca da
     posição. Item do JSON-LD sem card é ignorado;
   - o JSON-LD só ENRIQUECE o anúncio do mesmo ID (Product/Apartment);
   - aluguel = Product.offers → Offer.potentialAction(RentAction)
     → priceSpecification.price, em BRL. `Offer.price` só corrobora; qualquer
     divergência, falta de vínculo ou de BRL deixa o preço nulo. O primeiro
     "R$" do card e o "/mês" nunca viram preço;
   - cidade e UF vêm do anúncio (JSON-LD, ou o texto "Bairro, Cidade" do card
     para a cidade). Filtro, URL e contexto da busca nunca preenchem local;
   - autoria é sempre `incerto`; `datePosted` não é lido (não é recência).
   ================================================================ */
import type { CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import {
  idDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { normalizarUf, ufValida } from "@/lib/calculo/geografia";

const ORIGEM_ZAP = "https://www.zapimoveis.com.br/";
const SELETOR_CARD_ZAP = 'li[data-testid="rp-property-cd"]';
const CAMINHO_ANUNCIO_ZAP = /^\/imovel\/[^/]+-id-(\d{6,})\/?$/i;
const LOGRADOURO = /^(rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.|rodovia|estrada|pra[çc]a)\s/i;

type Objeto = Record<string, unknown>;

function lista(valor: unknown): unknown[] {
  if (valor == null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function objeto(valor: unknown): Objeto | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Objeto : null;
}

function temTipo(valor: Objeto | null, tipo: string): boolean {
  return !!valor && lista(valor["@type"]).includes(tipo);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.replace(/\s+/g, " ").trim() : null;
}

function mesmaChave(a: string, b: string): boolean {
  const chave = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return chave(a) === chave(b);
}

/** Número publicado no JSON-LD: número, "2500", "2500.00" ou "2.500". */
function numeroJsonLd(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const bruto = texto(valor);
  if (!bruto) return null;
  let numero: number;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(bruto)) numero = Number(bruto.replace(/\./g, "").replace(",", "."));
  else if (/^\d+([.,]\d+)?$/.test(bruto)) numero = Number(bruto.replace(",", "."));
  else return null;
  return Number.isFinite(numero) ? numero : null;
}

function inteiroEntre(valor: unknown, minimo: number, maximo: number): number | null {
  const bruto = objeto(valor) ? (valor as Objeto).value : valor;
  const numero = numeroJsonLd(bruto);
  return numero != null && Number.isInteger(numero) && numero >= minimo && numero <= maximo ? numero : null;
}

/** ID do anúncio numa URL do ZAP: só o caminho `/imovel/{slug}-id-{n}/`. */
function idDaUrlZap(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  try {
    const url = new URL(bruto, ORIGEM_ZAP);
    if (!/(^|\.)zapimoveis\.com\.br$/i.test(url.hostname)) return null;
    return url.pathname.match(CAMINHO_ANUNCIO_ZAP)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** URL persistida: origem + caminho do link do card, sem query nem fragmento. */
function urlCanonicaZap(href: string): string | null {
  try {
    const url = new URL(href, ORIGEM_ZAP);
    if (!/(^|\.)zapimoveis\.com\.br$/i.test(url.hostname) || !CAMINHO_ANUNCIO_ZAP.test(url.pathname)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------
// JSON-LD: índice por ID; ID repetido em tipos iguais = ambíguo
// ----------------------------------------------------------------

interface JsonLdDoAnuncio {
  produto: Objeto | null;
  apartamento: Objeto | null;
}

function indexarJsonLd($: CheerioAPI): Map<string, JsonLdDoAnuncio> {
  const produtos = new Map<string, Objeto[]>();
  const apartamentos = new Map<string, Objeto[]>();
  const visitar = (valor: unknown, profundidade: number) => {
    if (profundidade > 12 || !valor || typeof valor !== "object") return;
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item, profundidade + 1);
      return;
    }
    const obj = valor as Objeto;
    const id = idDaUrlZap(obj.url);
    if (id && temTipo(obj, "Product")) produtos.set(id, [...(produtos.get(id) ?? []), obj]);
    if (id && temTipo(obj, "Apartment")) apartamentos.set(id, [...(apartamentos.get(id) ?? []), obj]);
    for (const filho of Object.values(obj)) visitar(filho, profundidade + 1);
  };
  $('script[type="application/ld+json"]').each((_, script) => {
    try { visitar(JSON.parse($(script).text()), 0); } catch { /* bloco malformado: ignora */ }
  });
  const indice = new Map<string, JsonLdDoAnuncio>();
  for (const id of new Set([...produtos.keys(), ...apartamentos.keys()])) {
    const p = produtos.get(id) ?? [];
    const a = apartamentos.get(id) ?? [];
    // Dois Products (ou dois Apartments) para o mesmo ID: não há como escolher.
    indice.set(id, { produto: p.length === 1 ? p[0] : null, apartamento: a.length === 1 ? a[0] : null });
  }
  return indice;
}

/** Aluguel estrutural: RentAction da Offer do próprio Product, em BRL. */
export function precoAluguelZap(produto: Objeto | null): number | null {
  const valores = new Set<number>();
  const ofertasComPrecoDivergente: boolean[] = [];
  for (const oferta of lista(produto?.offers).map(objeto)) {
    if (!oferta || !temTipo(oferta, "Offer")) continue;
    for (const acao of lista(oferta.potentialAction).map(objeto)) {
      if (!acao || !temTipo(acao, "RentAction")) continue;
      for (const especificacao of lista(acao.priceSpecification).map(objeto)) {
        if (!especificacao || !temTipo(especificacao, "PriceSpecification")) continue;
        if (texto(especificacao.priceCurrency)?.toUpperCase() !== "BRL") continue;
        const valor = numeroJsonLd(especificacao.price);
        if (valor == null || valor <= 0) continue;
        valores.add(Math.round(valor * 100));
        const precoOferta = numeroJsonLd(oferta.price);
        ofertasComPrecoDivergente.push(precoOferta != null && Math.round(precoOferta * 100) !== Math.round(valor * 100));
      }
    }
  }
  if (valores.size !== 1 || ofertasComPrecoDivergente.some(Boolean)) return null;
  return [...valores][0] / 100;
}

/** Campo de endereço coerente entre Apartment e Product; divergência = nulo. */
function campoEndereco(anuncio: JsonLdDoAnuncio, campo: string): { valor: string | null; divergente: boolean } {
  const a = texto(objeto(anuncio.apartamento?.address)?.[campo]);
  const p = texto(objeto(anuncio.produto?.address)?.[campo]);
  if (a && p && !mesmaChave(a, p)) return { valor: null, divergente: true };
  return { valor: a ?? p, divergente: false };
}

function areaJsonLd(valor: unknown): number | null {
  const tamanho = objeto(valor);
  const unidade = texto(tamanho?.unitCode) ?? texto(tamanho?.unitText);
  if (unidade && !/^(MTK|m²|m2)$/i.test(unidade)) return null;
  const area = numeroJsonLd(tamanho ? tamanho.value : valor);
  return area != null && area >= 10 && area <= 10000 ? area : null;
}

function imagemJsonLd(valor: unknown): string | null {
  for (const item of lista(valor)) {
    const url = texto(item) ?? texto(objeto(item)?.url) ?? texto(objeto(item)?.contentUrl);
    if (url && /^https:\/\//i.test(url)) return url;
  }
  return null;
}

function quantidadeNoTexto(valor: string, rotulo: string): number | null {
  const achado = valor.match(new RegExp(`(\\d{1,2})\\s*${rotulo}\\b`, "i"));
  return achado ? Number(achado[1]) : null;
}

function escaparRegex(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----------------------------------------------------------------
// Extração
// ----------------------------------------------------------------

export function extrairZap(
  $: CheerioAPI,
  filtros: FiltrosCentralAngariacao,
  limite: number,
): AnuncioCentralAngariacao[] {
  const jsonLd = indexarJsonLd($);
  const vistos = new Set<string>();
  const anuncios: AnuncioCentralAngariacao[] = [];

  $(SELETOR_CARD_ZAP).slice(0, limite).each((indice, elemento) => {
    const card = $(elemento as Element);
    const links = card.find("a[href]").toArray()
      .map((a) => $(a).attr("href") || "")
      .filter((href) => idDaUrlZap(href) != null);
    const ids = new Set(links.map((href) => idDaUrlZap(href)!));
    // Card sem link de anúncio, ou com links de dois anúncios, não entra.
    if (ids.size !== 1) return;
    const idLink = [...ids][0];
    const url = urlCanonicaZap(links[0]);
    if (!url || vistos.has(idLink)) return;
    const idExterno = idDoAnuncio("zap", url, indice);
    if (idExterno !== idLink) return;
    vistos.add(idLink);

    const dados = jsonLd.get(idLink) ?? { produto: null, apartamento: null };
    const folhas = card.find("*").toArray()
      .filter((el) => $(el).children().length === 0)
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const textoCard = folhas.join(" · ");

    const titulo = texto(dados.produto?.name)
      ?? texto(dados.apartamento?.name)
      ?? texto(card.find("h1, h2, h3, h4").first().text())
      ?? texto(card.find("a[title]").first().attr("title"));
    if (!titulo) return;

    // Local: só o que o anúncio publica.
    const rua = campoEndereco(dados, "streetAddress");
    const cidadeJsonLd = campoEndereco(dados, "addressLocality");
    const ufJsonLd = campoEndereco(dados, "addressRegion");
    const ancoraCidade = cidadeJsonLd.valor ?? (cidadeJsonLd.divergente ? null : filtros.cidade);
    const bairroCidade = ancoraCidade
      ? folhas.map((folha) => folha.match(new RegExp(`^([^,\\d|]{2,60}),\\s*(${escaparRegex(ancoraCidade)})$`, "i")))
        .find(Boolean)
      : null;
    const logradouroCard = folhas.find((folha) => LOGRADOURO.test(folha)) ?? null;
    const endereco = rua.divergente ? null : (rua.valor ?? logradouroCard);
    const cidade = cidadeJsonLd.divergente ? null : (cidadeJsonLd.valor ?? bairroCidade?.[2]?.trim() ?? null);
    const ufNormalizada = ufJsonLd.valor ? normalizarUf(ufJsonLd.valor) : "";
    const estado = !ufJsonLd.divergente && ufValida(ufNormalizada) ? ufNormalizada : null;

    const quartos = inteiroEntre(dados.produto?.numberOfBedrooms, 0, 30)
      ?? inteiroEntre(dados.apartamento?.numberOfBedrooms, 0, 30)
      ?? quantidadeNoTexto(textoCard, "quartos?");
    const banheiros = inteiroEntre(dados.produto?.numberOfBathroomsTotal, 0, 30)
      ?? inteiroEntre(dados.apartamento?.numberOfBathroomsTotal, 0, 30)
      ?? quantidadeNoTexto(textoCard, "banheiros?");
    const areaCard = textoCard.match(/(\d{2,5})\s*m²/i);
    const areaM2 = areaJsonLd(dados.produto?.floorSize) ?? areaJsonLd(dados.apartamento?.floorSize)
      ?? (areaCard ? Number(areaCard[1]) : null);
    const vagas = quantidadeNoTexto(textoCard, "vagas?");

    const imagemCard = card.find("img").toArray()
      .map((img) => $(img).attr("src") || $(img).attr("data-src") || "")
      .find((src) => /^https:\/\//i.test(src)) ?? null;

    const preco = precoAluguelZap(dados.produto);

    // Filtros locais: agem só sobre esta primeira página da listagem (a URL
    // comprovada não aceita preço nem quartos). Sem preço, faixa exclui.
    if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return;
    if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return;
    if (filtros.dormitorios != null && (quartos == null || quartos < filtros.dormitorios)) return;

    anuncios.push({
      idExterno,
      portal: "zap",
      titulo,
      preco,
      cidade,
      estado,
      bairro: bairroCidade?.[1]?.trim() ?? null,
      endereco,
      imagem: imagemCard ?? imagemJsonLd(dados.produto?.image) ?? imagemJsonLd(dados.apartamento?.image),
      url,
      descricao: textoCard || null,
      tipo: dados.apartamento ? "Apartamento" : undefined,
      areaM2,
      quartos,
      banheiros,
      vagas,
      publicadoEm: null,
      publicadoTexto: null,
      anunciante: "incerto",
    });
  });
  return anuncios;
}
