import { describe, expect, it } from "vitest";
import {
  etiquetasDoImovel,
  type EtiquetaProspeccaoLeitura,
} from "@/lib/calculo/etiquetasProspeccao";

const etiqueta = (
  parcial: Partial<EtiquetaProspeccaoLeitura>,
): EtiquetaProspeccaoLeitura => ({
  categoria: "sinal-de-prospeccao",
  codigo: "placa-aluga-se",
  avistamentoId: "av-1",
  revisaoObservacao: 1,
  observadoEm: "2026-09-09T14:32:00Z",
  createdAt: "2026-09-09T14:33:00Z",
  estado: "inferida",
  origem: "ia-texto",
  confianca: 88,
  ...parcial,
});

describe("vigência temporal das etiquetas", () => {
  it("não apresenta uma placa antiga como atual e preserva sua última observação", () => {
    const resultado = etiquetasDoImovel([
      etiqueta({}),
      etiqueta({
        categoria: "estado-visual",
        codigo: "aparenta-em-obra",
        avistamentoId: "av-2",
        observadoEm: "2026-11-20T10:15:00Z",
      }),
    ], { id: "av-2", observacaoRevisao: 1 });

    expect(resultado.find((item) => item.codigo === "placa-aluga-se")).toMatchObject({
      vigenteNoAvistamentoCorrente: false,
      ultimaVezObservado: "2026-09-09T14:32:00Z",
    });
    expect(resultado.find((item) => item.codigo === "aparenta-em-obra")
      ?.vigenteNoAvistamentoCorrente).toBe(true);
  });

  it("mantém etiqueta humana do lugar atual até ela ser contestada", () => {
    const manual = etiqueta({
      avistamentoId: null,
      revisaoObservacao: null,
      estado: "confirmada",
      origem: "manual",
      confianca: null,
    });
    expect(etiquetasDoImovel([manual], { id: "av-2", observacaoRevisao: 1 })[0]
      .vigenteNoAvistamentoCorrente).toBe(true);
    expect(etiquetasDoImovel([{ ...manual, estado: "contestada" }], {
      id: "av-2",
      observacaoRevisao: 1,
    })[0].vigenteNoAvistamentoCorrente).toBe(false);
  });

  it("não considera vigente uma inferência de revisão antiga", () => {
    const resultado = etiquetasDoImovel([
      etiqueta({ avistamentoId: "av-2", revisaoObservacao: 1 }),
    ], { id: "av-2", observacaoRevisao: 2 });
    expect(resultado[0].vigenteNoAvistamentoCorrente).toBe(false);
  });

  it("não revoga uma confirmação humana quando a observação é revisada", () => {
    const resultado = etiquetasDoImovel([
      etiqueta({
        avistamentoId: "av-2",
        revisaoObservacao: 1,
        estado: "confirmada",
      }),
    ], { id: "av-2", observacaoRevisao: 2 });
    expect(resultado[0]).toMatchObject({
      vigenteNoAvistamentoCorrente: true,
      estado: "confirmada",
    });
  });

  it("preserva a autoridade da etiqueta manual vigente para o mesmo código", () => {
    const manual = etiqueta({
      avistamentoId: null,
      revisaoObservacao: null,
      estado: "confirmada",
      origem: "manual",
      confianca: null,
      createdAt: "2026-09-01T10:00:00Z",
    });
    const inferidaCorrente = etiqueta({
      avistamentoId: "av-2",
      observadoEm: "2026-11-20T10:15:00Z",
      createdAt: "2026-11-20T10:16:00Z",
    });
    expect(etiquetasDoImovel([manual, inferidaCorrente], {
      id: "av-2",
      observacaoRevisao: 1,
    })[0]).toMatchObject({ origem: "manual", estado: "confirmada" });
  });
});
