/* Fixture reduzida do HTML real da busca "casas-para-alugar/pr-londrina" do
   Chaves (auditoria R4.1b, 23/09/2026): só os primeiros cards trazem <img>; a
   foto de todos está no JSON-LD RealEstateListing → offers.itemListElement[]
   → itemOffered { @id, image }. */

export const BASE = "https://www.chavesnamao.com.br";
export const FOTO_CARD_46811835 = `${BASE}/imn/0400X0262/N/60/imoveis/585454/46811835/pr-londrina-jardim-londrilar-rua-joao-wanderley-casa-sobrado-para-alugar-4-quartos-6aabe481-1.jpg`;
export const FOTO_LD_46811835 = `${BASE}/imn/0340X0250/N/80/imoveis/585454/46811835/pr-londrina-jardim-londrilar-rua-joao-wanderley-casa-sobrado-para-alugar-4-quartos-6aabe481-1.jpg`;
export const FOTO_LD_43083373 = `${BASE}/imn/0340X0250/N/80/imoveis/73953/43083373/pr-londrina-universitario-rua-professora-delvina-borges-casa-sobrado-para-alugar-3-quartos-6aa216e0-1.jpg`;
export const FOTO_LD_45326545 = `${BASE}/imn/0340X0250/N/80/imoveis/935245/45326545/pr-londrina-universitario-nao-encontrado-casa-sobrado-para-alugar-6a70f097-1.jpg`;

export const URL_46811835 = `${BASE}/imovel/casa-para-alugar-4-quartos-com-garagem-pr-londrina-jardim-londrilar-250m2-RS3200/id-46811835/`;
export const URL_43083373 = `${BASE}/imovel/casa-para-alugar-3-quartos-com-garagem-pr-londrina-universitario-250m2-RS5700/id-43083373/`;
export const URL_45326545 = `${BASE}/imovel/casa-para-alugar-pr-londrina-universitario-250m2-RS5500/id-45326545/`;

export const CARD_46811835 = `<a href="${URL_46811835}">
  <img alt="Casa com 04 Quartos" fetchPriority="high" height="262" src="${FOTO_CARD_46811835}" width="400"/>
  <h2>Casa com 04 Quartos e Divisão Frente/Fundos Uso Residencial ou Comercial, Jardim Londrilar</h2>
  <p>Rua João Wanderley, 72</p><p>Jardim Londrilar, Londrina/PR</p><p>143m²</p><p>R$ 3.200</p>
</a>`;
export const CARD_43083373 = `<a href="${URL_43083373}">
  <h2>Casa com 3 dormitórios para alugar, 200 m² por R$ 5.700,00/mês - Universitário - Londrina/PR</h2>
  <p>Rua Professora Delvina Borges, 190</p><p>Universitário, Londrina/PR</p><p>200m²</p><p>R$ 5.700</p>
</a>`;
export const CARD_45326545 = `<a href="${URL_45326545}">
  <h2>Casa para alugar no Universitário, Londrina</h2>
  <p>Endereço indisponível</p><p>Universitário, Londrina/PR</p><p>202m²</p><p>R$ 5.500</p>
</a>`;

export const oferta = (url: string, imagem: unknown) => ({
  "@type": "Offer",
  name: "Casa",
  url,
  price: "5500",
  itemOffered: { "@type": "SingleFamilyResidence", "@id": url, image: imagem },
});
export const listagem = (itens: unknown[]) => ({
  "@context": "https://schema.org",
  "@type": "RealEstateListing",
  url: `${BASE}/casas-para-alugar/pr-londrina/`,
  // Imagens da página: não pertencem a nenhum anúncio e não podem ser usadas.
  image: [FOTO_LD_45326545, FOTO_LD_43083373],
  offers: { "@type": "AggregateOffer", itemListElement: itens },
});
export const script = (conteudo: unknown) =>
  `<script type="application/ld+json">${typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo)}</script>`;

export const LD_REAL = script(listagem([
  oferta(URL_46811835, FOTO_LD_46811835),
  oferta(URL_43083373, FOTO_LD_43083373),
  oferta(URL_45326545, FOTO_LD_45326545),
]));
