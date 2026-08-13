import { describe, expect, it } from "vitest";
import { deslocarStatusKanban, moverStatusKanban, normalizarOrdemKanban, ordenarStatusKanban } from "@/lib/calculo/kanban";

const STATUS = ["Novo contato", "Visita", "Publicado", "Locado"];

describe("ordem das colunas do Kanban", () => {
  it("ordena as etapas mais usadas primeiro e preserva a ordem do funil nos empates", () => {
    const imoveis = [
      { status: "Publicado" }, { status: "Novo contato" },
      { status: "Publicado" }, { status: "Locado" },
    ];
    expect(ordenarStatusKanban(STATUS, imoveis, "mais-usados", [])).toEqual([
      "Publicado", "Novo contato", "Locado", "Visita",
    ]);
  });

  it("recupera preferência antiga sem duplicar e inclui etapas novas", () => {
    expect(normalizarOrdemKanban(STATUS, ["Locado", "inválido", "Locado", "Novo contato"]))
      .toEqual(["Locado", "Novo contato", "Visita", "Publicado"]);
  });

  it("move uma coluna para antes da coluna de destino", () => {
    expect(moverStatusKanban(STATUS, "Locado", "Visita")).toEqual([
      "Novo contato", "Locado", "Visita", "Publicado",
    ]);
  });

  it("desloca uma coluna uma posição para cada lado sem ultrapassar as pontas", () => {
    expect(deslocarStatusKanban(STATUS, "Publicado", -1)).toEqual([
      "Novo contato", "Publicado", "Visita", "Locado",
    ]);
    expect(deslocarStatusKanban(STATUS, "Novo contato", -1)).toEqual(STATUS);
  });
});
