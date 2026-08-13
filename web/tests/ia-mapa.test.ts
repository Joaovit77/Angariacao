import { describe, expect, it } from "vitest";
import { ESQUEMA_ACAO_TERRITORIAL, promptAcaoTerritorial } from "@/lib/calculo/ia";

describe("leitura territorial por IA", () => {
  it("exige uma ação estruturada e limita o prompt aos números calculados", () => {
    expect(ESQUEMA_ACAO_TERRITORIAL.required).toEqual(["acao"]);
    const prompt = promptAcaoTerritorial({
      oportunidade: { bairro: "Centro", total: 10, ganhas: 4, conversao: 40 },
      atencao: { bairro: "Norte", total: 8, ganhas: 0, conversao: 0 },
      concentracao: { bairro: "Centro", total: 10, ganhas: 4, conversao: 40 },
      mediaConversao: 22.2,
    });
    expect(prompt).toContain("Centro, 10 registro(s), 4 captação(ões), 40.0%");
    expect(prompt).toContain("no máximo 150 caracteres");
    expect(prompt).toContain("Não recalcule nem invente dados");
  });
});
