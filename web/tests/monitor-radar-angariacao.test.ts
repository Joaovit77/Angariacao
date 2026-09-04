import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erroExternoSintetico } from "./fixtures/erroExterno";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/firecrawlCentralAngariacao", () => ({
  buscarComFirecrawl: mocks.buscarComFirecrawl,
}));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({
  salvarComparaveisMercado: mocks.salvarComparaveisMercado,
}));

import { executarMonitorRadar } from "@/lib/servidor/monitorRadarAngariacao";

const busca = {
  id: "busca-1",
  user_id: "usuario-radar",
  nome: "Centro",
  filtros: {
    portal: "olx" as const,
    cidade: "Londrina",
    estado: "PR",
    tipo: "Apartamento",
  },
  ativo: true,
  ultimo_check: null,
  created_at: "2026-08-01T12:00:00.000Z",
};

const anuncioValido: AnuncioCentralAngariacao = {
  idExterno: "novo-1",
  portal: "olx",
  titulo: "Apartamento com 2 quartos e 70 m²",
  preco: 2200,
  cidade: "Londrina",
  url: "https://www.olx.com.br/imovel/novo-1",
  anunciante: "incerto",
};

function clienteRadarFalso(
  existentes: Array<{ portal: string; id_externo: string }> = [],
) {
  const limitarBuscas = vi.fn().mockResolvedValue({ data: [busca], error: null });
  const ordenarBuscas = vi.fn().mockReturnValue({ limit: limitarBuscas });
  const filtrarBuscasAtivas = vi.fn().mockReturnValue({ order: ordenarBuscas });
  const selecionarBuscas = vi.fn().mockReturnValue({ eq: filtrarBuscasAtivas });
  const atualizarBuscaEq = vi.fn().mockResolvedValue({ error: null });
  const atualizarBusca = vi.fn().mockReturnValue({ eq: atualizarBuscaEq });

  const filtrarAnunciosDaBusca = vi.fn().mockResolvedValue({
    data: existentes,
    error: null,
  });
  const selecionarAnuncios = vi.fn().mockReturnValue({ eq: filtrarAnunciosDaBusca });
  const confirmarInsercao = vi.fn().mockResolvedValue({
    data: [{ id: "radar-anuncio-1" }],
    error: null,
  });
  const inserirAnuncios = vi.fn().mockReturnValue({ select: confirmarInsercao });

  const from = vi.fn((tabela: string) => {
    if (tabela === "radar_buscas") {
      return { select: selecionarBuscas, update: atualizarBusca };
    }
    if (tabela === "radar_anuncios") {
      return { select: selecionarAnuncios, upsert: inserirAnuncios };
    }
    throw new Error(`Tabela inesperada no teste: ${tabela}`);
  });

  return {
    cliente: { from },
    confirmarInsercao,
    inserirAnuncios,
    atualizarBusca,
  };
}

describe("monitor agendado do Radar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-teste");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    mocks.salvarComparaveisMercado.mockResolvedValue(1);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reaproveita uma coleta para salvar o anúncio novo e o comparável", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([anuncioValido]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ verificadas: 1, novos: 1, falhas: 0 });
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledWith(
      banco.cliente,
      "usuario-radar",
      [expect.objectContaining({ idExterno: "novo-1", areaM2: 70, quartos: 2 })],
      busca.filtros,
    );
    expect(banco.inserirAnuncios).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: "usuario-radar",
        busca_id: "busca-1",
        dados: expect.objectContaining({ idExterno: "novo-1", areaM2: 70 }),
        visto: false,
      }),
    ], {
      onConflict: "busca_id,portal,id_externo",
      ignoreDuplicates: true,
    });
  });

  it("preserva no Radar o anúncio que não atende aos critérios de comparável", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([{ ...anuncioValido, preco: null }]);
    mocks.salvarComparaveisMercado.mockResolvedValue(0);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ novos: 1, falhas: 0 });
    expect(banco.inserirAnuncios).toHaveBeenCalledOnce();
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledWith(
      banco.cliente,
      "usuario-radar",
      [expect.objectContaining({ idExterno: "novo-1", preco: null })],
      busca.filtros,
    );
  });

  it("reobserva o comparável sem recriar um alerta já conhecido", async () => {
    const banco = clienteRadarFalso([{ portal: "olx", id_externo: "novo-1" }]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([anuncioValido]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ novos: 0, falhas: 0 });
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledOnce();
    expect(banco.inserirAnuncios).not.toHaveBeenCalled();
  });

  it("não cria anúncios nem comparáveis artificiais quando a coleta vem vazia", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([]);
    mocks.salvarComparaveisMercado.mockResolvedValue(0);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ novos: 0, falhas: 0 });
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledWith(
      banco.cliente,
      "usuario-radar",
      [],
      busca.filtros,
    );
    expect(banco.inserirAnuncios).not.toHaveBeenCalled();
  });

  it("mantém o Radar bem-sucedido e registra separadamente a falha de comparáveis", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([anuncioValido]);
    mocks.salvarComparaveisMercado.mockRejectedValue(erroExternoSintetico());

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ novos: 1, falhas: 0 });
    expect(banco.inserirAnuncios).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[radar-cron] falha ao atualizar a base de comparáveis",
      { buscaId: "busca-1", portal: "olx", erro: {
        provider: "supabase", operation: "persistir_comparaveis", error_code: "comparable_persistence_failed", status: 403,
      } },
    );
  });

  it("preserva a falha atual do cron quando o Firecrawl não responde", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockRejectedValue(new Error("Firecrawl indisponível"));

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ verificadas: 1, novos: 0, falhas: 1 });
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
    expect(banco.inserirAnuncios).not.toHaveBeenCalled();
    expect(banco.atualizarBusca).toHaveBeenCalledOnce();
  });
});
