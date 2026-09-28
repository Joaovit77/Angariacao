import { describe, expect, it } from "vitest";
import {
  anuncioPertenceAoMercado,
  comCaracteristicasDoAnuncio,
  idExternoEhFallback,
  PORTAIS_ATIVOS,
  type PortalAtivoAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";

// HTML sintético: protege somente o contrato de código, não a compatibilidade atual dos portais reais.
const cards: Record<PortalAtivoAngariacao, string> = {
  olx: `<section class="olx-adcard"><a data-testid="adcard-link" title="Casa em Londrina" href="https://pr.olx.com.br/imoveis/casa-1525177784">Casa em Londrina</a><span class="olx-adcard__price">R$ 2.500</span><span class="olx-adcard__location">Londrina, Centro</span></section>`,
  "chaves-na-mao": `<a href="https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/"><h2>Casa para alugar no Centro</h2><p>Rua Pará, 100</p><p>Centro, Londrina/PR</p><p>R$ 2.700</p></a>`,
  wimoveis: `<article data-qa="posting PROPERTY" data-id="3018468881" data-to-posting="/propriedades/apartamento-centro-3018468881.html"><div data-qa="POSTING_CARD_GALLERY"><img alt="Apartamento em Londrina" src="https://img.wimoveis.com.br/a.jpg"></div><div data-qa="POSTING_CARD_PRICE">R$ 1.900</div><div data-qa="POSTING_CARD_FEATURES">2 quartos</div><div data-qa="POSTING_CARD_LOCATION">Centro, Londrina</div></article>`,
  "viva-real": `<a href="https://www.vivareal.com.br/imovel/apartamento-3-quartos-centro-londrina-id-2904079401/"><h2>Apartamento para alugar com 3 quartos em Centro, Londrina</h2><p>Rua Sergipe</p><p>R$ 3.200 / mês</p></a>`,
};

const ids: Record<PortalAtivoAngariacao, string> = {
  olx: "1525177784",
  "chaves-na-mao": "35106344",
  wimoveis: "3018468881",
  "viva-real": "2904079401",
};

describe("contrato estrutural dos quatro portais ativos", () => {
  it.each(PORTAIS_ATIVOS)("%s entrega anúncio compatível com o filtro geográfico comum", (portal) => {
    const anuncios = extrairAnunciosFirecrawl(cards[portal], { portal, cidade: "Londrina", estado: "PR" });
    expect(anuncios).toHaveLength(1);
    const anuncio = comCaracteristicasDoAnuncio(anuncios[0]);
    expect(anuncio).toMatchObject({ portal, idExterno: ids[portal] });
    expect(anuncio.titulo.trim()).not.toBe("");
    expect(new URL(anuncio.url).protocol).toBe("https:");
    expect(["proprietario", "imobiliaria", "incerto"]).toContain(anuncio.anunciante);
    expect(idExternoEhFallback(portal, anuncio.idExterno)).toBe(false);
    expect(anuncioPertenceAoMercado(anuncio, "Londrina", "PR")).toBe(true);
    expect(anuncioPertenceAoMercado(anuncio, "Curitiba", "PR")).toBe(false);
    expect(anuncioPertenceAoMercado({ ...anuncio, estado: "PR" }, "Londrina", "SP")).toBe(false);
  });
});
