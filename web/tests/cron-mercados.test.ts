import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const executar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/servidor/coletaMercadosMonitorados", () => ({ executarColetaMercados: executar }));
import { GET, maxDuration } from "@/app/api/cron/mercados/route";

describe("cron separado de mercados", () => {
  beforeEach(() => { executar.mockReset(); vi.stubEnv("CRON_SECRET", "segredo-local"); });
  afterEach(() => vi.unstubAllEnvs());
  it.each([undefined, "Bearer errado"])("recusa segredo ausente/incorreto", async (authorization) => {
    const r = await GET(new Request("http://localhost/api/cron/mercados", { headers: authorization ? { authorization } : {} }));
    expect(r.status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });
  it("sem configuração não executa", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("http://localhost"))).status).toBe(503);
    expect(executar).not.toHaveBeenCalled();
  });
  it("segredo válido executa sem encaminhar owner, limite ou mercado da URL", async () => {
    executar.mockResolvedValue({ mercadosReclamados: 0, mercados: [] });
    const r = await GET(new Request("http://localhost/api/cron/mercados?user_id=outro&limite=999", {
      headers: { authorization: "Bearer segredo-local" },
    }));
    expect(r.status).toBe(200);
    expect(executar).toHaveBeenCalledWith();
    expect(await r.json()).toMatchObject({ ok: true, mercadosReclamados: 0 });
  });
  it("não expõe erro interno", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    executar.mockRejectedValue(new Error("Bearer segredo-db"));
    const r = await GET(new Request("http://localhost", { headers: { authorization: "Bearer segredo-local" } }));
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("segredo-db");
    expect(JSON.stringify(log.mock.calls)).not.toContain("segredo-db");
    log.mockRestore();
  });
  it("adiciona somente um cron diário e preserva horário do Radar", () => {
    const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    expect(config.crons).toEqual([
      { path: "/api/cron/radar", schedule: "0 12 * * *" },
      { path: "/api/cron/mercados", schedule: "0 6 * * *" },
    ]);
    expect(maxDuration).toBe(300);
  });
});
