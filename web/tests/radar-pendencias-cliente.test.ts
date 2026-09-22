// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Imovel } from "@/lib/tipos";

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
}));

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));
vi.mock("@/lib/centralAngariacao", () => ({ buscarNaCentral: vi.fn() }));

import {
  atualizarPendenciasRadar,
  carregarCandidatosPendentesRadar,
  EVENTO_PENDENCIAS_RADAR,
  marcarRadarComoVisto,
  recalcularPendenciasRadar,
} from "@/lib/radarAngariacao";
import { useAppStore } from "@/lib/store";

const linhaRpc = (id: string, parcial: Record<string, unknown> = {}) => ({
  id,
  busca_id: "busca-olx",
  portal: "olx",
  id_externo: `ext-${id}`,
  url: `https://pr.olx.com.br/imoveis/anuncio-${id}`,
  titulo: "Alugo apartamento",
  descricao: null,
  endereco: null,
  cidade: "Londrina",
  estado: null,
  ...parcial,
});

function clienteFalso(linhas: unknown[]) {
  const rpc = vi.fn().mockResolvedValue({ data: linhas, error: null });
  const selecionarBuscas = vi.fn().mockResolvedValue({
    data: [{ id: "busca-olx", filtros: { portal: "olx", cidade: "Londrina", estado: "PR" } }],
    error: null,
  });
  const atualizarEq = vi.fn().mockResolvedValue({ error: null });
  const atualizar = vi.fn().mockReturnValue({ eq: atualizarEq });
  const from = vi.fn((tabela: string) => {
    if (tabela === "radar_buscas") return { select: selecionarBuscas };
    if (tabela === "radar_anuncios") return { update: atualizar };
    throw new Error(`Tabela inesperada: ${tabela}`);
  });
  return { cliente: { rpc, from }, rpc, atualizar, atualizarEq };
}

describe("fonte única das pendências do Radar no navegador (R4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ radarNovos: 0, imoveis: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lê os candidatos pela RPC, sem limite de janela, e mapeia os campos leves", async () => {
    const banco = clienteFalso([linhaRpc("a1", { portal: "chaves-na-mao", endereco: "Rua Pará, 100", estado: "PR" })]);
    mocks.getSupabase.mockReturnValue(banco.cliente);

    const candidatos = await carregarCandidatosPendentesRadar();

    expect(banco.rpc).toHaveBeenCalledWith("candidatos_pendentes_radar");
    expect(candidatos).toEqual([{
      id: "a1",
      buscaId: "busca-olx",
      anuncio: {
        portal: "chaves-na-mao",
        idExterno: "ext-a1",
        url: "https://pr.olx.com.br/imoveis/anuncio-a1",
        titulo: "Alugo apartamento",
        descricao: null,
        endereco: "Rua Pará, 100",
        cidade: "Londrina",
        estado: "PR",
      },
    }]);
  });

  it("escreve o contador e publica o mesmo resumo para a tela", async () => {
    mocks.getSupabase.mockReturnValue(clienteFalso([linhaRpc("a1"), linhaRpc("a2")]).cliente);
    const recebidos: number[] = [];
    const ouvir = (evento: Event) => recebidos.push((evento as CustomEvent<{ total: number }>).detail.total);
    window.addEventListener(EVENTO_PENDENCIAS_RADAR, ouvir);

    const resumo = await atualizarPendenciasRadar();
    window.removeEventListener(EVENTO_PENDENCIAS_RADAR, ouvir);

    expect(resumo.total).toBe(2);
    expect(useAppStore.getState().radarNovos).toBe(2);
    expect(recebidos).toEqual([2]);
  });

  it("o contador cai quando a RPC deixa de devolver o anúncio aberto", async () => {
    mocks.getSupabase.mockReturnValue(clienteFalso([linhaRpc("a1"), linhaRpc("a2")]).cliente);
    await atualizarPendenciasRadar();
    expect(useAppStore.getState().radarNovos).toBe(2);

    // Depois de "Ver anúncio", a visualização existe e a RPC não devolve mais a1.
    mocks.getSupabase.mockReturnValue(clienteFalso([linhaRpc("a2")]).cliente);
    await atualizarPendenciasRadar();
    expect(useAppStore.getState().radarNovos).toBe(1);
  });

  it("imóvel novo no pipeline recalcula a partir da última leitura, sem nova consulta", async () => {
    const banco = clienteFalso([linhaRpc("a1"), linhaRpc("a2")]);
    mocks.getSupabase.mockReturnValue(banco.cliente);
    await atualizarPendenciasRadar();
    expect(banco.rpc).toHaveBeenCalledOnce();

    const importado = {
      id: "imovel-1",
      endereco: "",
      cidade: "Londrina",
      status: "Novo contato",
      textoAnuncio: "Link original: https://pr.olx.com.br/imoveis/anuncio-a1",
    } as Imovel;
    useAppStore.setState({ imoveis: [importado] });
    const resumo = recalcularPendenciasRadar();

    expect(resumo?.total).toBe(1);
    expect(useAppStore.getState().radarNovos).toBe(1);
    expect(banco.rpc).toHaveBeenCalledOnce();
  });

  it("\"Marcar todos como vistos\" continua marcando visto em todos os não vistos", async () => {
    const banco = clienteFalso([]);
    mocks.getSupabase.mockReturnValue(banco.cliente);

    await marcarRadarComoVisto();

    expect(banco.atualizar).toHaveBeenCalledWith({ visto: true });
    expect(banco.atualizarEq).toHaveBeenCalledWith("visto", false);
  });

  it("falha da RPC propaga sem zerar o contador anterior", async () => {
    mocks.getSupabase.mockReturnValue(clienteFalso([linhaRpc("a1")]).cliente);
    await atualizarPendenciasRadar();
    const falho = clienteFalso([]);
    falho.rpc.mockResolvedValue({ data: null, error: new Error("rpc indisponível") });
    mocks.getSupabase.mockReturnValue(falho.cliente);

    await expect(atualizarPendenciasRadar()).rejects.toThrow("rpc indisponível");
    expect(useAppStore.getState().radarNovos).toBe(1);
  });
});
