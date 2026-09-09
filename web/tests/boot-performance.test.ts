import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("observabilidade do boot", () => {
  it("separa ocorrencias duplicadas e reinicia a contagem depois do login", async () => {
    let relogio = 100;
    vi.spyOn(performance, "now").mockImplementation(() => relogio);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const boot = await import("@/lib/bootPerformance");

    expect(boot.iniciarBoot()).toBe(100);
    relogio = 125;
    boot.registrarEtapaBoot("perfil_usuario", 100, { sucesso: true });
    relogio = 140;
    boot.registrarEtapaBoot("perfil_usuario", 125, { sucesso: true });

    expect(info.mock.calls[0]).toEqual([
      "[boot]",
      { etapa: "perfil_usuario", duracaoMs: 25, ocorrencia: 1, sucesso: true },
    ]);
    expect(info.mock.calls[1]).toEqual([
      "[boot]",
      { etapa: "perfil_usuario", duracaoMs: 15, ocorrencia: 2, sucesso: true },
    ]);

    relogio = 500;
    expect(boot.reiniciarBoot()).toBe(500);
    relogio = 510;
    boot.registrarEtapaBoot("perfil_usuario", 500);
    expect(info.mock.calls[2][1]).toMatchObject({ ocorrencia: 1, duracaoMs: 10 });
  });

  it("registra o primeiro render uma unica vez", async () => {
    let relogio = 10;
    vi.spyOn(performance, "now").mockImplementation(() => relogio);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const boot = await import("@/lib/bootPerformance");

    boot.iniciarBoot();
    relogio = 80;
    boot.registrarPrimeiroRenderBoot();
    boot.registrarPrimeiroRenderBoot();

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("[boot]", {
      etapa: "tempo_total_primeiro_render",
      duracaoMs: 70,
    });
  });
});
