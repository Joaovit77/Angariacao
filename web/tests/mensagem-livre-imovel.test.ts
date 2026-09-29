import { describe, expect, it } from "vitest";
import { STATUS_ALL } from "@/lib/constantes";
import { DISPONIBILIDADE_STATUS_ALVO } from "@/lib/calculo/followup";
import {
  STATUS_BLOQUEIAM_MENSAGEM_LIVRE,
  imovelBloqueiaMensagemLivre,
} from "@/lib/calculo/mensagemLivreImovel";

/* LD-163: a regra única que o worker e o modal leem. */

describe("imovelBloqueiaMensagemLivre", () => {
  it("bloqueia exatamente Perdido e Locado", () => {
    expect([...STATUS_BLOQUEIAM_MENSAGEM_LIVRE]).toEqual(["Perdido", "Locado"]);
    expect(imovelBloqueiaMensagemLivre({ status: "Perdido" })).toBe(true);
    expect(imovelBloqueiaMensagemLivre({ status: "Locado" })).toBe(true);
  });

  it("bloqueia imóvel retirado em qualquer status", () => {
    for (const status of ["Publicado", "Angariado", "Em negociação", null]) {
      expect(imovelBloqueiaMensagemLivre({ status, retirado: true })).toBe(true);
    }
  });

  it("não bloqueia nenhum outro status do funil nem os terminais negativos fora da lista", () => {
    const todos = new Set<string>([...STATUS_ALL, "Pausado"]);
    for (const status of todos) {
      if (status === "Perdido" || status === "Locado") continue;
      expect(imovelBloqueiaMensagemLivre({ status, retirado: false })).toBe(false);
      expect(imovelBloqueiaMensagemLivre({ status, retirado: null })).toBe(false);
    }
  });

  it("não é o alvo do M4: status fora do alvo da verificação continuam aceitando livre", () => {
    const alvo: readonly string[] = DISPONIBILIDADE_STATUS_ALVO;
    expect(alvo).not.toContain("Em negociação");
    expect(imovelBloqueiaMensagemLivre({ status: "Em negociação" })).toBe(false);
  });

  it("status ausente não bloqueia sozinho", () => {
    expect(imovelBloqueiaMensagemLivre({ status: null })).toBe(false);
    expect(imovelBloqueiaMensagemLivre({ status: undefined, retirado: false })).toBe(false);
  });
});
