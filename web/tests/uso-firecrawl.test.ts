import { describe, expect, it, vi } from "vitest";
import {
  ConsultaUsoFirecrawlFalhou,
  consultarUsoFirecrawl,
} from "@/lib/servidor/usoFirecrawl";

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("consultarUsoFirecrawl", () => {
  it("calcula o consumo do ciclo usando o saldo oficial", async () => {
    const fetcher = vi.fn(async () => resposta({
      success: true,
      data: {
        remainingCredits: 740,
        planCredits: 1000,
        billingPeriodStart: "2026-08-01T00:00:00Z",
        billingPeriodEnd: "2026-08-31T23:59:59Z",
      },
    }));

    const uso = await consultarUsoFirecrawl("fc-segredo", fetcher as typeof fetch);

    expect(uso).toEqual({
      creditosDisponiveis: 740,
      creditosDoPlano: 1000,
      creditosConsumidos: 260,
      percentualConsumido: 26,
      inicioCiclo: "2026-08-01T00:00:00Z",
      fimCiclo: "2026-08-31T23:59:59Z",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/team/credit-usage",
      expect.objectContaining({
        headers: { Authorization: "Bearer fc-segredo" },
        cache: "no-store",
      }),
    );
  });

  it("não aceita uma resposta incompleta como se fosse saldo zero", async () => {
    const fetcher = vi.fn(async () => resposta({ success: true, data: {} }));
    await expect(consultarUsoFirecrawl("fc-segredo", fetcher as typeof fetch))
      .rejects.toBeInstanceOf(ConsultaUsoFirecrawlFalhou);
  });

  it("não inclui a chave no erro devolvido pela API", async () => {
    const fetcher = vi.fn(async () => resposta({ success: false, error: "Unauthorized" }, 401));
    await expect(consultarUsoFirecrawl("fc-segredo", fetcher as typeof fetch))
      .rejects.toThrow("Firecrawl respondeu 401: Unauthorized");
  });
});
