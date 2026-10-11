import type { CheerioAPI } from "cheerio";
import type { AnuncioCentralAngariacao, FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { identidadeOlx } from "@/lib/calculo/aquisicaoRadar";
import { extrairTipoImovelDeclarado } from "@/lib/calculo/caracteristicasImovel";
import { dataPublicacaoOlx, dentroDoPeriodo } from "@/lib/datas";

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => v && typeof v === "object" && !Array.isArray(v) ? v as Objeto : {};
const texto = (v: unknown) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
const inteiro = (v: unknown) => /^\d+$/.test(texto(v)) ? Number(v) : null;

/** Valor monetário integral, nunca o primeiro R$ de texto livre. */
function dinheiro(v: unknown): number | null {
  const s = texto(v);
  if (!/^R\$ (?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(s)) return null;
  const n = Number(s.slice(3).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Somente dados JSON dos chunks RSC observados. Nunca executa scripts.
 * Concatenação conserva registros divididos entre chunks; registros desconhecidos falham fechados. */
function anunciosDoEstado($: CheerioAPI): Map<string, Objeto | null> {
  let fluxo = "";
  $("script").each((_, script) => {
    const s = ($(script).html() || "").trim();
    const m = s.match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!m) return;
    try {
      const chunk: unknown = JSON.parse(m[1]);
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string") fluxo += chunk[1];
    } catch { /* Script inválido não fornece evidência. */ }
  });
  const anuncios = new Map<string, Objeto | null>();
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visitar); return; }
    const no = objeto(v);
    if (Array.isArray(no.ads)) {
      for (const valor of no.ads) {
        const a = objeto(valor);
        if (!Array.isArray(a.properties) || !Number.isSafeInteger(a.listId)) continue;
        const id = String(a.listId);
        anuncios.set(id, anuncios.has(id) ? null : a);
      }
    }
    Object.values(no).forEach((filho) => { if (filho && typeof filho === "object") visitar(filho); });
  };
  for (const linha of fluxo.split("\n")) {
    const m = linha.match(/^[0-9a-f]+:([\[{][\s\S]*)$/);
    if (m) { try { visitar(JSON.parse(m[1])); } catch { /* Registro incompleto não comprova anúncio. */ } }
  }
  return anuncios;
}

/** Card individual + estado pelo mesmo ID e URL. Tipo/finalidade são propriedades do anúncio. */
export function extrairOlxLocacao($: CheerioAPI, filtros: FiltrosCentralAngariacao, limite: number): AnuncioCentralAngariacao[] {
  const estado = anunciosDoEstado($), vistos = new Set<string>();
  return $("section.olx-adcard").slice(0, limite).toArray().flatMap(elemento => {
    const card = $(elemento), links = card.find('a[data-testid="adcard-link"]');
    if (links.length !== 1) return [];
    const identidade = identidadeOlx(links.attr("href"));
    if (!identidade || vistos.has(identidade.id)) return [];
    const a = estado.get(identidade.id);
    if (!a || identidadeOlx(a.url)?.url !== identidade.url || String(a.listId) !== identidade.id) return [];
    const props = new Map<string, string | null>();
    for (const valor of a.properties as unknown[]) {
      const p = objeto(valor), nome = texto(p.name);
      props.set(nome, props.has(nome) ? null : texto(p.value));
    }
    const categoria = props.get("category");
    const contrato = props.get("real_estate_type");
    const tipoDeclarado = categoria === "Casas" && contrato === "Aluguel - casa em rua pública" ? "Casa"
      : categoria === "Apartamentos" && contrato === "Aluguel - apartamento padrão" ? "Apartamento" : null;
    if (!tipoDeclarado || a.categoryName !== categoria || a.category !== categoria || props.get("re_types") !== "Padrão") return [];
    const tipoObservado = tipoDeclarado === "Casa" ? "casa" : "apartamento";
    if (tipoObservado !== filtros.tipoRecorte) return [];
    const titulo = texto(links.attr("title") || links.find("h2").text());
    if (!titulo || titulo !== texto(a.subject) || /\b(venda|vendo|sobrado|kitnet|conjugado|studio|loft)\b|casa\s+(?:de|em)\s+condom[ií]nio/i.test(titulo)) return [];
    const tipoTitulo = extrairTipoImovelDeclarado(titulo);
    if (tipoTitulo && tipoTitulo !== tipoDeclarado) return [];
    const local = objeto(a.locationDetails);
    if (texto(local.municipality) !== "Londrina" || texto(local.uf) !== "PR") return [];
    const blocoPreco = card.find(".olx-adcard__price");
    const valor = dinheiro(a.price);
    const preco = blocoPreco.length === 1 && valor !== null && valor > 0
      && dinheiro(a.priceValue) === valor && dinheiro(blocoPreco.text()) === valor
      && !a.oldPrice && a.priceReductionBadge !== true ? valor : null;
    if (filtros.valorMin != null && (preco == null || preco < filtros.valorMin)) return [];
    if (filtros.valorMax != null && (preco == null || preco > filtros.valorMax)) return [];
    const quartos = inteiro(props.get("rooms"));
    if (filtros.dormitorios != null && (quartos == null || quartos < filtros.dormitorios)) return [];
    const publicadoTexto = texto(card.find(".olx-adcard__date").first().text());
    const publicadoEm = dataPublicacaoOlx(publicadoTexto)?.toISOString() || null;
    if (filtros.diasPublicacao && !dentroDoPeriodo(publicadoEm, filtros.diasPublicacao)) return [];
    const tamanho = props.get("size")?.match(/^(\d+(?:[.,]\d+)?)m²$/);
    vistos.add(identidade.id);
    return [{
      portal: "olx" as const, idExterno: identidade.id, url: identidade.url, titulo,
      finalidade: "locacao" as const, tipoRecorte: filtros.tipoRecorte, tipo: tipoDeclarado, tipoDeclarado, preco,
      evidenciaLocacaoOlx: { idExterno: identidade.id, url: identidade.url, tipoDeclarado, finalidade: "locacao" as const, preco },
      cidade: texto(local.municipality), estado: texto(local.uf), bairro: texto(local.neighbourhood) || null, endereco: null,
      imagem: card.find("img").first().attr("src") || null, descricao: texto(props.get("re_features")) || null,
      areaM2: tamanho ? Number(tamanho[1].replace(",", ".")) : null, quartos,
      banheiros: inteiro(props.get("bathrooms")), vagas: inteiro(props.get("garage_spaces")),
      valorCondominio: dinheiro(props.get("condominio")), valorIptu: dinheiro(props.get("iptu")),
      publicadoEm, publicadoTexto: publicadoTexto || null, anunciante: "incerto" as const,
    }];
  });
}
