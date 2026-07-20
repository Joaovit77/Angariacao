/* Testes do store global (Etapa 3) — espelho do STATE legado. */
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/lib/store";

const estadoExemplo = {
  imoveis: [{ id: "x1", endereco: "Rua A, 1", status: "Novo contato" }],
  metas: { "2026-07": { angariacoes: 5, locados: 2, comissao: 5000, faturamento: 12000 } },
  agenda: [{ id: "a1", title: "t", type: "Visita", date: "2026-07-10", done: false, isVerificacaoDisponibilidade: false }],
  abordagens: [{ id: "ab1", nome: "Avaliação gratuita", arquivada: false }],
  config: { comissaoPercent: 50, agendaTipos: [], whatsappModelos: [], empresa: "" },
};

beforeEach(() => {
  useAppStore.getState().limparEstado();
});

describe("useAppStore", () => {
  it("estado inicial espelha o STATE legado (vazio, comissaoPercent 100)", () => {
    const s = useAppStore.getState();
    expect(s.imoveis).toEqual([]);
    expect(s.metas).toEqual({});
    expect(s.agenda).toEqual([]);
    expect(s.abordagens).toEqual([]);
    expect(s.config).toEqual({ comissaoPercent: 100, agendaTipos: [], whatsappModelos: [], empresa: "" });
    expect(s.carregado).toBe(false);
    // Começa false de propósito: sem confirmação do servidor, a UI não
    // oferece os botões de IA.
    expect(s.iaDisponivel).toBe(false);
  });

  it("limparEstado (logout) também desliga a IA", () => {
    useAppStore.getState().setIaDisponivel(true);
    useAppStore.getState().limparEstado();
    expect(useAppStore.getState().iaDisponivel).toBe(false);
  });

  it("setEstado grava o resultado de carregarEstado e marca carregado", () => {
    useAppStore.getState().setEstado(estadoExemplo);
    const s = useAppStore.getState();
    expect(s.imoveis).toHaveLength(1);
    expect(s.abordagens).toHaveLength(1);
    expect(s.config.comissaoPercent).toBe(50);
    expect(s.carregado).toBe(true);
  });

  it("limparEstado (logout) volta tudo ao inicial", () => {
    useAppStore.getState().setEstado(estadoExemplo);
    useAppStore.getState().limparEstado();
    const s = useAppStore.getState();
    expect(s.imoveis).toEqual([]);
    expect(s.abordagens).toEqual([]);
    expect(s.config).toEqual({ comissaoPercent: 100, agendaTipos: [], whatsappModelos: [], empresa: "" });
    expect(s.carregado).toBe(false);
  });
});
