import { describe, expect, it } from "vitest";
import {
  estatisticasPerdaPosCaptacao,
  imoveisLocadosFora,
  perdasPosCaptacaoNoMes,
} from "@/lib/calculo/perdasPosCaptacao";
import type { Imovel } from "@/lib/tipos";

function imovel(parcial: Partial<Imovel>): Imovel {
  return {
    id: crypto.randomUUID(),
    codigo: "LD-TESTE",
    endereco: "Rua Teste",
    bairro: "Centro",
    cidade: "São Paulo",
    tipo: "Apartamento",
    status: "Novo contato",
    dataAngariacao: "2026-01-01",
    statusHistory: [],
    ...parcial,
  } as Imovel;
}

describe("perdas depois da angariação", () => {
  it("reconhece o motivo novo e normaliza motivos antigos pela fase", () => {
    const carteira = [
      imovel({
        status: "Perdido",
        motivoPerda: "Angariado, mas locado por outra imobiliária ou pelo proprietário",
        statusHistory: [
          { status: "Angariado", date: "2026-01-01" },
          { status: "Perdido", date: "2026-01-11" },
        ],
      }),
      imovel({
        status: "Perdido",
        motivoPerda: "Optou por outra imobiliária",
        statusHistory: [
          { status: "Angariado", date: "2026-02-01" },
          { status: "Perdido", date: "2026-03-13" },
        ],
      }),
      imovel({
        status: "Perdido",
        motivoPerda: "Optou por outra imobiliária",
        statusHistory: [{ status: "Perdido", date: "2026-01-05" }],
      }),
    ];

    expect(imoveisLocadosFora(carteira)).toHaveLength(2);
  });

  it("calcula volume, tempo, faixas e taxa sobre os desfechos da carteira", () => {
    const carteira = [
      imovel({
        referenciaCrm: "CRM-101",
        status: "Perdido",
        motivoPerda: "Optou por outra imobiliária",
        statusHistory: [
          { status: "Angariado", date: "2026-01-01" },
          { status: "Perdido", date: "2026-01-11" },
        ],
      }),
      imovel({
        referenciaCrm: "CRM-202",
        status: "Cancelado",
        motivoPerda: "Imóvel já alugado por conta própria",
        statusHistory: [
          { status: "Angariado", date: "2026-02-01" },
          { status: "Cancelado", date: "2026-03-13" },
        ],
      }),
      imovel({ status: "Locado" }),
      imovel({ status: "Locado" }),
    ];

    const resultado = estatisticasPerdaPosCaptacao(carteira);
    expect(resultado.total).toBe(2);
    expect(resultado.comTempoCalculavel).toBe(2);
    expect(resultado.tempoMedioDias).toBe(25);
    expect(resultado.tempoMedianoDias).toBe(25);
    expect(resultado.taxaPerdaCarteira).toBe(50);
    expect(resultado.faixas.map((faixa) => faixa.quantidade)).toEqual([0, 1, 1, 0]);
    expect(resultado.imoveis).toEqual([
      expect.objectContaining({
        referenciaCrm: "CRM-202",
        anunciadoDesde: "2026-02-01",
        encerradoEm: "2026-03-13",
        diasAnunciado: 40,
      }),
      expect.objectContaining({
        referenciaCrm: "CRM-101",
        anunciadoDesde: "2026-01-01",
        encerradoEm: "2026-01-11",
        diasAnunciado: 10,
      }),
    ]);
    expect(perdasPosCaptacaoNoMes(carteira, "2026-03").map((item) => item.referenciaCrm)).toEqual([
      "CRM-202",
    ]);
    expect(perdasPosCaptacaoNoMes(carteira, "2026-01").map((item) => item.referenciaCrm)).toEqual([
      "CRM-101",
    ]);
  });
});
