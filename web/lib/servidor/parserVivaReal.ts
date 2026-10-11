import type { CheerioAPI } from "cheerio";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { identidadeVivaReal, tipoRecorteRadar } from "@/lib/calculo/aquisicaoRadar";
import { extrairTipoImovelDeclarado } from "@/lib/calculo/caracteristicasImovel";

type Objeto = Record<string, unknown>;
const objeto = (valor: unknown): Objeto => valor && typeof valor === "object" && !Array.isArray(valor)
  ? valor as Objeto : {};
const texto = (valor: unknown): string => typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
const numero = (valor: unknown): number | null => typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : null;

/** Somente Product individual ligado por URL + @id. Duplicidade de objeto é ambígua. */
function produtosDaPagina($: CheerioAPI): Map<string, Objeto | null> {
  const produtos = new Map<string, Objeto | null>();
  const visitar = (valor: unknown) => {
    if (Array.isArray(valor)) { valor.forEach(visitar); return; }
    const no = objeto(valor);
    if (no["@type"] === "Product") {
      const identidade = identidadeVivaReal(no.url);
      if (identidade && no["@id"] === identidade.id) {
        produtos.set(identidade.id, produtos.has(identidade.id) ? null : no);
      }
    }
    Object.values(no).forEach((filho) => { if (filho && typeof filho === "object") visitar(filho); });
  };
  $('script[type="application/ld+json"]').each((_, script) => {
    try { visitar(JSON.parse($(script).html() || "")); } catch { /* JSON inválido não comprova contrato. */ }
  });
  return produtos;
}

/** Primeira página: card individual + Product/Offer/RentAction correspondentes.
 * additionalType genérico não fabrica tipo. Valores sem PriceSpecification ficam nulos. */
export function extrairVivaRealLocacao(
  $: CheerioAPI, filtros: FiltrosCentralAngariacao, limite: number,
): AnuncioCentralAngariacao[] {
  const produtos = produtosDaPagina($);
  const vistos = new Set<string>();
  return $('a[data-ds-component="DS-Card"][href]').slice(0, limite).toArray().flatMap((elemento) => {
    const card = $(elemento);
    const identidade = identidadeVivaReal(card.attr("href"));
    if (!identidade || vistos.has(identidade.id)) return [];
    const produto = produtos.get(identidade.id);
    if (!produto || identidadeVivaReal(produto.url)?.url !== identidade.url) return [];
    const oferta = objeto(produto.offers);
    const acao = objeto(oferta.potentialAction);
    if (oferta["@type"] !== "Offer" || acao["@type"] !== "RentAction"
      || identidadeVivaReal(oferta.url)?.url !== identidade.url
      || identidadeVivaReal(acao.target)?.url !== identidade.url) return [];
    const titulo = texto(card.find("h2").first().text());
    const tipoDeclarado = extrairTipoImovelDeclarado(titulo);
    const tipoProduto = extrairTipoImovelDeclarado(texto(produto.name));
    if (!/^(Casa|Apartamento)\b/i.test(titulo) || !tipoDeclarado || tipoProduto !== tipoDeclarado
      || tipoRecorteRadar(tipoDeclarado) !== filtros.tipoRecorte) return [];
    const especificacao = objeto(acao.priceSpecification);
    const valor = numero(especificacao.price);
    const preco = especificacao["@type"] === "PriceSpecification"
      && especificacao.priceCurrency === "BRL" && oferta.priceCurrency === "BRL"
      && valor !== null && numero(oferta.price) === valor ? valor : null;
    if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return [];
    if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return [];
    const endereco = objeto(produto.address);
    const cidade = texto(endereco.addressLocality) || null;
    const estado = texto(endereco.addressRegion) || null;
    const localCard = texto(card.find('[data-cy="rp-cardProperty-location-txt"]').text());
    const partes = localCard.split(",").map((p) => p.trim());
    const bairro = partes.length === 2 && partes[1] === cidade ? partes[0] : null;
    const quartos = numero(produto.numberOfBedrooms);
    if (filtros.dormitorios != null && (quartos == null || quartos < filtros.dormitorios)) return [];
    const caracteristicas = texto(card.find('[data-cy="rp-cardProperty-price-txt"]').text());
    const condominio = objeto(oferta.additionalProperty);
    vistos.add(identidade.id);
    return [{
      portal: "viva-real" as const, idExterno: identidade.id, url: identidade.url,
      finalidade: "locacao" as const, tipoRecorte: filtros.tipoRecorte, tipo: tipoDeclarado, tipoDeclarado,
      evidenciaLocacaoVivaReal: { idExterno: identidade.id, url: identidade.url, preco },
      titulo, preco, cidade, estado, bairro, endereco: texto(endereco.streetAddress) || null,
      imagem: card.find('[data-cy="rp-cardProperty-image-img"] img').first().attr("src") || null,
      descricao: caracteristicas || null, quartos,
      valorCondominio: condominio.name === "Condominium Fee" && condominio.unitText === "BRL/month"
        ? numero(condominio.value) : null,
      areaM2: objeto(produto.floorSize).unitCode === "M2" ? numero(objeto(produto.floorSize).value) : null,
      banheiros: numero(produto.numberOfBathroomsTotal), anunciante: "incerto" as const,
    }];
  });
}
