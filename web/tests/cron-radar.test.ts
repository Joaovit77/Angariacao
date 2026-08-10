import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { executarMonitorRadar } = vi.hoisted(() => ({ executarMonitorRadar: vi.fn() }));

vi.mock("@/lib/servidor/monitorRadarAngariacao", () => ({
  executarMonitorRadar,
}));

import { GET } from "@/app/api/cron/radar/route";

const segredoAnterior = process.env.CRON_SECRET;

describe("cron do Radar", () => {
  beforeEach(() => {
    executarMonitorRadar.mockReset();
    process.env.CRON_SECRET = "segredo-do-cron";
  });

  afterAll(() => {
    if (segredoAnterior == null) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = segredoAnterior;
  });

  it("recusa chamadas sem o segredo", async () => {
    const resposta = await GET(new Request("http://localhost/api/cron/radar"));

    expect(resposta.status).toBe(401);
    expect(executarMonitorRadar).not.toHaveBeenCalled();
  });

  it("não opera se o segredo ainda não foi configurado", async () => {
    delete process.env.CRON_SECRET;
    const resposta = await GET(new Request("http://localhost/api/cron/radar"));

    expect(resposta.status).toBe(503);
    expect(executarMonitorRadar).not.toHaveBeenCalled();
  });

  it("executa a rodada autenticada e devolve o resumo", async () => {
    executarMonitorRadar.mockResolvedValue({ verificadas: 2, novos: 3, falhas: 0, resultados: [] });
    const resposta = await GET(new Request("http://localhost/api/cron/radar", {
      headers: { Authorization: "Bearer segredo-do-cron" },
    }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, verificadas: 2, novos: 3, falhas: 0 });
    expect(executarMonitorRadar).toHaveBeenCalledOnce();
  });
});
