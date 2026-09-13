import { describe, expect, it } from "vitest";
import { derivarEtiquetasProspeccao } from "@/lib/calculo/etiquetasProspeccao";
import type { EntradaEtiquetasDeterministicas } from "@/lib/calculo/etiquetasProspeccao";

const entrada = (parcial: Partial<EntradaEtiquetasDeterministicas> = {}): EntradaEtiquetasDeterministicas => ({
  logradouro: "Rua Paranaguá",
  numero: "300",
  unidade: "",
  bairro: "Centro",
  cidade: "Londrina",
  tipo: "Apartamento",
  latitude: -23.3105,
  longitude: -51.1696,
  acuraciaMetros: 18,
  fotos: ["ativa"],
  avistamentosTotal: 2,
  ultimoAvistamentoEm: "2026-09-01T10:00:00Z",
  ultimaInvestigacaoEm: null,
  classificacaoEstado: "pendente",
  situacao: "identificado",
  hoje: "2026-09-10",
  ...parcial,
});

const codigos = (parcial: Partial<EntradaEtiquetasDeterministicas> = {}) =>
  derivarEtiquetasProspeccao(entrada(parcial)).map((etiqueta) => etiqueta.codigo);

describe("etiquetas determinísticas", () => {
  it("deriva localização, completude, foto, histórico e pendência sem IA", () => {
    expect(codigos()).toEqual(expect.arrayContaining([
      "regiao:central",
      "bairro-conhecido",
      "endereco-completo",
      "com-coordenada",
      "unidade-desconhecida",
      "com-foto",
      "nunca-investigado",
      "varios-avistamentos",
      "aguardando-classificacao",
    ]));
  });

  it("a mesma entrada sempre produz a mesma saída", () => {
    expect(derivarEtiquetasProspeccao(entrada())).toEqual(derivarEtiquetasProspeccao(entrada()));
  });

  it("distingue endereço sem número de uma referência sem endereço", () => {
    expect(codigos({ numero: "" })).toContain("endereco-sem-numero");
    expect(codigos({ logradouro: "", numero: "", pontoReferencia: "Ao lado da praça" }))
      .toContain("so-referencia");
  });

  it("declara coordenada imprecisa e envio interrompido sem esconder a ausência da foto ativa", () => {
    const resultado = codigos({ acuraciaMetros: 180, fotos: ["reservada"] });
    expect(resultado).toEqual(expect.arrayContaining([
      "com-coordenada",
      "coordenada-imprecisa",
      "sem-foto",
      "envio-de-foto-pendente",
    ]));
  });

  it("deriva estados históricos sem transformar ausência em zero", () => {
    const resultado = codigos({
      ultimaInvestigacaoEm: "2026-05-01T10:00:00Z",
      ultimoAvistamentoEm: "2026-05-01T10:00:00Z",
      situacao: "promovido",
      jaNaCarteira: true,
      possivelDuplicata: true,
    });
    expect(resultado).toEqual(expect.arrayContaining([
      "investigado",
      "investigado-ha-mais-de-90-dias",
      "sem-retorno-ha-mais-de-90-dias",
      "possivel-duplicata",
      "ja-na-carteira",
      "promovido",
    ]));
    expect(codigos({ avistamentosTotal: 0 })).not.toEqual(expect.arrayContaining([
      "um-avistamento",
      "varios-avistamentos",
    ]));
  });
});
