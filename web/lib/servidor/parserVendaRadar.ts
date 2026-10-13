import type { CheerioAPI } from "cheerio";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { extrairTipoImovelDeclarado } from "@/lib/calculo/caracteristicasImovel";
import { tipoRecorteRadar } from "@/lib/calculo/aquisicaoRadar";
import { identidadeVendaRadar } from "@/lib/calculo/identidadeVendaRadar";

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => v && typeof v === "object" && !Array.isArray(v) ? v as Objeto : {};
const texto = (v: unknown): string => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
const lista = (v: unknown): unknown[] => Array.isArray(v) ? v : v == null ? [] : [v];
const numero = (v: unknown): number | null => {
  if (typeof v !== "number" && !(typeof v === "string" && /^\d+(\.\d+)?$/.test(v))) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const proibido = /a partir de|entrada|parcelas?|direitos|repasse|empreendimento|lançamento|comercial|sala comercial|loja|galpão|terreno|kitnet|studio|loft|sobrado|casa (?:de|em) condomínio/i;
const acessorio = /condom[ií]nio|condominium|iptu|taxa|parcela|entrada|direitos|repasse|mensal|month|aluguel/i;

function precoPrincipal(v: string): number | null {
  // O bloco principal começa pelo preço. Taxas e rótulos anteriores não são preços do imóvel.
  const m = v.match(/^R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)(?=\s|[^\d.,]|$)/);
  return m ? numero(m[1].replace(/\./g, "").replace(",", ".")) : null;
}

/** Contratos B2.6-A: Product/BuyAction e RealEstateListing/Offer/SellAction.
 * Caminho exclusivo de Venda: os parsers de Locação conservam seus contratos. */
export function extrairVendaRadar($: CheerioAPI, filtros: FiltrosCentralAngariacao, limite: number): AnuncioCentralAngariacao[] {
  const portal = filtros.portal;
  if (filtros.finalidade !== "venda" || !["zap", "viva-real", "chaves-na-mao"].includes(portal)) return [];
  const chaves = portal === "chaves-na-mao";
  const porId = new Map<string, Objeto[]>();
  const referencias = new Map<string, Objeto[]>();
  const adicionar = (mapa: Map<string, Objeto[]>, id: string, no: Objeto) => mapa.set(id, [...(mapa.get(id) ?? []), no]);
  const visitar = (v: unknown, emListagem = false, nivel = 0) => {
    if (nivel > 16) return;
    if (Array.isArray(v)) { v.forEach(x => visitar(x, emListagem, nivel + 1)); return; }
    const no = objeto(v), tipo = no["@type"];
    const identidade = identidadeVendaRadar(portal, no.url ?? no["@id"]);
    const id = identidade?.id ?? (!chaves && /^\d{6,}$/.test(texto(no["@id"])) ? texto(no["@id"]) : null);
    const listagem = emListagem || tipo === "RealEstateListing";
    if (id) {
      if ((!chaves && tipo === "Product") || (chaves && tipo === "Offer" && emListagem)) adicionar(porId, id, no);
      if (!chaves && (tipo === "House" || tipo === "Apartment")) adicionar(referencias, id, no);
    }
    for (const filho of Object.values(no)) if (filho && typeof filho === "object") visitar(filho, listagem, nivel + 1);
  };
  $('script[type="application/ld+json"]').each((_, s) => {
    try { visitar(JSON.parse($(s).text())); } catch { /* Bloco inválido não comprova Venda. */ }
  });
  const seletor = chaves ? 'a[href*="/imovel/"][href*="/id-"]' : portal === "zap"
    ? 'li[data-cy="rp-property-cd"], li[data-testid="rp-property-cd"]' : 'a[data-ds-component="DS-Card"][href]';
  const candidatos: AnuncioCentralAngariacao[] = [];
  $(seletor).slice(0, limite).each((_, el) => {
    const card = $(el);
    const links = chaves || portal === "viva-real" ? [card.attr("href")] : card.find('a[href]').toArray().map(a => $(a).attr("href"));
    const identidades = links.map(u => identidadeVendaRadar(portal, u)).filter(x => x !== null);
    if (!identidades.length || new Set(identidades.map(i => i.url)).size !== 1) return;
    const identidade = identidades[0];
    const objetos = porId.get(identidade.id) ?? [];
    // Duplicação literal é o mesmo item; qualquer variação do objeto é ambígua.
    if (!objetos.length || new Set(objetos.map(o => JSON.stringify(o))).size !== 1) return;
    const produto = objetos[0], oferta = chaves ? produto : objeto(produto.offers);
    const mesmaUrl = (v: unknown) => identidadeVendaRadar(portal, v)?.url === identidade.url;
    if (!mesmaUrl(produto.url) || oferta["@type"] !== "Offer" || !mesmaUrl(oferta.url)) return;
    if (!chaves && String(produto["@id"]) !== identidade.id) return;
    if (chaves && (!mesmaUrl(objeto(oferta.itemOffered)["@id"]) || (oferta["@id"] !== undefined && !mesmaUrl(oferta["@id"])))) return;
    if (chaves && objeto(oferta.itemOffered).url !== undefined && !mesmaUrl(objeto(oferta.itemOffered).url)) return;
    if (!chaves && oferta["@id"] !== undefined && String(oferta["@id"]) !== identidade.id && !mesmaUrl(oferta["@id"])) return;
    const acao = objeto(oferta.potentialAction);
    if (chaves ? oferta.potentialAction !== "https://schema.org/SellAction" : acao["@type"] !== "BuyAction" || !mesmaUrl(acao.target)) return;
    const titulo = texto(card.find("h2").first().text());
    const nome = texto(produto.name);
    const tipo = extrairTipoImovelDeclarado(titulo);
    if (/para alugar|loca[çc][aã]o|aluguel|aluga-se/i.test(`${titulo} ${nome}`)) return;
    if (!/^(Casa|Apartamento)\b/i.test(titulo) || proibido.test(`${titulo} ${nome}`) || !tipo || tipoRecorteRadar(tipo) !== filtros.tipoRecorte
      || extrairTipoImovelDeclarado(nome) !== tipo) return;
    if (!chaves && !/para comprar|[àa] venda/i.test(nome)) return;
    if (chaves && (!/[àa] venda/i.test(titulo) || !identidade.url.includes("-a-venda-"))) return;
    if (chaves && objeto(oferta.itemOffered)["@type"] !== (tipo === "Casa" ? "SingleFamilyResidence" : "Apartment")) return;
    const contraditorio = (referencias.get(identidade.id) ?? []).some(no => !mesmaUrl(no.url)
      || String(no["@id"]) !== identidade.id || extrairTipoImovelDeclarado(texto(no.name)) !== tipo
      || (no["@type"] === "Apartment" ? tipo !== "Apartamento" : tipo !== "Casa"));
    if (contraditorio) return;
    const precoTexto = texto(card.find(chaves ? 'p[aria-label="Preço"] b' : '[data-cy="rp-cardProperty-price-txt"]').first().text());
    const preco = numero(oferta.price);
    const especificacao = objeto(acao.priceSpecification);
    if (preco === null || oferta.priceCurrency !== "BRL" || proibido.test(precoTexto) || precoPrincipal(precoTexto) !== preco) return;
    if (/(?:\/|por\s+)(?:m²|m2|m[eê]s)|ao m[eê]s/i.test(precoTexto)) return;
    if (!chaves && (especificacao["@type"] !== "PriceSpecification" || especificacao.priceCurrency !== "BRL" || numero(especificacao.price) !== preco)) return;
    if (acessorio.test([oferta.name, especificacao.name, especificacao.priceType, especificacao.unitText].map(texto).join(" "))
      || /m²|m2/i.test(texto(especificacao.unitText))
      || card.find('[data-cy="rp-cardProperty-price-txt"] del, [data-cy="rp-cardProperty-price-txt"] s, p[aria-label="Preço"] del').length) return;
    if (!chaves && lista(oferta.potentialAction).length !== 1) return;
    const dadosImovel = chaves ? objeto(oferta.itemOffered) : produto;
    const endereco = objeto(dadosImovel.address);
    const localCard = chaves ? card.find("p").toArray().map(p => texto($(p).text())).find(t => /,\s*[^/]+\/[A-Z]{2}\b/.test(t)) : null;
    const local = localCard?.match(/^(.*),\s*([^,/]+)\/([A-Z]{2})\b/);
    const cidade = chaves ? local?.[2]?.trim() : texto(endereco.addressLocality);
    const estado = chaves ? local?.[3] : texto(endereco.addressRegion);
    if (!cidade || !estado) return;
    if (chaves && texto(endereco.addressRegion) && texto(endereco.addressRegion) !== `${cidade}, ${estado}`) return;
    const quartos = numero(dadosImovel.numberOfBedrooms);
    if ((filtros.valorMin != null && preco < filtros.valorMin) || (filtros.valorMax != null && preco > filtros.valorMax)
      || (filtros.dormitorios != null && (quartos === null || quartos < filtros.dormitorios))) return;
    const imagem = card.find("img").first().attr("src") || texto(objeto(oferta.itemOffered).image) || null;
    const taxa = (rotulo: "Condomínio" | "IPTU"): number | null => {
      const publicado = chaves ? texto(card.find(`[aria-label="${rotulo}"]`).text()) : precoTexto;
      const padrao = rotulo === "Condomínio" ? /(?:Cond\.|Condomínio)\s*(R\$\s*[\d.,]+)/i : /IPTU\s*(R\$\s*[\d.,]+)/i;
      return precoPrincipal(publicado.match(padrao)?.[1] || "");
    };
    const condominio = objeto(oferta.additionalProperty);
    const condominioEstruturado = condominio.name === "Condominium Fee" && condominio.unitText === "BRL/month" ? numero(condominio.value) : null;
    const condominioPublicado = taxa("Condomínio");
    const valorCondominio = condominioEstruturado !== null && condominioPublicado !== null && condominioEstruturado !== condominioPublicado
      ? null : condominioEstruturado ?? condominioPublicado;
    candidatos.push({ portal, idExterno: identidade.id, url: identidade.url, finalidade: "venda", finalidadeObservada: "venda",
      tipoRecorte: filtros.tipoRecorte, tipo, tipoDeclarado: tipo, titulo, preco, cidade, estado,
      bairro: chaves ? local?.[1]?.trim() || null
        : texto(card.find('[data-cy="rp-cardProperty-location-txt"]').text()).split(",").slice(0, -1).join(",").trim() || null,
      endereco: texto(endereco.streetAddress) || null, imagem, descricao: null, quartos, valorCondominio, valorIptu: taxa("IPTU"),
      areaM2: numero(objeto(dadosImovel.floorSize).value) ?? numero(texto(objeto(dadosImovel.floorSize).unitText).match(/^(\d+(?:\.\d+)?)m²$/)?.[1]),
      banheiros: numero(dadosImovel.numberOfBathroomsTotal), anunciante: "incerto" });
  });
  const porIdentidade = new Map<string, AnuncioCentralAngariacao[]>();
  for (const a of candidatos) porIdentidade.set(a.idExterno, [...(porIdentidade.get(a.idExterno) ?? []), a]);
  return [...porIdentidade.values()].flatMap(grupo => new Set(grupo.map(a => JSON.stringify(a))).size === 1 ? [grupo[0]] : []);
}
