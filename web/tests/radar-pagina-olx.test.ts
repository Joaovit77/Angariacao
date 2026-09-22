import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { urlDaPesquisa } from "@/lib/servidor/centralAngariacao";
import {
  extrairAnunciosFirecrawl,
  LIMITE_RESULTADOS,
  type DiagnosticoPaginaOlx,
} from "@/lib/servidor/firecrawlCentralAngariacao";

function cardOlx(id: number, data: string | null, cidade = "Londrina, Centro", titulo = `Apartamento ${id}`) {
  return `<section class="olx-adcard">
    <a data-testid="adcard-link" title="${titulo}" href="https://pr.olx.com.br/imoveis/anuncio-${id}">${titulo}</a>
    <span class="olx-adcard__price">R$ 1.500</span>
    <span class="olx-adcard__location">${cidade}</span>
    ${data == null ? "" : `<span class="olx-adcard__date">${data}</span>`}
  </section>`;
}

const cardInvalido = `<section class="olx-adcard"><span>Publicidade</span></section>`;

// Posições: 1 recente, 2 antigo, 3 inválido, 4 recente de outra cidade,
// 5 sem data, 6 antigo depois do último recente.
const paginaMista = [
  cardOlx(1000001, "Hoje, 08:30"),
  cardOlx(1000002, "10 de set, 10:00"),
  cardInvalido,
  cardOlx(1000004, "Ontem, 09:00", "Cambé, Centro"),
  cardOlx(1000005, null),
  cardOlx(1000006, "05 de set, 10:00"),
].join("\n");

const filtrosOlx: FiltrosCentralAngariacao = {
  portal: "olx",
  cidade: "Londrina",
  estado: "PR",
  somenteProprietario: true,
  diasPublicacao: 7,
};

function extrairComDiagnostico(html: string, filtros: FiltrosCentralAngariacao) {
  const diagnosticos: DiagnosticoPaginaOlx[] = [];
  const anuncios = extrairAnunciosFirecrawl(html, filtros, (d) => diagnosticos.push(d));
  return { anuncios, diagnosticos };
}

describe("diagnóstico da página OLX (R3.1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T15:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("descreve tamanho e ordem da página sem mudar a extração", () => {
    const { anuncios, diagnosticos } = extrairComDiagnostico(paginaMista, filtrosOlx);

    expect(anuncios).toEqual(extrairAnunciosFirecrawl(paginaMista, filtrosOlx));
    expect(anuncios.map((a) => a.idExterno)).toEqual(["1000001", "1000004"]);
    expect(diagnosticos).toEqual([{
      cardsPagina: 6,
      noPeriodoAntesCidade: 2,
      indiceUltimoNoPeriodo: 4,
      cardsAntigosAntesDeRecente: 1,
    }]);
  });

  it("na OLX, os candidatos do período são exatamente os coletados", () => {
    const { anuncios, diagnosticos } = extrairComDiagnostico(paginaMista, filtrosOlx);
    expect(diagnosticos[0].noPeriodoAntesCidade).toBe(anuncios.length);
  });

  it("página em ordem de recência não tem inversões", () => {
    const html = [
      cardOlx(2000001, "Hoje, 08:30"),
      cardOlx(2000002, "Ontem, 09:00"),
      cardOlx(2000003, "10 de set, 10:00"),
      cardOlx(2000004, "01 de set, 10:00"),
    ].join("\n");

    expect(extrairComDiagnostico(html, filtrosOlx).diagnosticos[0]).toEqual({
      cardsPagina: 4,
      noPeriodoAntesCidade: 2,
      indiceUltimoNoPeriodo: 2,
      cardsAntigosAntesDeRecente: 0,
    });
  });

  it("sem nenhum card no período, o índice é nulo e não há inversão", () => {
    const html = [cardOlx(3000001, "10 de set, 10:00"), cardOlx(3000002, "01 de set, 10:00")].join("\n");
    expect(extrairComDiagnostico(html, filtrosOlx).diagnosticos[0]).toEqual({
      cardsPagina: 2,
      noPeriodoAntesCidade: 0,
      indiceUltimoNoPeriodo: null,
      cardsAntigosAntesDeRecente: 0,
    });
  });

  it("sem diasPublicacao, omite os campos que dependem do período", () => {
    const { anuncios, diagnosticos } = extrairComDiagnostico(paginaMista, { ...filtrosOlx, diasPublicacao: null });
    expect(anuncios).toHaveLength(5);
    expect(diagnosticos).toEqual([{ cardsPagina: 6, noPeriodoAntesCidade: 5 }]);
  });

  it("conta todos os cards da página, mas interpreta só os primeiros do limite", () => {
    const html = Array.from({ length: LIMITE_RESULTADOS + 5 }, (_, i) => cardOlx(4000000 + i, "Hoje, 08:30")).join("\n");
    const { anuncios, diagnosticos } = extrairComDiagnostico(html, filtrosOlx);

    expect(anuncios).toHaveLength(LIMITE_RESULTADOS);
    expect(diagnosticos[0]).toMatchObject({
      cardsPagina: LIMITE_RESULTADOS + 5,
      noPeriodoAntesCidade: LIMITE_RESULTADOS,
      indiceUltimoNoPeriodo: LIMITE_RESULTADOS,
    });
  });

  it("um erro no registro do diagnóstico não interrompe a coleta", () => {
    const anuncios = extrairAnunciosFirecrawl(paginaMista, filtrosOlx, () => {
      throw new Error("falha no observador");
    });
    expect(anuncios.map((a) => a.idExterno)).toEqual(["1000001", "1000004"]);
  });

  it("não produz diagnóstico para a Chaves na Mão", () => {
    const html = `<a href="https://www.chavesnamao.com.br/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/">
      <h2>Casa para alugar no Centro</h2><p>Centro, Londrina/PR</p><p>R$ 2.700</p></a>`;
    const registrar = vi.fn();
    const anuncios = extrairAnunciosFirecrawl(html, { portal: "chaves-na-mao", cidade: "Londrina", estado: "PR" }, registrar);

    expect(anuncios).toHaveLength(1);
    expect(registrar).not.toHaveBeenCalled();
  });

  it("não esconde anúncio de quarto na extração compartilhada (Central, Radar e Mercados)", () => {
    const html = cardOlx(5000001, "Hoje, 08:30", "Londrina, Centro", "QUARTO MOBILIADO CENTRO DE LONDRINA");
    expect(extrairAnunciosFirecrawl(html, filtrosOlx).map((a) => a.titulo))
      .toEqual(["QUARTO MOBILIADO CENTRO DE LONDRINA"]);
  });
});

describe("URL da OLX continua sem ordenação (R3 não ativou sf)", () => {
  it("não inclui sf com ou sem período", () => {
    for (const diasPublicacao of [null, 1, 7, 30] as const) {
      const url = new URL(urlDaPesquisa({ ...filtrosOlx, diasPublicacao }));
      expect(url.searchParams.has("sf")).toBe(false);
      expect(url.toString()).toBe("https://www.olx.com.br/imoveis/aluguel/estado-pr/regiao-de-londrina?f=p");
    }
  });
});
