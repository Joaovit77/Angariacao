// FIXTURE SINTÉTICA (R4.2h). Não é captura do ZAP: o HTML real do discovery
// (R4.2f) nunca foi guardado. Ela reproduz SOMENTE as estruturas comprovadas
// lá: card `li[data-testid="rp-property-cd"]`, link `/imovel/{slug}-id-{n}/`
// com query `?source=`, foto em resizedimgs.zapimoveis.com.br, texto
// "Bairro, Londrina" no card e JSON-LD com ItemList → Product → offers(Offer)
// → potentialAction(RentAction) → priceSpecification(PriceSpecification),
// Apartment à parte e RealEstateListing com datePosted. O smoke real em
// Preview continua obrigatório.

export const ORIGEM = "https://www.zapimoveis.com.br";

export interface AnuncioSintetico {
  id: string;
  /** Texto das folhas do card, na ordem. */
  folhas?: string[];
  titulo?: string;
  semCard?: boolean;
  produto?: Record<string, unknown> | null;
  apartamento?: Record<string, unknown> | null;
  datePosted?: string;
  hrefExtra?: string;
  imagem?: string | null;
}

export function urlAnuncio(id: string, slug = "aluguel-apartamento-2-quartos-centro-londrina-pr-60m2"): string {
  return `${ORIGEM}/imovel/${slug}-id-${id}/`;
}

export function endereco(extra: Record<string, unknown> = {}) {
  return {
    "@type": "PostalAddress", addressCountry: "BR", addressLocality: "Londrina",
    addressRegion: "PR", streetAddress: "Rua Sergipe", ...extra,
  };
}

export function produto(id: string, extra: Record<string, unknown> = {}, preco: {
  aluguel?: unknown; moeda?: unknown; ofertaPreco?: unknown; semRentAction?: boolean;
} = {}) {
  const aluguel = "aluguel" in preco ? preco.aluguel : 2500;
  const oferta: Record<string, unknown> = {
    "@type": "Offer",
    price: "ofertaPreco" in preco ? preco.ofertaPreco : aluguel,
    priceCurrency: "BRL",
    availability: "https://schema.org/InStock",
    url: urlAnuncio(id),
  };
  if (!preco.semRentAction) {
    oferta.potentialAction = {
      "@type": "RentAction",
      target: urlAnuncio(id),
      priceSpecification: { "@type": "PriceSpecification", price: aluguel, priceCurrency: "moeda" in preco ? preco.moeda : "BRL" },
    };
  }
  return {
    "@type": "Product",
    "@id": `${urlAnuncio(id)}#product`,
    url: urlAnuncio(id),
    name: "Apartamento com 2 quartos para alugar, 60 m² em Centro",
    address: endereco(),
    floorSize: { "@type": "QuantitativeValue", value: 60, unitCode: "MTK" },
    numberOfBedrooms: 2,
    numberOfBathroomsTotal: 1,
    image: "https://resizedimgs.zapimoveis.com.br/img/json-ld.jpg",
    offers: oferta,
    ...extra,
  };
}

export function apartamento(id: string, extra: Record<string, unknown> = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "Apartment",
    "@id": `${urlAnuncio(id)}#apartment`,
    url: urlAnuncio(id),
    name: "Apartamento com 2 quartos para alugar, 60 m² em Centro",
    address: endereco(),
    floorSize: { "@type": "QuantitativeValue", value: 60, unitCode: "MTK" },
    numberOfBedrooms: 2,
    numberOfBathroomsTotal: 1,
    ...extra,
  };
}

const FOLHAS_PADRAO = [
  "Rua Sergipe", "Centro, Londrina", "60 m²", "2 quartos", "1 banheiro", "1 vaga", "R$ 9.999 /mês", "IPTU R$ 80",
];

function card(anuncio: AnuncioSintetico): string {
  const folhas = (anuncio.folhas ?? FOLHAS_PADRAO).map((f) => `<p>${f}</p>`).join("");
  const imagem = anuncio.imagem === null ? "" : `<img src="${anuncio.imagem ?? `https://resizedimgs.zapimoveis.com.br/img/${anuncio.id}.jpg`}" alt="">`;
  const extra = anuncio.hrefExtra ? `<a href="${anuncio.hrefExtra}">outro</a>` : "";
  return `<li data-testid="rp-property-cd"><a href="${urlAnuncio(anuncio.id)}?source=ranking%2Crp">${imagem}<h2>${anuncio.titulo ?? "Título do card"}</h2></a><div>${folhas}</div>${extra}</li>`;
}

/** HTML da listagem: cards na ordem dada; JSON-LD em outra ordem (invertida). */
export function htmlZap(anuncios: AnuncioSintetico[]): string {
  const comProduto = anuncios.filter((a) => a.produto !== null);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: [...comProduto].reverse().map((a, i) => ({
      "@type": "ListItem", position: i + 1, item: a.produto ?? produto(a.id),
    })),
  };
  const listings = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    url: urlAnuncio(anuncios[0]?.id ?? "2600000000"),
    mainEntity: anuncios.map((a) => ({
      "@type": "RealEstateListing", url: urlAnuncio(a.id), name: "x", datePosted: a.datePosted ?? "2024-01-10T10:00:00Z",
    })),
  };
  const aps = anuncios.filter((a) => a.apartamento !== null).map((a) => a.apartamento ?? apartamento(a.id));
  const scripts = [itemList, listings, ...aps]
    .map((bloco) => `<script type="application/ld+json">${JSON.stringify(bloco)}</script>`).join("");
  const cards = anuncios.filter((a) => !a.semCard).map(card).join("");
  return `<!doctype html><html><head><title>Apartamentos para alugar em Londrina</title>${scripts}</head><body><ul>${cards}</ul></body></html>`;
}
