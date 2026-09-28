/* ================================================================
   R4.2f — DIAGNÓSTICO TEMPORÁRIO DO ZAP (discovery)

   Prova única, só em Preview, para descobrir a estrutura real da
   listagem do ZAP antes de qualquer builder ou parser definitivo.
   O ZAP NÃO é PortalAngariacao: nada aqui entra na Central, no Radar,
   no cache, no single-flight ou nos fallbacks. Este arquivo sai do
   código junto com a rota e a página temporárias.

   Regras que seguram o diagnóstico:
   - a URL é fixa aqui, nunca vem do cliente;
   - exatamente UM POST ao Firecrawl, sem retry e sem fallback;
   - o HTML existe só em memória e vira contagens na hora;
   - a saída só tem números, booleanos e rótulos estruturais curtos
     que passaram por lista branca; nenhum texto de anúncio.
   ================================================================ */
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { TIMEOUT_FIRECRAWL_FETCH_MS, TIMEOUT_FIRECRAWL_MS } from "./firecrawlCentralAngariacao";

/** Gerada pelo próprio site do ZAP: aluguel, apartamento residencial, Londrina/PR, sem faixa de preço. */
export const URL_DIAGNOSTICO_ZAP =
  "https://www.zapimoveis.com.br/aluguel/apartamentos/pr+londrina/?onde=%2CParan%C3%A1%2CLondrina%2C%2C%2C%2C%2Ccity%2CBR%3EParana%3ENULL%3ELondrina%2C-23.319731%2C-51.166201%2C&tipos=apartamento_residencial";

export const ENDPOINT_FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v2/scrape";

const HOST_ZAP = "www.zapimoveis.com.br";
const MAX_PADROES = 12;

// ----------------------------------------------------------------
// Aquisição: uma chamada, mesmo contrato operacional da coleta atual
// ----------------------------------------------------------------

export type FalhaAquisicaoZap =
  | "firecrawl_timeout" | "firecrawl_indisponivel" | "firecrawl_429" | "firecrawl_http_falhou"
  | "firecrawl_resposta_invalida" | "firecrawl_resposta_falhou" | "firecrawl_html_invalido"
  | "portal_http_falhou";

export interface AquisicaoZap {
  chamadasFirecrawl: 1;
  statusHttpFirecrawl: number | null;
  statusHttpPortal: number | null;
  falha: FalhaAquisicaoZap | null;
}

interface CorpoFirecrawl {
  success?: unknown;
  data?: { rawHtml?: unknown; metadata?: { statusCode?: unknown } };
}

/** Corpo do POST: o mesmo da coleta atual, sem guardar a página no cache do Firecrawl. */
export function corpoRequisicaoZap(): Record<string, unknown> {
  return {
    url: URL_DIAGNOSTICO_ZAP,
    formats: ["rawHtml"],
    proxy: "basic",
    location: { country: "BR", languages: ["pt-BR"] },
    timeout: TIMEOUT_FIRECRAWL_MS,
    // Prova de estrutura atual: não reaproveita nem deixa cópia no cache do provedor.
    storeInCache: false,
    maxAge: 0,
  };
}

function ehTimeout(erro: unknown): boolean {
  return erro instanceof Error && ["AbortError", "TimeoutError"].includes(erro.name);
}

/** Faz exatamente uma chamada. Qualquer falha encerra a prova; não há segunda tentativa. */
export async function adquirirHtmlZapUmaVez(
  apiKey: string,
): Promise<{ aquisicao: AquisicaoZap; html: string | null }> {
  const aquisicao: AquisicaoZap = {
    chamadasFirecrawl: 1, statusHttpFirecrawl: null, statusHttpPortal: null, falha: null,
  };
  const falhar = (falha: FalhaAquisicaoZap) => ({ aquisicao: { ...aquisicao, falha }, html: null });

  let resposta: Response;
  try {
    resposta = await fetch(ENDPOINT_FIRECRAWL_SCRAPE, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpoRequisicaoZap()),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_FIRECRAWL_FETCH_MS),
    });
  } catch (erro) {
    return falhar(ehTimeout(erro) ? "firecrawl_timeout" : "firecrawl_indisponivel");
  }
  aquisicao.statusHttpFirecrawl = resposta.status;
  if (!resposta.ok) return falhar(resposta.status === 429 ? "firecrawl_429" : "firecrawl_http_falhou");

  let corpo: CorpoFirecrawl;
  try {
    corpo = await resposta.json() as CorpoFirecrawl;
  } catch (erro) {
    return falhar(ehTimeout(erro) ? "firecrawl_timeout" : "firecrawl_resposta_invalida");
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return falhar("firecrawl_resposta_invalida");
  if (corpo.success === false) return falhar("firecrawl_resposta_falhou");
  if (corpo.success !== true || !corpo.data || typeof corpo.data !== "object") {
    return falhar("firecrawl_resposta_invalida");
  }
  const statusPortal = corpo.data.metadata?.statusCode;
  if (typeof statusPortal === "number" && Number.isInteger(statusPortal)) aquisicao.statusHttpPortal = statusPortal;
  if (aquisicao.statusHttpPortal != null && aquisicao.statusHttpPortal >= 400) return falhar("portal_http_falhou");
  if (typeof corpo.data.rawHtml !== "string" || !corpo.data.rawHtml.trim()) return falhar("firecrawl_html_invalido");
  return { aquisicao, html: corpo.data.rawHtml };
}

// ----------------------------------------------------------------
// Utilidades de saída segura
// ----------------------------------------------------------------

/** Rótulo estrutural curto (nome de chave, data-testid, @type...). Qualquer outra coisa vira null. */
export function rotuloSeguro(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return /^[A-Za-z_][A-Za-z0-9_:\-]{0,47}$/.test(limpo) ? limpo : null;
}

export function contar<T extends string>(mapa: Map<T, number>, chave: T | null): void {
  if (chave == null) return;
  mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
}

export function maisFrequentes(mapa: Map<string, number>, limite = MAX_PADROES): Array<{ padrao: string; quantidade: number }> {
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([padrao, quantidade]) => ({ padrao, quantidade }));
}

export function textoDe(elemento: Cheerio<AnyNode>): string {
  return elemento.text().replace(/\s+/g, " ").trim();
}

/** Atributos que descrevem papel estrutural (nunca o conteúdo visível). */
function atributosEstruturais($: CheerioAPI, elemento: AnyNode): string {
  const attrs = ($(elemento).attr() ?? {}) as Record<string, string>;
  return Object.entries(attrs)
    .filter(([nome]) => nome === "class" || nome === "itemprop" || nome === "itemtype" || nome.startsWith("data-"))
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join(" ")
    .toLowerCase();
}

export function urlSegura(href: string | undefined): URL | null {
  if (!href) return null;
  try {
    return new URL(href, `https://${HOST_ZAP}/`);
  } catch {
    return null;
  }
}

function ehInterna(url: URL): boolean {
  return url.hostname === HOST_ZAP || url.hostname === "zapimoveis.com.br";
}

/** Forma do caminho, sem slugs: `/imovel/{slug}-id-{n}/`. Só o 1º segmento pode ficar literal. */
export function padraoDoCaminho(url: URL): string {
  const segmentos = url.pathname.split("/").filter(Boolean);
  const formas = segmentos.map((segmento, indice) => {
    const minusculo = segmento.toLowerCase();
    if (/^\d+$/.test(minusculo)) return "{n}";
    if (indice === 0 && /^[a-z][a-z-]{0,29}$/.test(minusculo)) return minusculo;
    const sufixoId = minusculo.match(/-id-\d{4,}$/);
    if (sufixoId) return "{slug}-id-{n}";
    if (/\d{6,}$/.test(minusculo)) return "{slug}{n}";
    if (/\d{6,}/.test(minusculo)) return "{slug-com-n}";
    return "{slug}";
  });
  const chaves = [...new Set([...url.searchParams.keys()].map((chave) => rotuloSeguro(chave) ?? "{param}"))].sort();
  return `/${formas.join("/")}${formas.length ? "/" : ""}${chaves.length ? `?${chaves.join("&")}` : ""}`;
}

/** ID numérico aparente do caminho (sequência de 6+ dígitos), com a forma de onde saiu. */
export function idDaUrl(url: URL): { id: string; forma: string } | null {
  const segmentos = url.pathname.split("/").filter(Boolean);
  for (let i = segmentos.length - 1; i >= 0; i -= 1) {
    const segmento = segmentos[i];
    const sufixo = segmento.match(/-id-(\d{6,})$/i);
    if (sufixo) return { id: sufixo[1], forma: "sufixo -id-{n} no caminho" };
    if (/^\d{6,}$/.test(segmento)) return { id: segmento, forma: "segmento /{n}/ no caminho" };
    const fim = segmento.match(/(\d{6,})$/);
    if (fim) return { id: fim[1], forma: "número no fim do segmento" };
  }
  for (const [chave, valor] of url.searchParams) {
    if (/^\d{6,}$/.test(valor) && /id/i.test(chave)) return { id: valor, forma: "parâmetro de id na query" };
  }
  return null;
}

// ----------------------------------------------------------------
// Cards: sobe do link de detalhe até o maior ancestral com um só anúncio
// ----------------------------------------------------------------

export interface CardCandidato {
  raiz: Element;
  id: string;
  /** origem + caminho do link, sem query nem barra final: só para parear com o JSON-LD. */
  urlNormalizada: string;
  forma: string;
  comQuery: boolean;
  linkPadrao: string;
}

/** Origem + caminho, minúsculos e sem barra final: compara link do card com URL do JSON-LD. */
export function normalizarUrl(url: URL): string {
  return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase().replace(/\/+$/, "")}`;
}

/** Forma do caminho sem a query: agrupa links do mesmo tipo de página. */
function familiaDoCaminho(padrao: string): string {
  return padrao.split("?")[0];
}

export function cardsCandidatos($: CheerioAPI): {
  cards: CardCandidato[];
  links: {
    internos: number; externos: number; comId: number; padroes: Map<string, number>;
    familiaDominante: string | null; comIdForaDaFamiliaDominante: number;
  };
} {
  const padroes = new Map<string, number>();
  const comId: Array<{ link: Element; id: string; forma: string; comQuery: boolean; padrao: string; urlNormalizada: string }> = [];
  let internos = 0;
  let externos = 0;
  $("a[href]").each((_, elemento) => {
    const url = urlSegura($(elemento).attr("href"));
    if (!url || !/^https?:$/.test(url.protocol)) return;
    if (!ehInterna(url)) {
      externos += 1;
      return;
    }
    internos += 1;
    const padrao = padraoDoCaminho(url);
    contar(padroes, padrao);
    const id = idDaUrl(url);
    if (id) comId.push({ link: elemento, ...id, comQuery: url.search.length > 0, padrao, urlNormalizada: normalizarUrl(url) });
  });

  // Links com número podem apontar para anunciante, lançamento etc. O card é
  // derivado só da família de caminho mais frequente; as demais são contadas.
  const familias = new Map<string, number>();
  for (const item of comId) contar(familias, familiaDoCaminho(item.padrao));
  const familiaDominante = maisFrequentes(familias, 1)[0]?.padrao ?? null;
  const porElementoLink = comId.filter((item) => familiaDoCaminho(item.padrao) === familiaDominante);

  // Um ancestral "pertence" a um anúncio enquanto só contém links desse mesmo id.
  const idsPorAncestral = new Map<Element, Set<string>>();
  for (const item of porElementoLink) {
    for (let atual: Element | null = item.link; atual; atual = atual.parent?.type === "tag" ? atual.parent as Element : null) {
      const ids = idsPorAncestral.get(atual) ?? new Set<string>();
      ids.add(item.id);
      idsPorAncestral.set(atual, ids);
    }
  }
  const cards = new Map<Element, CardCandidato>();
  for (const item of porElementoLink) {
    let raiz: Element = item.link;
    for (let atual = item.link.parent; atual && atual.type === "tag"; atual = atual.parent) {
      if ((idsPorAncestral.get(atual as Element)?.size ?? 0) !== 1) break;
      raiz = atual as Element;
    }
    if (!cards.has(raiz)) {
      cards.set(raiz, {
        raiz, id: item.id, forma: item.forma, comQuery: item.comQuery, linkPadrao: item.padrao,
        urlNormalizada: item.urlNormalizada,
      });
    }
  }
  return {
    cards: [...cards.values()],
    links: {
      internos, externos, comId: comId.length, padroes,
      familiaDominante, comIdForaDaFamiliaDominante: comId.length - porElementoLink.length,
    },
  };
}

function assinaturaDoCard($: CheerioAPI, raiz: Element): string {
  const testid = rotuloSeguro($(raiz).attr("data-testid")) ?? rotuloSeguro($(raiz).attr("data-cy"));
  if (testid) return `${raiz.tagName}[data-testid=${testid}]`;
  const classes = ($(raiz).attr("class") ?? "").split(/\s+/).map(rotuloSeguro).filter(Boolean).slice(0, 2);
  return classes.length ? `${raiz.tagName}.${classes.join(".")}` : raiz.tagName;
}

// ----------------------------------------------------------------
// Semântica por card
// ----------------------------------------------------------------

const VALORES_MONETARIOS = /R\$\s*[\d.]+(?:,\d{2})?/g;
const TEM_VALOR_MONETARIO = /R\$\s*[\d.]+/;
type RotuloPreco = "aluguel" | "condominio" | "iptu" | "total" | "outro" | "sem_rotulo";

/** Um rótulo só quando o texto indica exatamente uma categoria. "/mês" sozinho não prova aluguel. */
function rotuloDoTexto(valor: string): RotuloPreco {
  const achados = new Set<RotuloPreco>();
  if (/\baluguel\b|\brental\b|\brent\b/i.test(valor)) achados.add("aluguel");
  if (/\bcondom[ií]nio\b|\bcond\.|\bcondo\b|condominium/i.test(valor)) achados.add("condominio");
  if (/\biptu\b/i.test(valor)) achados.add("iptu");
  if (/\btotal\b/i.test(valor)) achados.add("total");
  if (/\b(taxa|seguro|outras? despesas?)\b/i.test(valor)) achados.add("outro");
  return achados.size === 1 ? [...achados][0] : "sem_rotulo";
}

const PALAVRAS_ESTRUTURAIS_PRECO = ["price", "rental", "rent", "condo", "iptu", "total", "business", "valor", "preco"];

interface ValoresDoCard {
  rotulos: RotuloPreco[];
  comSufixoMes: boolean;
  palavrasEstruturais: string[];
}

/** Rótulo de cada valor: texto do menor elemento que o contém, depois o do pai curto, depois atributos. */
function valoresDoCard($: CheerioAPI, raiz: Element): ValoresDoCard {
  const rotulos: RotuloPreco[] = [];
  const palavras = new Set<string>();
  let comSufixoMes = false;
  const portadores = $(raiz).find("*").addBack().toArray().filter((el) => {
    const proprio = $(el).contents().toArray().filter((no) => no.type === "text").map((no) => $(no).text()).join(" ");
    return TEM_VALOR_MONETARIO.test(proprio);
  });
  for (const portador of portadores) {
    const textoPortador = textoDe($(portador));
    const quantidade = textoPortador.match(VALORES_MONETARIOS)?.length ?? 0;
    if (!quantidade) continue;
    const pai = portador.parent && portador.parent.type === "tag" ? textoDe($(portador.parent as Element)) : "";
    if (/\/\s*m[eê]s\b/i.test(`${textoPortador} ${quantidade === 1 ? pai : ""}`)) comSufixoMes = true;
    const atributos = `${atributosEstruturais($, portador)} ${portador.parent?.type === "tag" ? atributosEstruturais($, portador.parent as Element) : ""}`;
    for (const palavra of PALAVRAS_ESTRUTURAIS_PRECO) if (atributos.includes(palavra)) palavras.add(palavra);
    let rotulo = rotuloDoTexto(textoPortador);
    if (rotulo === "sem_rotulo" && quantidade === 1 && pai.length <= 80) rotulo = rotuloDoTexto(pai);
    if (rotulo === "sem_rotulo") rotulo = rotuloDoTexto(atributos.replace(/[-_]/g, " "));
    for (let i = 0; i < quantidade; i += 1) rotulos.push(rotulo);
  }
  return { rotulos, comSufixoMes, palavrasEstruturais: [...palavras] };
}

const LOGRADOURO = /^(rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.|rodovia|estrada|pra[çc]a)\s/i;

function segmentosFolha($: CheerioAPI, raiz: Element): string[] {
  return $(raiz).find("*").addBack().toArray()
    .filter((el) => $(el).children().length === 0)
    .map((el) => textoDe($(el)))
    .filter(Boolean);
}

// ----------------------------------------------------------------
// Diagnóstico agregado
// ----------------------------------------------------------------

function faixa(n: number): "zero" | "um" | "dois" | "tresOuMais" {
  return n === 0 ? "zero" : n === 1 ? "um" : n === 2 ? "dois" : "tresOuMais";
}

function jsonLd($: CheerioAPI) {
  const tipos = new Map<string, number>();
  let blocos = 0;
  let invalidos = 0;
  let itensComUrlENome = 0;
  let comDataPublicacao = 0;
  const visitar = (valor: unknown, profundidade: number) => {
    if (profundidade > 8 || !valor || typeof valor !== "object") return;
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item, profundidade + 1);
      return;
    }
    const obj = valor as Record<string, unknown>;
    const tipo = obj["@type"];
    for (const t of Array.isArray(tipo) ? tipo : [tipo]) contar(tipos, rotuloSeguro(t));
    if (typeof obj.url === "string" && typeof obj.name === "string") itensComUrlENome += 1;
    if (typeof obj.datePosted === "string" || typeof obj.datePublished === "string") comDataPublicacao += 1;
    for (const filho of Object.values(obj)) visitar(filho, profundidade + 1);
  };
  $('script[type="application/ld+json"]').each((_, script) => {
    blocos += 1;
    try { visitar(JSON.parse($(script).text()), 0); } catch { invalidos += 1; }
  });
  return { blocos, invalidos, tipos: maisFrequentes(tipos), itensComUrlENome, comDataPublicacao };
}

/** Procura, sem copiar valores, listas de objetos no estado embutido da página. */
function dadosEmbutidos($: CheerioAPI) {
  const marcadores = new Map<string, number>();
  const listas: Array<{ caminho: string; itens: number; chaves: string[] }> = [];
  let maiorScriptCaracteres = 0;
  const visitar = (valor: unknown, caminho: string[], profundidade: number) => {
    if (profundidade > 10 || listas.length >= 30 || !valor || typeof valor !== "object") return;
    if (Array.isArray(valor)) {
      const objetos = valor.filter((item) => item && typeof item === "object" && !Array.isArray(item));
      if (objetos.length >= 5) {
        const chaves = [...new Set(objetos.slice(0, 3).flatMap((item) => Object.keys(item as object)))]
          .map(rotuloSeguro).filter((chave): chave is string => chave != null).slice(0, 30);
        listas.push({ caminho: caminho.join(".") || "(raiz)", itens: objetos.length, chaves });
      }
      if (objetos[0]) visitar(objetos[0], [...caminho, "[]"], profundidade + 1);
      return;
    }
    for (const [chave, filho] of Object.entries(valor as Record<string, unknown>)) {
      visitar(filho, [...caminho, rotuloSeguro(chave) ?? "{chave}"], profundidade + 1);
    }
  };
  $("script:not([src])").each((_, script) => {
    const conteudo = $(script).text();
    maiorScriptCaracteres = Math.max(maiorScriptCaracteres, conteudo.length);
    const id = rotuloSeguro($(script).attr("id"));
    if (id === "__NEXT_DATA__") contar(marcadores, "__NEXT_DATA__");
    for (const marcador of ["__NEXT_DATA__", "__NUXT__", "__INITIAL_STATE__", "__PRELOADED_STATE__", "__APOLLO_STATE__", "self.__next_f"]) {
      if (id !== marcador && conteudo.includes(marcador)) contar(marcadores, marcador);
    }
    const tipo = $(script).attr("type") ?? "";
    if (id === "__NEXT_DATA__" || tipo === "application/json") {
      try { visitar(JSON.parse(conteudo), [id ?? "json"], 0); } catch { /* bloco não JSON: ignora */ }
    }
  });
  return {
    scriptsInline: $("script:not([src])").length,
    maiorScriptCaracteres,
    marcadores: maisFrequentes(marcadores),
    listasDeObjetos: listas.sort((a, b) => b.itens - a.itens).slice(0, 10),
  };
}

function atributosRepetidos($: CheerioAPI) {
  const nomes = new Map<string, number>();
  const testids = new Map<string, number>();
  $("*").each((_, elemento) => {
    for (const [nome, valor] of Object.entries(($(elemento).attr() ?? {}) as Record<string, string>)) {
      if (!nome.startsWith("data-")) continue;
      contar(nomes, rotuloSeguro(nome));
      if (["data-testid", "data-cy", "data-qa"].includes(nome)) contar(testids, rotuloSeguro(`${nome}=${valor}`));
    }
  });
  const repetidos = (mapa: Map<string, number>, minimo: number) =>
    maisFrequentes(new Map([...mapa].filter(([, n]) => n >= minimo)), 30);
  return { nomes: repetidos(nomes, 5), valoresDeTeste: repetidos(testids, 3) };
}

function paginacao($: CheerioAPI) {
  const parametros = new Map<string, number>();
  let numerosDePagina = 0;
  let maiorPaginaVisivel: number | null = null;
  $("a[href]").each((_, elemento) => {
    const url = urlSegura($(elemento).attr("href"));
    if (!url || !ehInterna(url)) return;
    for (const chave of url.searchParams.keys()) {
      if (/^(pagina|page|p|pg|from|offset|cursor)$/i.test(chave)) contar(parametros, rotuloSeguro(chave));
    }
    const rotulo = textoDe($(elemento));
    if (/^\d{1,3}$/.test(rotulo)) {
      numerosDePagina += 1;
      maiorPaginaVisivel = Math.max(maiorPaginaVisivel ?? 0, Number(rotulo));
    }
  });
  const botoes = $("button, a").toArray().map((el) => textoDe($(el)));
  const totalDeclarado = textoDe($("h1").first()).match(/([\d.]{1,9})\s+(?:apartamentos?|im[oó]veis)\b/i)?.[1];
  return {
    linkRelNext: $('link[rel="next"], a[rel="next"]').length,
    ariaProxima: $('[aria-label*="próxima" i], [aria-label*="proxima" i], [aria-label*="next" i]').length,
    containersPaginacao: $('nav[aria-label*="pagin" i], [class*="pagination" i], [data-testid*="pagination" i]').length,
    parametros: maisFrequentes(parametros),
    linksNumericos: numerosDePagina,
    maiorPaginaVisivel,
    botoesCarregarMais: botoes.filter((texto) => /^(ver|carregar|mostrar)\s+mais\b/i.test(texto)).length,
    totalResultadosDeclarado: totalDeclarado ? Number(totalDeclarado.replace(/\./g, "")) : null,
  };
}

function hostImagem(elemento: Cheerio<AnyNode>): string | null {
  const bruto = elemento.attr("src") || elemento.attr("data-src") || elemento.attr("srcset")?.split(/[\s,]+/)[0];
  if (!bruto || bruto.startsWith("data:")) return null;
  try {
    return new URL(bruto, `https://${HOST_ZAP}/`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Generaliza o host só pelo primeiro rótulo numérico/variável (ex.: `resizedimgs.x.com`). */
function padraoHost(host: string): string {
  return host.replace(/^[a-z0-9-]*\d[a-z0-9-]*\./, "{n}.");
}

const MARCADORES_BLOQUEIO: Array<[string, RegExp]> = [
  ["cloudflare", /cloudflare|cf-chl|attention required/i],
  ["captcha", /captcha|recaptcha|hcaptcha|px-captcha/i],
  ["acesso_negado", /access denied|acesso negado|forbidden/i],
  ["aguarde_verificacao", /just a moment|verificando|checking your browser/i],
];

export function diagnosticarHtmlZap(html: string) {
  const $ = load(html);
  const titulo = textoDe($("title").first());
  const cabecalho = `${titulo} ${textoDe($("h1").first())}`;
  const bloqueio = MARCADORES_BLOQUEIO.filter(([, regra]) => regra.test(cabecalho)).map(([nome]) => nome);

  const { cards, links } = cardsCandidatos($);
  const assinaturas = new Map<string, number>();
  const formasId = new Map<string, number>();
  const padroesLinkCard = new Map<string, number>();
  const sequenciasPreco = new Map<string, number>();
  const hostsCards = new Map<string, number>();
  const contagemIds = new Map<string, number>();
  const outrosIds = new Map<string, number>();
  const preco = {
    cardsComValores: { zero: 0, um: 0, dois: 0, tresOuMais: 0 },
    aluguelRotulado: 0, condominioRotulado: 0, iptuRotulado: 0, totalRotulado: 0, outroRotulado: 0,
    precoAmbiguo: 0, primeiroValorRotuladoAluguel: 0, cardsComSufixoMes: 0,
  };
  const palavrasPreco = new Map<string, number>();
  const localizacao = {
    publicadoNoCard: { logradouro: 0, logradouroComNumero: 0, bairroCidadeEstruturado: 0, cidadeLondrina: 0, uf: 0, atributoEndereco: 0 },
    somenteNaUrl: { linksDeCardComLondrinaNoSlug: 0, linksDeCardComUfNoSlug: 0 },
    contextoDaBusca: { cidadeNaUrlDaBusca: true, ufNaUrlDaBusca: true },
  };
  const imovel = { titulo: 0, tipo: 0, quartos: 0, banheiros: 0, vagas: 0, area: 0 };
  const autoria = { imobiliariaOuCorretor: 0, creci: 0, particularOuProprietario: 0, atributoAnunciante: 0, semSinal: 0 };
  const data = { textoPublicacao: 0, dataRelativa: 0, dataAbsoluta: 0, elementoTime: 0, atualizacao: 0 };
  let cardsComImagem = 0;

  for (const card of cards) {
    const raiz = $(card.raiz);
    contar(assinaturas, assinaturaDoCard($, card.raiz));
    contar(formasId, card.forma);
    contar(padroesLinkCard, card.linkPadrao);
    contagemIds.set(card.id, (contagemIds.get(card.id) ?? 0) + 1);
    for (const [nome, valor] of Object.entries((raiz.attr() ?? {}) as Record<string, string>)) {
      if (/(^|-)id$|listing|posting/i.test(nome) && /^[\w-]{4,}$/.test(valor ?? "")) contar(outrosIds, rotuloSeguro(nome));
    }

    const { rotulos, comSufixoMes, palavrasEstruturais } = valoresDoCard($, card.raiz);
    if (comSufixoMes) preco.cardsComSufixoMes += 1;
    for (const palavra of palavrasEstruturais) contar(palavrasPreco, palavra);
    preco.cardsComValores[faixa(rotulos.length)] += 1;
    if (rotulos.includes("aluguel")) preco.aluguelRotulado += 1;
    if (rotulos.includes("condominio")) preco.condominioRotulado += 1;
    if (rotulos.includes("iptu")) preco.iptuRotulado += 1;
    if (rotulos.includes("total")) preco.totalRotulado += 1;
    if (rotulos.includes("outro")) preco.outroRotulado += 1;
    if (rotulos.length && rotulos.filter((r) => r === "aluguel").length !== 1) preco.precoAmbiguo += 1;
    if (rotulos[0] === "aluguel") preco.primeiroValorRotuladoAluguel += 1;
    if (rotulos.length) contar(sequenciasPreco, rotulos.slice(0, 5).join(">"));

    const segmentos = segmentosFolha($, card.raiz);
    const textoCard = segmentos.join(" | ");
    const atributos = raiz.find("*").addBack().toArray().map((el) => atributosEstruturais($, el)).join(" ");
    const logradouros = segmentos.filter((s) => LOGRADOURO.test(s));
    if (logradouros.length) localizacao.publicadoNoCard.logradouro += 1;
    if (logradouros.some((s) => /,\s*\d{1,5}\b|\s\d{1,5}\s*$/.test(s))) localizacao.publicadoNoCard.logradouroComNumero += 1;
    if (segmentos.some((s) => /^[^,|]{2,60},\s*londrina\b/i.test(s))) localizacao.publicadoNoCard.bairroCidadeEstruturado += 1;
    if (/\blondrina\b/i.test(textoCard)) localizacao.publicadoNoCard.cidadeLondrina += 1;
    if (/\b(PR|Paran[aá])\b/.test(textoCard)) localizacao.publicadoNoCard.uf += 1;
    if (/address|street|neighbo|location|endereco|logradouro|bairro/.test(atributos)) localizacao.publicadoNoCard.atributoEndereco += 1;
    const hrefs = raiz.find("a[href]").addBack("a[href]").toArray().map((a) => ($(a).attr("href") ?? "").toLowerCase());
    if (hrefs.some((h) => h.includes("londrina"))) localizacao.somenteNaUrl.linksDeCardComLondrinaNoSlug += 1;
    if (hrefs.some((h) => /(^|[-/])pr([-/]|$)|parana/.test(h))) localizacao.somenteNaUrl.linksDeCardComUfNoSlug += 1;

    if (raiz.find("h1, h2, h3, h4, [title]").length || raiz.is("[title]")) imovel.titulo += 1;
    if (/\b(apartamento|casa|kitnet|kitinete|studio|est[uú]dio|sobrado|cobertura|flat|loft)\b/i.test(textoCard)) imovel.tipo += 1;
    if (/\d+\s*(quartos?|dorms?\.?|dormit[oó]rios?)\b/i.test(textoCard) || /bedroom/.test(atributos)) imovel.quartos += 1;
    if (/\d+\s*banheiros?\b/i.test(textoCard) || /bathroom/.test(atributos)) imovel.banheiros += 1;
    if (/\d+\s*vagas?\b/i.test(textoCard) || /parking|garage/.test(atributos)) imovel.vagas += 1;
    if (/\d+\s*m²|\d+\s*m2\b/i.test(textoCard) || /floor-?size|usable-?area|area/.test(atributos)) imovel.area += 1;

    const imobiliaria = /\bimobili[aá]ria\b|\bcorretor(a)?\b|\bconstrutora\b/i.test(textoCard);
    const creci = /\bcreci\b/i.test(textoCard);
    const particular = /\bparticular\b|\bpropriet[aá]rio\b|direto com o dono/i.test(textoCard);
    const atributoAnunciante = /publisher|advertiser|anunciante|account|agency|imobiliaria/.test(atributos);
    if (imobiliaria) autoria.imobiliariaOuCorretor += 1;
    if (creci) autoria.creci += 1;
    if (particular) autoria.particularOuProprietario += 1;
    if (atributoAnunciante) autoria.atributoAnunciante += 1;
    if (!imobiliaria && !creci && !particular && !atributoAnunciante) autoria.semSinal += 1;

    if (/\b(publicad[oa]|anunciad[oa])\b/i.test(textoCard)) data.textoPublicacao += 1;
    if (/\bh[aá]\s+\d+\s+(minutos?|horas?|dias?|semanas?|m[eê]s(es)?)\b|\b(hoje|ontem)\b/i.test(textoCard)) data.dataRelativa += 1;
    if (/\b\d{2}\/\d{2}\/\d{4}\b/.test(textoCard)) data.dataAbsoluta += 1;
    if (raiz.find("time, [datetime]").length) data.elementoTime += 1;
    if (/\batualizad[oa]\b/i.test(textoCard)) data.atualizacao += 1;

    const imagens = raiz.find("img, source").toArray().map((el) => hostImagem($(el))).filter((h): h is string => !!h);
    if (imagens.length) cardsComImagem += 1;
    for (const host of new Set(imagens)) contar(hostsCards, host);
  }

  const hostsPagina = new Map<string, number>();
  $("img").each((_, el) => contar(hostsPagina, hostImagem($(el))));
  const duplicados = [...contagemIds.values()].filter((n) => n > 1).length;
  const tamanhosId = [...contagemIds.keys()].map((id) => id.length);

  return {
    htmlCaracteres: html.length,
    pagina: {
      tituloCaracteres: titulo.length,
      tituloMencionaLondrina: /\blondrina\b/i.test(titulo),
      marcadoresDeBloqueio: bloqueio,
    },
    estrutura: {
      linksInternos: links.internos,
      linksExternos: links.externos,
      linksInternosComIdNumerico: links.comId,
      familiaDeLinkDosCards: links.familiaDominante,
      linksComIdForaDaFamiliaDosCards: links.comIdForaDaFamiliaDominante,
      padroesDeHref: maisFrequentes(links.padroes),
      cardsCandidatos: cards.length,
      assinaturasDeCard: maisFrequentes(assinaturas),
      padroesDoLinkDoCard: maisFrequentes(padroesLinkCard),
      jsonLd: jsonLd($),
      dadosEmbutidos: dadosEmbutidos($),
      atributosData: atributosRepetidos($),
    },
    identidade: {
      situacao: cards.length ? "id_numerico_na_url" : "desconhecido",
      cardsComIdNumericoNaUrl: cards.length,
      formasDoId: maisFrequentes(formasId),
      idsUnicos: contagemIds.size,
      idsRepetidosEntreCards: duplicados,
      digitosDoId: tamanhosId.length ? { minimo: Math.min(...tamanhosId), maximo: Math.max(...tamanhosId) } : null,
      cardsComQueryNoLink: cards.filter((card) => card.comQuery).length,
      outrosAtributosDeIdNoCard: maisFrequentes(outrosIds),
    },
    preco: {
      ...preco,
      sequenciasDeRotulos: maisFrequentes(sequenciasPreco, 8),
      palavrasEstruturaisNosValores: maisFrequentes(palavrasPreco),
      observacao: "Posição do valor não é usada como prova de aluguel.",
    },
    localizacao,
    imovel,
    autoria: {
      ...autoria,
      observacao: "Ausência de sinal de imobiliária não significa proprietário.",
    },
    data,
    paginacao: paginacao($),
    imagens: {
      cardsComImagem,
      hostsNosCards: maisFrequentes(hostsCards),
      hostsNaPagina: maisFrequentes(hostsPagina),
      padroesDeHost: maisFrequentes([...hostsPagina].reduce((mapa, [host, n]) => {
        mapa.set(padraoHost(host), (mapa.get(padraoHost(host)) ?? 0) + n);
        return mapa;
      }, new Map<string, number>())),
    },
  };
}

export type DiagnosticoZap = ReturnType<typeof diagnosticarHtmlZap>;
