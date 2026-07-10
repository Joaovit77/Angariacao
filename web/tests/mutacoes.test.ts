/* ================================================================
   Invariante do statusHistory (§3.1 do MIGRATION_NEXT.md).
   Caracteriza o trecho do saveImovel() antigo que empurra a
   transição no histórico — agora centralizado em
   aplicarMudancaDeStatus(), por onde TODO fluxo de mudança passa.
   ================================================================ */
import { describe, expect, it } from "vitest";
import { congelaRelogio } from "./setup-relogio";
import { aplicarMudancaDeStatus, numOrNull } from "@/lib/mutacoes";
import type { Imovel } from "@/lib/tipos";

congelaRelogio();

const HOJE = "2026-07-09";

function imovelBase(statusHistory: Imovel["statusHistory"], status = "Novo contato"): Imovel {
  return { id: "x", endereco: "Rua A", status, statusHistory };
}

describe("aplicarMudancaDeStatus", () => {
  it("empurra a transição com a data de hoje quando o status muda", () => {
    const i = imovelBase([{ status: "Novo contato", date: "2026-06-01" }], "Visita agendada");
    aplicarMudancaDeStatus(i, "Visita agendada", "Novo contato");
    expect(i.statusHistory).toEqual([
      { status: "Novo contato", date: "2026-06-01" },
      { status: "Visita agendada", date: HOJE },
    ]);
  });

  it("não registra nada quando o status não mudou", () => {
    const i = imovelBase([{ status: "Angariado", date: "2026-06-01" }], "Angariado");
    aplicarMudancaDeStatus(i, "Angariado", "Angariado");
    expect(i.statusHistory).toEqual([{ status: "Angariado", date: "2026-06-01" }]);
  });

  it("não duplica quando a última entrada já é o status novo", () => {
    // Caso do registro antigo cujo status atual e histórico já concordam,
    // mas o statusAnterior chega diferente (ex.: dado importado).
    const i = imovelBase([{ status: "Locado", date: "2026-05-01" }], "Locado");
    aplicarMudancaDeStatus(i, "Locado", "Publicado");
    expect(i.statusHistory).toEqual([{ status: "Locado", date: "2026-05-01" }]);
  });

  it("num imóvel novo (sem status anterior) registra o status inicial", () => {
    const i = imovelBase([], "Novo contato");
    aplicarMudancaDeStatus(i, "Novo contato", null);
    expect(i.statusHistory).toEqual([{ status: "Novo contato", date: HOJE }]);
  });

  it("histórico ausente vira array com a transição", () => {
    const i = imovelBase(null, "Publicado");
    aplicarMudancaDeStatus(i, "Publicado", "Angariado");
    expect(i.statusHistory).toEqual([{ status: "Publicado", date: HOJE }]);
  });
});

describe("numOrNull", () => {
  it("converte como o app antigo", () => {
    expect(numOrNull("")).toBeNull();
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull(undefined)).toBeNull();
    expect(numOrNull("abc")).toBeNull();
    expect(numOrNull("0")).toBe(0);
    expect(numOrNull("12.5")).toBe(12.5);
  });
});
