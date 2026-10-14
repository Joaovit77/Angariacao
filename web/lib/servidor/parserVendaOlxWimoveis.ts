import type { CheerioAPI } from "cheerio";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { extrairTipoImovelDeclarado } from "@/lib/calculo/caracteristicasImovel";
import { identidadeVendaRadar } from "@/lib/calculo/identidadeVendaRadar";
import { anunciosDoEstado } from "./parserOlx";
import { tituloWimoveis } from "./tituloWimoveis";

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => v && typeof v === "object" && !Array.isArray(v) ? v as Objeto : {};
const texto = (v: unknown): string => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
const lista = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const positivo = (v: unknown): number | null => {
  if (typeof v !== "number" && !(typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v))) return null;
  const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null;
};
function dinheiro(v: unknown): number | null {
  const s = texto(v);
  if (!/^R\$\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(s)) return null;
  return positivo(s.replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", "."));
}
const parcial = /\b(direitos?|entrada|repasse|parcelas?|sinal|financiamento|financiad[oa])\b/i;
const promocional = /promo[cç][aã]o|promocional|pre[cç]o antigo|de\s+R\$.*por\s+R\$/i;
const agrupado = /a partir de|empreendimento|lan[cç]amento|unidades dispon[ií]veis/i;
const subtipo = /\b(sobrado|kitnet|kitinete|quitinete|conjugado|studio|loft|flat|condo.hotel|comercial|terreno|galp[aã]o)\b|casa\b.{0,60}\bcondom[ií]nio|localizad[ao] em um condom[ií]nio/i;
const locacao = /para alugar|aluga-se|\baluguel\b|\blocação\b/i;

/** JSON de uma atribuição observada, sem eval nem execução de script. */
function estadoWimoveis($: CheerioAPI): Objeto[] {
  const estados: Objeto[] = [];
  $("script").each((_, el) => {
    const s = ($(el).html() || "").trim();
    const inicio = s.match(/^window\.__PRELOADED_STATE__\s*=\s*/)?.[0].length;
    if (!inicio || s[inicio] !== "{") return;
    let profundidade = 0, emString = false, escape = false;
    for (let i = inicio; i < s.length; i++) {
      const c = s[i];
      if (emString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') emString = false;
      } else if (c === '"') emString = true;
      else if (c === "{") profundidade++;
      else if (c === "}" && --profundidade === 0) {
        if (!/^\s*;/.test(s.slice(i + 1))) return;
        try { estados.push(objeto(JSON.parse(s.slice(inicio, i + 1)))); } catch { /* JSON inválido não comprova posting. */ }
        return;
      }
    }
  });
  return estados;
}

/** Venda OLX exige o anúncio RSC individual e três preços integrais concordantes. */
export function extrairOlxVenda($: CheerioAPI, filtros: FiltrosCentralAngariacao, limite: number): AnuncioCentralAngariacao[] {
  if (filtros.finalidade !== "venda") return [];
  const estado = anunciosDoEstado($), candidatos: AnuncioCentralAngariacao[] = [];
  $("section.olx-adcard").slice(0, limite).each((_, el) => {
    const card = $(el), links = card.find('a[data-testid="adcard-link"]');
    if (links.length !== 1) return;
    const identidade = identidadeVendaRadar("olx", links.attr("href"));
    if (!identidade) return;
    const a = estado.get(identidade.id);
    if (!a || String(a.listId) !== identidade.id || identidadeVendaRadar("olx", a.url)?.url !== identidade.url) return;
    const props = new Map<string, string | null>();
    for (const valor of lista(a.properties)) {
      const p = objeto(valor), nome = texto(p.name);
      props.set(nome, props.has(nome) ? null : texto(p.value));
    }
    const categoria = props.get("category"), contrato = props.get("real_estate_type");
    const tipo = categoria === "Casas" ? "Casa" : categoria === "Apartamentos" ? "Apartamento" : null;
    if (!tipo || contrato !== (tipo === "Casa" ? "Venda - casa em rua pública" : "Venda - apartamento padrão")) return;
    if (a.category !== categoria || a.categoryName !== categoria || props.get("re_types") !== "Padrão") return;
    const titulo = texto(links.attr("title") || links.find("h2").text());
    if (!titulo || titulo !== texto(a.subject) || extrairTipoImovelDeclarado(titulo) !== tipo
      || (tipo === "Casa" ? "casa" : "apartamento") !== filtros.tipoRecorte || locacao.test(titulo)) return;
    const semantica = [titulo, card.text(), a.description, a.body, a.priceDescription, props.get("re_features")].map(texto).join(" ");
    if (parcial.test(semantica)) return;
    if (agrupado.test(semantica) || a.grouped === true || a.isGrouped === true || lista(a.matchingAds).length > 0 || lista(a.units).length > 0) return;
    if (subtipo.test(semantica)) return;
    if (a.oldPrice || a.priceReductionBadge === true || a.installments || promocional.test(semantica)
      || card.find("del, s, .olx-adcard__old-price").length) return;
    const bloco = card.find(".olx-adcard__price"), preco = dinheiro(a.price);
    if (preco === null || dinheiro(a.priceValue) !== preco || bloco.length !== 1 || dinheiro(bloco.text()) !== preco) return;
    const local = objeto(a.locationDetails);
    if (texto(local.municipality) !== "Londrina" || texto(local.uf) !== "PR") return;
    const quartos = positivo(props.get("rooms"));
    if (!dentroDosFiltros(preco, quartos, filtros)) return;
    const area = props.get("size")?.match(/^(\d+(?:[.,]\d+)?)m²$/);
    candidatos.push({ portal: "olx", idExterno: identidade.id, url: identidade.url, titulo,
      finalidade: "venda", finalidadeObservada: "venda", tipoRecorte: filtros.tipoRecorte, tipo, tipoDeclarado: tipo,
      preco, cidade: "Londrina", estado: "PR", bairro: texto(local.neighbourhood) || null, endereco: null,
      areaM2: area ? positivo(area[1].replace(",", ".")) : null, quartos,
      banheiros: positivo(props.get("bathrooms")), vagas: positivo(props.get("garage_spaces")),
      valorCondominio: dinheiro(props.get("condominio")), valorIptu: dinheiro(props.get("iptu")),
      descricao: texto(a.description) || null, imagem: card.find("img").first().attr("src") || null, anunciante: "incerto" });
  });
  return semIdentidadeRepetida(candidatos);
}

function dentroDosFiltros(preco: number, quartos: number | null, f: FiltrosCentralAngariacao): boolean {
  return !(f.valorMin != null && preco < f.valorMin) && !(f.valorMax != null && preco > f.valorMax)
    && !(f.dormitorios != null && (quartos === null || quartos < f.dormitorios));
}
function semIdentidadeRepetida(anuncios: AnuncioCentralAngariacao[]): AnuncioCentralAngariacao[] {
  return anuncios.filter(a => anuncios.filter(b => b.idExterno === a.idExterno).length === 1);
}

/** Venda Wimoveis exige PROPERTY, posting e SellAction individuais coerentes. */
export function extrairWimoveisVenda($: CheerioAPI, filtros: FiltrosCentralAngariacao, limite: number): AnuncioCentralAngariacao[] {
  if (filtros.finalidade !== "venda") return [];
  const postings = new Map<string, Objeto | null>(), acoes = new Map<string, Objeto | null>();
  for (const estado of estadoWimoveis($)) for (const v of lista(objeto(estado.listStore).listPostings)) {
    const p = objeto(v), id = texto(p.postingId);
    if (id) postings.set(id, postings.has(id) ? null : p);
  }
  const visitar = (v: unknown, nivel = 0) => {
    if (nivel > 16) return;
    if (Array.isArray(v)) { v.forEach(x => visitar(x, nivel + 1)); return; }
    const a = objeto(v);
    if (a["@type"] === "SellAction" || a["@type"] === "RentAction") {
      const id = identidadeVendaRadar("wimoveis", objeto(a.object).url)?.id;
      if (id) acoes.set(id, acoes.has(id) ? null : a);
    }
    Object.values(a).forEach(x => { if (x && typeof x === "object") visitar(x, nivel + 1); });
  };
  $('script[type="application/ld+json"]').each((_, s) => { try { visitar(JSON.parse($(s).text())); } catch { /* Ação inválida não comprova Venda. */ } });
  const candidatos: AnuncioCentralAngariacao[] = [];
  $('[data-to-posting], [data-qa="posting PROPERTY"], [data-qa="posting DEVELOPMENT"]').slice(0, limite).each((_, el) => {
    const card = $(el), identidade = identidadeVendaRadar("wimoveis", card.attr("data-to-posting"));
    if (!identidade || card.attr("data-id") !== identidade.id) return;
    const p = postings.get(identidade.id), acao = acoes.get(identidade.id);
    if (!p || !acao || texto(p.postingId) !== identidade.id || identidadeVendaRadar("wimoveis", p.url)?.url !== identidade.url) return;
    const imovel = objeto(acao.object), publicado = objeto(p.action), observado = objeto(publicado.object);
    if (identidadeVendaRadar("wimoveis", imovel.url)?.url !== identidade.url || identidadeVendaRadar("wimoveis", observado.url)?.url !== identidade.url) return;
    if (acao["@type"] !== "SellAction" || publicado.type !== "SellAction") return;
    const operacoes = lista(p.priceOperationTypes).map(objeto);
    if (operacoes.length !== 1 || objeto(operacoes[0].operationType).name !== "Venda" || objeto(operacoes[0].operationType).operationTypeId !== "1") return;
    if (p.postingType !== "PROPERTY" || card.attr("data-posting-type") !== "PROPERTY" || !Array.isArray(p.units) || p.units.length !== 0) return;
    const titulo = texto(p.title), tituloCard = tituloWimoveis(texto(card.find("img[alt]").first().attr("alt")));
    const tipo = extrairTipoImovelDeclarado(titulo), estrutura = objeto(p.realEstateType);
    if (!tipo || !["Casa", "Apartamento"].includes(tipo) || extrairTipoImovelDeclarado(tituloCard) !== tipo
      || extrairTipoImovelDeclarado(texto(p.generatedTitle)) !== tipo
      || estrutura.name !== (tipo === "Casa" ? "Casas" : "Apartamentos") || estrutura.realEstateTypeId !== (tipo === "Casa" ? "1" : "2")
      || (tipo === "Casa" ? "casa" : "apartamento") !== filtros.tipoRecorte) return;
    if (imovel.type !== (tipo === "Casa" ? "SingleFamilyResidence" : "Apartment")
      || observado.type !== (tipo === "Casa" ? "SingleFamilyResidence" : "Apartment")
      || extrairTipoImovelDeclarado(texto(imovel.name)) !== tipo || extrairTipoImovelDeclarado(texto(observado.name)) !== tipo || locacao.test(titulo)) return;
    const semantica = [titulo, tituloCard, card.text(), imovel.description, observado.description, p.descriptionNormalized, p.promotionTitle].map(texto).join(" ");
    if (agrupado.test(semantica)) return;
    if (parcial.test(semantica) || subtipo.test(semantica) || promocional.test(semantica) || p.promotionTitle || operacoes[0].lowPricePercentage != null || card.find("del, s").length) return;
    const precos = lista(operacoes[0].prices).map(objeto), bloco = card.find('[data-qa="POSTING_CARD_PRICE"]');
    if (precos.length !== 1 || precos[0].currency !== "R$" || precos[0].currencyId !== "3") return;
    const preco = positivo(precos[0].amount);
    if (preco === null || dinheiro(`R$ ${texto(precos[0].formattedAmount)}`) !== preco || bloco.length !== 1 || dinheiro(bloco.text()) !== preco) return;
    const endereco = objeto(imovel.address), enderecoEstado = objeto(observado.address);
    const local = texto(card.find('[data-qa="POSTING_CARD_LOCATION"]').text());
    if (!/^(?:.*?,\s*)?Londrina$/.test(local) || endereco.addressRegion !== "PR" || enderecoEstado.addressRegion !== "PR") return;
    const features = objeto(p.mainFeatures), feature = (id: string) => positivo(objeto(features[id]).value);
    const quartos = feature("CFT2");
    if (!dentroDosFiltros(preco, quartos, filtros)) return;
    const acessorio = (v: unknown) => { const t = objeto(v); return t.currency === "R$" ? positivo(t.amount) : null; };
    candidatos.push({ portal: "wimoveis", idExterno: identidade.id, url: identidade.url, titulo,
      finalidade: "venda", finalidadeObservada: "venda", tipoRecorte: filtros.tipoRecorte, tipo, tipoDeclarado: tipo,
      preco, cidade: "Londrina", estado: "PR", bairro: local.includes(",") ? local.split(",").slice(0, -1).join(",").trim() : null,
      endereco: texto(endereco.streetAddress) || null, areaM2: feature("CFT101"), quartos,
      banheiros: feature("CFT3"), vagas: feature("CFT7"), valorCondominio: acessorio(p.expenses), valorIptu: acessorio(p.iptu),
      descricao: texto(imovel.description) || null, imagem: card.find("img").first().attr("src") || null, anunciante: "incerto" });
  });
  return semIdentidadeRepetida(candidatos);
}
