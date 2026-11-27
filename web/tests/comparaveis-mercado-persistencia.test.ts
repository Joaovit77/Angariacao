import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/embeddingsImoveis", () => ({
  gerarEmbeddingsDeImoveis: vi.fn(),
  hashConteudoEmbedding: (texto: string) => `hash:${texto}`,
  modeloEmbeddingImoveis: () => "text-embedding-3-small",
}));

import {
  numeroNaFaixa,
  salvarComparaveisMercado,
  salvarComparaveisMercadoDetalhado,
} from "@/lib/servidor/comparaveisMercado";
import { finalizarColetaCentralAngariacao } from "@/lib/servidor/finalizacaoCentralAngariacao";
import { gerarEmbeddingsDeImoveis } from "@/lib/servidor/embeddingsImoveis";
import { erroExternoSintetico } from "./fixtures/erroExterno";

const filtros = {
  portal: "olx" as const,
  cidade: "Londrina",
  estado: "PR",
  tipo: "Apartamento",
};

const anuncioValido: AnuncioCentralAngariacao = {
  idExterno: "oferta-1",
  portal: "olx",
  titulo: "Apartamento com 2 quartos e 70 m²",
  preco: 2200,
  cidade: "Londrina",
  url: "https://www.olx.com.br/imovel/oferta-1",
  anunciante: "incerto",
};

function bancoComparaveisFalso() {
  const registros = new Map<string, string>();
  const atualizacoesRegiao: Array<{ dados: Record<string, unknown>; ids: string[] }> = [];
  const rpc = vi.fn(async (
    _funcao: string,
    argumentos: { p_dados: Record<string, unknown> },
  ): Promise<{
    data: { id: string; criado: boolean; precisa_embedding: boolean }[] | null;
    error: { code?: string; message?: string } | null;
  }> => {
    const dados = argumentos.p_dados;
    const chave = `${dados.user_id}:${dados.portal}:${dados.id_externo}`;
    const existente = registros.get(chave);
    const id = existente || `comparavel-${registros.size + 1}`;
    registros.set(chave, id);
    return {
      data: [{ id, criado: !existente, precisa_embedding: false }],
      error: null,
    };
  });
  const consultaAtualizacao = {
    eq: vi.fn(() => consultaAtualizacao),
    in: vi.fn(async (_coluna: string, ids: string[]) => {
      atualizacoesRegiao.at(-1)!.ids = ids;
      return { error: null };
    }),
  };
  const from = vi.fn(() => ({
    update: vi.fn((dados: Record<string, unknown>) => {
      atualizacoesRegiao.push({ dados, ids: [] });
      return consultaAtualizacao;
    }),
  }));
  return {
    cliente: { rpc, from } as unknown as SupabaseClient,
    registros,
    rpc,
    from,
    atualizacoesRegiao,
  };
}

describe("persistência idempotente dos comparáveis de mercado", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const anuncioZap: AnuncioCentralAngariacao = {
    ...anuncioValido,
    portal: "zap",
    idExterno: "2612345678",
    url: "https://www.zapimoveis.com.br/imovel/aluguel-apartamento-2-quartos-centro-londrina-pr-id-2612345678/",
    preco: 2500,
    cidade: "Londrina",
    estado: "PR",
  };
  const filtrosZap = { ...filtros, portal: "zap" as const };

  it("R4.2h: comparável ZAP com preço e UF publicados é salvo com a UF do anúncio", async () => {
    const banco = bancoComparaveisFalso();
    expect(await salvarComparaveisMercado(banco.cliente, "usuario-1", [anuncioZap], filtrosZap)).toBe(1);
    expect(banco.rpc).toHaveBeenCalledWith("registrar_comparavel_mercado", {
      p_dados: expect.objectContaining({ portal: "zap", id_externo: "2612345678", estado: "PR", cidade: "Londrina", valor_anunciado: 2500 }),
    });
  });

  it.each([
    ["preço nulo", { preco: null }],
    ["UF nula (nunca preenchida pelo filtro)", { estado: null }],
    ["cidade nula (nunca preenchida pelo filtro)", { cidade: null }],
  ])("R4.2h: ZAP com %s não vira comparável", async (_nome, parcial) => {
    const banco = bancoComparaveisFalso();
    expect(await salvarComparaveisMercado(banco.cliente, "usuario-1", [{ ...anuncioZap, ...parcial }], filtrosZap)).toBe(0);
    expect(banco.rpc).not.toHaveBeenCalledWith("registrar_comparavel_mercado", expect.anything());
  });

  it("R4.2h: os demais portais mantêm UF do filtro e cidade do filtro como reserva", async () => {
    const banco = bancoComparaveisFalso();
    expect(await salvarComparaveisMercado(banco.cliente, "usuario-1", [{ ...anuncioValido, cidade: null, estado: null }], filtros)).toBe(1);
    expect(banco.rpc).toHaveBeenCalledWith("registrar_comparavel_mercado", {
      p_dados: expect.objectContaining({ portal: "olx", estado: "PR", cidade: "Londrina" }),
    });
  });

  it("aceita comparável Wimoveis incerto apesar do filtro solicitado ao portal", async () => {
    const banco = bancoComparaveisFalso();
    const salvos = await salvarComparaveisMercado(banco.cliente, "usuario-1", [{
      ...anuncioValido,
      portal: "wimoveis",
      idExterno: "3018468881",
      url: "https://www.wimoveis.com.br/propriedades/apartamento-3018468881.html",
    }], { ...filtros, portal: "wimoveis", somenteProprietario: true });
    expect(salvos).toBe(1);
    expect(banco.rpc).toHaveBeenCalledWith("registrar_comparavel_mercado", {
      p_dados: expect.objectContaining({
        id_externo: "3018468881", anunciante_tipo: "incerto",
        dados_originais: expect.objectContaining({ anunciante: "incerto" }),
      }),
    });
  });

  it("preserva a persistência estruturada no 403 sem despejar o erro do provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const banco = bancoComparaveisFalso();
    const registrar = banco.rpc.getMockImplementation()!;
    banco.rpc.mockImplementation(async (...args) => {
      const resposta = await registrar(...args);
      if (resposta.data?.[0]) resposta.data[0].precisa_embedding = true;
      return resposta;
    });
    vi.mocked(gerarEmbeddingsDeImoveis).mockRejectedValueOnce(erroExternoSintetico());
    await expect(salvarComparaveisMercado(
      banco.cliente, "usuario-1", [anuncioValido], filtros,
    )).resolves.toBe(1);
    expect(banco.registros.size).toBe(1);
    expect(banco.from).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[comparaveis-mercado] falha ao gerar embeddings",
      { provider: "openai", operation: "embedding", error_code: "embedding_request_failed", status: 403 },
    );
  });

  it("ignora anúncios sem os critérios já exigidos pela base", async () => {
    const banco = bancoComparaveisFalso();
    const invalidos: AnuncioCentralAngariacao[] = [
      { ...anuncioValido, idExterno: "sem-preco", preco: null },
      { ...anuncioValido, idExterno: "sem-titulo", titulo: "" },
      { ...anuncioValido, idExterno: "sem-url", url: "" },
    ];

    const quantidade = await salvarComparaveisMercado(
      banco.cliente,
      "usuario-1",
      [anuncioValido, ...invalidos],
      filtros,
    );

    expect(quantidade).toBe(1);
    expect(banco.rpc).toHaveBeenCalledOnce();
    expect(banco.registros.size).toBe(1);
  });

  it("elimina identificadores repetidos dentro da mesma resposta do portal", async () => {
    const banco = bancoComparaveisFalso();
    const quantidade = await salvarComparaveisMercado(
      banco.cliente,
      "usuario-1",
      [anuncioValido, { ...anuncioValido, titulo: "Card repetido" }],
      filtros,
    );
    expect(quantidade).toBe(1);
    expect(banco.rpc).toHaveBeenCalledOnce();
  });

  it("converge para um registro ao repetir ou concorrer no mesmo anúncio", async () => {
    const banco = bancoComparaveisFalso();

    await expect(Promise.all([
      salvarComparaveisMercado(banco.cliente, "usuario-1", [anuncioValido], filtros),
      salvarComparaveisMercado(banco.cliente, "usuario-1", [anuncioValido], filtros),
    ])).resolves.toEqual([1, 1]);

    expect(banco.rpc).toHaveBeenCalledTimes(2);
    expect(banco.registros.size).toBe(1);
    expect(banco.registros.values().next().value).toBe("comparavel-1");
  });

  it("registra a zona somente nos anúncios pertencentes à conta coletora", async () => {
    const banco = bancoComparaveisFalso();

    await salvarComparaveisMercado(
      banco.cliente,
      "usuario-1",
      [{ ...anuncioValido, bairro: "Bela Suíça" }],
      { ...filtros, bairro: "Bela Suíça", regiao: "Zona Sul" },
    );

    expect(banco.from).toHaveBeenCalledWith("comparaveis_mercado");
    expect(banco.atualizacoesRegiao).toEqual([{
      dados: { regiao: "Zona Sul" },
      ids: ["comparavel-1"],
    }]);
  });

  it.each([
    [9.9, null],
    [10, 10],
    [10_000, 10_000],
    [10_000.1, null],
  ])("P1: valida area_m2 no limite %s → %s preservando dados_originais", async (areaInformada, esperadoBanco) => {
    const banco = bancoComparaveisFalso();
    const anuncio: AnuncioCentralAngariacao = {
      ...anuncioValido,
      idExterno: `area-${areaInformada}`,
      titulo: "Apartamento para locação no Centro",
      areaM2: areaInformada,
    };

    const salvos = await salvarComparaveisMercado(banco.cliente, "usuario-1", [anuncio], filtros);
    expect(salvos).toBe(1);
    const payload = banco.rpc.mock.calls[0][1].p_dados as Record<string, unknown>;
    expect(payload.area_m2).toBe(esperadoBanco);
    expect(payload.area_privativa_m2).toBe(esperadoBanco);
    expect((payload.dados_originais as AnuncioCentralAngariacao).areaM2).toBe(areaInformada);
  });

  it("P1: valida cada campo de área e numéricos de forma independente sem descartar o anúncio", async () => {
    const banco = bancoComparaveisFalso();
    expect(numeroNaFaixa(9.9, 10, 100_000)).toBeNull();
    expect(numeroNaFaixa(100_000, 10, 100_000)).toBe(100_000);
    expect(numeroNaFaixa(100_000.1, 10, 100_000)).toBeNull();

    const anuncio: AnuncioCentralAngariacao = {
      ...anuncioValido,
      idExterno: "areas-mistas",
      titulo: "Casa ampla no Centro",
      areaM2: 5, // fora da faixa [10, 10000]
      areaTotalM2: 180, // válida em [10, 100000]
      areaTerrenoM2: 2_000_000, // fora da faixa [10, 1000000]
      quartos: 45, // fora da faixa [0, 30]
      valorCondominio: -50, // negativo
    };

    const salvos = await salvarComparaveisMercado(banco.cliente, "usuario-1", [anuncio], filtros);
    expect(salvos).toBe(1);
    const payload = banco.rpc.mock.calls[0][1].p_dados as Record<string, unknown>;
    expect(payload.area_m2).toBeNull();
    expect(payload.area_privativa_m2).toBeNull();
    expect(payload.area_total_m2).toBe(180);
    expect(payload.area_terreno_m2).toBeNull();
    expect(payload.quartos).toBeNull();
    expect(payload.valor_condominio).toBeNull();
    expect(payload.dados_originais).toEqual(expect.objectContaining({
      areaM2: 5,
      areaTotalM2: 180,
      areaTerrenoM2: 2_000_000,
    }));
  });

  it("P1: falha em um anúncio não descarta os demais válidos, classifica motivo e permite reprocessamento idempotente", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const banco = bancoComparaveisFalso();
    const registrarPadrao = banco.rpc.getMockImplementation()!;
    let falharAnuncio2 = true;
    banco.rpc.mockImplementation(async (funcao, argumentos) => {
      if (falharAnuncio2 && argumentos.p_dados.id_externo === "oferta-2") {
        return { data: null, error: { code: "23514", message: "violates check constraint" } };
      }
      return registrarPadrao(funcao, argumentos);
    });

    const lote: AnuncioCentralAngariacao[] = [
      { ...anuncioValido, idExterno: "oferta-1", bairro: "Bela Suíça" },
      { ...anuncioValido, idExterno: "oferta-2", bairro: "Bela Suíça" },
      { ...anuncioValido, idExterno: "oferta-3", bairro: "Bela Suíça" },
    ];

    const parcial = await salvarComparaveisMercadoDetalhado(
      banco.cliente,
      "usuario-1",
      lote,
      { ...filtros, bairro: "Bela Suíça", regiao: "Zona Sul" },
    );

    expect(parcial.tentados).toBe(3);
    expect(parcial.salvos).toBe(2);
    expect(parcial.parcial).toBe(true);
    expect(parcial.falhas).toEqual([
      { portal: "olx", idExterno: "oferta-2", motivo: "restricao-banco", codigoSql: "23514" },
    ]);
    expect(parcial.falhasPorMotivo).toEqual({ "restricao-banco": 1 });
    expect(banco.registros.size).toBe(2);
    expect(banco.atualizacoesRegiao[0].ids).toHaveLength(2);
    expect(log).toHaveBeenCalledWith(
      "[comparaveis-mercado] persistência parcial de comparáveis",
      expect.objectContaining({ tentados: 3, salvos: 2, falhas: 1 }),
    );

    // Reprocessamento idempotente somente do registro que falhou converge para os 3 sem duplicar.
    falharAnuncio2 = false;
    const reprocessado = await salvarComparaveisMercadoDetalhado(
      banco.cliente,
      "usuario-1",
      [lote[1]],
      { ...filtros, bairro: "Bela Suíça", regiao: "Zona Sul" },
    );
    expect(reprocessado.salvos).toBe(1);
    expect(reprocessado.parcial).toBe(false);
    expect(reprocessado.falhas).toEqual([]);
    expect(banco.registros.size).toBe(3);
  });

  it("P1: finalizarColetaCentralAngariacao diferencia sucesso parcial de falha integral", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const banco = bancoComparaveisFalso();
    const registrarPadrao = banco.rpc.getMockImplementation()!;
    banco.rpc.mockImplementation(async (funcao, argumentos) => {
      if (argumentos.p_dados.id_externo === "oferta-falha") {
        return { data: null, error: { code: "23514", message: "violates check constraint" } };
      }
      return registrarPadrao(funcao, argumentos);
    });

    const parcial = await finalizarColetaCentralAngariacao(
      banco.cliente,
      "usuario-1",
      [
        { ...anuncioValido, idExterno: "oferta-ok" },
        { ...anuncioValido, idExterno: "oferta-falha" },
      ],
      filtros,
    );
    expect(parcial.comparaveisSalvos).toBe(1);
    expect(parcial.comparaveisParcial).toBe(true);
    expect(parcial.comparaveisFalhos).toBe(1);
    expect(parcial.comparaveisFalhasPorMotivo).toEqual({ "restricao-banco": 1 });
    expect(parcial.erroComparaveis).toBeNull();

    const falhaTotal = await finalizarColetaCentralAngariacao(
      banco.cliente,
      "usuario-1",
      [{ ...anuncioValido, idExterno: "oferta-falha" }],
      filtros,
    );
    expect(falhaTotal.comparaveisSalvos).toBe(0);
    expect(falhaTotal.comparaveisParcial).toBe(false);
    expect(falhaTotal.erroComparaveis).toBeTruthy();
  });
});
