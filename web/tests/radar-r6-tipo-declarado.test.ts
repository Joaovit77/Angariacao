// R6.0b — tipo declarado pelo próprio anúncio, separado do tipo herdado do filtro.
// HTML sintético nos formatos de card já cobertos pelos testes de cada portal.
import { describe, expect, it } from "vitest";
import {
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { htmlZap, produto } from "./fixtures/zap-listagem-sintetica";

const cardOlx = (titulo: string) =>
  `<section class="olx-adcard"><a data-testid="adcard-link" title="${titulo}" href="https://pr.olx.com.br/imoveis/anuncio-1525177784">${titulo}</a><span class="olx-adcard__price">R$ 2.500</span><span class="olx-adcard__location">Londrina, Centro</span></section>`;

const cardChaves = (titulo: string) =>
  `<a href="https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/"><h2>${titulo}</h2><p>Rua Pará, 100</p><p>Centro, Londrina/PR</p><p>R$ 2.700</p></a>`;

/** Mesmo caminho da coleta real: parser → finalização → comparáveis, cada um
    reaplicando o tipo do filtro, com a ida e volta pelo jsonb no meio. */
function coletar(html: string, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao {
  const [doParser] = extrairAnunciosFirecrawl(html, filtros);
  const finalizado = comCaracteristicasDoAnuncio(doParser, filtros.tipo);
  const persistido = JSON.parse(JSON.stringify(finalizado)) as AnuncioCentralAngariacao;
  return comCaracteristicasDoAnuncio(persistido, filtros.tipo);
}

describe("R6.0b: tipo declarado não herda o filtro da busca", () => {
  it("OLX pesquisada como Casa: o apartamento continua declarado como Apartamento", () => {
    const anuncio = coletar(
      cardOlx("Apartamento 2 quartos no Centro"),
      { portal: "olx", cidade: "Londrina", estado: "PR", tipo: "Casa" },
    );
    expect(anuncio.tipo).toBe("Casa");
    expect(anuncio.tipoDeclarado).toBe("Apartamento");
  });

  it("sem filtro de tipo, o tipo atual e o declarado coincidem", () => {
    const anuncio = coletar(
      cardOlx("Apartamento 2 quartos no Centro"),
      { portal: "olx", cidade: "Londrina", estado: "PR" },
    );
    expect(anuncio.tipo).toBe("Apartamento");
    expect(anuncio.tipoDeclarado).toBe("Apartamento");
  });

  it("anúncio que não declara tipo fica nulo mesmo com filtro", () => {
    const anuncio = coletar(
      cardOlx("Imóvel para alugar no Centro"),
      { portal: "olx", cidade: "Londrina", estado: "PR", tipo: "Casa" },
    );
    expect(anuncio.tipo).toBe("Casa");
    expect(anuncio.tipoDeclarado).toBeNull();
  });

  it("Chaves em Casas preserva o subtipo que o card declara", () => {
    const anuncio = coletar(
      cardChaves("Sobrado 3 quartos para alugar no Centro"),
      { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR", tipo: "Casa" },
    );
    expect(anuncio.tipo).toBe("Casa");
    expect(anuncio.tipoDeclarado).toBe("Sobrado");
  });

  it("ZAP com JSON-LD Apartment declara Apartamento pelo próprio portal", () => {
    const anuncio = coletar(
      htmlZap([{ id: "2612345678" }]),
      { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" },
    );
    expect(anuncio.tipoDeclarado).toBe("Apartamento");
  });

  it("ZAP sem Apartment no JSON-LD usa o texto do anúncio, não o filtro", () => {
    const id = "2612345678";
    const anuncio = coletar(
      htmlZap([{
        id,
        titulo: "Casa com 3 quartos para alugar",
        apartamento: null,
        produto: produto(id, { name: "Casa com 3 quartos para alugar em Centro" }),
      }]),
      { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" },
    );
    expect(anuncio.tipo).toBe("Apartamento");
    expect(anuncio.tipoDeclarado).toBe("Casa");
  });

  it("um valor já decidido nunca é recalculado, nem quando é nulo", () => {
    const base: AnuncioCentralAngariacao = {
      idExterno: "1525177784",
      portal: "olx",
      titulo: "Apartamento no Centro",
      url: "https://pr.olx.com.br/imoveis/anuncio-1525177784",
      anunciante: "incerto",
    };
    expect(comCaracteristicasDoAnuncio({ ...base, tipoDeclarado: null }, "Casa").tipoDeclarado).toBeNull();
    expect(comCaracteristicasDoAnuncio({ ...base, tipoDeclarado: "Kitnet/Studio" }, "Casa").tipoDeclarado)
      .toBe("Kitnet/Studio");
  });

  it("os demais campos continuam iguais ao comportamento anterior", () => {
    const anuncio = coletar(
      cardOlx("Apartamento 2 quartos 60 m² no Centro"),
      { portal: "olx", cidade: "Londrina", estado: "PR", tipo: "Casa" },
    );
    expect(anuncio).toMatchObject({ tipo: "Casa", quartos: 2, areaM2: 60, preco: 2500 });
  });
});
