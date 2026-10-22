import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { urlPaginaChavesRadar } from "@/lib/servidor/coberturaRadar";

/** Universo sintético, sem dados pessoais, com navegação pg publicada pelo portal. */
export function paginaRadar(f: FiltrosCentralAngariacao, pagina: number, ids: string[], total: number, proxima: boolean) {
  const tipo = f.tipoRecorte === "apartamento" ? "Apartamento" : "Casa";
  const acao = f.finalidade === "venda" ? "a-venda" : "para-alugar";
  const titulo = `${tipo} ${f.finalidade === "venda" ? "à venda" : "para alugar"} em Londrina`;
  const url = (id: string) => `https://www.chavesnamao.com.br/imovel/${tipo.toLowerCase()}-${acao}-pr-londrina-centro/id-${id}/`;
  const bairro = f.bairro || "Centro";
  const cards = ids.map((id) => `<a href="${url(id)}"><h2>${titulo}</h2>
    <p>${bairro}, Londrina/PR</p><p aria-label="Preço"><b>R$ 1.200</b></p></a>`).join("");
  const offers = ids.map((id) => ({ "@type": "Offer", url: url(id), name: titulo, price: 1200, priceCurrency: "BRL",
    potentialAction: `https://schema.org/${f.finalidade === "venda" ? "SellAction" : "RentAction"}`,
    itemOffered: { "@type": f.tipoRecorte === "casa" ? "SingleFamilyResidence" : "Apartment", "@id": url(id) } }));
  const base = urlDaPesquisa(f);
  return (f.bairro ? `<link rel="canonical" href="${base}">` : "") + cards + `<script type="application/ld+json">${JSON.stringify({ "@type": "RealEstateListing",
    url: urlPaginaChavesRadar(base, pagina), offers: { "@type": "ItemList", numberOfItems: total, itemListElement: offers } })}</script>`
    + (proxima ? `<a rel="next" href="${urlPaginaChavesRadar(base, pagina + 1)}">Página ${pagina+1}</a>` : "");
}
