import registros from "./chaves-jardim-tokio-populacao.json";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
export const filtrosPopulacaoChaves: FiltrosCentralAngariacao = { portal: "chaves-na-mao", finalidade: "locacao", tipoRecorte: "casa", cidade: "Londrina", estado: "PR", bairro: "Jardim Tókio" };
export const basePopulacaoChaves = "https://www.chavesnamao.com.br/casas-para-alugar/pr-londrina/jardim-tokio/";
const escapar = (v: string) => v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
/** Cards mínimos dos 45 IDs capturados; variantes alteram somente a condição sob teste. */
export function paginasPopulacaoChaves(qualificados = 33, indeterminados = 0, nextFinal = false, adicional = false) {
  const linhas = registros.map((r,i) => ({ ...r, bairro: i < qualificados + indeterminados ? "Jardim Tókio" : "Outro bairro publicado",
    titulo: i >= qualificados && i < qualificados + indeterminados ? "Imóvel para alugar" : r.titulo }));
  if (adicional) linhas.push({ ...linhas[0], pagina: 3, idExterno: "990001", url: linhas[0].url.replace(/id-\d+/,"id-990001") });
  return [1,2,3].map((n) => {
    const itens=linhas.filter(r=>r.pagina===n), total=33+(adicional?1:0);
    const cards=itens.map(r=>`<a href="${escapar(r.url)}"><h2>${escapar(r.titulo)}</h2><p>${escapar(r.bairro)}, ${r.cidade}/${r.estado}</p><p>R$ ${r.preco}</p></a>`).join("");
    const offers=itens.map(r=>({"@type":"Offer",url:r.url,itemOffered:{"@type":"SingleFamilyResidence"}}));
    return `<link rel="canonical" href="${basePopulacaoChaves}">${cards}<script type="application/ld+json">${JSON.stringify({"@type":"RealEstateListing",url:basePopulacaoChaves,offers:{"@type":"ItemList",numberOfItems:total,itemListElement:offers}})}</script>`
      +(n===1||n===3&&nextFinal?`<a rel="next" href="${basePopulacaoChaves}?pg=${n+1}">Página ${n+1}</a>`:"");
  });
}
