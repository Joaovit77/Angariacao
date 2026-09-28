// R4.2f (temporário): HTML SINTÉTICO. Não é captura do ZAP e não prova a
// estrutura real do portal; só exercita o diagnóstico e as proteções da rota.
// Os marcadores "Segredo", telefone, nome e IDs existem para provar que nada
// do conteúdo dos anúncios sai na resposta.
const nextData = JSON.stringify({
  props: {
    pageProps: {
      listings: Array.from({ length: 5 }, (_, i) => ({
        id: `26123456${70 + i}`,
        address: { street: "Rua Segredo", number: "15" },
        advertiser: { name: "Fulano Segredo" },
        price: "2500",
      })),
    },
  },
});

export const SEGREDOS_DO_HTML = [
  "<", "Rua Segredo", "Fulano", "Segredo", "99999-0000", "2612345678", "2612345699", "87654321", "R$",
];

export const HTML_ZAP_SINTETICO = `<!doctype html>
<html><head><title>Apartamentos para alugar em Londrina</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[]}</script>
</head><body>
<h1>1.234 Apartamentos para alugar em Londrina</h1>
<ul>
  <li data-testid="card-listing">
    <a href="https://www.zapimoveis.com.br/imovel/aluguel-apartamento-2-quartos-centro-londrina-pr-60m2-id-2612345678/?source=ranking">
      <img src="https://resizedimgs.zapimoveis.com.br/foto-segredo.jpg" alt="">
      <h2>Apartamento para alugar no Centro</h2>
    </a>
    <p>Rua Segredo, 15</p>
    <p>Centro, Londrina</p>
    <p>60 m²</p>
    <p><span>Aluguel</span> <strong>R$ 2.500</strong></p>
    <p><span>Cond. R$ 500</span><span>IPTU R$ 80</span></p>
    <p>Publicado há 3 dias</p>
    <p>Fulano Segredo · Imobiliária Segredo · CRECI 12345 · (43) 99999-0000</p>
    <a href="/imobiliarias/imobiliaria-segredo-87654321/">Ver anunciante</a>
  </li>
  <li data-testid="card-listing">
    <a href="https://www.zapimoveis.com.br/imovel/aluguel-apartamento-2-quartos-londrina-pr-id-2612345699/">
      <img data-src="https://resizedimgs.zapimoveis.com.br/foto-2.jpg" alt="">
      <h2>Apartamento com 2 quartos</h2>
    </a>
    <p>R$ 3.100 /mês</p>
  </li>
</ul>
<nav aria-label="paginação"><a href="?pagina=2">2</a><a href="?pagina=3">3</a><a rel="next" href="?pagina=2">Próxima página</a></nav>
<script id="__NEXT_DATA__" type="application/json">${nextData}</script>
</body></html>`;

export function respostaFirecrawl(html = HTML_ZAP_SINTETICO, statusCode = 200, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data: { rawHtml: html, metadata: { statusCode } } }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// ----------------------------------------------------------------
// Segunda prova: JSON-LD SINTÉTICO. A ordem dos itens é diferente da
// dos cards de propósito (um extra vem primeiro), para que parear por
// posição dê resultado errado.
//  - A (2612345678, card 1): Offer que contém RentAction; valor mensal em
//    BRL; um IPTU rotulado; vendedor imobiliária com endereço próprio.
//  - B (2612345699, card 2): Offer e PriceSpecification mensal, SEM
//    nenhum RentAction: não prova locação.
//  - Extra (2612345700, sem card): valores dentro do RentAction, um deles
//    rotulado como condomínio.
//  - D (2612345701, sem card): Offer com RentAction só como irmão.
//  - Listing da própria página (sem ID) e Organization do portal.
// ----------------------------------------------------------------
const ZAP = "https://www.zapimoveis.com.br";
const jsonLdLista = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  itemListElement: [
    {
      "@type": "ListItem", position: 1,
      item: {
        "@type": "RealEstateListing", url: `${ZAP}/imovel/aluguel-apartamento-londrina-pr-id-2612345700/`,
        datePosted: "2026-09-27",
        offers: { "@type": "Offer", price: "1800", priceCurrency: "BRL" },
        potentialAction: {
          "@type": "RentAction",
          priceSpecification: [
            { "@type": "PriceSpecification", price: 1800, priceCurrency: "BRL", unitCode: "MON" },
            { "@type": "PriceSpecification", name: "Condomínio", price: 400, priceCurrency: "BRL" },
          ],
        },
      },
    },
    {
      "@type": "ListItem", position: 2,
      item: {
        "@type": "RealEstateListing", url: `${ZAP}/imovel/aluguel-apartamento-2-quartos-londrina-pr-id-2612345699/`,
        offers: {
          "@type": "Offer", price: 3100, priceCurrency: "BRL",
          priceSpecification: { "@type": "PriceSpecification", price: 3100, priceCurrency: "BRL", unitText: "mensal" },
        },
        mainEntity: { "@type": "Apartment", address: { "@type": "PostalAddress", addressLocality: "Londrina", addressRegion: "PR" } },
      },
    },
    {
      "@type": "ListItem", position: 3,
      item: {
        "@type": "RealEstateListing",
        url: `${ZAP}/imovel/aluguel-apartamento-2-quartos-centro-londrina-pr-60m2-id-2612345678/`,
        datePosted: "2026-09-20T10:00:00Z",
        offers: {
          "@type": "Offer", price: "2500", priceCurrency: "BRL",
          potentialAction: { "@type": "RentAction" },
          priceSpecification: [
            { "@type": "UnitPriceSpecification", price: 2500, priceCurrency: "BRL", unitCode: "MON" },
            { "@type": "PriceSpecification", name: "IPTU", price: 80, priceCurrency: "BRL" },
          ],
          seller: {
            "@type": "RealEstateAgent", name: "Imobiliária Segredo",
            address: { "@type": "PostalAddress", streetAddress: "Avenida Segredo, 999", addressLocality: "Londrina" },
          },
        },
        mainEntity: {
          "@type": "Apartment",
          address: {
            "@type": "PostalAddress", streetAddress: "Rua Segredo, 15", addressLocality: "Londrina",
            addressRegion: "PR", postalCode: "86010-000", addressNeighborhood: "Centro",
          },
        },
      },
    },
    {
      "@type": "ListItem", position: 4,
      item: {
        "@type": "RealEstateListing", url: `${ZAP}/imovel/aluguel-apartamento-londrina-pr-id-2612345701/`,
        offers: { "@type": "Offer", price: 999, priceCurrency: "BRL" },
        potentialAction: { "@type": "RentAction" },
      },
    },
  ],
};
const jsonLdPagina = {
  "@context": "https://schema.org", "@type": "RealEstateListing",
  url: `${ZAP}/aluguel/apartamentos/pr+londrina/`, name: "Apartamentos para alugar", datePosted: "2026-09-28",
};
const jsonLdPortal = {
  "@context": "https://schema.org", "@type": "Organization", name: "Portal Segredo",
  address: { "@type": "PostalAddress", addressLocality: "São Paulo" },
};

export const AGORA_JSONLD = Date.parse("2026-09-28T12:00:00Z");

export const SEGREDOS_DO_JSONLD = [
  "<", "Rua Segredo", "Avenida Segredo", "Segredo", "86010-000", "2026-09-20", "2026-09-27", "2612345678", "2612345699",
  "2612345700", "2612345701", "1800", "3100", "2500", "zapimoveis.com.br/imovel", "Centro", "São Paulo",
];

export const HTML_ZAP_SINTETICO_COM_JSONLD = HTML_ZAP_SINTETICO.replace(
  "</head>",
  [jsonLdLista, jsonLdPagina, jsonLdPortal]
    .map((bloco) => `<script type="application/ld+json">${JSON.stringify(bloco)}</script>`)
    .join("\n") + "\n</head>",
);
