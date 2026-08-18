import { afterEach, describe, expect, it } from "vitest";
import { useRascunhoFollowUp } from "@/lib/rascunhoFollowUp";

afterEach(() => useRascunhoFollowUp.getState().limpar());

describe("rascunho diário do follow-up", () => {
  it("mantém roteiro e texto entre as duas aberturas do mesmo dia", () => {
    const escolha = { abordagemId: "ab-1", base: "Olá, {nome}" };
    useRascunhoFollowUp.getState().salvarEscolha("2026-08-18", "origem:portal", escolha);

    expect(useRascunhoFollowUp.getState().escolhas["origem:portal"]).toEqual(escolha);
  });

  it("descarta escolhas do dia anterior ao salvar a primeira de hoje", () => {
    const store = useRascunhoFollowUp.getState();
    store.salvarEscolha("2026-08-17", "origem:ontem", { abordagemId: "a", base: "Ontem" });
    store.salvarEscolha("2026-08-18", "origem:hoje", { abordagemId: "b", base: "Hoje" });

    expect(useRascunhoFollowUp.getState()).toMatchObject({
      dia: "2026-08-18",
      escolhas: { "origem:hoje": { abordagemId: "b", base: "Hoje" } },
    });
    expect(useRascunhoFollowUp.getState().escolhas["origem:ontem"]).toBeUndefined();
  });
});
