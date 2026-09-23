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

import {
  executarMonitorRadar,
  LIMITE_AMOSTRA_REPETICAO,
  LIMITE_IDS_PARECE_QUARTO,
} from "@/lib/servidor/monitorRadarAngariacao";
import {
  BELO_HORIZONTE_GEMINADA,
  BELO_HORIZONTE_TERREA,
  EDU_CHAVES_DOM_PEDRO,
  EDU_CHAVES_NOVO_AEROPORTO,
  EDU_CHAVES_SANTOS_DUMONT,
  JARDIM_TOKIO,
  UNIVERSITARIO_DELVINA,
  UNIVERSITARIO_SEM_ENDERECO,
} from "./fixtures/radarChavesR41";
import {
  CARD_43083373,
  CARD_45326545,
  CARD_46811835,
  FOTO_CARD_46811835,
  FOTO_LD_43083373,
  FOTO_LD_45326545,
  LD_REAL,
} from "./fixtures/chavesFotosJsonLd";

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

describe("monitor agendado do Radar: observabilidade R3.1 e shadow R3.2a", () => {
  const quarto = (id: string, titulo: string): AnuncioCentralAngariacao => ({
    ...anuncioValido,
    idExterno: id,
    titulo,
    url: `https://pr.olx.com.br/imoveis/${id}`,
  });
  const deCambe: AnuncioCentralAngariacao = {
    ...anuncioValido,
    idExterno: "cambe-1",
    cidade: "Cambé",
    url: "https://pr.olx.com.br/imoveis/cambe-1",
  };
  const diagnostico = {
    cardsPagina: 50,
    noPeriodoAntesCidade: 3,
    indiceUltimoNoPeriodo: 12,
    cardsAntigosAntesDeRecente: 4,
  };

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

  it("acrescenta ordem, tamanho da página e shadow ao radar-busca-ok sem mudar os campos atuais", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    const coletados = [anuncioValido, quarto("1523674129", "QUARTO MOBILIADO CENTRO DE LONDRINA"), deCambe];
    mocks.buscarComFirecrawl.mockImplementation(async (_filtros, _url, registrarOrigem, registrarDiagnostico) => {
      registrarOrigem("firecrawl");
      registrarDiagnostico(diagnostico);
      return coletados;
    });

    await executarMonitorRadar();

    expect(detalheRadar("radar-busca-ok")).toEqual({
      busca_id: "busca-1",
      portal: "olx",
      coletados: 3,
      apos_filtro: 2,
      novos: 1,
      origem_html: "firecrawl",
      duracao_ms: expect.any(Number),
      cards_pagina: 50,
      no_periodo_antes_cidade: 3,
      descartados_cidade: 1,
      indice_ultimo_no_periodo: 12,
      cards_antigos_antes_de_recente: 4,
      parece_quarto: 1,
      parece_quarto_ids: ["1523674129"],
      sinal_quarto_preservado: 1,
    });
  });

  it("omite os campos de período quando o diagnóstico não os traz", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockImplementation(async (_f, _u, _o, registrarDiagnostico) => {
      registrarDiagnostico({ cardsPagina: 7, noPeriodoAntesCidade: 1 });
      return [anuncioValido];
    });

    await executarMonitorRadar();

    const detalhe = detalheRadar("radar-busca-ok");
    expect(detalhe).toMatchObject({ cards_pagina: 7, no_periodo_antes_cidade: 1, descartados_cidade: 0 });
    expect(detalhe).not.toHaveProperty("indice_ultimo_no_periodo");
    expect(detalhe).not.toHaveProperty("cards_antigos_antes_de_recente");
  });

  it("shadow não esconde o quarto: persiste no Radar e nos comparáveis como hoje", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    const anuncioQuarto = quarto("1534620451", "Alugo quarto mobilado ");
    mocks.buscarComFirecrawl.mockResolvedValue([anuncioQuarto]);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ novos: 1, falhas: 0 });
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledWith(
      banco.cliente,
      "usuario-radar",
      [expect.objectContaining({ idExterno: "1534620451" })],
      busca.filtros,
    );
    expect(banco.inserirAnuncios).toHaveBeenCalledWith([
      expect.objectContaining({ id_externo: "1534620451", visto: false }),
    ], { onConflict: "busca_id,portal,id_externo", ignoreDuplicates: true });
    expect(detalheRadar("radar-busca-ok")).toMatchObject({ parece_quarto: 1, novos: 1 });
  });

  it("deduplicação não muda: quarto já conhecido é contado no shadow, mas não reinserido", async () => {
    const banco = clienteRadarFalso([{ portal: "olx", id_externo: "1530812703" }]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([quarto("1530812703", "Aluguel Quarto ")]);

    await executarMonitorRadar();

    expect(banco.inserirAnuncios).not.toHaveBeenCalled();
    expect(detalheRadar("radar-busca-ok")).toMatchObject({ novos: 0, parece_quarto: 1 });
  });

  it("limita a amostra de IDs do shadow sem limitar a contagem", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    const quartos = Array.from({ length: 12 }, (_, i) => quarto(`15000000${i + 10}`, "Aluguel Quarto"));
    mocks.buscarComFirecrawl.mockResolvedValue(quartos);

    await executarMonitorRadar();

    const detalhe = detalheRadar("radar-busca-ok");
    expect(detalhe.parece_quarto).toBe(12);
    expect(detalhe.parece_quarto_ids).toHaveLength(LIMITE_IDS_PARECE_QUARTO);
  });

  it("não registra título nem URL do anúncio no shadow", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([quarto("1523968436", "Pensionato mensal")]);

    await executarMonitorRadar();

    const logs = JSON.stringify(mocks.registrarEvento.mock.calls);
    expect(logs).not.toContain("Pensionato");
    expect(logs).not.toContain("olx.com.br");
    expect(detalheRadar("radar-busca-ok").parece_quarto_ids).toEqual(["1523968436"]);
  });

  it("Chaves na Mão não recebe os campos da OLX nem o shadow", async () => {
    const buscaChaves = {
      ...busca,
      id: "busca-chaves",
      filtros: { ...busca.filtros, portal: "chaves-na-mao" as typeof busca.filtros.portal, tipo: "Casa" },
    };
    const banco = clienteRadarFalso([], [buscaChaves]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([
      { ...anuncioValido, portal: "chaves-na-mao", idExterno: "35106344", titulo: "Quarto para alugar" },
    ]);

    await executarMonitorRadar();

    const detalhe = detalheRadar("radar-busca-ok");
    expect(Object.keys(detalhe).sort()).toEqual(
      ["apos_filtro", "busca_id", "coletados", "duracao_ms", "novos", "origem_html", "portal"],
    );
    expect(banco.inserirAnuncios).toHaveBeenCalledOnce();
  });

  it("radar-busca-vazia continua sem os campos novos", async () => {
    const banco = clienteRadarFalso();
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockImplementation(async (_f, _u, _o, registrarDiagnostico) => {
      registrarDiagnostico({ cardsPagina: 0, noPeriodoAntesCidade: 0 });
      return [];
    });

    await executarMonitorRadar();

    expect(detalheRadar("radar-busca-vazia")).not.toHaveProperty("cards_pagina");
    expect(detalheRadar("radar-busca-vazia")).not.toHaveProperty("parece_quarto");
  });
});

describe("monitor agendado do Radar: shadow de repetição do Chaves (R4.1a)", () => {
  const buscaChaves = {
    ...busca,
    id: "busca-chaves",
    nome: "Londrina · Chaves na Mão",
    filtros: { ...busca.filtros, portal: "chaves-na-mao" as typeof busca.filtros.portal, tipo: "Casa" },
  };
  const linhaImovel = (codigo: string, endereco: string, extra: Record<string, unknown> = {}) => ({
    id: `imovel-${codigo}`,
    user_id: "usuario-radar",
    codigo,
    endereco,
    bairro: null,
    cidade: "Londrina",
    tipo: "Casa",
    quartos: null,
    valor_aluguel: 0,
    status: "Publicado",
    ...extra,
  });
  const carteira = [
    linhaImovel("LD-65", "Rua Professora Delvina Borges, 190", { valor_aluguel: 6000 }),
    linhaImovel("LD-178", "Rua Presidente Wilson, 170", { valor_aluguel: 5500 }),
    linhaImovel("LD-900", "Rua Yoshikawa Koji, 250", { quartos: 3, valor_aluguel: 2900 }),
  ];

  interface OpcoesBanco {
    buscas?: BuscaRadarTeste[];
    existentes?: AnuncioCentralAngariacao[];
    mercado?: Array<{ id_externo: string; primeiro_visto_em: string }>;
    imoveis?: unknown[];
    falhaMercado?: boolean;
  }

  function bancoComShadow(opcoes: OpcoesBanco = {}) {
    const existentes = opcoes.existentes || [];
    const limitarBuscas = vi.fn().mockResolvedValue({ data: opcoes.buscas || [buscaChaves], error: null });
    const selecionarBuscas = vi.fn().mockReturnValue({
      eq: () => ({ order: () => ({ order: () => ({ limit: limitarBuscas }) }) }),
    });
    const atualizarBusca = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const confirmarInsercao = vi.fn().mockResolvedValue({ data: [{ id: "radar-anuncio-1" }], error: null });
    const inserirAnuncios = vi.fn().mockReturnValue({ select: confirmarInsercao });
    const consultasShadow: string[] = [];

    const selecionarAnuncios = vi.fn((colunas: string) => {
      if (colunas === "portal,id_externo") {
        return {
          eq: vi.fn().mockResolvedValue({
            data: existentes.map((anuncio) => ({ portal: anuncio.portal, id_externo: anuncio.idExterno })),
            error: null,
          }),
        };
      }
      consultasShadow.push("radar_anuncios");
      return {
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: vi.fn().mockResolvedValue({
                data: existentes.map((anuncio) => ({ id_externo: anuncio.idExterno, dados: anuncio })),
                error: null,
              }),
            }),
          }),
        }),
      };
    });

    const from = vi.fn((tabela: string) => {
      if (tabela === "radar_buscas") return { select: selecionarBuscas, update: atualizarBusca };
      if (tabela === "radar_anuncios") return { select: selecionarAnuncios, upsert: inserirAnuncios };
      if (tabela === "comparaveis_mercado") {
        consultasShadow.push(tabela);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: vi.fn().mockResolvedValue(opcoes.falhaMercado
                  ? { data: null, error: { message: "falha" } }
                  : { data: opcoes.mercado || [], error: null }),
              }),
            }),
          }),
        };
      }
      if (tabela === "imoveis") {
        consultasShadow.push(tabela);
        return { select: () => ({ eq: vi.fn().mockResolvedValue({ data: opcoes.imoveis ?? carteira, error: null }) }) };
      }
      throw new Error(`Tabela inesperada no teste: ${tabela}`);
    });

    return { cliente: { from }, inserirAnuncios, consultasShadow };
  }

  const coletaReal = [
    EDU_CHAVES_NOVO_AEROPORTO,
    EDU_CHAVES_DOM_PEDRO,
    UNIVERSITARIO_DELVINA,
    UNIVERSITARIO_SEM_ENDERECO,
    JARDIM_TOKIO,
    BELO_HORIZONTE_TERREA,
    BELO_HORIZONTE_GEMINADA,
  ];

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

  it("registra os três sinais com os casos reais da auditoria", async () => {
    const banco = bancoComShadow({
      existentes: [EDU_CHAVES_SANTOS_DUMONT],
      mercado: [
        { id_externo: "38985130", primeiro_visto_em: "2026-08-22T17:20:47.000Z" },
        { id_externo: "43083373", primeiro_visto_em: new Date().toISOString() },
      ],
    });
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue(coletaReal);

    await executarMonitorRadar();

    expect(detalheRadar("radar-busca-ok").repeticao_chaves).toEqual({
      ja_conhecido_no_mercado: 1,
      ja_conhecido_ids: ["38985130"],
      possivel_mesmo_imovel: 2,
      possivel_mesmo_imovel_pares: [
        ["30868208", "40494125"],
        ["30868208", "31083573"],
        ["31083573", "40494125"],
      ],
      possivel_imovel_carteira: 1,
      possivel_imovel_carteira_itens: [
        { id: "33821843", origem: "foto", codigos: ["LD-900"], evidencias: ["logradouro", "quartos", "preco"] },
      ],
    });
  });

  it("não muda a lista: grava exatamente os mesmos anúncios, com ou sem shadow", async () => {
    const comShadow = bancoComShadow({ existentes: [EDU_CHAVES_SANTOS_DUMONT] });
    mocks.createClient.mockReturnValue(comShadow.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([...coletaReal, EDU_CHAVES_SANTOS_DUMONT]);
    const resumoCom = await executarMonitorRadar();

    const semShadow = bancoComShadow({ existentes: [EDU_CHAVES_SANTOS_DUMONT], falhaMercado: true });
    mocks.createClient.mockReturnValue(semShadow.cliente);
    const resumoSem = await executarMonitorRadar();

    const gravados = comShadow.inserirAnuncios.mock.calls[0];
    expect(gravados).toEqual(semShadow.inserirAnuncios.mock.calls[0]);
    expect(gravados[0].map((linha: { id_externo: string; visto: boolean }) => [linha.id_externo, linha.visto]))
      .toEqual(coletaReal.map((anuncio) => [anuncio.idExterno, false]));
    expect(gravados[1]).toEqual({ onConflict: "busca_id,portal,id_externo", ignoreDuplicates: true });
    expect(resumoCom).toEqual(resumoSem);
  });

  it("falha do shadow omite o bloco e mantém a rodada e os campos atuais", async () => {
    const banco = bancoComShadow({ falhaMercado: true });
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue(coletaReal);

    const resumo = await executarMonitorRadar();

    expect(resumo).toMatchObject({ verificadas: 1, novos: 1, falhas: 0 });
    expect(Object.keys(detalheRadar("radar-busca-ok")).sort()).toEqual(
      ["apos_filtro", "busca_id", "coletados", "duracao_ms", "novos", "origem_html", "portal"],
    );
  });

  it("sem anúncio novo registra zeros sem consultar histórico nem carteira", async () => {
    const banco = bancoComShadow({ existentes: [EDU_CHAVES_SANTOS_DUMONT] });
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([EDU_CHAVES_SANTOS_DUMONT]);

    await executarMonitorRadar();

    expect(banco.inserirAnuncios).not.toHaveBeenCalled();
    expect(banco.consultasShadow).toEqual([]);
    expect(detalheRadar("radar-busca-ok").repeticao_chaves).toEqual({
      ja_conhecido_no_mercado: 0,
      possivel_mesmo_imovel: 0,
      possivel_imovel_carteira: 0,
    });
  });

  it.each([
    ["OLX", { ...busca }],
    ["Chaves de apartamento", { ...buscaChaves, filtros: { ...buscaChaves.filtros, tipo: "Apartamento" } }],
  ])("fica desligado em %s: nenhuma consulta e nenhum campo novo", async (_nome, outraBusca) => {
    const banco = bancoComShadow({ buscas: [outraBusca] });
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue([{ ...EDU_CHAVES_NOVO_AEROPORTO, portal: outraBusca.filtros.portal }]);

    await executarMonitorRadar();

    expect(banco.consultasShadow).toEqual([]);
    expect(detalheRadar("radar-busca-ok")).not.toHaveProperty("repeticao_chaves");
  });

  it("limita as amostras sem limitar as contagens", async () => {
    const muitos = Array.from({ length: 12 }, (_, indice) => ({
      ...EDU_CHAVES_NOVO_AEROPORTO,
      idExterno: `9000000${indice + 10}`,
      endereco: "Rua Edu Chaves, --",
      url: `https://www.chavesnamao.com.br/imovel/casa/id-9000000${indice + 10}/`,
    }));
    const banco = bancoComShadow({
      mercado: muitos.map((anuncio) => ({ id_externo: anuncio.idExterno, primeiro_visto_em: "2026-08-01T00:00:00.000Z" })),
      imoveis: [linhaImovel("LD-901", "Rua Edu Chaves, 112", { valor_aluguel: 6000 })],
    });
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue(muitos);

    await executarMonitorRadar();

    const repeticao = detalheRadar("radar-busca-ok").repeticao_chaves;
    expect(repeticao.ja_conhecido_no_mercado).toBe(12);
    expect(repeticao.ja_conhecido_ids).toHaveLength(LIMITE_AMOSTRA_REPETICAO);
    expect(repeticao.possivel_mesmo_imovel).toBe(12);
    expect(repeticao.possivel_mesmo_imovel_pares).toHaveLength(LIMITE_AMOSTRA_REPETICAO);
    expect(repeticao.possivel_imovel_carteira).toBe(12);
    expect(repeticao.possivel_imovel_carteira_itens).toHaveLength(LIMITE_AMOSTRA_REPETICAO);
  });

  it("não registra endereço, título, URL nem foto no shadow", async () => {
    const banco = bancoComShadow({ existentes: [EDU_CHAVES_SANTOS_DUMONT] });
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockResolvedValue(coletaReal);

    await executarMonitorRadar();

    const logs = JSON.stringify(mocks.registrarEvento.mock.calls);
    for (const proibido of ["Edu Chaves", "edu chaves", "Yoshikawa", "yoshikawa", "Delvina", "chavesnamao.com.br", "Casa Geminada"]) {
      expect(logs).not.toContain(proibido);
    }
  });
});

describe("monitor agendado do Radar: foto do Chaves via JSON-LD (R4.1b.1)", () => {
  const buscaChaves = {
    ...busca,
    id: "busca-chaves",
    filtros: { ...busca.filtros, portal: "chaves-na-mao" as typeof busca.filtros.portal, tipo: "Casa" },
  };

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

  async function linhasGravadas(html: string) {
    const real = await vi.importActual<typeof import("@/lib/servidor/firecrawlCentralAngariacao")>(
      "@/lib/servidor/firecrawlCentralAngariacao",
    );
    const banco = clienteRadarFalso([], [buscaChaves]);
    mocks.createClient.mockReturnValue(banco.cliente);
    mocks.buscarComFirecrawl.mockImplementation(async (filtros) => real.extrairAnunciosFirecrawl(html, filtros));
    await executarMonitorRadar();
    return banco.inserirAnuncios.mock.calls[0][0] as Array<{ id_externo: string; dados: AnuncioCentralAngariacao }>;
  }

  it("a gravação no Radar só difere na foto", async () => {
    const cards = `${CARD_46811835}${CARD_43083373}${CARD_45326545}`;
    const antes = await linhasGravadas(cards);
    const depois = await linhasGravadas(`${cards}${LD_REAL}`);

    const semFoto = (linhas: typeof antes) => linhas.map((linha) => ({ ...linha, dados: { ...linha.dados, imagem: null } }));
    expect(semFoto(depois)).toEqual(semFoto(antes));
    expect(antes.map((linha) => linha.dados.imagem ?? null)).toEqual([FOTO_CARD_46811835, null, null]);
    expect(depois.map((linha) => linha.dados.imagem)).toEqual([FOTO_CARD_46811835, FOTO_LD_43083373, FOTO_LD_45326545]);
  });
});
