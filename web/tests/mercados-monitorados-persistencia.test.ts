import { beforeEach, describe, expect, it, vi } from "vitest";

const estadoMock = vi.hoisted(() => ({
  cliente: null as unknown,
}));

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => estadoMock.cliente,
}));

import {
  carregarMercadosMonitorados,
  criarMercadoMonitorado,
  definirMercadoMonitoradoAtivo,
  excluirMercadoMonitorado,
} from "@/lib/persistencia/mercadosMonitorados";

const LINHA = {
  id: "mercado-1",
  cidade: "Campinas",
  estado: "SP",
  cidade_chave: "campinas",
  finalidade: "locacao",
  segmento: "residencial",
  ativo: true,
  frequencia_dias: 30,
  proxima_execucao_em: null,
  ultima_tentativa_em: null,
  ultimo_sucesso_em: null,
  falhas_consecutivas: 0,
  ultimo_erro_codigo: null,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
} as const;

function clienteFalso(opcoes: { erroInsert?: { code: string; message: string } } = {}) {
  const insert = vi.fn();
  const update = vi.fn();
  const apagar = vi.fn();
  const eq = vi.fn(async () => ({ error: null }));
  const single = vi.fn(async () => ({
    data: opcoes.erroInsert ? null : LINHA,
    error: opcoes.erroInsert || null,
  }));
  const selectDepoisInsert = vi.fn(() => ({ single }));
  insert.mockReturnValue({ select: selectDepoisInsert });
  update.mockReturnValue({ eq });
  apagar.mockReturnValue({ eq });

  const selectLista = vi.fn(() => ({
    order: vi.fn(async () => ({ data: [LINHA], error: null })),
  }));
  const from = vi.fn(() => ({
    select: selectLista,
    insert,
    update,
    delete: apagar,
  }));
  const auth = {
    getUser: vi.fn(async () => ({
      data: { user: { id: "usuario-autenticado" } },
      error: null,
    })),
  };
  return { auth, from, insert, update, apagar, eq };
}

describe("persistência de mercados monitorados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista os mercados visíveis pela RLS", async () => {
    const cliente = clienteFalso();
    estadoMock.cliente = cliente;

    await expect(carregarMercadosMonitorados()).resolves.toEqual([
      expect.objectContaining({ id: "mercado-1", cidade: "Campinas", estado: "SP" }),
    ]);
    expect(cliente.from).toHaveBeenCalledWith("mercados_monitorados");
  });

  it("descobre o owner pela sessão e não envia cidade_chave nem dispara coleta", async () => {
    const cliente = clienteFalso();
    estadoMock.cliente = cliente;

    await criarMercadoMonitorado({
      cidade: " Campinas ",
      estado: "sp",
      finalidade: "locacao",
      segmento: "residencial",
    });

    expect(cliente.auth.getUser).toHaveBeenCalledOnce();
    expect(cliente.insert).toHaveBeenCalledWith({
      user_id: "usuario-autenticado",
      cidade: "Campinas",
      estado: "SP",
      finalidade: "locacao",
      segmento: "residencial",
      frequencia_dias: 30,
      proxima_execucao_em: null,
    });
  });

  it("traduz a unicidade do banco em erro de domínio", async () => {
    const cliente = clienteFalso({ erroInsert: { code: "23505", message: "duplicate key" } });
    estadoMock.cliente = cliente;

    await expect(criarMercadoMonitorado({
      cidade: "Campinas",
      estado: "SP",
      finalidade: "locacao",
      segmento: "residencial",
    })).rejects.toThrow("Esse mercado já está configurado.");
  });

  it("ativa, desativa e exclui pela chave da linha; a RLS mantém o owner", async () => {
    const cliente = clienteFalso();
    estadoMock.cliente = cliente;

    await definirMercadoMonitoradoAtivo("mercado-1", false);
    await excluirMercadoMonitorado("mercado-1");

    expect(cliente.update).toHaveBeenCalledWith(expect.objectContaining({ ativo: false }));
    expect(cliente.apagar).toHaveBeenCalledOnce();
    expect(cliente.eq).toHaveBeenNthCalledWith(1, "id", "mercado-1");
    expect(cliente.eq).toHaveBeenNthCalledWith(2, "id", "mercado-1");
  });
});
