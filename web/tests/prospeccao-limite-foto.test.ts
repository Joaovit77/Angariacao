import { describe, expect, it } from "vitest";

import {
  ALVO_BYTES_FOTO_FACHADA,
  LIMITE_BYTES_FOTO_FACHADA,
  LADO_INICIAL_FOTO_FACHADA,
  LADO_MINIMO_FOTO_FACHADA,
  LADO_MINIATURA_FOTO_FACHADA,
  QUALIDADE_INICIAL_FOTO_FACHADA,
  QUALIDADE_MINIMA_FOTO_FACHADA,
  QUALIDADE_MINIATURA_FOTO_FACHADA,
  planejarTentativasFotoFachada,
  processarFotoFachada,
} from "@/lib/calculo/fotoFachada";

const entrada = { largura: 3000, altura: 2000, mimeType: "image/webp" };

describe("C5 — limites de processamento da fachada", () => {
  it("mantém alvo, dimensões e qualidades exatos da V7", () => {
    expect(ALVO_BYTES_FOTO_FACHADA).toBe(400 * 1024);
    expect(LIMITE_BYTES_FOTO_FACHADA).toBe(5 * 1024 * 1024);
    expect(LADO_INICIAL_FOTO_FACHADA).toBe(1600);
    expect(LADO_MINIMO_FOTO_FACHADA).toBe(1024);
    expect(LADO_MINIATURA_FOTO_FACHADA).toBe(320);
    expect(QUALIDADE_INICIAL_FOTO_FACHADA).toBe(0.82);
    expect(QUALIDADE_MINIMA_FOTO_FACHADA).toBe(0.55);
    expect(QUALIDADE_MINIATURA_FOTO_FACHADA).toBe(0.7);
  });

  it("reduz qualidade em 0,08 antes de 1280 e 1024, sem romper os pisos", () => {
    const tentativas = planejarTentativasFotoFachada(entrada);
    expect(tentativas.map(({ largura, qualidade }) => [largura, qualidade])).toEqual([
      [1600, 0.82], [1600, 0.74], [1600, 0.66], [1600, 0.58], [1600, 0.55],
      [1280, 0.55], [1024, 0.55],
    ]);
  });

  it("aceita acima de 400 KB até 5 MB e recusa MIME ou saída acima do bucket", async () => {
    await expect(processarFotoFachada(entrada, (tentativa) => ({
      conteudo: tentativa.finalidade,
      bytes: tentativa.finalidade === "miniatura" ? 20_000 : 900_000,
    }))).resolves.toMatchObject({ original: { bytes: 900_000 } });
    expect(() => planejarTentativasFotoFachada({ ...entrada, mimeType: "image/png" })).toThrow();
    await expect(processarFotoFachada(entrada, (tentativa) => ({
      conteudo: tentativa.finalidade,
      bytes: tentativa.finalidade === "miniatura" ? 20_000 : LIMITE_BYTES_FOTO_FACHADA + 1,
    }))).rejects.toMatchObject({ codigo: "arquivo-muito-grande" });
  });
});
