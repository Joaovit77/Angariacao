import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuscaRadar } from "@/lib/calculo/radarAngariacao";

const mocks = vi.hoisted(() => ({
  buscarNaCentral: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock("@/lib/centralAngariacao", () => ({ buscarNaCentral: mocks.buscarNaCentral }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));

import { verificarBuscaRadar } from "@/lib/radarAngariacao";

const busca: BuscaRadar = {
  id: "busca-1",
  nome: "Centro",
  filtros: { portal: "olx", cidade: "Londrina", estado: "PR" },
  ativo: true,
  ultimoCheck: null,
  ultimoCheckAutomatico: null,
  ultimoCheckOrigem: null,
  criadoEm: "2026-09-10T12:00:00.000Z",
};

function clienteFalso() {
  const atualizarEq = vi.fn().mockResolvedValue({ error: null });
  const atualizar = vi.fn().mockReturnValue({ eq: atualizarEq });
  const selecionarExistentesEq = vi.fn().mockResolvedValue({ data: [], error: null });
  const selecionarExistentes = vi.fn().mockReturnValue({ eq: selecionarExistentesEq });
  const from = vi.fn((tabela: string) => {
    if (tabela === "radar_buscas") return { update: atualizar };
    if (tabela === "radar_anuncios") return { select: selecionarExistentes };
    throw new Error(`Tabela inesperada: ${tabela}`);
  });
  return { cliente: { from }, atualizar };
}

describe("persistência da origem do Radar no navegador", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buscarNaCentral.mockResolvedValue({ ok: true, anuncios: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["manual", "navegador"] as const)(
    "%s atualiza a coleta geral sem alterar a execução automática",
    async (origem) => {
      const banco = clienteFalso();
      mocks.getSupabase.mockReturnValue(banco.cliente);

      await verificarBuscaRadar("usuario-1", busca, origem);

      expect(banco.atualizar).toHaveBeenCalledWith({
        ultimo_check: expect.any(String),
        ultimo_check_origem: origem,
      });
      expect(banco.atualizar.mock.calls[0][0]).not.toHaveProperty("ultimo_check_automatico");
    },
  );

  it("registra a origem mesmo quando a consulta manual falha", async () => {
    const banco = clienteFalso();
    mocks.getSupabase.mockReturnValue(banco.cliente);
    mocks.buscarNaCentral.mockResolvedValue({ ok: false, aviso: "Portal indisponível" });

    await expect(verificarBuscaRadar("usuario-1", busca, "manual"))
      .rejects.toThrow("Portal indisponível");

    expect(banco.atualizar).toHaveBeenCalledWith({
      ultimo_check: expect.any(String),
      ultimo_check_origem: "manual",
    });
    expect(banco.atualizar.mock.calls[0][0]).not.toHaveProperty("ultimo_check_automatico");
  });
});
