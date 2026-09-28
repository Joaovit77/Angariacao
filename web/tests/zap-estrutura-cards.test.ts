// R4.2h — diagnóstico ESTRUTURAL dos cards do ZAP (HTML SINTÉTICO). Descobre
// onde moram os links de imóvel quando o seletor esperado não existe. Só
// observa: o parser continua exigindo `li[data-testid="rp-property-cd"]`.
import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";

import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { extrairZap, type DiagnosticoZap, type EstruturaCardsZap } from "@/lib/servidor/parserZap";
import { criarObservadorRadar, diagnosticoZapSeguro } from "@/lib/servidor/observabilidadeRadar";
import { apartamento, produto, urlAnuncio } from "./fixtures/zap-listagem-sintetica";

const ZAP: FiltrosCentralAngariacao = { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" };
const A = "2612345678";
const B = "2612345699";
const C = "2612345700";

function ids(quantidade: number, base = 2612300000): string[] {
  return Array.from({ length: quantidade }, (_, i) => String(base + i));
}

/** Página sem o seletor antigo: só o corpo dado e o JSON-LD pedido. */
function pagina(corpo: string, jsonLd: { produtos?: string[]; apartamentos?: string[] } = {}): string {
  const blocos = [
    ...(jsonLd.produtos ?? []).map((id) => produto(id)),
    ...(jsonLd.apartamentos ?? []).map((id) => apartamento(id)),
  ];
  const scripts = blocos.map((bloco) => `<script type="application/ld+json">${JSON.stringify(bloco)}</script>`).join("");
  return `<!doctype html><html><head><title>Apartamentos para alugar em Londrina</title>${scripts}</head><body>${corpo}</body></html>`;
}

function link(id: string, sufixo = ""): string {
  return `<a href="${urlAnuncio(id)}${sufixo}"><h2>Título do card</h2><p>R$ 9.999 /mês</p><p>Centro, Londrina</p></a>`;
}

function diagnosticar(html: string) {
  let diagnostico: DiagnosticoZap | null = null;
  const anuncios = extrairZap(load(html), ZAP, 50, (d) => { diagnostico = d; }, html.length);
  if (!diagnostico) throw new Error("diagnóstico não registrado");
  const d = diagnostico as DiagnosticoZap;
  if (!d.estruturaCards) throw new Error("estrutura dos cards não registrada");
  return { anuncios, d, e: d.estruturaCards as EstruturaCardsZap };
}

describe("diagnóstico estrutural dos cards do ZAP", () => {
  it("A. 29 links em 29 li separados: 29 contêineres unitários e o parser segue em zero", () => {
    const lista = ids(29);
    const html = pagina(`<main><ul>${lista.map((id) => `<li><div>${link(id)}</div></li>`).join("")}</ul></main>`,
      { produtos: [...lista, "2612399999"], apartamentos: lista });
    const { anuncios, d, e } = diagnosticar(html);
    // O seletor funcional não muda: sem rp-property-cd, nenhum anúncio.
    expect(anuncios).toEqual([]);
    expect(d.seletorCards).toBe(0);
    expect(e.ancestrais.li).toEqual({
      linksComAncestral: 29,
      profundidade: { 2: 29 },
      containers: 29,
      linksPorContainer: { 1: 29 },
      idsPorContainer: { 1: 29 },
      unitarios: 29,
      comProduct: 29,
      semProduct: 0,
      comApartment: 29,
      semApartment: 0,
      atributos: [{ atributo: "tag", valor: "li", quantidade: 29 }],
    });
    expect(e.ancestrais.article).toMatchObject({ linksComAncestral: 0, containers: 0, profundidade: {} });
    expect(e.assinaturas).toEqual([{ valor: "a > div > li > ul > main > body > html", quantidade: 29 }]);
    expect(e.atributosDoLink).toEqual([{ atributo: "tag", valor: "a", quantidade: 29 }]);
  });

  it("B. vários links no mesmo li: o histograma mostra a ambiguidade", () => {
    const html = pagina(`<ul><li>${link(A)}${link(B)}</li><li>${link(C)}${link(C, "?source=ranking")}</li></ul>`);
    const { e } = diagnosticar(html);
    expect(e.ancestrais.li).toMatchObject({
      linksComAncestral: 4,
      containers: 2,
      linksPorContainer: { 2: 2 },
      idsPorContainer: { 1: 1, 2: 1 },
      unitarios: 1,
    });
    expect(e.cruzamento).toMatchObject({ idsLinks: 3, idsComVariosLinks: 1, idsComUrlsDiferentes: 1 });
  });

  it("C. article unitário dentro de um li compartilhado: os dois candidatos se distinguem", () => {
    const html = pagina(`<ul><li><article>${link(A)}</article><article><div>${link(B)}</div></article></li></ul>`,
      { produtos: [A, B] });
    const { e } = diagnosticar(html);
    expect(e.ancestrais.li).toMatchObject({ containers: 1, linksPorContainer: { 2: 1 }, idsPorContainer: { 2: 1 }, unitarios: 0, comProduct: 0 });
    expect(e.ancestrais.article).toMatchObject({
      containers: 2, linksPorContainer: { 1: 2 }, idsPorContainer: { 1: 2 }, unitarios: 2, comProduct: 2,
      profundidade: { 1: 1, 2: 1 },
    });
  });

  it("D. link sem li, mas com article, data-testid, data-cy, role e itemtype", () => {
    const html = pagina(`<main><section data-cy="rp-lista"><article data-testid="card-listagem" role="listitem" itemtype="https://schema.org/Offer" itemprop="itemListElement"><div>${link(A)}</div></article></section></main>`);
    const { e } = diagnosticar(html);
    expect(e.ancestrais.li).toMatchObject({ linksComAncestral: 0, containers: 0 });
    expect(e.ancestrais.article).toMatchObject({ linksComAncestral: 1, profundidade: { 2: 1 }, containers: 1 });
    expect(e.ancestrais.dataTestid).toMatchObject({ profundidade: { 2: 1 } });
    expect(e.ancestrais.role).toMatchObject({ profundidade: { 2: 1 } });
    expect(e.ancestrais.itemtype).toMatchObject({ profundidade: { 2: 1 } });
    expect(e.ancestrais.dataCy).toMatchObject({ profundidade: { 3: 1 }, atributos: [{ atributo: "dataCy", valor: "rp-lista", quantidade: 1 }, { atributo: "tag", valor: "section", quantidade: 1 }] });
    expect(e.ancestrais.section).toMatchObject({ profundidade: { 3: 1 } });
    expect(e.ancestrais.article.atributos).toEqual(expect.arrayContaining([
      { atributo: "tag", valor: "article", quantidade: 1 },
      { atributo: "dataTestid", valor: "card-listagem", quantidade: 1 },
      { atributo: "role", valor: "listitem", quantidade: 1 },
      { atributo: "itemtype", valor: "Offer", quantidade: 1 },
      { atributo: "itemprop", valor: "itemListElement", quantidade: 1 },
    ]));
  });

  it("E. links dentro e fora da recommendations-list", () => {
    const html = pagina(`<ul><li>${link(A)}</li></ul><section data-testid="recommendations-list"><div>${link(B)}${link(C)}${link(C)}</div></section>`);
    const { e } = diagnosticar(html);
    expect(e.recomendacoes).toEqual({ listas: 1, linksDentro: 3, idsDentro: 2, linksFora: 1, idsFora: 1 });
  });

  it("F e G. 29 IDs de link casam com 29 de 30 Product; o Product extra é contado", () => {
    const lista = ids(29);
    const html = pagina(`<ul>${lista.map((id) => `<li>${link(id)}</li>`).join("")}</ul>`,
      { produtos: [...lista, "2612399999"], apartamentos: [...lista.slice(0, 28), "2612399998", "2612399997"] });
    const { e } = diagnosticar(html);
    expect(e.cruzamento).toEqual({
      idsLinks: 29,
      idsProduct: 30,
      idsApartment: 30,
      idsLinkComProduct: 29,
      idsLinkSemProduct: 0,
      idsProductSemLink: 1,
      idsLinkComApartment: 28,
      idsLinkSemApartment: 1,
      idsApartmentSemLink: 2,
      idsComVariosLinks: 0,
      idsComUrlsDiferentes: 0,
    });
  });

  it("H. ID de link sem Product é contado, também no candidato", () => {
    const html = pagina(`<ul><li>${link(A)}</li><li>${link(B)}</li></ul>`, { produtos: [A], apartamentos: [A] });
    const { e } = diagnosticar(html);
    expect(e.cruzamento).toMatchObject({ idsLinkComProduct: 1, idsLinkSemProduct: 1, idsProductSemLink: 0 });
    expect(e.ancestrais.li).toMatchObject({ unitarios: 2, comProduct: 1, semProduct: 1, comApartment: 1, semApartment: 1 });
  });

  it("Product duplicado não conta como pareado no candidato", () => {
    const html = pagina(`<ul><li>${link(A)}</li></ul>`, { produtos: [A, A] });
    const { e } = diagnosticar(html);
    expect(e.cruzamento.idsLinkComProduct).toBe(1);
    expect(e.ancestrais.li).toMatchObject({ comProduct: 0, semProduct: 1 });
  });

  it("I. nenhum conteúdo individual: sem texto, href, classe, id HTML ou ID de anúncio", () => {
    const html = pagina(
      `<ul class="lista-secreta" id="id-secreto"><li class="card-secreto" aria-label="Rótulo secreto" title="Título secreto" data-foo="dado-secreto" data-testid="card-${A}">`
      + `<div style="color:red">${link(A, "?source=ranking")}</div></li><li data-cy="Texto com espaço">${link(B)}</li></ul>`
      + `<section data-testid="recommendations-list" itemtype="https://evil.example/x">${link(C)}</section>`,
      { produtos: [A, B, C], apartamentos: [A] },
    );
    const { d, e } = diagnosticar(html);
    const bruto = JSON.stringify(e);
    const seguro = JSON.stringify(diagnosticoZapSeguro(d).estrutura_cards);
    for (const serializado of [bruto, seguro]) {
      for (const proibido of [
        A, B, C, "<", "zapimoveis", "http", "evil", "source", "secret", "Título", "R$", "Centro", "Londrina",
        "color", "espaço", "dado-", "aria", "class", "style",
      ]) {
        expect(serializado, proibido).not.toContain(proibido);
      }
    }
    // Rótulo com cara de ID, com espaço ou itemtype fora do schema.org vira marcador fixo.
    expect(e.ancestrais.dataTestid.atributos).toEqual(expect.arrayContaining([{ atributo: "dataTestid", valor: "valor-recusado", quantidade: 1 }]));
    expect(e.ancestrais.dataCy.atributos).toEqual(expect.arrayContaining([{ atributo: "dataCy", valor: "valor-recusado", quantidade: 1 }]));
    expect(e.ancestrais.itemtype.atributos).toEqual(expect.arrayContaining([{ atributo: "itemtype", valor: "valor-recusado", quantidade: 1 }]));
  });
});

describe("sanitização e integração R4.3 da estrutura dos cards", () => {
  it("o sanitizador reconstrói só números, histogramas, tags e rótulos permitidos", () => {
    const lista = ids(3);
    const { d } = diagnosticar(pagina(`<ul>${lista.map((id) => `<li>${link(id)}</li>`).join("")}</ul>`, { produtos: lista }));
    const e = d.estruturaCards!;
    const sujo = {
      ...d,
      estruturaCards: {
        ...e,
        html: "<li>segredo</li>",
        cruzamento: { ...e.cruzamento, idsLista: [A] },
        ancestrais: {
          ...e.ancestrais,
          li: {
            ...e.ancestrais.li,
            href: urlAnuncio(A),
            profundidade: { ...e.ancestrais.li.profundidade, [A]: 1, segredo: 2 },
            atributos: [...e.ancestrais.li.atributos, { atributo: "class", valor: "x", quantidade: 1 }, { atributo: "dataTestid", valor: `card-${A}`, quantidade: 1 }, { atributo: "tag", valor: "<b>", quantidade: 1 }],
          },
          outro: { containers: 99 },
        },
        assinaturas: [...e.assinaturas, { valor: "a > <script>", quantidade: 1 }, { valor: `a > li#${A}`, quantidade: 1 }],
      },
    };
    const seguro = diagnosticoZapSeguro(sujo).estrutura_cards!;
    expect(JSON.stringify(seguro)).not.toMatch(/segredo|<|2612345678|zapimoveis|class|outro|idsLista/);
    expect(seguro.ancestrais.li).toMatchObject({ containers: 3, profundidade: { 1: 3 }, linksPorContainer: { 1: 3 } });
    expect(seguro.ancestrais.li.atributos).toEqual([{ atributo: "tag", valor: "li", quantidade: 3 }]);
    expect(seguro.assinaturas).toEqual([{ valor: "a > li > ul > body > html", quantidade: 3 }]);
    expect(Object.keys(seguro.ancestrais)).toEqual(["li", "article", "section", "role", "dataTestid", "dataCy", "itemtype"]);
    expect(diagnosticoZapSeguro({ ...d, estruturaCards: null }).estrutura_cards).toBeNull();
  });

  it("o resumo da execução carrega a estrutura dos cards dentro do diagnostico_zap", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { d } = diagnosticar(pagina(`<ul><li>${link(A)}</li></ul>`, { produtos: [A] }));
    const observador = criarObservadorRadar({ execucaoId: "e1", iniciador: "pesquisar", portal: "zap" });
    observador.observar({ fase: "resultado_interpretado", aquisicao: "firecrawl", diagnosticoZap: d });
    expect(observador.resumo().diagnostico_zap?.estrutura_cards).toMatchObject({
      cruzamento: { idsLinks: 1, idsLinkComProduct: 1 },
      ancestrais: { li: { containers: 1, unitarios: 1, comProduct: 1 } },
    });
  });
});
