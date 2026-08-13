import { describe, expect, it } from "vitest";
import { focoInteligenteDoDia } from "@/lib/calculo/focoDia";
import type { AgendaItem, Imovel } from "@/lib/tipos";

const HOJE = "2026-08-13";

function imovel(over: Partial<Imovel> = {}): Imovel {
  return { id: "i1", codigo: "LD-1", endereco: "Rua A, 10", status: "Novo contato", ...over };
}

function compromisso(over: Partial<AgendaItem> & { id: string; date: string }): AgendaItem {
  return {
    title: "Retornar proprietário",
    type: "Follow-up",
    done: false,
    isVerificacaoDisponibilidade: false,
    ...over,
  };
}

describe("focoInteligenteDoDia", () => {
  it("coloca resposta de captação antes de compromisso atrasado e compromisso de hoje", () => {
    const lead = imovel({
      notas: [{ id: "wa:m1", texto: "Podemos conversar", data: "2026-08-13T09:00:00" }],
    });
    const foco = focoInteligenteDoDia(
      [lead],
      [
        compromisso({ id: "atrasado", date: "2026-08-10" }),
        compromisso({ id: "hoje", date: HOJE, title: "Enviar documentos" }),
      ],
      [],
      HOJE,
    );

    expect(foco.acoes.slice(0, 3).map((a) => a.tipo)).toEqual(["resposta", "atrasado", "hoje"]);
    expect(foco.respostasPendentes).toBe(1);
    expect(foco.compromissosVencidos).toBe(1);
  });

  it("não repete o mesmo imóvel quando ele tem resposta e compromisso", () => {
    const lead = imovel({
      notas: [{ id: "wa:m1", texto: "Tenho interesse", data: "2026-08-13T08:00:00" }],
    });
    const foco = focoInteligenteDoDia(
      [lead],
      [compromisso({ id: "a1", date: "2026-08-12", imovelId: lead.id })],
      [],
      HOJE,
    );

    expect(foco.acoes.filter((a) => a.imovelId === lead.id)).toHaveLength(1);
    expect(foco.acoes[0].tipo).toBe("resposta");
  });

  it("usa a prospecção como próxima ação quando não há pendência operacional", () => {
    const historico = imovel({
      id: "antigo",
      origemImovel: "Marketplace",
      statusHistory: [{ status: "Novo contato", date: "2026-08-10" }],
    });
    const foco = focoInteligenteDoDia([historico], [], ["Marketplace"], HOJE);

    expect(foco.acoes[0]).toMatchObject({ tipo: "prospeccao", titulo: "Prospectar no Marketplace" });
    expect(foco.planoProspeccao.ritmo).toBe(1);
  });

  it("ignora compromissos concluídos e futuros", () => {
    const foco = focoInteligenteDoDia(
      [],
      [
        compromisso({ id: "feito", date: HOJE, done: true }),
        compromisso({ id: "futuro", date: "2026-08-14" }),
      ],
      [],
      HOJE,
    );

    expect(foco.acoes).toEqual([]);
    expect(foco.compromissosHoje).toBe(0);
  });
});
