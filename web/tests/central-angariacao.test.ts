import { describe, expect, it } from "vitest";
import {
  anuncioPertenceACidade,
  idDoAnuncio,
  numeroOpcional,
  slugPortal,
  textoParaPreCadastro,
  type AnuncioCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { dataPublicacaoOlx, dentroDoPeriodo } from "@/lib/datas";
import { extrairJsonLd, urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import {
  enderecoTemNumero,
  situacaoRepeticaoCentral,
  tipoDoAnuncio,
  urlCanonicaAnuncio,
} from "@/lib/calculo/repeticaoCentralAngariacao";
import type { Imovel } from "@/lib/tipos";

describe("Central de Angariação", () => {
  const imovelPipeline = (parcial: Partial<Imovel> = {}): Imovel => ({
    id: "pipeline-1",
    endereco: "Rua Pará, 100",
    cidade: "Londrina",
    tipo: "Casa",
    status: "Novo contato",
    ...parcial,
  });

  const anuncio = (parcial: Partial<AnuncioCentralAngariacao> = {}): AnuncioCentralAngariacao => ({
    idExterno: "123456",
    portal: "chaves-na-mao",
    titulo: "Casa para alugar",
    endereco: "Rua Pará, 100",
    cidade: "Londrina",
    url: "https://portal.test/imovel/123456",
    anunciante: "incerto",
    ...parcial,
  });

  it("normaliza cidade e valores dos filtros", () => {
    expect(slugPortal("São José dos Pinhais")).toBe("sao-jose-dos-pinhais");
    expect(numeroOpcional("R$ 2.500")).toBe(2500);
    expect(numeroOpcional(0)).toBe(0);
    expect(numeroOpcional("")).toBeNull();
  });

  it("gera URL somente nos hosts fixos dos portais", () => {
    const olx = urlDaPesquisa({ portal: "olx", cidade: "Londrina", estado: "PR", valorMax: 2500 });
    const chaves = urlDaPesquisa({ portal: "chaves-na-mao", cidade: "Londrina", estado: "PR" });
    const chaves1 = urlDaPesquisa({ portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", tipo: "Apartamento", dormitorios: 1 });
    const chaves3 = urlDaPesquisa({ portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", tipo: "Apartamento", dormitorios: 3 });
    const chavesBairro = urlDaPesquisa({ portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", bairro: "Jardim Piza", tipo: "Apartamento", dormitorios: 1 });
    const wimoveis = urlDaPesquisa({ portal: "wimoveis", cidade: "Londrina", estado: "PR", somenteProprietario: true });
    const wimoveis3 = urlDaPesquisa({ portal: "wimoveis", cidade: "Londrina", estado: "PR", tipo: "Apartamento", dormitorios: 3 });
    const vivaReal = urlDaPesquisa({ portal: "viva-real", cidade: "Londrina", estado: "PR", valorMin: 1000 });
    expect(new URL(olx).hostname).toBe("www.olx.com.br");
    expect(new URL(chaves).hostname).toBe("www.chavesnamao.com.br");
    expect(new URL(wimoveis).hostname).toBe("www.wimoveis.com.br");
    expect(new URL(vivaReal).hostname).toBe("www.vivareal.com.br");
    expect(olx).toContain("ps=2500");
    expect(chaves1).toContain("/apartamentos-para-alugar/pr-londrina/1-quarto/");
    expect(chaves3).toContain("/apartamentos-para-alugar/pr-londrina/3-quartos/");
    expect(chavesBairro).toContain("/apartamentos-para-alugar/pr-londrina/jardim-piza/1-quarto/");
    expect(wimoveis).toContain("tipoanunciante-particular");
    expect(wimoveis3).toContain("/apartamentos/pr/londrina/3-quartos");
    expect(vivaReal).toContain("precoMinimo=1000");
  });

  it("inclui o filtro de anunciante particular da OLX quando solicitado", () => {
    const url = new URL(urlDaPesquisa({
      portal: "olx",
      cidade: "Londrina",
      estado: "PR",
      somenteProprietario: true,
    }));

    expect(url.searchParams.get("f")).toBe("p");
  });

  it("interpreta e filtra as datas relativas publicadas pela OLX", () => {
    const agora = new Date(2026, 7, 10, 10, 0);
    const hoje = dataPublicacaoOlx("Hoje, 06:29", agora);
    const ontem = dataPublicacaoOlx("Ontem, 16:50", agora);
    const agosto = dataPublicacaoOlx("8 de ago, 21:08", agora);

    expect(hoje?.getDate()).toBe(10);
    expect(ontem?.getDate()).toBe(9);
    expect(agosto?.getDate()).toBe(8);
    expect(dentroDoPeriodo(hoje?.toISOString(), 1, agora)).toBe(true);
    expect(dentroDoPeriodo(agosto?.toISOString(), 1, agora)).toBe(false);
    expect(dentroDoPeriodo(agosto?.toISOString(), 7, agora)).toBe(true);
  });

  it("extrai apenas dados declarados no JSON-LD e elimina URL repetida", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({
      "@type": "ItemList",
      itemListElement: [
        { item: { name: "Apartamento direto", url: "/anuncio-123456789", image: "https://img.test/a.jpg", datePosted: "2026-08-10T08:30:00-03:00", offers: { price: "1800" }, address: { streetAddress: "Rua A, 10", addressLocality: "Londrina" } } },
        { item: { name: "Apartamento direto", url: "/anuncio-123456789" } },
      ],
    })}</script></html>`;
    expect(extrairJsonLd(html, "olx", "https://www.olx.com.br/busca")).toEqual([
      expect.objectContaining({
        idExterno: "123456789",
        titulo: "Apartamento direto",
        preco: 1800,
        endereco: "Rua A, 10",
        cidade: "Londrina",
        publicadoEm: "2026-08-10T08:30:00-03:00",
        anunciante: "incerto",
      }),
    ]);
  });

  it("não transforma a capa nem a página de busca do portal em anúncio", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      itemListElement: [
        { item: { name: "Chaves na Mão", url: "https://www.chavesnamao.com.br/" } },
        { item: { name: "8.600 imóveis em Londrina", url: "https://www.chavesnamao.com.br/imoveis-para-alugar/pr-londrina/" } },
        { item: { name: "Casa no Centro", url: "https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro-id-98765/" } },
      ],
    })}</script>`;
    expect(extrairJsonLd(html, "chaves-na-mao", "https://www.chavesnamao.com.br/imoveis-para-alugar/pr-londrina/"))
      .toEqual([expect.objectContaining({ titulo: "Casa no Centro" })]);
  });

  it("preserva fonte e URL no texto levado ao pré-cadastro", () => {
    const anuncio: AnuncioCentralAngariacao = {
      idExterno: idDoAnuncio("olx", "https://olx.test/anuncio-123456", 0),
      portal: "olx",
      titulo: "Casa para alugar",
      preco: 2000,
      cidade: "Londrina",
      bairro: "Centro",
      endereco: null,
      imagem: null,
      url: "https://olx.test/anuncio-123456",
      anunciante: "proprietario",
    };
    const texto = textoParaPreCadastro(anuncio);
    expect(texto).toContain("Fonte: OLX");
    expect(texto).toContain(anuncio.url);
    expect(texto).not.toContain("Endereço publicado");
  });

  it("mantém somente a cidade solicitada, mesmo quando o portal retorna a região", () => {
    expect(anuncioPertenceACidade({ cidade: "Londrina" }, "Londrina")).toBe(true);
    expect(anuncioPertenceACidade({ cidade: "Londrina - PR" }, "Londrina")).toBe(true);
    expect(anuncioPertenceACidade({ cidade: "Cornélio Procópio" }, "Londrina")).toBe(false);
    expect(anuncioPertenceACidade({ cidade: "Jacarezinho" }, "Londrina")).toBe(false);
    expect(anuncioPertenceACidade({ cidade: null }, "Londrina")).toBe(false);
  });

  it("oculta casa com endereço completo já existente no pipeline", () => {
    expect(situacaoRepeticaoCentral(anuncio(), [imovelPipeline()])).toEqual({
      motivo: "casa-no-pipeline",
      ocultar: true,
    });
  });

  it("não oculta apartamento apenas porque o prédio já está no pipeline", () => {
    expect(situacaoRepeticaoCentral(
      anuncio({ titulo: "Apartamento para alugar" }),
      [imovelPipeline({ tipo: "Apartamento", unidade: "101" })],
    )).toEqual({ motivo: "apartamento-no-endereco", ocultar: false });
  });

  it("não afirma duplicidade de casa sem número ou com tipo indefinido", () => {
    expect(enderecoTemNumero("Rua 10 de Dezembro")).toBe(false);
    expect(tipoDoAnuncio(anuncio({ titulo: "Imóvel residencial" }))).toBe("indefinido");
    expect(situacaoRepeticaoCentral(
      anuncio({ endereco: "Rua Pará" }),
      [imovelPipeline({ endereco: "Rua Pará" })],
    )).toEqual({ motivo: null, ocultar: false });
  });

  it("reconhece URL da carteira mesmo quando o portal acrescenta parâmetros", () => {
    const atual = anuncio({ url: "https://portal.test/imovel/123456?utm_source=radar#foto" });
    expect(urlCanonicaAnuncio(atual.url)).toBe("https://portal.test/imovel/123456");
    expect(situacaoRepeticaoCentral(atual, [imovelPipeline()], new Set(["https://portal.test/imovel/123456"])))
      .toEqual({ motivo: "url-na-carteira", ocultar: true });
  });

  it("transforma os cards renderizados da OLX pelo Firecrawl", () => {
    const html = `<section class="olx-adcard">
      <a data-testid="adcard-link" title="Casa direto com proprietário" href="https://pr.olx.com.br/imoveis/casa-1525177784">Casa direto com proprietário</a>
      <span class="olx-adcard__price">R$ 2.500</span>
      <span class="olx-adcard__location">Londrina, Centro</span>
      <span class="olx-adcard__details">2 quartos, 70 m²</span>
      <span class="olx-adcard__date">Hoje, 08:30</span>
      <img src="https://img.olx.com.br/a.jpg">
    </section>`;

    expect(extrairAnunciosFirecrawl(html, {
      portal: "olx",
      cidade: "Londrina",
      estado: "PR",
      somenteProprietario: true,
    })).toEqual([expect.objectContaining({
      idExterno: "1525177784",
      titulo: "Casa direto com proprietário",
      preco: 2500,
      cidade: "Londrina",
      bairro: "Centro",
      imagem: "https://img.olx.com.br/a.jpg",
      tipo: "Casa",
      areaM2: 70,
      quartos: 2,
    })]);
  });

  it("transforma os cards renderizados do Viva Real pelo Firecrawl", () => {
    const html = `<a href="https://www.vivareal.com.br/imovel/apartamento-3-quartos-centro-londrina-id-2904079401/">
      <h2>Apartamento para alugar com 90 m², 3 quartos em Centro, Londrina</h2>
      <p>Rua Sergipe</p><p>R$ 3.200 / mês</p>
      <img src="https://resizedimgs.vivareal.com/a.jpg">
    </a>`;

    expect(extrairAnunciosFirecrawl(html, {
      portal: "viva-real",
      cidade: "Londrina",
      estado: "PR",
      dormitorios: 3,
    })).toEqual([expect.objectContaining({
      idExterno: "2904079401",
      preco: 3200,
      cidade: "Londrina",
      bairro: "Centro",
      endereco: "Rua Sergipe",
      tipo: "Apartamento",
      areaM2: 90,
      quartos: 3,
    })]);
  });

  it("transforma os cards renderizados do Chaves na Mão pelo Firecrawl", () => {
    const html = `<a href="https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/">
      <h2>Casa para alugar no Centro</h2>
      <p>Rua Pará, 100</p><p>Centro, Londrina/PR</p><p>80 m²</p><p>R$ 2.700</p>
      <img src="https://cdn.chavesnamao.com.br/a.jpg">
    </a>`;

    expect(extrairAnunciosFirecrawl(html, {
      portal: "chaves-na-mao",
      cidade: "Londrina",
      estado: "PR",
    })).toEqual([expect.objectContaining({
      idExterno: "35106344",
      preco: 2700,
      cidade: "Londrina",
      bairro: "Centro",
      endereco: "Rua Pará, 100",
      imagem: "https://cdn.chavesnamao.com.br/a.jpg",
      tipo: "Casa",
      areaM2: 80,
    })]);
  });

  it("transforma os cards renderizados do Wimoveis pelo Firecrawl", () => {
    const html = `<article data-qa="posting PROPERTY" data-id="3018468881" data-to-posting="/propriedades/apartamento-centro-3018468881.html">
      <div data-qa="POSTING_CARD_GALLERY"><img alt="Apartamento para alugar no Centro" src="https://img.wimoveis.com.br/a.jpg"></div>
      <div data-qa="POSTING_CARD_PRICE">R$ 1.900</div>
      <div data-qa="POSTING_CARD_FEATURES">2 quartos, 70 m²</div>
      <div class="location-address">Rua Goiás, 20</div>
      <div data-qa="POSTING_CARD_LOCATION">Centro, Londrina</div>
    </article>`;

    expect(extrairAnunciosFirecrawl(html, {
      portal: "wimoveis",
      cidade: "Londrina",
      estado: "PR",
      dormitorios: 2,
    })).toEqual([expect.objectContaining({
      idExterno: "3018468881",
      preco: 1900,
      cidade: "Londrina",
      bairro: "Centro",
      endereco: "Rua Goiás, 20",
      imagem: "https://img.wimoveis.com.br/a.jpg",
      tipo: "Apartamento",
      areaM2: 70,
      quartos: 2,
    })]);
  });
});
