import { load } from "cheerio";
import { idDoAnuncio, idExternoEhFallback, type AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";

const SELETOR_ATUAL = 'a[href*="vivareal.com.br/imovel/"][href*="-id-"]';
const VALOR = /R\$\s*[\d.]+(?:,\d{2})?/g;

type Rotulo = "aluguel" | "condominio" | "iptu" | "total" | "outro" | "sem_rotulo";

function rotuloDoParagrafo(valor: string): Rotulo {
  const encontrados: Rotulo[] = [];
  if (/\baluguel\b/i.test(valor)) encontrados.push("aluguel");
  if (/\bcondom[ií]nio\b/i.test(valor)) encontrados.push("condominio");
  if (/\biptu\b/i.test(valor)) encontrados.push("iptu");
  if (/\btotal\b/i.test(valor)) encontrados.push("total");
  if (/\b(taxa|seguro|outras? despesas?)\b/i.test(valor)) encontrados.push("outro");
  return encontrados.length === 1 ? encontrados[0] : "sem_rotulo";
}

function contagem(anuncios: AnuncioCentralAngariacao[], campo: keyof AnuncioCentralAngariacao): number {
  return anuncios.filter((anuncio) => {
    const valor = anuncio[campo];
    return typeof valor === "string" ? Boolean(valor.trim()) : valor != null;
  }).length;
}

export function resumirAnunciosVivaReal(anuncios: AnuncioCentralAngariacao[]) {
  return {
    interpretados: anuncios.length,
    cobertura: {
      titulo: contagem(anuncios, "titulo"), url: contagem(anuncios, "url"),
      idExterno: contagem(anuncios, "idExterno"), preco: contagem(anuncios, "preco"),
      endereco: contagem(anuncios, "endereco"), bairro: contagem(anuncios, "bairro"),
      cidade: contagem(anuncios, "cidade"), estado: contagem(anuncios, "estado"),
      quartos: contagem(anuncios, "quartos"), tipo: contagem(anuncios, "tipo"),
      autoriaIndividual: anuncios.filter((a) => a.anunciante !== "incerto").length,
      publicadoEm: contagem(anuncios, "publicadoEm"),
    },
  };
}

/** Só produz números e categorias fechadas. Nenhum texto ou href do portal sai desta função. */
export function diagnosticarEstruturaVivaReal(html: string) {
  const $ = load(html);
  const candidatos = $(SELETOR_ATUAL).slice(0, 50).toArray();
  const hrefs = new Set<string>();
  const ids = new Set<string>();
  const resumo = {
    tamanhoHtmlCaracteres: html.length,
    linksSeletorAtual: candidatos.length,
    cardsInterpretaveis: 0,
    preco: {
      semValor: 0, umValor: 0, doisValores: 0, tresOuMais: 0,
      rotuloAluguel: 0, rotuloCondominio: 0, rotuloIptu: 0,
      primeiroRotuladoAluguel: 0, primeiroRotuladoOutro: 0, primeiroSemRotulo: 0,
      aluguelNaPrimeiraPosicao: 0, aluguelNaSegundaPosicao: 0, aluguelDepoisDaSegunda: 0,
      ambiguos: 0,
    },
    identidade: {
      idEstruturalExplicito: 0, idNaUrl: 0, fallbackPosicional: 0,
      idsUnicos: 0, idsDuplicados: 0, hrefsDuplicados: 0,
      hrefsAbsolutos: 0, hrefsRelativos: 0, hrefsComQuery: 0,
    },
    localizacao: {
      logradouroNoCard: 0, numeroNoCard: 0, bairroTextualCandidato: 0,
      cidadePublicadaNoCard: 0, ufPublicadaNoCard: 0,
      cidadeSomenteFiltro: 0, ufSomenteFiltro: 0,
    },
    autoria: {
      sinalIndividual: 0, imobiliaria: 0, particularOuProprietario: 0,
      anuncianteSemTipo: 0, semEvidenciaIndividual: 0,
    },
    data: { marcadorEstrutural: 0 },
  };

  for (const [indice, elemento] of candidatos.entries()) {
    const card = $(elemento);
    const href = card.attr("href") || "";
    if (!href || !card.find("h2").first().text().trim()) continue;
    if (hrefs.has(href)) { resumo.identidade.hrefsDuplicados++; continue; }
    hrefs.add(href);
    resumo.cardsInterpretaveis++;

    const valores = card.find("p").toArray().flatMap((p) => {
      const paragrafo = $(p).text().replace(/\s+/g, " ").trim();
      let fimAnterior = 0;
      return Array.from(paragrafo.matchAll(VALOR), (encontrado) => {
        const rotulo = rotuloDoParagrafo(paragrafo.slice(fimAnterior, encontrado.index));
        fimAnterior = encontrado.index + encontrado[0].length;
        return rotulo;
      });
    });
    if (valores.length === 0) resumo.preco.semValor++;
    else if (valores.length === 1) resumo.preco.umValor++;
    else if (valores.length === 2) resumo.preco.doisValores++;
    else resumo.preco.tresOuMais++;
    if (valores.includes("aluguel")) resumo.preco.rotuloAluguel++;
    if (valores.includes("condominio")) resumo.preco.rotuloCondominio++;
    if (valores.includes("iptu")) resumo.preco.rotuloIptu++;
    if (valores[0] === "aluguel") resumo.preco.primeiroRotuladoAluguel++;
    else if (valores[0] === "sem_rotulo") resumo.preco.primeiroSemRotulo++;
    else if (valores.length) resumo.preco.primeiroRotuladoOutro++;
    const posicaoAluguel = valores.indexOf("aluguel");
    if (posicaoAluguel === 0) resumo.preco.aluguelNaPrimeiraPosicao++;
    else if (posicaoAluguel === 1) resumo.preco.aluguelNaSegundaPosicao++;
    else if (posicaoAluguel > 1) resumo.preco.aluguelDepoisDaSegunda++;
    if (posicaoAluguel < 0 || (valores.length > 1 && valores[0] === "sem_rotulo")) resumo.preco.ambiguos++;

    const idEstrutural = card.attr("data-id") || card.attr("data-listing-id")
      || card.closest("[data-id], [data-listing-id]").attr("data-id")
      || card.closest("[data-id], [data-listing-id]").attr("data-listing-id");
    if (idEstrutural && /^\d{6,}$/.test(idEstrutural)) resumo.identidade.idEstruturalExplicito++;
    if (/-id-\d{6,}(?:[/?#]|$)/.test(href)) resumo.identidade.idNaUrl++;
    const id = idDoAnuncio("viva-real", href, indice);
    if (idExternoEhFallback("viva-real", id)) resumo.identidade.fallbackPosicional++;
    if (ids.has(id)) resumo.identidade.idsDuplicados++;
    ids.add(id);
    if (/^https?:\/\//i.test(href)) resumo.identidade.hrefsAbsolutos++;
    else resumo.identidade.hrefsRelativos++;
    if (href.includes("?")) resumo.identidade.hrefsComQuery++;

    const paragrafos = card.find("p").toArray().map((p) => $(p).text().replace(/\s+/g, " ").trim());
    const titulo = card.find("h2").first().text().replace(/\s+/g, " ").trim();
    const textoCard = `${titulo} ${paragrafos.join(" ")}`;
    const endereco = paragrafos.find((p) => /^(Rua|Avenida|Alameda|Travessa|Rodovia|Estrada)\b/i.test(p));
    if (endereco) resumo.localizacao.logradouroNoCard++;
    if (endereco && /(?:,|\s)\s*\d{1,6}\b/.test(endereco)) resumo.localizacao.numeroNoCard++;
    if (/\bbairro\s*[:,-]/i.test(textoCard) || /\bem\s+[^,]+,\s*Londrina\b/i.test(titulo)) {
      resumo.localizacao.bairroTextualCandidato++;
    }
    if (/\bLondrina\b/i.test(textoCard)) resumo.localizacao.cidadePublicadaNoCard++;
    else resumo.localizacao.cidadeSomenteFiltro++;
    if (/\b(?:PR|Paran[aá])\b/i.test(textoCard)) resumo.localizacao.ufPublicadaNoCard++;
    else resumo.localizacao.ufSomenteFiltro++;

    const nosAnunciante = card.find('[data-testid*="seller"], [data-testid*="advertiser"], [data-qa*="advertiser"], [class*="seller"], [class*="advertiser"], [class*="broker"]')
      .toArray().map((no) => $(no).text().trim()).filter((valor) => valor.length <= 100);
    const rotulosBreves = card.find("p, span").toArray().map((no) => $(no).text().trim())
      .filter((valor) => valor.length <= 40 && /^(imobili[aá]ria|particular|propriet[aá]rio|anunciante|corretor)\b/i.test(valor));
    const marcadores = [...nosAnunciante, ...rotulosBreves];
    const imobiliaria = marcadores.some((valor) => /\bimobili[aá]ria\b/i.test(valor));
    const particular = marcadores.some((valor) => /\b(particular|propriet[aá]rio)\b/i.test(valor));
    const anunciante = marcadores.some((valor) => /\b(anunciante|corretor)\b/i.test(valor));
    if (imobiliaria) resumo.autoria.imobiliaria++;
    if (particular) resumo.autoria.particularOuProprietario++;
    if (anunciante && !imobiliaria && !particular) resumo.autoria.anuncianteSemTipo++;
    if (imobiliaria || particular || anunciante) resumo.autoria.sinalIndividual++;
    else resumo.autoria.semEvidenciaIndividual++;

    if (card.find('time[datetime], [itemprop="datePosted"], [itemprop="datePublished"]').length) {
      resumo.data.marcadorEstrutural++;
    }
  }
  resumo.identidade.idsUnicos = ids.size;
  return resumo;
}
