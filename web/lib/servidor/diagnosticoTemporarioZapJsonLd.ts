/* ================================================================
   R4.2f — DIAGNÓSTICO TEMPORÁRIO DO ZAP: CAMPOS DO JSON-LD

   Segunda e última prova. Lê os campos do JSON-LD já observado na
   listagem (RealEstateListing, Offer, PriceSpecification, RentAction,
   PostalAddress, datePosted) e responde, só com agregados:
   - existe preço de LOCAÇÃO estruturalmente comprovado?
   - o JSON-LD melhora a localização e traz data?
   - dá para ligar cada item aos cards pelo ID/URL, nunca pela posição?

   Regras de prova:
   - `Offer.price` sozinho NÃO é aluguel;
   - RentAction solto no mesmo anúncio é contexto fraco, não prova;
   - rótulo de condomínio, IPTU, total ou venda exclui o valor;
   - endereço só conta como do imóvel se o dono estrutural for o imóvel
     (ou o anúncio) e o item estiver ligado a um ID de anúncio.

   Nada daqui sai como valor individual: nem preço, nem endereço, nem
   data, nem nome, nem URL. Sai junto com o harness.
   ================================================================ */
import { load, type CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import {
  cardsCandidatos,
  contar,
  maisFrequentes,
  normalizarUrl,
  rotuloSeguro,
  textoDe,
  urlSegura,
  type CardCandidato,
} from "./diagnosticoTemporarioZap";

const PROFUNDIDADE_MAXIMA = 14;
const NOS_MAXIMOS = 30_000;

interface No {
  obj: Record<string, unknown>;
  tipos: string[];
  pai: No | null;
  chave: string | null;
  filhos: No[];
  bloco: number;
}

// ----------------------------------------------------------------
// Árvore do JSON-LD em memória
// ----------------------------------------------------------------

function tiposDe(obj: Record<string, unknown>): string[] {
  const bruto = obj["@type"];
  return (Array.isArray(bruto) ? bruto : [bruto]).filter((t): t is string => typeof t === "string");
}

function arvoreJsonLd($: CheerioAPI): { nos: No[]; blocos: number; invalidos: number } {
  const nos: No[] = [];
  let blocos = 0;
  let invalidos = 0;
  const visitar = (valor: unknown, pai: No | null, chave: string | null, bloco: number, profundidade: number) => {
    if (profundidade > PROFUNDIDADE_MAXIMA || nos.length >= NOS_MAXIMOS || !valor || typeof valor !== "object") return;
    if (Array.isArray(valor)) {
      for (const item of valor) visitar(item, pai, chave, bloco, profundidade + 1);
      return;
    }
    const obj = valor as Record<string, unknown>;
    const no: No = { obj, tipos: tiposDe(obj), pai, chave, filhos: [], bloco };
    nos.push(no);
    pai?.filhos.push(no);
    for (const [filhoChave, filho] of Object.entries(obj)) visitar(filho, no, filhoChave, bloco, profundidade + 1);
  };
  $('script[type="application/ld+json"]').each((indice, script) => {
    blocos += 1;
    try {
      visitar(JSON.parse($(script).text()), null, null, indice, 0);
    } catch {
      invalidos += 1;
    }
  });
  return { nos, blocos, invalidos };
}

function ancestraisOuProprio(no: No): No[] {
  const lista: No[] = [];
  for (let atual: No | null = no; atual; atual = atual.pai) lista.push(atual);
  return lista;
}

function descendentes(no: No): No[] {
  const saida: No[] = [];
  const pilha = [...no.filhos];
  while (pilha.length) {
    const atual = pilha.pop()!;
    saida.push(atual);
    pilha.push(...atual.filhos);
  }
  return saida;
}

function temTipo(no: No, ...tipos: string[]): boolean {
  return no.tipos.some((t) => tipos.includes(t));
}

/** Caminho estrutural sem valores: `RealEstateListing.offers:Offer`. */
function caminhoTipado(no: No): string {
  const partes: string[] = [];
  for (let atual: No | null = no; atual; atual = atual.pai) {
    const tipo = atual.tipos[0] ? (rotuloSeguro(atual.tipos[0]) ?? "{tipo}") : "";
    if (atual.pai) partes.unshift(`.${rotuloChave(atual.chave)}${tipo ? `:${tipo}` : ""}`);
    else partes.unshift(tipo || "(sem tipo)");
  }
  return partes.join("").slice(0, 160);
}

// ----------------------------------------------------------------
// Identidade: só campos próprios do nó, nunca posição
// ----------------------------------------------------------------

const CAMPOS_DE_IDENTIDADE = ["url", "@id", "identifier", "mainEntityOfPage", "sameAs", "sku", "productID"] as const;

function idsDeValor(valor: unknown, campo: string, saida: Set<string>, profundidade = 0): void {
  if (profundidade > 3 || valor == null) return;
  if (Array.isArray(valor)) {
    for (const item of valor) idsDeValor(item, campo, saida, profundidade + 1);
    return;
  }
  if (typeof valor === "number" && Number.isInteger(valor) && String(valor).length >= 6 && campo !== "url") {
    saida.add(String(valor));
    return;
  }
  if (typeof valor === "string") {
    for (const achado of valor.matchAll(/-id-(\d{6,})(?=[/?#]|$)/gi)) saida.add(achado[1]);
    if (/^\d{6,}$/.test(valor.trim()) && campo !== "url") saida.add(valor.trim());
    return;
  }
  if (typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    for (const chave of ["@id", "url", "value"]) idsDeValor(obj[chave], chave, saida, profundidade + 1);
  }
}

function idsProprios(no: No): { ids: Set<string>; campos: string[] } {
  const ids = new Set<string>();
  const campos: string[] = [];
  for (const campo of CAMPOS_DE_IDENTIDADE) {
    const antes = ids.size;
    idsDeValor(no.obj[campo], campo, ids);
    if (ids.size > antes) campos.push(campo);
  }
  return { ids, campos };
}

function urlPropria(no: No): string | null {
  const bruto = no.obj.url;
  if (typeof bruto !== "string") return null;
  const url = urlSegura(bruto);
  return url ? normalizarUrl(url) : null;
}

/** Grupo de um nó: ID do ancestral (ou próprio) mais próximo com exatamente um ID; vários = ambíguo. */
function grupoDoNo(no: No, idsPorNo: Map<No, Set<string>>): { id: string | null; ambiguo: boolean } {
  for (const atual of ancestraisOuProprio(no)) {
    const ids = idsPorNo.get(atual);
    if (!ids || ids.size === 0) continue;
    return ids.size === 1 ? { id: [...ids][0], ambiguo: false } : { id: null, ambiguo: true };
  }
  return { id: null, ambiguo: false };
}

/** Pareamento pela identidade do anúncio: ID igual, ou URL igual. Nunca por posição. */
export function parearCardsPorIdentidade(
  cards: Array<Pick<CardCandidato, "id" | "urlNormalizada">>,
  idsDoJsonLd: Set<string>,
  idsPorUrl: Map<string, Set<string>>,
): Map<string, { grupo: string; porId: boolean; porUrl: boolean }> {
  const pares = new Map<string, { grupo: string; porId: boolean; porUrl: boolean }>();
  for (const card of cards) {
    const porId = idsDoJsonLd.has(card.id);
    const idsDaUrl = idsPorUrl.get(card.urlNormalizada);
    const porUrl = !!idsDaUrl && idsDaUrl.size === 1;
    const grupo = porId ? card.id : porUrl ? [...idsDaUrl!][0] : null;
    if (grupo) pares.set(card.id, { grupo, porId, porUrl: porUrl && (!porId || idsDaUrl!.has(card.id)) });
  }
  return pares;
}

// ----------------------------------------------------------------
// Preço
// ----------------------------------------------------------------

function numeroDoPreco(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const limpo = valor.replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  let numero: number;
  // Milhar com ponto ("2.500", "2.500,00") antes do decimal com ponto ("2500.00").
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpo)) numero = Number(limpo.replace(/\./g, "").replace(",", "."));
  else if (/^\d+(\.\d+)?$/.test(limpo)) numero = Number(limpo);
  else numero = Number(limpo.replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

type RotuloJsonLd = "aluguel" | "condominio" | "iptu" | "total" | "venda" | "sem_rotulo" | "conflitante";

function rotuloDoNoDePreco(no: No): RotuloJsonLd {
  const texto = ["name", "description", "priceType", "unitText", "valueAddedTaxIncluded"]
    .map((campo) => no.obj[campo])
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  const achados = new Set<RotuloJsonLd>();
  if (/\baluguel\b|\brent\b|\brental\b|loca[çc][ãa]o/.test(texto)) achados.add("aluguel");
  if (/condom[ií]nio|\bcondo\b/.test(texto)) achados.add("condominio");
  if (/\biptu\b/.test(texto)) achados.add("iptu");
  if (/\btotal\b/.test(texto)) achados.add("total");
  if (/\bvenda\b|\bsale\b|\bsell\b/.test(texto)) achados.add("venda");
  if (achados.size === 0) return "sem_rotulo";
  return achados.size === 1 ? [...achados][0] : "conflitante";
}

function unidadeMensal(no: No): boolean {
  const codigo = typeof no.obj.unitCode === "string" ? no.obj.unitCode : "";
  const texto = typeof no.obj.unitText === "string" ? no.obj.unitText : "";
  const referencia = no.obj.referenceQuantity as Record<string, unknown> | undefined;
  const codigoReferencia = typeof referencia?.unitCode === "string" ? referencia.unitCode : "";
  return /^MON$/i.test(codigo) || /^MON$/i.test(codigoReferencia) || /m[eê]s|mensal|month/i.test(texto);
}

interface CandidatoPreco {
  valor: number;
  origem: "Offer.price" | "PriceSpecification.price" | "RentAction.price";
  moedaBrl: boolean;
  moedaAusente: boolean;
  mensal: boolean;
  rotulo: RotuloJsonLd;
  dentroDeRentAction: boolean;
  ofertaComRentAction: boolean;
  leaseOut: boolean;
}

function ofertaDe(no: No): No | null {
  return ancestraisOuProprio(no).find((atual) => temTipo(atual, "Offer", "AggregateOffer")) ?? null;
}

function moedaDe(no: No): string | null {
  for (const atual of ancestraisOuProprio(no)) {
    if (typeof atual.obj.priceCurrency === "string") return atual.obj.priceCurrency.trim().toUpperCase();
    if (temTipo(atual, "Offer", "RealEstateListing", "Product")) break;
  }
  return null;
}

function candidatoDoNo(no: No): CandidatoPreco | null {
  const origem = temTipo(no, "Offer", "AggregateOffer")
    ? "Offer.price"
    : temTipo(no, "PriceSpecification", "UnitPriceSpecification", "CompoundPriceSpecification")
      ? "PriceSpecification.price"
      : temTipo(no, "RentAction") ? "RentAction.price" : null;
  if (!origem) return null;
  const valor = numeroDoPreco(no.obj.price);
  if (valor == null) return null;
  const oferta = ofertaDe(no);
  const moeda = moedaDe(no);
  const funcao = [no.obj.businessFunction, oferta?.obj.businessFunction].filter((v) => typeof v === "string").join(" ");
  return {
    valor,
    origem,
    moedaBrl: moeda === "BRL",
    moedaAusente: moeda == null,
    mensal: unidadeMensal(no),
    rotulo: rotuloDoNoDePreco(no),
    dentroDeRentAction: ancestraisOuProprio(no).some((atual) => temTipo(atual, "RentAction")),
    ofertaComRentAction: !!oferta && descendentes(oferta).some((filho) => temTipo(filho, "RentAction")),
    leaseOut: /LeaseOut/i.test(funcao),
  };
}

/** Prova estrutural de LOCAÇÃO: vínculo direto com RentAction, LeaseOut ou rótulo de aluguel,
    e nenhum rótulo de outra natureza. RentAction apenas no mesmo anúncio não basta. */
export function candidatoComprovaAluguel(c: CandidatoPreco): boolean {
  const contextoForte = c.dentroDeRentAction || c.ofertaComRentAction || c.leaseOut || c.rotulo === "aluguel";
  const rotuloCompativel = c.rotulo === "sem_rotulo" || c.rotulo === "aluguel";
  return contextoForte && rotuloCompativel;
}

function mesmoValor(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

// ----------------------------------------------------------------
// Card: valores monetários em ordem, só para comparar em memória
// ----------------------------------------------------------------

function valoresNumericosDoCard($: CheerioAPI, raiz: Element): number[] {
  return [...textoDe($(raiz)).matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)]
    // No card o formato é sempre o brasileiro: ponto de milhar, vírgula decimal.
    .map((achado) => Number(achado[1].replace(/\./g, "").replace(",", ".")))
    .filter((v) => Number.isFinite(v));
}

function normalizarTexto(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// ----------------------------------------------------------------
// Análise completa
// ----------------------------------------------------------------

const TIPOS_IMOVEL = ["Apartment", "House", "SingleFamilyResidence", "Residence", "Accommodation", "Room", "Place"];
const TIPOS_EMPRESA_OU_PESSOA = ["Organization", "RealEstateAgent", "LocalBusiness", "Corporation", "Person"];
const CHAVES_AUTORIA = ["seller", "offeredBy", "provider", "agent", "author", "brand", "publisher"];

/** Nome de chave para a saída: `@id`/`@type` preservam o prefixo; o resto passa pela lista branca. */
function rotuloChave(chave: string | null): string {
  if (chave?.startsWith("@")) return `@${rotuloSeguro(chave.slice(1)) ?? "{chave}"}`;
  return rotuloSeguro(chave) ?? "{chave}";
}

function chavesPorTipo(nos: No[], tipos: string[]) {
  const saida: Record<string, Array<{ padrao: string; quantidade: number }>> = {};
  for (const tipo of tipos) {
    const chaves = new Map<string, number>();
    for (const no of nos.filter((n) => n.tipos.includes(tipo))) {
      for (const chave of Object.keys(no.obj)) contar(chaves, rotuloChave(chave));
    }
    saida[tipo] = maisFrequentes(chaves, 25);
  }
  return saida;
}

export function analisarJsonLdZap(html: string, agora = Date.now()) {
  const $ = load(html);
  const { cards } = cardsCandidatos($);
  const { nos, blocos, invalidos } = arvoreJsonLd($);

  // Identidade própria de cada nó e grupo (ID do anúncio) de cada nó.
  const idsPorNo = new Map<No, Set<string>>();
  const camposDeId = new Map<string, number>();
  const idPorTipo = new Map<string, number>();
  for (const no of nos) {
    const { ids, campos } = idsProprios(no);
    if (ids.size === 0) continue;
    idsPorNo.set(no, ids);
    for (const tipo of no.tipos.length ? no.tipos : ["(sem tipo)"]) {
      for (const campo of campos) contar(camposDeId, `${rotuloSeguro(tipo) ?? "{tipo}"}.${rotuloChave(campo)}`);
      contar(idPorTipo, rotuloSeguro(tipo) ?? "{tipo}");
    }
  }
  const grupoPorNo = new Map<No, { id: string | null; ambiguo: boolean }>();
  for (const no of nos) grupoPorNo.set(no, grupoDoNo(no, idsPorNo));
  const nosPorGrupo = new Map<string, No[]>();
  let nosAmbiguos = 0;
  for (const [no, grupo] of grupoPorNo) {
    if (grupo.ambiguo) nosAmbiguos += 1;
    if (!grupo.id) continue;
    const lista = nosPorGrupo.get(grupo.id) ?? [];
    lista.push(no);
    nosPorGrupo.set(grupo.id, lista);
  }

  // Pareamento com os cards: por ID do anúncio ou URL igual. Nunca por posição.
  const idsDoJsonLd = new Set(nosPorGrupo.keys());
  const idPorUrl = new Map<string, Set<string>>();
  for (const no of nos) {
    const url = urlPropria(no);
    const grupo = grupoPorNo.get(no)?.id;
    if (!url || !grupo) continue;
    const ids = idPorUrl.get(url) ?? new Set<string>();
    ids.add(grupo);
    idPorUrl.set(url, ids);
  }
  const pares = parearCardsPorIdentidade(cards, idsDoJsonLd, idPorUrl);
  const cardPorId = new Map(cards.map((card) => [card.id, card]));
  // Grupo do JSON-LD -> card pareado a ele.
  const cardPorGrupo = new Map([...pares].map(([idCard, par]) => [par.grupo, cardPorId.get(idCard)!]));
  const listings = nos.filter((no) => temTipo(no, "RealEstateListing"));
  const listingsPorId = new Map<string, number>();
  for (const no of listings) {
    const id = grupoPorNo.get(no)?.id;
    if (id) listingsPorId.set(id, (listingsPorId.get(id) ?? 0) + 1);
  }

  // Preço
  const preco = {
    gruposComOffer: 0,
    gruposComPriceSpecification: 0,
    gruposComRentAction: 0,
    candidatos: { offerPrice: 0, priceSpecificationPrice: 0, rentActionPrice: 0, naoNumericos: 0 },
    moeda: { brl: 0, outra: 0, ausente: 0 },
    unidadeMensalExplicita: 0,
    rotulos: { aluguel: 0, condominio: 0, iptu: 0, total: 0, venda: 0, conflitante: 0, sem_rotulo: 0 },
    vinculoComRentAction: { dentroDeRentAction: 0, ofertaContemRentAction: 0, leaseOut: 0, apenasNoMesmoAnuncio: 0, nenhum: 0 },
    gruposComAluguelComprovado: 0,
    gruposComAluguelAmbiguo: 0,
    gruposComAluguelComprovadoBrlMensal: 0,
    gruposComOfferPriceSemContexto: 0,
  };
  const comparacao = {
    cardsPareados: pares.size,
    aluguelComprovadoPareado: 0,
    aluguelIgualPrimeiroValorDoCard: 0,
    aluguelIgualOutroValorDoCard: 0,
    aluguelDivergenteDoCard: 0,
    cardSemValorMonetario: 0,
    offerPriceIgualPrimeiroValorDoCard: 0,
    offerPriceIgualOutroValorDoCard: 0,
    offerPriceDivergenteDoCard: 0,
    cardsSemPareamento: cards.length - pares.size,
  };
  const relacoesRentAction = new Map<string, number>();
  const caminhosOffer = new Map<string, number>();
  const caminhosPriceSpec = new Map<string, number>();
  for (const no of nos) {
    if (temTipo(no, "RentAction")) contar(relacoesRentAction, caminhoTipado(no));
    if (temTipo(no, "Offer")) contar(caminhosOffer, caminhoTipado(no));
    if (temTipo(no, "PriceSpecification", "UnitPriceSpecification")) contar(caminhosPriceSpec, caminhoTipado(no));
  }
  const aluguelPorGrupo = new Map<string, number>();
  const primeiraOfferPorGrupo = new Map<string, number>();
  for (const [id, grupoNos] of nosPorGrupo) {
    if (grupoNos.some((no) => temTipo(no, "Offer"))) preco.gruposComOffer += 1;
    if (grupoNos.some((no) => temTipo(no, "PriceSpecification", "UnitPriceSpecification"))) preco.gruposComPriceSpecification += 1;
    const temRentAction = grupoNos.some((no) => temTipo(no, "RentAction"));
    if (temRentAction) preco.gruposComRentAction += 1;
    const candidatos: CandidatoPreco[] = [];
    for (const no of grupoNos) {
      if ("price" in no.obj && temTipo(no, "Offer", "AggregateOffer", "PriceSpecification", "UnitPriceSpecification", "CompoundPriceSpecification", "RentAction")) {
        const candidato = candidatoDoNo(no);
        if (!candidato) {
          preco.candidatos.naoNumericos += 1;
          continue;
        }
        candidatos.push(candidato);
      }
    }
    for (const c of candidatos) {
      if (c.origem === "Offer.price") preco.candidatos.offerPrice += 1;
      else if (c.origem === "PriceSpecification.price") preco.candidatos.priceSpecificationPrice += 1;
      else preco.candidatos.rentActionPrice += 1;
      if (c.moedaBrl) preco.moeda.brl += 1;
      else if (c.moedaAusente) preco.moeda.ausente += 1;
      else preco.moeda.outra += 1;
      if (c.mensal) preco.unidadeMensalExplicita += 1;
      preco.rotulos[c.rotulo] += 1;
      if (c.dentroDeRentAction) preco.vinculoComRentAction.dentroDeRentAction += 1;
      else if (c.ofertaComRentAction) preco.vinculoComRentAction.ofertaContemRentAction += 1;
      else if (c.leaseOut) preco.vinculoComRentAction.leaseOut += 1;
      else if (temRentAction) preco.vinculoComRentAction.apenasNoMesmoAnuncio += 1;
      else preco.vinculoComRentAction.nenhum += 1;
    }
    const primeiraOffer = candidatos.find((c) => c.origem === "Offer.price");
    if (primeiraOffer) primeiraOfferPorGrupo.set(id, primeiraOffer.valor);
    const comprovados = candidatos.filter(candidatoComprovaAluguel);
    const valores = [...new Set(comprovados.map((c) => Math.round(c.valor * 100)))];
    if (valores.length === 1) {
      preco.gruposComAluguelComprovado += 1;
      aluguelPorGrupo.set(id, valores[0] / 100);
      if (comprovados.some((c) => c.moedaBrl) && candidatos.some((c) => c.mensal && mesmoValor(c.valor, valores[0] / 100))) {
        preco.gruposComAluguelComprovadoBrlMensal += 1;
      }
    } else if (valores.length > 1) {
      preco.gruposComAluguelAmbiguo += 1;
    } else if (primeiraOffer) {
      preco.gruposComOfferPriceSemContexto += 1;
    }
  }
  for (const [idCard, par] of pares) {
    const card = cardPorId.get(idCard);
    const valoresCard = card ? valoresNumericosDoCard($, card.raiz) : [];
    if (!valoresCard.length) comparacao.cardSemValorMonetario += 1;
    const aluguel = aluguelPorGrupo.get(par.grupo);
    if (aluguel != null) {
      comparacao.aluguelComprovadoPareado += 1;
      if (valoresCard.length && mesmoValor(valoresCard[0], aluguel)) comparacao.aluguelIgualPrimeiroValorDoCard += 1;
      else if (valoresCard.slice(1).some((v) => mesmoValor(v, aluguel))) comparacao.aluguelIgualOutroValorDoCard += 1;
      else if (valoresCard.length) comparacao.aluguelDivergenteDoCard += 1;
    }
    const offer = primeiraOfferPorGrupo.get(par.grupo);
    if (offer != null && valoresCard.length) {
      if (mesmoValor(valoresCard[0], offer)) comparacao.offerPriceIgualPrimeiroValorDoCard += 1;
      else if (valoresCard.slice(1).some((v) => mesmoValor(v, offer))) comparacao.offerPriceIgualOutroValorDoCard += 1;
      else comparacao.offerPriceDivergenteDoCard += 1;
    }
  }

  // Localização
  const localizacao = {
    postalAddress: 0,
    donos: { imovel: 0, anuncio: 0, empresaOuPessoa: 0, indeterminado: 0 },
    atribuiveisAoAnuncio: 0,
    naoAtribuiveis: 0,
    doImovelPareadoComCard: 0,
    campos: { logradouro: 0, numeroNoLogradouro: 0, bairro: 0, cidade: 0, cidadeLondrina: 0, uf: 0, cep: 0 },
    logradouroConfereComCard: 0,
    gruposComEnderecosDivergentes: 0,
  };
  const caminhosEndereco = new Map<string, number>();
  const chavesBairro = new Map<string, number>();
  const enderecosPorGrupo = new Map<string, Set<string>>();
  for (const no of nos.filter((n) => temTipo(n, "PostalAddress"))) {
    localizacao.postalAddress += 1;
    contar(caminhosEndereco, caminhoTipado(no));
    const dono = ancestraisOuProprio(no).slice(1).find((atual) => atual.tipos.length > 0) ?? null;
    const classe = !dono ? "indeterminado"
      : temTipo(dono, ...TIPOS_EMPRESA_OU_PESSOA) ? "empresaOuPessoa"
        : temTipo(dono, ...TIPOS_IMOVEL) ? "imovel"
          : temTipo(dono, "RealEstateListing") ? "anuncio" : "indeterminado";
    localizacao.donos[classe] += 1;
    const grupo = grupoPorNo.get(no)?.id ?? null;
    const doAnuncio = !!grupo && (classe === "imovel" || classe === "anuncio");
    if (!doAnuncio) {
      localizacao.naoAtribuiveis += 1;
      continue;
    }
    localizacao.atribuiveisAoAnuncio += 1;
    const rua = typeof no.obj.streetAddress === "string" ? no.obj.streetAddress.trim() : "";
    const cidade = typeof no.obj.addressLocality === "string" ? no.obj.addressLocality.trim() : "";
    const uf = typeof no.obj.addressRegion === "string" ? no.obj.addressRegion.trim() : "";
    const cep = typeof no.obj.postalCode === "string" ? no.obj.postalCode.trim() : "";
    if (rua) localizacao.campos.logradouro += 1;
    if (/,\s*\d{1,5}\b|\s\d{1,5}\s*$/.test(rua)) localizacao.campos.numeroNoLogradouro += 1;
    const chavesDeBairro = Object.keys(no.obj).filter((chave) => /neighbo|bairro|district|sublocality|addressarea/i.test(chave));
    for (const chave of chavesDeBairro) contar(chavesBairro, rotuloSeguro(chave));
    if (chavesDeBairro.some((chave) => typeof no.obj[chave] === "string" && (no.obj[chave] as string).trim())) localizacao.campos.bairro += 1;
    if (cidade) localizacao.campos.cidade += 1;
    if (/^londrina$/i.test(cidade)) localizacao.campos.cidadeLondrina += 1;
    if (/^([A-Z]{2}|paran[aá])$/i.test(uf)) localizacao.campos.uf += 1;
    if (/^\d{5}-?\d{3}$/.test(cep)) localizacao.campos.cep += 1;
    if (rua) {
      const conjunto = enderecosPorGrupo.get(grupo) ?? new Set<string>();
      conjunto.add(normalizarTexto(rua));
      enderecosPorGrupo.set(grupo, conjunto);
    }
    const card = cardPorGrupo.get(grupo);
    if (card) {
      localizacao.doImovelPareadoComCard += 1;
      const ruaBase = normalizarTexto(rua.split(",")[0] ?? "");
      if (ruaBase && normalizarTexto(textoDe($(card.raiz))).includes(ruaBase)) localizacao.logradouroConfereComCard += 1;
    }
  }
  localizacao.gruposComEnderecosDivergentes = [...enderecosPorGrupo.values()].filter((s) => s.size > 1).length;

  // Data
  const data = {
    datePosted: 0,
    formato: { data: 0, dataHora: 0, outro: 0 },
    validas: 0,
    noRealEstateListing: 0,
    ligadasAAnuncio: 0,
    relacionaveisAosCards: 0,
    semAnuncio: 0,
    gruposComDatasDivergentes: 0,
    idade: { ateUmDia: 0, ateSeteDias: 0, ateTrintaDias: 0, ateUmAno: 0, maisDeUmAno: 0, futura: 0 },
    datePublished: nos.filter((n) => "datePublished" in n.obj).length,
    dateModified: nos.filter((n) => "dateModified" in n.obj).length,
  };
  const datasPorGrupo = new Map<string, Set<string>>();
  const donosData = new Map<string, number>();
  for (const no of nos.filter((n) => "datePosted" in n.obj)) {
    data.datePosted += 1;
    contar(donosData, caminhoTipado(no));
    const valor = typeof no.obj.datePosted === "string" ? no.obj.datePosted.trim() : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) data.formato.data += 1;
    else if (/^\d{4}-\d{2}-\d{2}T/.test(valor)) data.formato.dataHora += 1;
    else data.formato.outro += 1;
    const instante = Date.parse(valor);
    if (Number.isFinite(instante)) {
      data.validas += 1;
      const dias = (agora - instante) / 86_400_000;
      if (dias < 0) data.idade.futura += 1;
      else if (dias <= 1) data.idade.ateUmDia += 1;
      else if (dias <= 7) data.idade.ateSeteDias += 1;
      else if (dias <= 30) data.idade.ateTrintaDias += 1;
      else if (dias <= 365) data.idade.ateUmAno += 1;
      else data.idade.maisDeUmAno += 1;
    }
    if (temTipo(no, "RealEstateListing")) data.noRealEstateListing += 1;
    const grupo = grupoPorNo.get(no)?.id ?? null;
    if (!grupo || !temTipo(no, "RealEstateListing", "Offer", "Product", ...TIPOS_IMOVEL)) {
      data.semAnuncio += 1;
      continue;
    }
    data.ligadasAAnuncio += 1;
    if (cardPorGrupo.has(grupo)) data.relacionaveisAosCards += 1;
    const conjunto = datasPorGrupo.get(grupo) ?? new Set<string>();
    conjunto.add(valor);
    datasPorGrupo.set(grupo, conjunto);
  }
  data.gruposComDatasDivergentes = [...datasPorGrupo.values()].filter((s) => s.size > 1).length;

  // Autoria: só estrutura ligada a um anúncio.
  const autoriaChaves = new Map<string, number>();
  const autoriaTipos = new Map<string, number>();
  const gruposComAutoria = new Set<string>();
  for (const no of nos) {
    const grupo = grupoPorNo.get(no)?.id;
    if (!grupo) continue;
    const viaChave = no.chave != null && CHAVES_AUTORIA.includes(no.chave);
    const viaTipo = temTipo(no, ...TIPOS_EMPRESA_OU_PESSOA);
    if (!viaChave && !viaTipo) continue;
    gruposComAutoria.add(grupo);
    if (viaChave) contar(autoriaChaves, rotuloSeguro(no.chave));
    for (const tipo of no.tipos) contar(autoriaTipos, rotuloSeguro(tipo));
  }

  // Itens além dos cards: 29 cards x 31 RealEstateListing x 30 Offer.
  const classificarListing = (no: No) => {
    const grupo = grupoPorNo.get(no);
    if (grupo?.ambiguo) return "idAmbiguo";
    if (!grupo?.id) return "semIdDeAnuncio";
    if ((listingsPorId.get(grupo.id) ?? 0) > 1) return cardPorGrupo.has(grupo.id) ? "idRepetidoComCard" : "idRepetidoSemCard";
    return cardPorGrupo.has(grupo.id) ? "comCard" : "comIdSemCard";
  };
  const listingsPorClasse = new Map<string, number>();
  const caminhosListing = new Map<string, number>();
  for (const no of listings) {
    contar(listingsPorClasse, classificarListing(no));
    contar(caminhosListing, `${classificarListing(no)} @ ${caminhoTipado(no)}`);
  }
  const offersPorClasse = new Map<string, number>();
  for (const no of nos.filter((n) => temTipo(n, "Offer"))) {
    const grupo = grupoPorNo.get(no)?.id;
    contar(offersPorClasse, !grupo ? "semIdDeAnuncio" : cardPorGrupo.has(grupo) ? "comCard" : "comIdSemCard");
  }
  const urlsAmbiguas = [...idPorUrl.values()].filter((ids) => ids.size > 1).length;

  return {
    blocos,
    invalidos,
    nosAnalisados: nos.length,
    pareamento: {
      cards: cards.length,
      idsDeAnuncioNoJsonLd: idsDoJsonLd.size,
      pareaveisPorId: [...pares.values()].filter((p) => p.porId).length,
      pareaveisPorUrl: [...pares.values()].filter((p) => p.porUrl).length,
      pareaveisPorIdEUrl: [...pares.values()].filter((p) => p.porId && p.porUrl).length,
      cardsSemPareamento: cards.length - pares.size,
      idsDoJsonLdSemCard: [...idsDoJsonLd].filter((id) => !cardPorGrupo.has(id)).length,
      nosComIdAmbiguo: nosAmbiguos,
      urlsLigadasAMaisDeUmId: urlsAmbiguas,
      camposQueCarregamId: maisFrequentes(camposDeId, 15),
      tiposComIdProprio: maisFrequentes(idPorTipo, 10),
      metodo: "ID do anúncio ou URL normalizada; nunca posição.",
    },
    preco: {
      ...preco,
      comparacaoComCard: comparacao,
      caminhosDeRentAction: maisFrequentes(relacoesRentAction, 6),
      caminhosDeOffer: maisFrequentes(caminhosOffer, 6),
      caminhosDePriceSpecification: maisFrequentes(caminhosPriceSpec, 6),
      chaves: chavesPorTipo(nos, ["Offer", "PriceSpecification", "UnitPriceSpecification", "RentAction"]),
      regra: "Aluguel só com vínculo direto a RentAction, LeaseOut ou rótulo de aluguel, e sem rótulo de outra natureza.",
    },
    localizacao: {
      ...localizacao,
      chavesDeBairro: maisFrequentes(chavesBairro),
      caminhosDoEndereco: maisFrequentes(caminhosEndereco, 8),
      chaves: chavesPorTipo(nos, ["PostalAddress"]),
    },
    data: { ...data, caminhosDoDatePosted: maisFrequentes(donosData, 6) },
    autoria: {
      gruposComEstruturaDeAnunciante: gruposComAutoria.size,
      porChave: maisFrequentes(autoriaChaves),
      porTipo: maisFrequentes(autoriaTipos),
      observacao: "Ausência de anunciante profissional não significa proprietário.",
    },
    itensExtras: {
      realEstateListing: listings.length,
      realEstateListingPorClasse: maisFrequentes(listingsPorClasse),
      realEstateListingPorCaminho: maisFrequentes(caminhosListing, 8),
      offer: nos.filter((n) => temTipo(n, "Offer")).length,
      offerPorClasse: maisFrequentes(offersPorClasse),
      chavesDoRealEstateListing: chavesPorTipo(nos, ["RealEstateListing", "Apartment", "Product"]),
    },
  };
}

export type DiagnosticoJsonLdZap = ReturnType<typeof analisarJsonLdZap>;
