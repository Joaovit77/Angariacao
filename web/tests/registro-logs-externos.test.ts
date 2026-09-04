import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erroExternoSintetico } from "./fixtures/erroExterno";
const mocks = vi.hoisted(() => ({ after: vi.fn(), insert: vi.fn(), createClient: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { registrarEvento, registrarUsoIa } from "@/lib/servidor/registro";

describe("falhas do registro sem dados externos no console", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-ficticia");
    mocks.createClient.mockReturnValue({ from: () => ({ insert: mocks.insert }) });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it.each(["evento", "uso", "rejeicao", "fora-request"])("mantém registro não bloqueante em %s", async (cenario) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (cenario === "rejeicao" || cenario === "fora-request") mocks.insert.mockRejectedValue(erroExternoSintetico());
    else mocks.insert.mockResolvedValue({ error: erroExternoSintetico() });
    if (cenario === "fora-request") mocks.after.mockImplementation(() => { throw Error("sem request"); });
    if (cenario === "uso") {
      expect(registrarUsoIa({ userId: "usuario-fixture", tipo: "fixture", modelo: "fixture", tokensEntrada: 2, tokensSaida: 1 })).toBeUndefined();
    } else {
      expect(registrarEvento({ userId: "usuario-fixture", categoria: "ia", nivel: "erro", evento: "fixture" })).toBeUndefined();
    }
    if (cenario !== "fora-request") {
      expect(mocks.insert).not.toHaveBeenCalled();
      await mocks.after.mock.calls[0][0]();
    } else await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][1]).toEqual({ provider: "supabase", operation: "registrar", error_code: "registration_failed", status: 403 });
  });
});
