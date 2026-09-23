import { describe, expect, it } from "vitest";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { logradouroDaFoto } from "@/lib/calculo/sinaisRepeticaoRadar";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import {
  BASE,
  FOTO_CARD_46811835,
  FOTO_LD_43083373,
  FOTO_LD_45326545,
  URL_43083373,
  URL_45326545,
  CARD_46811835,
  CARD_43083373,
  CARD_45326545,
  oferta,
  listagem,
  script,
  LD_REAL,
} from "./fixtures/chavesFotosJsonLd";

const CHAVES: FiltrosCentralAngariacao = { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", tipo: "Casa" };
const fotos = (html: string, filtros = CHAVES) =>
  Object.fromEntries(extrairAnunciosFirecrawl(html, filtros).map((anuncio) => [anuncio.idExterno, anuncio.imagem ?? null]));

describe("foto do Chaves: <img> do card e fallback JSON-LD (R4.1b.1)", () => {
  it("usa o formato real itemOffered.image para os cards sem <img>", () => {
    expect(fotos(`${CARD_46811835}${CARD_43083373}${CARD_45326545}${LD_REAL}`)).toEqual({
      46811835: FOTO_CARD_46811835,
      43083373: FOTO_LD_43083373,
      45326545: FOTO_LD_45326545,
    });
  });

  it("mantém a foto do <img> quando existe: JSON-LD é só fallback", () => {
    expect(fotos(`${CARD_46811835}${LD_REAL}`)[46811835]).toBe(FOTO_CARD_46811835);
    expect(fotos(`${LD_REAL}${CARD_46811835}`)[46811835]).toBe(FOTO_CARD_46811835);
  });

  it("sem <img> e sem JSON-LD continua sem foto", () => {
    expect(fotos(CARD_43083373)).toEqual({ 43083373: null });
  });

  it("JSON-LD malformado não quebra a coleta e não inventa foto", () => {
    const html = `${CARD_43083373}${CARD_46811835}${script('{"@type":"RealEstateListing","offers":')}`;
    expect(fotos(html)).toEqual({ 43083373: null, 46811835: FOTO_CARD_46811835 });
  });

  it("aproveita o bloco válido quando outro bloco está malformado (múltiplos scripts)", () => {
    const html = `${CARD_43083373}${CARD_45326545}${script("{ nada")}`
      + `${script(listagem([oferta(URL_43083373, FOTO_LD_43083373)]))}`
      + `${script(listagem([oferta(URL_45326545, FOTO_LD_45326545)]))}`;
    expect(fotos(html)).toEqual({ 43083373: FOTO_LD_43083373, 45326545: FOTO_LD_45326545 });
  });

  it("aceita JSON-LD em objeto e em array", () => {
    const itens = [oferta(URL_43083373, FOTO_LD_43083373)];
    expect(fotos(`${CARD_43083373}${script(listagem(itens))}`)[43083373]).toBe(FOTO_LD_43083373);
    expect(fotos(`${CARD_43083373}${script([{ "@type": "Organization" }, listagem(itens)])}`)[43083373]).toBe(FOTO_LD_43083373);
  });

  it("aceita imagem em lista e ignora entradas irrelevantes", () => {
    const html = `${CARD_43083373}${script({ "@type": "Organization", image: FOTO_LD_43083373 })}`
      + `${script({ "@type": "Product", image: [FOTO_LD_43083373] })}`
      + `${script(listagem([oferta(URL_43083373, ["não é url", FOTO_LD_43083373])]))}`;
    expect(fotos(html)[43083373]).toBe(FOTO_LD_43083373);
  });

  it("ignora imagens da página que não pertencem a nenhum anúncio", () => {
    // A listagem tem image: [FOTO_LD_45326545, ...] no nível da página, sem o id.
    expect(fotos(`${CARD_45326545}${script(listagem([]))}`)[45326545]).toBeNull();
  });

  it("rejeita foto de outro anúncio, inclusive de ID parecido", () => {
    const outroId = script(listagem([oferta(URL_43083373, FOTO_LD_45326545)]));
    expect(fotos(`${CARD_43083373}${outroId}`)[43083373]).toBeNull();
    const prefixo = FOTO_LD_43083373.replace("/43083373/", "/4308337/");
    const sufixo = FOTO_LD_43083373.replace("/43083373/", "/430833730/");
    const parecidos = script(listagem([oferta(URL_43083373, [prefixo, sufixo])]));
    expect(fotos(`${CARD_43083373}${parecidos}`)[43083373]).toBeNull();
    // O id precisa estar no segmento do anúncio, não em outro lugar do caminho.
    const noNome = `${BASE}/imn/0340X0250/N/80/imoveis/43083373/999/foto-43083373.jpg`;
    expect(fotos(`${CARD_43083373}${script(listagem([oferta(URL_43083373, noNome)]))}`)[43083373]).toBeNull();
  });

  it("rejeita host diferente do Chaves", () => {
    for (const host of ["cdn.chavesnamao.com.br", "chavesnamao.com.br", "www.chavesnamao.com.br.exemplo.test", "exemplo.test"]) {
      const foto = FOTO_LD_43083373.replace("www.chavesnamao.com.br", host);
      expect(fotos(`${CARD_43083373}${script(listagem([oferta(URL_43083373, foto)]))}`)[43083373]).toBeNull();
    }
  });

  it("rejeita protocolo que não seja https", () => {
    for (const foto of [FOTO_LD_43083373.replace("https:", "http:"), `data:image/png;base64,AAAA`, "javascript:alert(1)", `//www.chavesnamao.com.br/imn/x/imoveis/1/43083373/a.jpg`]) {
      expect(fotos(`${CARD_43083373}${script(listagem([oferta(URL_43083373, foto)]))}`)[43083373]).toBeNull();
    }
  });

  it("a foto do fallback mantém o sinal de logradouro do R4.1a (formato 0340X0250)", () => {
    const [anuncio] = extrairAnunciosFirecrawl(`${CARD_43083373}${LD_REAL}`, CHAVES);
    expect(anuncio.imagem).toContain("/imn/0340X0250/");
    expect(logradouroDaFoto(anuncio)).toBe("professora delvina borges");
  });

  it("o anúncio só ganha a foto: todos os outros campos ficam iguais", () => {
    const html = `${CARD_46811835}${CARD_43083373}${CARD_45326545}`;
    const antes = extrairAnunciosFirecrawl(html, CHAVES);
    const depois = extrairAnunciosFirecrawl(`${html}${LD_REAL}`, CHAVES);
    const semFoto = (lista: typeof antes) => lista.map((anuncio) => ({ ...anuncio, imagem: null }));
    expect(semFoto(depois)).toEqual(semFoto(antes));
    expect(antes.map((anuncio) => anuncio.imagem ?? null)).toEqual([FOTO_CARD_46811835, null, null]);
    expect(depois.map((anuncio) => anuncio.imagem)).toEqual([FOTO_CARD_46811835, FOTO_LD_43083373, FOTO_LD_45326545]);
  });
});

describe("outros portais não mudam com JSON-LD do Chaves na página (R4.1b.1)", () => {
  const cases: Array<[string, string, FiltrosCentralAngariacao]> = [
    ["OLX", `<section class="olx-adcard">
      <a data-testid="adcard-link" title="Casa direto com proprietário" href="https://pr.olx.com.br/imoveis/casa-1525177784">Casa direto com proprietário</a>
      <span class="olx-adcard__price">R$ 2.500</span>
      <span class="olx-adcard__location">Londrina, Centro</span>
      <span class="olx-adcard__details">2 quartos, 70 m²</span>
      <span class="olx-adcard__date">Hoje, 08:30</span>
    </section>`, { portal: "olx", cidade: "Londrina", estado: "PR" }],
    ["Wimóveis", `<article data-qa="posting PROPERTY" data-id="3018468881" data-to-posting="/propriedades/apartamento-centro-3018468881.html">
      <div data-qa="POSTING_CARD_GALLERY"><img alt="Apartamento para alugar no Centro"></div>
      <div data-qa="POSTING_CARD_PRICE">R$ 1.900</div>
      <div data-qa="POSTING_CARD_LOCATION">Centro, Londrina</div>
    </article>`, { portal: "wimoveis", cidade: "Londrina", estado: "PR" }],
    ["Viva Real", `<a href="https://www.vivareal.com.br/imovel/apartamento-3-quartos-centro-londrina-id-2904079401/">
      <h2>Apartamento para alugar com 90 m², 3 quartos em Centro, Londrina</h2>
      <p>Rua Sergipe</p><p>R$ 3.200 / mês</p>
    </a>`, { portal: "viva-real", cidade: "Londrina", estado: "PR" }],
  ];

  it.each(cases)("%s produz o mesmo resultado, sem foto emprestada", (_nome, html, filtros) => {
    const semLd = extrairAnunciosFirecrawl(html, filtros);
    const comLd = extrairAnunciosFirecrawl(`${html}${LD_REAL}`, filtros);
    expect(semLd).toHaveLength(1);
    expect(comLd).toEqual(semLd);
    expect(comLd[0].imagem ?? null).toBeNull();
  });
});
