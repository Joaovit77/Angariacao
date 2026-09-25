import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executarMonitorRadar, registrarEvento } = vi.hoisted(() => ({
  executarMonitorRadar: vi.fn(),
  registrarEvento: vi.fn(),
}));

vi.mock("@/lib/servidor/monitorRadarAngariacao", () => ({
  executarMonitorRadar,
}));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento }));

import { GET } from "@/app/api/cron/radar/route";

const segredoAnterior = process.env.CRON_SECRET;

describe("cron do Radar", () => {
  beforeEach(() => {
    executarMonitorRadar.mockReset();
    registrarEvento.mockReset();
    process.env.CRON_SECRET = "segredo-do-cron";
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    executarMonitorRadar.mockResolvedValue({
      candidatas: 3,
      elegiveis: 2,
      verificadas: 2,
      novos: 3,
      falhas: 0,
      resultados: [],
    });
    const resposta = await GET(new Request("http://localhost/api/cron/radar", {
      headers: { Authorization: "Bearer segredo-do-cron" },
    }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, verificadas: 2, novos: 3, falhas: 0 });
    expect(executarMonitorRadar).toHaveBeenCalledOnce();
    expect(registrarEvento).toHaveBeenCalledTimes(2);
    const inicio = JSON.parse(registrarEvento.mock.calls[0][0].detalhe);
    const fim = JSON.parse(registrarEvento.mock.calls[1][0].detalhe);
    expect(inicio).toEqual({ etapa: "inicio", rodada_id: expect.any(String) });
    expect(executarMonitorRadar).toHaveBeenCalledWith(inicio.rodada_id);
    expect(fim).toMatchObject({
      etapa: "fim",
      rodada_id: inicio.rodada_id,
      candidatas: 3,
      elegiveis: 2,
      verificadas: 2,
      falhas: 0,
    });
  });

  it("uma falha do registro não altera a execução nem a resposta da rodada", async () => {
    registrarEvento.mockImplementation(() => { throw new Error("log indisponível"); });
    executarMonitorRadar.mockResolvedValue({
      candidatas: 1,
      elegiveis: 1,
      verificadas: 1,
      novos: 0,
      falhas: 0,
      resultados: [],
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resposta = await GET(new Request("http://localhost/api/cron/radar", {
      headers: { Authorization: "Bearer segredo-do-cron" },
    }));

    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ ok: true, verificadas: 1, falhas: 0 });
  });
});
