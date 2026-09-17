import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { erroExternoSintetico } from "./fixtures/erroExterno";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";

const mocks = vi.hoisted(() => ({
  buscarComFirecrawl: vi.fn(),
  createClient: vi.fn(),
  registrarEvento: vi.fn(),
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
vi.mock("@/lib/servidor/registro", () => ({
  registrarEvento: mocks.registrarEvento,
}));

import { executarMonitorRadar } from "@/lib/servidor/monitorRadarAngariacao";

interface BuscaRadarTeste {
  id: string;
  user_id: string;
  nome: string;
  filtros: {
    portal: "olx";
    cidade: string;
    estado: string;
    tipo: string;
  };
  ativo: boolean;
  ultimo_check: string | null;
  ultimo_check_automatico: string | null;
  ultimo_check_origem: "manual" | "navegador" | "cron" | null;
  created_at: string;
}

const busca: BuscaRadarTeste = {
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
  ultimo_check_automatico: null,
  ultimo_check_origem: null,
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
  buscas: BuscaRadarTeste[] = [busca],
) {
  const limitarBuscas = vi.fn().mockResolvedValue({ data: buscas, error: null });
  const ordenarCriacao = vi.fn().mockReturnValue({ limit: limitarBuscas });
  const ordenarBuscas = vi.fn().mockReturnValue({ order: ordenarCriacao });
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

function eventosRadar(evento: string) {
  return mocks.registrarEvento.mock.calls
    .map(([entrada]) => entrada)
    .filter((entrada) => entrada.evento === evento);
}

function detalheRadar(evento: string, indice = 0) {
  return JSON.parse(eventosRadar(evento)[indice].detalhe);
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
    expect(detalheRadar("radar-busca-ok")).toMatchObject({
      busca_id: "busca-1",
      portal: "olx",
      coletados: 1,
      apos_filtro: 1,
      novos: 1,
      origem_html: "firecrawl",
    });
    expect(banco.atualizarBusca).toHaveBeenCalledWith(expect.objectContaining({
      ultimo_check_automatico: expect.any(String),
      ultimo_check_origem: "cron",
    }));
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
    expect(detalheRadar("radar-busca-ok")).toMatchObject({ novos: 0 });
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
    expect(detalheRadar("radar-busca-vazia")).toMatchObject({
      busca_id: "busca-1",
      portal: "olx",
      coletados: 0,
      apos_filtro: 0,
      novos: 0,
      origem_html: "firecrawl",
      status_portal: "sem_cards",
    });
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

  it("classifica a falha do Firecrawl sem persistir conteúdo externo sensível", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockImplementation(async (_filtros, _url, registrarOrigem) => {
      registrarOrigem("firecrawl");
      throw Object.assign(
        new Error("<html>telefone 43999998888 https://olx.com.br/anuncio/segredo</html>"),
        { codigo: "firecrawl_timeout" },
      );
    });

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({
      verificadas: 1,
      novos: 0,
      falhas: 1,
      resultados: [{
        buscaId: "busca-1",
        ok: false,
        codigo: "firecrawl_timeout",
        origem_html: "firecrawl",
      }],
    });
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
    expect(banco.inserirAnuncios).not.toHaveBeenCalled();
    expect(banco.atualizarBusca).toHaveBeenCalledOnce();
    expect(banco.atualizarBusca).toHaveBeenCalledWith(expect.objectContaining({
      ultimo_check_automatico: expect.any(String),
      ultimo_check_origem: "cron",
    }));
    expect(detalheRadar("radar-busca-falhou")).toMatchObject({
      busca_id: "busca-1",
      portal: "olx",
      codigo: "firecrawl_timeout",
      etapa: "coleta",
      origem_html: "firecrawl",
    });
    const logsPersistentes = JSON.stringify(mocks.registrarEvento.mock.calls);
    expect(logsPersistentes).not.toContain("<html>");
    expect(logsPersistentes).not.toContain("43999998888");
    expect(logsPersistentes).not.toContain("olx.com.br/anuncio");
  });

  it.each(["cache", "firecrawl"] as const)(
    "expõe e persiste a origem %s da coleta",
    async (origem) => {
      const banco = clienteRadarFalso();
      mocks.createClient.mockReturnValue(banco.cliente);
      mocks.buscarComFirecrawl.mockImplementation(async (_filtros, _url, registrarOrigem) => {
        registrarOrigem(origem);
        return [anuncioValido];
      });

      const resumo = await executarMonitorRadar();

      expect(resumo.resultados[0]).toMatchObject({ origem_html: origem });
      expect(detalheRadar("radar-busca-ok")).toMatchObject({ origem_html: origem });
    },
  );

  it("uma falha do log de uma busca não altera a coleta", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([anuncioValido]);
    mocks.registrarEvento.mockImplementation(() => { throw new Error("log indisponível"); });

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ verificadas: 1, novos: 1, falhas: 0 });
    expect(banco.inserirAnuncios).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[radar-cron] falha ao agendar registro de observabilidade (ignorada)",
      expect.objectContaining({ provider: "supabase", error_code: "registration_failed" }),
    );
  });

  it("uma busca com falha não interrompe as demais", async () => {
    const segundaBusca = { ...busca, id: "busca-2", nome: "Gleba Palhano" };
    const banco = clienteRadarFalso([], [busca, segundaBusca]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl
      .mockRejectedValueOnce(Object.assign(new Error("falha"), { codigo: "firecrawl_429" }))
      .mockResolvedValueOnce([anuncioValido]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ verificadas: 2, novos: 1, falhas: 1 });
    expect(resumo.resultados).toEqual([
      expect.objectContaining({ buscaId: "busca-1", ok: false, codigo: "firecrawl_429" }),
      expect.objectContaining({ buscaId: "busca-2", ok: true, novos: 1 }),
    ]);
    expect(eventosRadar("radar-busca-falhou")).toHaveLength(1);
    expect(eventosRadar("radar-busca-ok")).toHaveLength(1);
  });

  it("o cron executa mesmo se o navegador verificou há menos de duas horas", async () => {
    const verificadaNoNavegador = {
      ...busca,
      ultimo_check: "2999-01-01T00:00:00.000Z",
      ultimo_check_origem: "navegador" as const,
    };
    const banco = clienteRadarFalso([], [verificadaNoNavegador]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ candidatas: 1, elegiveis: 1, verificadas: 1 });
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledOnce();
  });

  it("considera já executada a segunda rodada automática no mesmo dia", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-17T12:45:00.000Z"));
    const executadaHoje = {
      ...busca,
      ultimo_check: "2026-09-17T12:40:00.000Z",
      ultimo_check_automatico: "2026-09-17T12:40:00.000Z",
      ultimo_check_origem: "cron" as const,
    };
    const banco = clienteRadarFalso([], [executadaHoje]);
    mocks.createClient.mockReturnValue(banco.cliente);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ candidatas: 1, elegiveis: 0, verificadas: 0 });
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(detalheRadar("radar-busca-pulada")).toEqual({
      busca_id: "busca-1",
      motivo: "nao-vencida",
    });
  });

  it("mantém anúncios e buscas isolados pelo usuário dono", async () => {
    const segundaBusca = { ...busca, id: "busca-2", user_id: "outro-usuario" };
    const banco = clienteRadarFalso([], [busca, segundaBusca]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([anuncioValido]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ verificadas: 2, novos: 2, falhas: 0 });
    expect(banco.inserirAnuncios).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ user_id: "usuario-radar", busca_id: "busca-1" }),
    ], expect.any(Object));
    expect(banco.inserirAnuncios).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ user_id: "outro-usuario", busca_id: "busca-2" }),
    ], expect.any(Object));
  });

  it("registra buscas puladas por execução automática, filtros e cobertura sem executá-las", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-17T12:45:00.000Z"));
    const naoVencida = {
      ...busca,
      id: "busca-recente",
      ultimo_check_automatico: "2026-09-17T08:00:00.000Z",
      ultimo_check_origem: "cron" as const,
    };
    const filtrosInvalidos = {
      ...busca,
      id: "busca-invalida",
      filtros: { ...busca.filtros, cidade: "" },
    };
    const portalSemCobertura = {
      ...busca,
      id: "busca-sem-cobertura",
      filtros: { ...busca.filtros, portal: "portal-desconhecido" as typeof busca.filtros.portal },
    };
    const banco = clienteRadarFalso([], [naoVencida, filtrosInvalidos, portalSemCobertura]);
    mocks.createClient.mockReturnValue(banco.cliente);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ candidatas: 3, elegiveis: 0, verificadas: 0 });
    expect(mocks.buscarComFirecrawl).not.toHaveBeenCalled();
    expect(eventosRadar("radar-busca-pulada").map((entrada) => JSON.parse(entrada.detalhe))).toEqual([
      { busca_id: "busca-recente", motivo: "nao-vencida" },
      { busca_id: "busca-invalida", motivo: "filtros-invalidos" },
      { busca_id: "busca-sem-cobertura", motivo: "portal-sem-cobertura" },
    ]);
  });

  it("registra o limite da rodada sem alterar o teto de oito buscas", async () => {
    const noveBuscas = Array.from({ length: 9 }, (_, indice) => ({
      ...busca,
      id: `busca-${indice + 1}`,
      nome: `Busca ${indice + 1}`,
    }));
    const banco = clienteRadarFalso([], noveBuscas);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ candidatas: 9, elegiveis: 9, verificadas: 8 });
    expect(mocks.buscarComFirecrawl).toHaveBeenCalledTimes(8);
    expect(eventosRadar("radar-busca-pulada")).toHaveLength(1);
    expect(detalheRadar("radar-busca-pulada")).toEqual({
      busca_id: "busca-9",
      motivo: "limite-rodada",
    });
  });
});
