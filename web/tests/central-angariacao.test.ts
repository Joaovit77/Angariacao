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

describe("Central de Angariação", () => {
  it("normaliza cidade e valores dos filtros", () => {
    expect(slugPortal("São José dos Pinhais")).toBe("sao-jose-dos-pinhais");
    expect(numeroOpcional("R$ 2.500")).toBe(2500);
    expect(numeroOpcional(0)).toBe(0);
    expect(numeroOpcional("")).toBeNull();
  });

  it("gera URL somente nos hosts fixos dos portais", () => {
    const olx = urlDaPesquisa({ portal: "olx", cidade: "Londrina", estado: "PR", valorMax: 2500 });
    const chaves = urlDaPesquisa({ portal: "chaves-na-mao", cidade: "Londrina", estado: "PR" });
    const wimoveis = urlDaPesquisa({ portal: "wimoveis", cidade: "Londrina", estado: "PR", somenteProprietario: true });
    const vivaReal = urlDaPesquisa({ portal: "viva-real", cidade: "Londrina", estado: "PR", valorMin: 1000 });
    expect(new URL(olx).hostname).toBe("www.olx.com.br");
    expect(new URL(chaves).hostname).toBe("www.chavesnamao.com.br");
    expect(new URL(wimoveis).hostname).toBe("www.wimoveis.com.br");
    expect(new URL(vivaReal).hostname).toBe("www.vivareal.com.br");
    expect(olx).toContain("ps=2500");
    expect(wimoveis).toContain("tipoanunciante-particular");
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
});
