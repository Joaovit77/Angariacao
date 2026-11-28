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

  it("inclui imóveis Retirados locados fora (C4/C5) usando retiradoEm e exclui outros motivos de retirada", () => {
    const carteira = [
      // Retirado por locação direta (C2/C4)
      imovel({
        referenciaCrm: "CRM-RET-1",
        status: "Publicado",
        retirado: true,
        retiradoEm: "2026-10-16",
        retiradoMotivo: "locado-proprietario",
        statusHistory: [
          { status: "Angariado", date: "2026-10-01" },
          { status: "Publicado", date: "2026-10-02" },
        ],
      }),
      // Retirado por locação em outra imobiliária (C2/C4)
      imovel({
        referenciaCrm: "CRM-RET-2",
        status: "Angariado",
        retirado: true,
        retiradoEm: "2026-10-11",
        retiradoMotivo: "locado-outra-imobiliaria",
        statusHistory: [{ status: "Angariado", date: "2026-10-01" }],
      }),
      // Retirado migrado na Fase C5 ("outro" com observação preservada de locado fora)
      imovel({
        referenciaCrm: "CRM-C5",
        status: "Publicado",
        retirado: true,
        retiradoEm: "2026-11-23",
        retiradoMotivo: "outro",
        retiradoObservacao: "Locado por outra imobiliária ou pelo proprietário (migrado de Perdido)",
        statusHistory: [
          { status: "Angariado", date: "2026-10-26" },
          { status: "Publicado", date: "2026-10-27" },
        ],
      }),
      // Retirados por OUTROS motivos -> NÃO entram em "locados fora"
      imovel({
        referenciaCrm: "CRM-VENDIDO",
        status: "Publicado",
        retirado: true,
        retiradoEm: "2026-11-05",
        retiradoMotivo: "vendido",
        statusHistory: [{ status: "Angariado", date: "2026-10-01" }],
      }),
      imovel({
        referenciaCrm: "CRM-DESISTIU",
        status: "Publicado",
        retirado: true,
        retiradoEm: "2026-11-06",
        retiradoMotivo: "desistiu",
        statusHistory: [{ status: "Angariado", date: "2026-10-01" }],
      }),
      imovel({
        referenciaCrm: "CRM-SEM-MOTIVO",
        status: "Publicado",
        retirado: true,
        retiradoEm: null,
        retiradoMotivo: null,
        statusHistory: [{ status: "Angariado", date: "2026-10-01" }],
      }),
      imovel({ status: "Locado" }),
    ];

    const resultado = estatisticasPerdaPosCaptacao(carteira);
    expect(resultado.total).toBe(3);
    expect(resultado.comTempoCalculavel).toBe(3);
    expect(resultado.taxaPerdaCarteira).toBe(75);
    expect(resultado.imoveis.map((i) => ({ ref: i.referenciaCrm, encerradoEm: i.encerradoEm, dias: i.diasAnunciado }))).toEqual([
      { ref: "CRM-C5", encerradoEm: "2026-11-23", dias: 28 },
      { ref: "CRM-RET-1", encerradoEm: "2026-10-16", dias: 15 },
      { ref: "CRM-RET-2", encerradoEm: "2026-10-11", dias: 10 },
    ]);
    expect(perdasPosCaptacaoNoMes(carteira, "2026-11").map((i) => i.referenciaCrm)).toEqual(["CRM-C5"]);
    expect(perdasPosCaptacaoNoMes(carteira, "2026-10").map((i) => i.referenciaCrm)).toEqual([
      "CRM-RET-1",
      "CRM-RET-2",
    ]);
  });
});
