import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALVO_BYTES_FOTO_FACHADA,
  ErroFotoFachada,
  LIMITE_BYTES_FOTO_FACHADA,
  planejarTentativasFotoFachada,
  processarFotoFachada,
  type TentativaCodificacaoFoto,
} from "@/lib/calculo/fotoFachada";

const entrada = { largura: 3000, altura: 2000, mimeType: "image/jpeg" };

describe("processamento puro da foto de fachada", () => {
  it("reduz qualidade antes da resolução e respeita os pisos", () => {
    const tentativas = planejarTentativasFotoFachada(entrada);
    expect(tentativas.slice(0, 5).map((item) => item.qualidade))
      .toEqual([0.82, 0.74, 0.66, 0.58, 0.55]);
    expect(tentativas[0]).toMatchObject({ largura: 1600, altura: 1067 });
    expect(tentativas.at(-1)).toMatchObject({ largura: 1024, altura: 683, qualidade: 0.55 });
    expect(Math.min(...tentativas.map((item) => Math.max(item.largura, item.altura))))
      .toBe(1024);
  });

  it("para ao atingir 400 KB e produz miniatura de 320 px", async () => {
    const chamadas: TentativaCodificacaoFoto[] = [];
    const resultado = await processarFotoFachada(entrada, (tentativa) => {
      chamadas.push(tentativa);
      return {
        conteudo: tentativa.finalidade,
        bytes: tentativa.finalidade === "miniatura"
          ? 30_000
          : tentativa.qualidade <= 0.66 ? ALVO_BYTES_FOTO_FACHADA : 500_000,
      };
    });
    expect(resultado.original.qualidade).toBe(0.66);
    expect(resultado.original.bytes).toBe(ALVO_BYTES_FOTO_FACHADA);
    expect(resultado.miniatura).toMatchObject({ largura: 320, altura: 213, qualidade: 0.7 });
    expect(resultado.exifPreservado).toBe(false);
    expect(chamadas.filter((item) => item.finalidade === "original")).toHaveLength(3);
  });

  it("aceita arquivo acima do alvo quando chegou aos pisos e continua abaixo de 5 MB", async () => {
    const resultado = await processarFotoFachada(entrada, (tentativa) => ({
      conteudo: tentativa.finalidade,
      bytes: tentativa.finalidade === "miniatura" ? 40_000 : 700_000,
    }));
    expect(resultado.original).toMatchObject({ largura: 1024, altura: 683, qualidade: 0.55, bytes: 700_000 });
  });

  it("recusa MIME inválido e resultado que ainda excede o limite do bucket", async () => {
    expect(() => planejarTentativasFotoFachada({ ...entrada, mimeType: "image/png" }))
      .toThrowError(ErroFotoFachada);
    expect(() => planejarTentativasFotoFachada({
      ...entrada,
      mimeSaida: "image/png" as "image/jpeg",
    })).toThrowError(ErroFotoFachada);
    await expect(processarFotoFachada(entrada, (tentativa) => ({
      conteudo: tentativa.finalidade,
      bytes: tentativa.finalidade === "miniatura" ? 40_000 : LIMITE_BYTES_FOTO_FACHADA + 1,
    }))).rejects.toMatchObject({ codigo: "arquivo-muito-grande" });
  });

  it("não chama IA nem adiciona dependência de imagem", () => {
    const fonte = readFileSync(new URL("../lib/calculo/fotoFachada.ts", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/(?:servidor\/ia|\/api\/ia|openai|sharp)/i);
    expect(fonte).not.toMatch(/^import /m);
  });
});
