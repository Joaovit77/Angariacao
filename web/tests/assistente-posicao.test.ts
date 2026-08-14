import { describe, expect, it } from "vitest";
import { limitarPosicaoAssistente } from "@/lib/assistente/posicao";

describe("posicao arrastavel do assistente", () => {
  it("mantem o painel inteiro dentro da viewport", () => {
    expect(limitarPosicaoAssistente(-100, -50, 410, 650, 1200, 900)).toEqual({ x: 8, y: 8 });
    expect(limitarPosicaoAssistente(2000, 1200, 410, 650, 1200, 900)).toEqual({ x: 782, y: 242 });
  });

  it("preserva uma posicao escolhida que ja e valida", () => {
    expect(limitarPosicaoAssistente(120, 80, 410, 650, 1200, 900)).toEqual({ x: 120, y: 80 });
  });
});
