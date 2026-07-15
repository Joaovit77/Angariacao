/* Contrato da tabela "Desempenho por canal de captação" (lib/calculo/canais).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o comportamento: base só nos angariados, aproveitamento por canal,
   tempo médio até locação e a ordenação. */
import { describe, expect, it } from "vitest";
import { desempenhoPorCanal, ORIGEM_NAO_INFORMADA } from "@/lib/calculo/canais";
import type { Imovel } from "@/lib/tipos";

// Constrói um imóvel angariado (statusHistory com "Angariado"); se `locadoEm`
// vier, também empurra a entrada de "Locado" para o cálculo de tempo médio.
function angariado(over: {
  id: string;
  origem?: string | null;
  angariadoEm: string;
  locadoEm?: string;
}): Imovel {
  const hist = [
    { status: "Novo contato", date: over.angariadoEm },
    { status: "Angariado", date: over.angariadoEm },
  ];
  if (over.locadoEm) hist.push({ status: "Locado", date: over.locadoEm });
  return {
    id: over.id,
    endereco: `Rua ${over.id}`,
    origemImovel: over.origem === undefined ? "Placa no imóvel" : over.origem,
    status: over.locadoEm ? "Locado" : "Angariado",
    dataAngariacao: over.angariadoEm,
    statusHistory: hist,
  };
}

describe("desempenhoPorCanal", () => {
  it("ignora imóveis que ainda não foram angariados", () => {
    const soContato: Imovel = {
      id: "x",
      endereco: "Rua X",
      origemImovel: "Placa no imóvel",
      status: "Novo contato",
      statusHistory: [{ status: "Novo contato", date: "2026-01-01" }],
    };
    expect(desempenhoPorCanal([soContato])).toEqual([]);
  });

  it("agrupa por origem, conta angariados/locados e calcula aproveitamento e tempo médio", () => {
    const imoveis = [
      angariado({ id: "a", origem: "Placa no imóvel", angariadoEm: "2026-01-01" }),
      angariado({ id: "b", origem: "Placa no imóvel", angariadoEm: "2026-01-01", locadoEm: "2026-01-31" }), // 30 dias
      angariado({ id: "c", origem: "Indicação de cliente", angariadoEm: "2026-03-01", locadoEm: "2026-03-11" }), // 10 dias
    ];
    const r = desempenhoPorCanal(imoveis);

    const placa = r.find((x) => x.origem === "Placa no imóvel")!;
    expect(placa).toMatchObject({ angariados: 2, locados: 1, conversao: 50, tempoMedio: 30 });

    const indic = r.find((x) => x.origem === "Indicação de cliente")!;
    expect(indic).toMatchObject({ angariados: 1, locados: 1, conversao: 100, tempoMedio: 10 });
  });

  it("origem vazia/ausente cai em 'Não informado'", () => {
    const r = desempenhoPorCanal([angariado({ id: "a", origem: null, angariadoEm: "2026-01-01" })]);
    expect(r).toHaveLength(1);
    expect(r[0].origem).toBe(ORIGEM_NAO_INFORMADA);
  });

  it("canal sem nenhuma locação tem conversão 0 e tempo médio null", () => {
    const r = desempenhoPorCanal([angariado({ id: "a", origem: "OLX / Canal Pro", angariadoEm: "2026-01-01" })]);
    expect(r[0]).toMatchObject({ angariados: 1, locados: 0, conversao: 0, tempoMedio: null });
  });

  it("ordena por angariados desc, depois locados desc, depois origem", () => {
    const imoveis = [
      // canal "A": 1 angariado, 0 locado
      angariado({ id: "a1", origem: "A", angariadoEm: "2026-01-01" }),
      // canal "B": 1 angariado, 1 locado
      angariado({ id: "b1", origem: "B", angariadoEm: "2026-01-01", locadoEm: "2026-01-10" }),
      // canal "C": 3 angariados, 0 locado
      angariado({ id: "c1", origem: "C", angariadoEm: "2026-01-01" }),
      angariado({ id: "c2", origem: "C", angariadoEm: "2026-01-01" }),
      angariado({ id: "c3", origem: "C", angariadoEm: "2026-01-01" }),
    ];
    const ordem = desempenhoPorCanal(imoveis).map((x) => x.origem);
    // C primeiro (3 angariados); depois B e A empatam em 1 angariado, B vem
    // antes por ter mais locados.
    expect(ordem).toEqual(["C", "B", "A"]);
  });
});
