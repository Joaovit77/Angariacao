// R4.2h — diagnóstico AGREGADO do parser do ZAP (HTML SINTÉTICO). Só observa:
// a extração não muda. Mede em que etapa os cards reais são descartados.
import { load } from "cheerio";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/functions", () => ({
  getCache: () => ({ get: async () => null, set: async () => undefined }),
}));

import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { extrairZap, MOTIVOS_DESCARTE_ZAP, type DiagnosticoZap } from "@/lib/servidor/parserZap";
import { buscarComFirecrawl, type EventoConsultaFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { criarObservadorRadar, diagnosticoZapSeguro } from "@/lib/servidor/observabilidadeRadar";
import { URL_ZAP_LONDRINA_APARTAMENTOS } from "@/lib/servidor/centralAngariacao";
import { apartamento, htmlZap, produto, urlAnuncio } from "./fixtures/zap-listagem-sintetica";

const A = "2612345678";
const B = "2612345699";
const ZAP: FiltrosCentralAngariacao = { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" };

function diagnosticar(html: string, filtros: Partial<FiltrosCentralAngariacao> = {}) {
  let diagnostico: DiagnosticoZap | null = null;
  const anuncios = extrairZap(load(html), { ...ZAP, ...filtros }, 50, (d) => { diagnostico = d; }, html.length);
  if (!diagnostico) throw new Error("diagnóstico não registrado");
  return { anuncios, d: diagnostico as DiagnosticoZap };
}

function somaDescartes(d: DiagnosticoZap): number {
  return MOTIVOS_DESCARTE_ZAP.reduce((soma, motivo) => soma + d.saida.descartes[motivo], 0);
}

/** Todo card processado vira anúncio ou tem exatamente um motivo de descarte. */
function expectContaFecha(d: DiagnosticoZap) {
  expect(d.saida.aceitos + somaDescartes(d)).toBe(d.cards.processados);
}

describe("diagnóstico agregado do parser do ZAP", () => {
  it("A. página normal: cards aceitos, JSON-LD pareado e contas fechando", () => {
    const html = htmlZap([{ id: A }, { id: B }]);
    const { anuncios, d } = diagnosticar(html);
    expect(anuncios).toHaveLength(2);
    expect(d).toMatchObject({
      htmlCaracteres: html.length,
      marcadoresBloqueio: [],
      tituloMencionaLondrina: true,
      seletorCards: 2,
      estrutura: { linksImovelComId: 2, idsUnicosNosLinks: 2 },
      cards: { processados: 2, alemDoLimite: 0, comUmId: 2, idsUnicos: 2, idsDuplicados: 0 },
      jsonLd: { blocos: 4, invalidos: 0, product: 2, apartment: 2, offer: 2, rentAction: 2, priceSpecification: 2, realEstateListing: 3, productsComId: 2, apartmentsComId: 2, idsUnicos: 2 },
      pareamento: { comProduct: 2, semProduct: 0, comApartment: 2, semApartment: 0, ambiguos: 0, jsonLdSemCard: 0 },
      titulo: { comProductName: 2, comTituloHtml: 2, semTitulo: 0 },
      saida: { aceitos: 2 },
    });
    expect(somaDescartes(d)).toBe(0);
    expectContaFecha(d);
  });

  it("B. seletor esperado ausente: registra os links globais, os data-testid e o JSON-LD", () => {
    const html = htmlZap([{ id: A }, { id: B }]).replace(/rp-property-cd/g, "listing-card-novo");
    const { anuncios, d } = diagnosticar(html);
    expect(anuncios).toEqual([]);
    expect(d).toMatchObject({
      seletorCards: 0,
      cards: { processados: 0 },
      estrutura: { li: 2, linksImovelComId: 2, idsUnicosNosLinks: 2, elementosComDataTestid: 2 },
      jsonLd: { product: 2, idsUnicos: 2 },
      pareamento: { jsonLdSemCard: 2 },
    });
    expect(d.estrutura.dataTestid).toEqual([{ valor: "listing-card-novo", quantidade: 2 }]);
  });

  it("C. cards sem link de imóvel e com link de imóvel sem ID", () => {
    const html = htmlZap([{ id: A }]).replace("<ul>",
      '<ul><li data-testid="rp-property-cd"><a href="/aluguel/apartamentos/pr+londrina/">busca</a></li>'
      + '<li data-testid="rp-property-cd"><a href="https://www.zapimoveis.com.br/imovel/sem-identificador/">x</a></li>');
    const { d } = diagnosticar(html);
    expect(d.saida.descartes).toMatchObject({ sem_link_imovel: 1, sem_id: 1 });
    expect(d.saida.aceitos).toBe(1);
    expectContaFecha(d);
  });

  it("D. card com dois IDs distintos", () => {
    const { d } = diagnosticar(htmlZap([{ id: A, hrefExtra: urlAnuncio("2600000001") }, { id: B }]));
    expect(d.saida.descartes.multiplos_ids).toBe(1);
    expect(d.cards.comUmId).toBe(1);
    expectContaFecha(d);
  });

  it("E. card sem nenhuma fonte de título", () => {
    const html = htmlZap([{ id: A, titulo: "", produto: produto(A, { name: undefined }), apartamento: apartamento(A, { name: undefined }) }]);
    const { anuncios, d } = diagnosticar(html);
    expect(anuncios).toEqual([]);
    expect(d.saida.descartes.sem_titulo).toBe(1);
    expect(d.titulo).toEqual({ comProductName: 0, comTituloHtml: 0, semTitulo: 1 });
    expectContaFecha(d);
  });

  it("F. JSON-LD presente, mas sem pareamento com os cards", () => {
    const html = htmlZap([{ id: A, produto: produto("2600000077"), apartamento: apartamento("2600000077") }]);
    const { anuncios, d } = diagnosticar(html);
    expect(anuncios).toHaveLength(1);
    expect(d.pareamento).toMatchObject({ comProduct: 0, semProduct: 1, comApartment: 0, semApartment: 1, jsonLdSemCard: 1 });
    expect(d.titulo).toMatchObject({ comProductName: 0, comTituloHtml: 1 });
  });

  it("G. Product duplicado para o mesmo ID conta como ambíguo, não como pareado", () => {
    const html = htmlZap([{ id: A }]).replace("</head>", `<script type="application/ld+json">${JSON.stringify(produto(A))}</script></head>`);
    const { d } = diagnosticar(html);
    expect(d.pareamento).toMatchObject({ ambiguos: 1, comProduct: 0, semProduct: 1 });
    expect(d.jsonLd.productsComId).toBe(2);
  });

  it("H. item do JSON-LD sem card", () => {
    const { d } = diagnosticar(htmlZap([{ id: A }, { id: "2699999999", semCard: true }]));
    expect(d.pareamento.jsonLdSemCard).toBe(1);
    expect(d.saida.aceitos).toBe(1);
  });

  it("descartes por ID duplicado entre cards e por filtro local", () => {
    const dup = diagnosticar(htmlZap([{ id: A }, { id: A }])).d;
    expect(dup.saida.descartes.id_duplicado).toBe(1);
    expect(dup.cards).toMatchObject({ comUmId: 2, idsUnicos: 1, idsDuplicados: 1 });
    expectContaFecha(dup);
    const filtrado = diagnosticar(htmlZap([{ id: A }, { id: B }]), { valorMax: 100 }).d;
    expect(filtrado.saida.descartes.filtro_local).toBe(2);
    expectContaFecha(filtrado);
  });

  it("marcador de página de verificação", () => {
    const { d } = diagnosticar("<html><head><title>Just a moment...</title></head><body><h1>Verificando</h1></body></html>");
    expect(d.marcadoresBloqueio).toContain("aguarde_verificacao");
    expect(d.seletorCards).toBe(0);
  });

  it("I. nenhum conteúdo individual: sem HTML, título, preço, endereço, URL ou ID", () => {
    const html = htmlZap([{ id: A }, { id: B }]).replace("<ul>", '<ul data-testid="card-2612345678">');
    const { d } = diagnosticar(html);
    const serializado = JSON.stringify(d);
    for (const proibido of ["<", A, B, "Rua Sergipe", "Centro", "Apartamento com", "R$", "9.999", "2500", "zapimoveis.com.br/imovel", "Título do card"]) {
      expect(serializado, proibido).not.toContain(proibido);
    }
  });

  it("sem registrador, a extração é a mesma e nada é calculado a mais", () => {
    const html = htmlZap([{ id: A }, { id: B }]);
    expect(extrairZap(load(html), ZAP, 50)).toEqual(diagnosticar(html).anuncios);
  });
});

describe("integração com a observabilidade R4.3", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("o observador reconstrói só contagens e rótulos conhecidos", () => {
    const { d } = diagnosticar(htmlZap([{ id: A }]));
    const sujo = { ...d, html: "<li>segredo</li>", url: urlAnuncio(A), marcadoresBloqueio: ["captcha", "<script>"],
      estrutura: { ...d.estrutura, dataTestid: [{ valor: "ok-rotulo", quantidade: 1 }, { valor: "card-2612345678", quantidade: 1 }, { valor: "<b>", quantidade: 1 }] } };
    const seguro = diagnosticoZapSeguro(sujo);
    const serializado = JSON.stringify(seguro);
    expect(serializado).not.toMatch(/segredo|<|2612345678|zapimoveis/);
    expect(seguro.marcadores_bloqueio).toEqual(["captcha"]);
    expect(seguro.estrutura.dataTestid).toEqual([{ valor: "ok-rotulo", quantidade: 1 }]);
    expect(seguro.saida.aceitos).toBe(1);
  });

  it("uma execução gera um único resumo agregado no resultado interpretado", () => {
    const observador = criarObservadorRadar({ execucaoId: "e1", iniciador: "pesquisar", portal: "zap" });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { d } = diagnosticar(htmlZap([{ id: A }]));
    observador.observar({ fase: "caminho_escolhido", aquisicao: "firecrawl" });
    observador.observar({ fase: "resultado_interpretado", aquisicao: "firecrawl", diagnosticoZap: d });
    const resumo = observador.resumo();
    expect(resumo.diagnostico_zap).toMatchObject({ seletor_cards: 1, saida: { aceitos: 1 } });
    expect(JSON.stringify(resumo.fases)).not.toContain("diagnostico");
    const semDiagnostico = criarObservadorRadar({ execucaoId: "e2", iniciador: "pesquisar", portal: "olx" });
    semDiagnostico.observar({ fase: "resultado_interpretado", aquisicao: "firecrawl" });
    expect("diagnostico_zap" in semDiagnostico.resumo()).toBe(false);
  });

  it("buscarComFirecrawl anexa o diagnóstico ao resultado interpretado do ZAP", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
    const html = htmlZap([{ id: A }, { id: B }]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: 200 } } })));
    const eventos: EventoConsultaFirecrawl[] = [];
    const anuncios = await buscarComFirecrawl(ZAP, URL_ZAP_LONDRINA_APARTAMENTOS, undefined, undefined, (e) => { eventos.push(e); });
    expect(anuncios).toHaveLength(2);
    const interpretado = eventos.find((e) => e.fase === "resultado_interpretado");
    expect(interpretado?.diagnosticoZap).toMatchObject({ seletorCards: 2, saida: { aceitos: 2 }, htmlCaracteres: html.length });
    expect(eventos.filter((e) => e.diagnosticoZap)).toHaveLength(1);
  });
});
