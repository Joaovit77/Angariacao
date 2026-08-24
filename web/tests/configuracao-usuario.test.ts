import { describe, expect, it } from "vitest";
import {
  configuracaoPadrao,
  origensAprendidas,
  origensDoUsuario,
  tiposAgendaAprendidos,
  tiposAgendaDoUsuario,
} from "@/lib/configuracaoUsuario";

describe("configuração por usuário", () => {
  it("cria padrões independentes para contas e resets", () => {
    const primeira = configuracaoPadrao();
    const segunda = configuracaoPadrao();

    primeira.agendaTipos.push("Avaliação");
    expect(segunda.agendaTipos).toEqual([]);
    expect(segunda.comissaoPercent).toBe(100);
  });

  it("aprende portais da carteira sem persistir duplicatas dos padrões ou preferências", () => {
    const imoveis = [
      { origemImovel: "Marketplace" },
      { origemImovel: " marketplace " },
      { origemImovel: "OLX / Canal Pro" },
      { origemImovel: "Grupo de Zap" },
      { origemImovel: null },
    ];

    expect(origensAprendidas(imoveis, ["Grupo de Zap"])).toEqual(["Marketplace"]);
    expect(origensDoUsuario(["Grupo de Zap"], imoveis)).toEqual(expect.arrayContaining([
      "OLX / Canal Pro",
      "Grupo de Zap",
      "Marketplace",
    ]));
  });

  it("aprende tipos da agenda e trata acento e caixa como o mesmo valor", () => {
    const agenda = [
      { type: "Avaliação" },
      { type: "avaliacao" },
      { type: "Visita" },
      { type: "Sessão de fotos" },
    ];

    expect(tiposAgendaAprendidos(agenda, ["Sessão de fotos"])).toEqual(["Avaliação"]);
    const tipos = tiposAgendaDoUsuario(["Sessão de fotos"], agenda);
    expect(tipos.filter((tipo) => tipo.toLowerCase().startsWith("avalia"))).toHaveLength(1);
    expect(tipos).toContain("Sessão de fotos");
  });
});
