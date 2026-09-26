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
  const ordem: string[] = [];
  const atualizarEq = vi.fn(async () => { ordem.push("atualizar_busca"); return { error: null }; });
  const atualizar = vi.fn().mockReturnValue({ eq: atualizarEq });
  const selecionarExistentesEq = vi.fn().mockResolvedValue({ data: [], error: null });
  const selecionarExistentes = vi.fn().mockReturnValue({ eq: selecionarExistentesEq });
  const selecionarInseridos = vi.fn(async () => {
    ordem.push("upsert_anuncios");
    return { data: [{ id: "anuncio-1", busca_id: busca.id, dados: anuncioNovo, visto: false, encontrado_em: "2026-09-10T12:00:00Z" }], error: null };
  });
  const upsert = vi.fn().mockReturnValue({ select: selecionarInseridos });
  const from = vi.fn((tabela: string) => {
    if (tabela === "radar_buscas") return { update: atualizar };
    if (tabela === "radar_anuncios") return { select: selecionarExistentes, upsert };
    throw new Error(`Tabela inesperada: ${tabela}`);
  });
  const getSession = vi.fn(async () => ({ data: { session: { access_token: "token-teste" } } }));
  return { cliente: { from, auth: { getSession } }, atualizar, upsert, ordem };
}

const anuncioNovo = {
  idExterno: "novo-1", portal: "olx" as const, titulo: "Casa em Londrina",
  cidade: "Londrina", estado: "PR", url: "https://exemplo.test/novo-1",
  preco: 1000, anunciante: "incerto" as const,
};

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

  it.each(["manual", "navegador"] as const)("preserva relógio de %s quando a consulta falha", async (origem) => {
    const banco = clienteFalso();
    mocks.getSupabase.mockReturnValue(banco.cliente);
    mocks.buscarNaCentral.mockResolvedValue({ ok: false, aviso: "Portal indisponível" });

    await expect(verificarBuscaRadar("usuario-1", busca, origem))
      .rejects.toThrow("Portal indisponível");

    expect(banco.atualizar).toHaveBeenCalledWith({
      ultimo_check: expect.any(String),
      ultimo_check_origem: origem,
    });
    expect(banco.atualizar.mock.calls[0][0]).not.toHaveProperty("ultimo_check_automatico");
  });

  it.each(["manual", "navegador"] as const)(
    "%s fecha telemetria com o ID do servidor só depois do upsert normal",
    async (origem) => {
      const banco = clienteFalso();
      mocks.getSupabase.mockReturnValue(banco.cliente);
      mocks.buscarNaCentral.mockResolvedValue({ ok: true, anuncios: [anuncioNovo], execucaoId: "id-do-servidor" });
      const requisicao = vi.fn(async (_url: string, opcoes: RequestInit) => {
        banco.ordem.push("fechamento");
        expect(JSON.parse(String(opcoes.body))).toEqual({
          execucaoId: "id-do-servidor", buscaId: busca.id, novos: 1,
        });
        return new Response(JSON.stringify({ ok: true }));
      });
      vi.stubGlobal("fetch", requisicao);

      const inseridos = await verificarBuscaRadar("usuario-1", busca, origem);

      expect(inseridos).toHaveLength(1);
      await vi.waitFor(() => expect(requisicao).toHaveBeenCalledOnce());
      expect(banco.ordem).toEqual(["upsert_anuncios", "atualizar_busca", "fechamento"]);
      expect(mocks.buscarNaCentral).toHaveBeenCalledWith(busca.filtros,
        origem === "navegador" ? "monitor_navegador" : "verificar_agora");
      vi.unstubAllGlobals();
    },
  );

  it("falha no fechamento não repete nem desfaz o upsert", async () => {
    const banco = clienteFalso();
    mocks.getSupabase.mockReturnValue(banco.cliente);
    mocks.buscarNaCentral.mockResolvedValue({ ok: true, anuncios: [anuncioNovo], execucaoId: "id-do-servidor" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("log indisponível"); }));

    const inseridos = await verificarBuscaRadar("usuario-1", busca, "manual");

    expect(inseridos).toHaveLength(1);
    expect(banco.upsert).toHaveBeenCalledOnce();
    expect(banco.ordem).toEqual(["upsert_anuncios", "atualizar_busca"]);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    vi.unstubAllGlobals();
  });

  it("fechamento lento não retém o resultado funcional do Radar", async () => {
    const banco = clienteFalso();
    mocks.getSupabase.mockReturnValue(banco.cliente);
    mocks.buscarNaCentral.mockResolvedValue({ ok: true, anuncios: [anuncioNovo], execucaoId: "id-do-servidor" });
    let liberar!: (resposta: Response) => void;
    const requisicao = vi.fn(() => new Promise<Response>((resolve) => { liberar = resolve; }));
    vi.stubGlobal("fetch", requisicao);

    const inseridos = await verificarBuscaRadar("usuario-1", busca, "manual");

    expect(inseridos).toHaveLength(1);
    expect(banco.upsert).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(requisicao).toHaveBeenCalledOnce());
    liberar(new Response(JSON.stringify({ ok: true })));
    vi.unstubAllGlobals();
  });
});
