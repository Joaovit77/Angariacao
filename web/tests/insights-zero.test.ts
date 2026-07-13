/* Regressão: cards de INSIGHTS cuja estatística principal é uma taxa de
   conversão não devem aparecer quando a taxa seria 0% — um "0%" cru não agrega
   leitura e, no caso do "tipo/abordagem que mais converte", seria contraditório
   ("0% é o que mais converte"). Ver lib/calculo/insights.ts. */
import { describe, it, expect } from "vitest";
import { buildInsights } from "@/lib/calculo/insights";
import type { Imovel } from "@/lib/tipos";
import { congelaRelogio } from "./setup-relogio";

congelaRelogio();

/** Imóvel mínimo com histórico coerente com o status atual. */
function imovel(over: Partial<Imovel> & { id: string; status: string }): Imovel {
  return {
    endereco: `Rua ${over.id}`,
    tipo: "Apartamento",
    formaAbordagem: "Ligação telefônica",
    statusHistory: [{ status: over.status, date: "2026-07-01" }],
    ...over,
  };
}

describe("Insights — supressão de taxas em 0%", () => {
  // Carteira só com desfechos negativos: nada converteu (conversão = 0%).
  // Duas abordagens com amostra >= 3 cada, ambas a 0% — assim o card de
  // "abordagem mais eficaz" só é barrado pela guarda de taxa > 0, não por
  // falta de alternativas.
  const semConversao: Imovel[] = [
    imovel({ id: "z1", status: "Perdido", formaAbordagem: "Ligação telefônica" }),
    imovel({ id: "z2", status: "Perdido", formaAbordagem: "Ligação telefônica" }),
    imovel({ id: "z3", status: "Cancelado", formaAbordagem: "Ligação telefônica" }),
    imovel({ id: "z4", status: "Perdido", formaAbordagem: "Visita presencial" }),
    imovel({ id: "z5", status: "Perdido", formaAbordagem: "Visita presencial" }),
    imovel({ id: "z6", status: "Cancelado", formaAbordagem: "Visita presencial" }),
  ];

  const insights = buildInsights(semConversao, 100);

  it("não gera o card 'tipo que mais converte' quando a conversão é 0%", () => {
    expect(insights.some((i) => i.icon === "check")).toBe(false);
  });

  it("não gera o card 'abordagem mais eficaz' quando a conversão é 0%", () => {
    expect(insights.some((i) => i.icon === "telefone")).toBe(false);
  });

  it("não gera o card 'Taxa de conversão geral' quando ela é 0%", () => {
    expect(insights.some((i) => i.icon === "alvo")).toBe(false);
  });

  it("controle: com pelo menos uma locação, os cards de conversão voltam a aparecer", () => {
    const comConversao: Imovel[] = [
      imovel({
        id: "c1",
        status: "Locado",
        statusHistory: [
          { status: "Novo contato", date: "2026-06-01" },
          { status: "Locado", date: "2026-07-01" },
        ],
      }),
      imovel({ id: "c2", status: "Perdido" }),
      imovel({ id: "c3", status: "Cancelado" }),
    ];
    const comInsights = buildInsights(comConversao, 100);
    expect(comInsights.some((i) => i.icon === "check")).toBe(true);
    expect(comInsights.some((i) => i.icon === "alvo")).toBe(true);
  });
});
