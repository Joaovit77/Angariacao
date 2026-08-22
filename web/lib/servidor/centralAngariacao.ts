import {
  idDoAnuncio,
  slugPortal,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
  type PortalAngariacao,
} from "@/lib/calculo/centralAngariacao";

function urlOlx(f: FiltrosCentralAngariacao): string {
  const estado = slugPortal(f.estado || "PR");
  const cidade = slugPortal(f.cidade);
  // A OLX agrupa algumas cidades por DDD/região. Londrina é o primeiro
  // recorte atendido e sua rota canônica é "regiao-de-londrina".
  const local = cidade === "londrina" ? "regiao-de-londrina" : cidade;
  const url = new URL(`https://www.olx.com.br/imoveis/aluguel/estado-${estado}/${local}`);
  if (f.valorMin != null) url.searchParams.set("pe", String(f.valorMin));
  if (f.valorMax != null) url.searchParams.set("ps", String(f.valorMax));
  if (f.bairro) url.searchParams.set("q", f.bairro);
  // Parâmetro usado pela própria OLX ao selecionar o chip "Particular".
  if (f.somenteProprietario) url.searchParams.set("f", "p");
  return url.toString();
}

function urlChaves(f: FiltrosCentralAngariacao): string {
  const uf = slugPortal(f.estado || "PR");
  const cidade = slugPortal(f.cidade);
  const tipoNormalizado = slugPortal(f.tipo || "");
  const categoria = tipoNormalizado.includes("apartamento")
    ? "apartamentos"
    : (tipoNormalizado.includes("casa") ? "casas" : "imoveis");
  const dormitorios = f.dormitorios != null
    ? `/${f.dormitorios}-quarto${f.dormitorios === 1 ? "" : "s"}`
    : "";
  const bairro = f.bairro ? `/${slugPortal(f.bairro)}` : "";
  const url = new URL(
    `https://www.chavesnamao.com.br/${categoria}-para-alugar/${uf}-${cidade}${bairro}${dormitorios}/`,
  );
  if (f.valorMin != null) url.searchParams.set("valor_min", String(f.valorMin));
  if (f.valorMax != null) url.searchParams.set("valor_max", String(f.valorMax));
  return url.toString();
}

function categoriaWimoveis(tipo?: string): string {
  const valor = slugPortal(tipo || "");
  if (valor.includes("apartamento")) return "apartamentos";
  if (valor.includes("casa")) return "casas";
  return "imoveis";
}

function urlWimoveis(f: FiltrosCentralAngariacao): string {
  const partes = [
    "https://www.wimoveis.com.br/aluguel",
    categoriaWimoveis(f.tipo),
    slugPortal(f.estado || "PR"),
    slugPortal(f.cidade),
    f.bairro ? slugPortal(f.bairro) : null,
    f.dormitorios != null ? `${f.dormitorios}-quarto${f.dormitorios === 1 ? "" : "s"}` : null,
    f.somenteProprietario ? "tipoanunciante-particular" : null,
  ].filter(Boolean);
  return partes.join("/");
}

function urlVivaReal(f: FiltrosCentralAngariacao): string {
  const estados: Record<string, string> = { PR: "parana" };
  const estado = estados[(f.estado || "PR").toUpperCase()] || slugPortal(f.estado || "PR");
  const tipoNormalizado = slugPortal(f.tipo || "");
  const tipo = tipoNormalizado.includes("apartamento")
    ? "apartamento_residencial"
    : (tipoNormalizado.includes("casa") ? "casa_residencial" : null);
  const partes = [
    "https://www.vivareal.com.br/aluguel",
    estado,
    slugPortal(f.cidade),
    f.bairro ? `bairros/${slugPortal(f.bairro)}` : null,
    tipo,
  ].filter(Boolean);
  const url = new URL(`${partes.join("/")}/`);
  if (f.valorMin != null) url.searchParams.set("precoMinimo", String(f.valorMin));
  if (f.valorMax != null) url.searchParams.set("precoMaximo", String(f.valorMax));
  if (f.dormitorios != null) url.searchParams.set("quartos", String(f.dormitorios));
  return url.toString();
}

export function urlDaPesquisa(filtros: FiltrosCentralAngariacao): string {
  switch (filtros.portal) {
    case "olx": return urlOlx(filtros);
    case "chaves-na-mao": return urlChaves(filtros);
    case "wimoveis": return urlWimoveis(filtros);
    case "viva-real": return urlVivaReal(filtros);
  }
}

interface JsonLd {
  name?: unknown;
  description?: unknown;
  url?: unknown;
  image?: unknown;
  offers?: { price?: unknown };
  address?: {
    streetAddress?: unknown;
    addressLocality?: unknown;
    addressRegion?: unknown;
  };
  itemListElement?: unknown;
  item?: unknown;
  datePosted?: unknown;
  datePublished?: unknown;
}

function coletarItens(valor: unknown, saida: JsonLd[]) {
  if (Array.isArray(valor)) {
    for (const item of valor) coletarItens(item, saida);
    return;
  }
  if (!valor || typeof valor !== "object") return;
  const obj = valor as JsonLd;
  if (typeof obj.url === "string" && (typeof obj.name === "string" || obj.offers)) saida.push(obj);
  if (obj.itemListElement) coletarItens(obj.itemListElement, saida);
  if (obj.item) coletarItens(obj.item, saida);
}

/** Parser conservador: só aceita JSON-LD publicado pelo próprio portal.
    Mudança de HTML resulta em lista vazia e link da pesquisa, nunca em dado
    inventado ou em card associado ao imóvel errado. */
export function extrairJsonLd(
  html: string,
  portal: PortalAngariacao,
  baseUrl: string,
): AnuncioCentralAngariacao[] {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const itens: JsonLd[] = [];
  for (const match of scripts) {
    try { coletarItens(JSON.parse(match[1]), itens); } catch { /* bloco malformado: ignora */ }
  }

  const vistos = new Set<string>();
  return itens.flatMap((item, indice) => {
    if (typeof item.url !== "string" || typeof item.name !== "string") return [];
    let url: string;
    try { url = new URL(item.url, baseUrl).toString(); } catch { return []; }
    const caminho = new URL(url).pathname.toLowerCase();
    // Os portais também publicam JSON-LD da página inicial e da própria
    // listagem. Eles têm `name` + `url`, mas NÃO são imóveis. Aceitar
    // somente o formato de detalhe impede cards como "Chaves na Mão" e
    // "8.600 imóveis" de aparecerem como oportunidades importáveis.
    const ehDetalhe = portal === "olx"
      ? /\d{6,}/.test(caminho)
      : portal === "wimoveis"
        ? caminho.includes("/propriedades/")
        : caminho.includes("/imovel/") || /\/id-\d+/.test(caminho);
    if (!ehDetalhe) return [];
    if (vistos.has(url)) return [];
    vistos.add(url);
    const imagem = Array.isArray(item.image) ? item.image[0] : item.image;
    const preco = Number(item.offers?.price);
    const dataPublicada = typeof item.datePosted === "string"
      ? item.datePosted
      : (typeof item.datePublished === "string" ? item.datePublished : null);
    return [{
      idExterno: idDoAnuncio(portal, url, indice),
      portal,
      titulo: item.name,
      preco: Number.isFinite(preco) ? preco : null,
      cidade: typeof item.address?.addressLocality === "string" ? item.address.addressLocality : null,
      bairro: null,
      endereco: typeof item.address?.streetAddress === "string" ? item.address.streetAddress : null,
      imagem: typeof imagem === "string" ? imagem : null,
      url,
      descricao: typeof item.description === "string" ? item.description : null,
      publicadoEm: dataPublicada,
      publicadoTexto: null,
      anunciante: "incerto" as const,
    }];
  }).slice(0, 60);
}
