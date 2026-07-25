/* O eixo de CAPTAÇÃO (conversaoCaptacao em lib/calculo/motor.ts).
   Feature nova da pós-migração — sem oráculo do app antigo. O que cada caso
   protege está no bloco de cabeçalho da função. */
import { describe, expect, it } from "vitest";
import { conversaoCaptacao } from "@/lib/calculo/motor";
import type { Imovel, StatusHistoryEntry } from "@/lib/tipos";
import { congelaRelogio } from "./setup-relogio";

congelaRelogio();

function imovel(id: string, status: string, historico: string[], extra: Partial<Imovel> = {}): Imovel {
  const statusHistory: StatusHistoryEntry[] = historico.map((s, n) => ({
    status: s,
    date: `2026-07-0${n + 1}`,
  }));
  return { id, endereco: `Rua ${id}`, status, statusHistory, ...extra };
}

describe("conversaoCaptacao", () => {
  it("carteira vazia não inventa taxa", () => {
    const c = conversaoCaptacao([]);
    expect(c).toEqual({ decididos: 0, angariados: 0, perdidosAntesDeAngariar: 0, emAberto: 0, taxa: null });
  });

  it("só com leads em aberto a taxa é null, não 0%", () => {
    // 0% diria "você não fecha nada"; a verdade é que ainda não deu desfecho.
    const c = conversaoCaptacao([
      imovel("a", "Novo contato", ["Novo contato"]),
      imovel("b", "Visita agendada", ["Novo contato", "Visita agendada"]),
    ]);
    expect(c.emAberto).toBe(2);
    expect(c.decididos).toBe(0);
    expect(c.taxa).toBeNull();
  });

  it("angariado e depois perdido continua contando como angariado", () => {
    // A captação foi ganha; a perda veio depois, em outra etapa. Ler o status
    // atual apagaria o trabalho que deu certo.
    const c = conversaoCaptacao([imovel("a", "Perdido", ["Novo contato", "Angariado", "Perdido"])]);
    expect(c.angariados).toBe(1);
    expect(c.perdidosAntesDeAngariar).toBe(0);
    expect(c.taxa).toBe(100);
  });

  it("perdido sem nunca angariar é a derrota que a taxa mede", () => {
    const c = conversaoCaptacao([
      imovel("a", "Perdido", ["Novo contato", "Perdido"]),
      imovel("b", "Cancelado", ["Novo contato", "Cancelado"]),
      imovel("c", "Angariado", ["Novo contato", "Angariado"]),
    ]);
    expect(c).toMatchObject({ angariados: 1, perdidosAntesDeAngariar: 2, decididos: 3, emAberto: 0 });
    expect(c.taxa).toBeCloseTo(33.333, 2);
  });

  it("os leads em aberto não diluem a taxa", () => {
    const decididos = [
      imovel("a", "Angariado", ["Novo contato", "Angariado"]),
      imovel("b", "Perdido", ["Novo contato", "Perdido"]),
    ];
    const comAbertos = [...decididos, ...Array.from({ length: 20 }, (_, n) => imovel(`x${n}`, "Novo contato", ["Novo contato"]))];
    // Vinte leads novos são vinte oportunidades, não vinte derrotas: a taxa não
    // se move, só o "em disputa".
    expect(conversaoCaptacao(comAbertos).taxa).toBe(conversaoCaptacao(decididos).taxa);
    expect(conversaoCaptacao(comAbertos).emAberto).toBe(20);
  });

  it("Locado sem a etapa Angariado no histórico conta como captação ganha", () => {
    // Não se aluga o que não se captou. Sem esta regra o desfecho mais positivo
    // que existe cairia em "ainda em disputa".
    const c = conversaoCaptacao([imovel("a", "Locado", ["Novo contato", "Locado"])]);
    expect(c.angariados).toBe(1);
    expect(c.emAberto).toBe(0);
    expect(c.taxa).toBe(100);
  });

  it("unidade desdobrada não conta como captação nova", () => {
    // Uma conversa ganha continua sendo uma, mesmo virando quatro linhas na
    // carteira — a mesma regra das quatro funções de esforço do motor.
    const principal = imovel("galpao", "Angariado", ["Novo contato", "Angariado"]);
    const salas = ["s1", "s2", "s3"].map((id) =>
      imovel(id, "Angariado", ["Novo contato", "Angariado"], { imovelPrincipalId: "galpao" }),
    );
    const c = conversaoCaptacao([principal, ...salas]);
    expect(c.angariados).toBe(1);
    expect(c.decididos).toBe(1);
  });
});
