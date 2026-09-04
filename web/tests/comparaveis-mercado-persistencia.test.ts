import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/servidor/embeddingsImoveis", () => ({
  gerarEmbeddingsDeImoveis: vi.fn(),
  hashConteudoEmbedding: (texto: string) => `hash:${texto}`,
  modeloEmbeddingImoveis: () => "text-embedding-3-small",
}));

import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";
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
  ) => {
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

  it("preserva a persistência estruturada no 403 sem despejar o erro do provider", async () => {
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const banco = bancoComparaveisFalso();
    const registrar = banco.rpc.getMockImplementation()!;
    banco.rpc.mockImplementation(async (...args) => {
      const resposta = await registrar(...args);
      resposta.data[0].precisa_embedding = true;
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
});
