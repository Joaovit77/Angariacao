// R4.2h — as duas variantes reais do card do ZAP (HTML SINTÉTICO): `li` com
// `rp-property-cd` em `data-cy` (smoke do R4.2h) ou em `data-testid`
// (discovery R4.2f). Nada além delas define card.
import { load } from "cheerio";
import { describe, expect, it } from "vitest";

import type { FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { extrairZap, type DiagnosticoZap } from "@/lib/servidor/parserZap";
import { diagnosticoZapSeguro } from "@/lib/servidor/observabilidadeRadar";
import { htmlZap, urlAnuncio, type AnuncioSintetico } from "./fixtures/zap-listagem-sintetica";

const ZAP: FiltrosCentralAngariacao = { portal: "zap", cidade: "Londrina", estado: "PR", tipo: "Apartamento" };
const A = "2612345678";
const B = "2612345699";
const C = "2612345700";
const D = "2612345711";
const E = "2612345722";

function extrair(html: string) {
  let diagnostico: DiagnosticoZap | null = null;
  const anuncios = extrairZap(load(html), ZAP, 50, (d) => { diagnostico = d; }, html.length);
  if (!diagnostico) throw new Error("diagnóstico não registrado");
  return { anuncios, ids: anuncios.map((a) => a.idExterno), d: diagnostico as DiagnosticoZap };
}

function pagina(anuncios: AnuncioSintetico[]): string {
  return htmlZap(anuncios);
}

describe("variantes reais do card do ZAP", () => {
  it("A. só data-cy: anúncio aceito com o mesmo contrato", () => {
    const { anuncios, d } = extrair(pagina([{ id: A, marcador: "data-cy" }]));
    expect(anuncios).toHaveLength(1);
    expect(anuncios[0]).toMatchObject({
      idExterno: A,
      portal: "zap",
      url: urlAnuncio(A),
      preco: 2500,
      cidade: "Londrina",
      estado: "PR",
      bairro: "Centro",
      anunciante: "incerto",
      publicadoEm: null,
    });
    expect(d.seletorVariantes).toEqual({ dataCy: 1, dataTestid: 0, ambos: 0, uniao: 1 });
  });

  it("B. só data-testid: anúncio aceito, idêntico ao da variante data-cy", () => {
    const testid = extrair(pagina([{ id: A, marcador: "data-testid" }]));
    const cy = extrair(pagina([{ id: A, marcador: "data-cy" }]));
    expect(testid.ids).toEqual([A]);
    expect(testid.anuncios).toEqual(cy.anuncios);
    expect(testid.d.seletorVariantes).toEqual({ dataCy: 0, dataTestid: 1, ambos: 0, uniao: 1 });
  });

  it("C. card com os dois atributos é processado uma única vez", () => {
    const { ids, d } = extrair(pagina([{ id: A, marcador: "ambos" }]));
    expect(ids).toEqual([A]);
    expect(d.seletorCards).toBe(1);
    expect(d.cards).toMatchObject({ processados: 1, comUmId: 1, idsDuplicados: 0 });
    expect(d.saida.descartes.id_duplicado).toBe(0);
    expect(d.seletorVariantes).toEqual({ dataCy: 1, dataTestid: 1, ambos: 1, uniao: 1 });
  });

  it("D. mistura de variantes: todos uma vez, na ordem do DOM", () => {
    const { ids, d } = extrair(pagina([
      { id: A, marcador: "data-cy" },
      { id: B, marcador: "data-testid" },
      { id: C, marcador: "ambos" },
      { id: D, marcador: "data-cy" },
    ]));
    expect(ids).toEqual([A, B, C, D]);
    expect(d.cards).toMatchObject({ processados: 4, idsDuplicados: 0 });
    expect(d.saida.descartes.id_duplicado).toBe(0);
    expect(d.seletorVariantes).toEqual({ dataCy: 3, dataTestid: 2, ambos: 1, uniao: 4 });
  });

  it("E a H. li sem marcador, outro valor, link solto e Product sem card ficam de fora", () => {
    const html = pagina([
      { id: A, marcador: "data-cy" },
      { id: B, marcador: "nenhum" }, // E
      { id: C, marcador: "data-cy-outro" }, // F
      { id: D, semCard: true }, // G: só o link solto abaixo
      { id: E, semCard: true }, // H: só o Product
    ]).replace("</ul>", `</ul><div><a href="${urlAnuncio(D)}"><h2>Link solto</h2></a></div>`);
    const { ids, d } = extrair(html);
    expect(ids).toEqual([A]);
    expect(d.seletorCards).toBe(1);
    expect(d.cards.processados).toBe(1);
    expect(d.seletorVariantes).toEqual({ dataCy: 1, dataTestid: 0, ambos: 0, uniao: 1 });
    // Os IDs de fora aparecem só como JSON-LD sem card, nunca como anúncio.
    expect(d.pareamento.jsonLdSemCard).toBe(4);
    expect(d.estrutura.linksImovelComId).toBe(4);
  });

  it("a observabilidade leva as contagens por variante, sem mais nada", () => {
    const { d } = extrair(pagina([{ id: A, marcador: "data-cy" }, { id: B, marcador: "ambos" }]));
    const seguro = diagnosticoZapSeguro({ ...d, seletorVariantes: { ...d.seletorVariantes, seletor: "li", ids: [A] } });
    expect(seguro.seletor_variantes).toEqual({ dataCy: 2, dataTestid: 1, ambos: 1, uniao: 2 });
  });
});
