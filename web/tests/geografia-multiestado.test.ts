import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  avaliarImovel,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";
import {
  carregarComparaveisMercadoComCliente,
} from "@/lib/persistencia/comparaveisMercado";
import { separarCidadeEUf } from "@/lib/calculo/geografia";

const HOJE = "2026-09-01";

function entrada(
  cidade: string,
  estado: string,
  bairro = "Centro",
): EntradaAvaliacao {
  return {
    finalidade: "locacao",
    endereco: "Rua Exemplo, 10",
    bairro,
    cidade,
    estado,
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    conservacao: "Bom",
  };
}

function comparavel(
  id: string,
  cidade: string,
  estado: string | null,
  bairro = "Centro",
  valor = 2200,
): ComparavelAvaliacao {
  return {
    origem: "externo",
    id,
    idExterno: id,
    codigo: "portal",
    endereco: `Avenida ${id}, ${100 + id.length}`,
    bairro,
    cidade,
    estado,
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    valorAnunciado: valor,
    dataInformacao: "2026-08-20",
    status: "Anunciado",
  };
}

describe("fronteira geográfica multiestado da Avaliação", () => {
  it("separa UF sem cortar cidades compostas", () => {
    expect(separarCidadeEUf("São José dos Pinhais PR"))
      .toEqual({ cidade: "São José dos Pinhais", estado: "PR" });
    expect(separarCidadeEUf("São José dos Pinhais / Paraná"))
      .toEqual({ cidade: "São José dos Pinhais", estado: "PR" });
    expect(separarCidadeEUf("São Paulo"))
      .toEqual({ cidade: "São Paulo", estado: null });
  });

  it("mantém Londrina/PR e sua expansão regional comprovada", () => {
    const resultado = avaliarImovel(entrada("Londrina", "PR", "Centro"), [
      comparavel("higienopolis", "Londrina", "PR", "Higienópolis"),
      comparavel("petropolis", "Londrina", "PR", "Petrópolis", 2300),
      comparavel("quevec", "Londrina", "PR", "Quebec", 2400),
    ], HOJE);

    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Central");
    expect(resultado.metodologia.modoAmostra).toBe("regional");
    expect(resultado.comparaveis).toHaveLength(3);
  });

  it.each([
    ["Curitiba", "PR"],
    ["Maringá", "PR"],
    ["Campinas", "SP"],
  ])("%s/%s não recebe regiões ou bairros de Londrina", (cidade, estado) => {
    const resultado = avaliarImovel(entrada(cidade, estado, "Centro"), [
      comparavel("higienopolis", cidade, estado, "Higienópolis"),
      comparavel("petropolis", cidade, estado, "Petrópolis", 2300),
      comparavel("quevec", cidade, estado, "Quebec", 2400),
    ], HOJE);

    expect(resultado.metodologia.regiaoReferencia).toBeNull();
    expect(resultado.metodologia.modoAmostra).toBe("sem-amostra");
    expect(resultado.comparaveis).toEqual([]);
  });

  it("não mistura cidade homônima entre UFs e ignora UF desconhecida", () => {
    const alvo = entrada("Santa Luzia", "MG");
    const candidatos = [
      comparavel("mg-1", "Santa Luzia", "MG", "Centro", 2100),
      comparavel("mg-2", "Santa Luzia", "MG", "Centro", 2200),
      comparavel("mg-3", "Santa Luzia", "MG", "Centro", 2300),
      comparavel("ba", "Santa Luzia", "BA", "Centro", 9900),
      comparavel("sem-uf", "Santa Luzia", null, "Centro", 8800),
    ];

    const resultado = avaliarImovel(alvo, candidatos, HOJE);

    expect(resultado.comparaveis.map((item) => item.id).sort()).toEqual(["mg-1", "mg-2", "mg-3"]);
    expect(resultado.valorRecomendado).toBe(2200);
  });

  it("degrada conservadoramente quando a entrada não possui UF confiável", () => {
    const resultado = avaliarImovel(
      { ...entrada("Campinas", "SP"), estado: null },
      [comparavel("sp", "Campinas", "SP")],
      HOJE,
    );
    expect(resultado.situacao).toBe("insuficiente");
    expect(resultado.comparaveis).toEqual([]);
  });
});

describe("consulta estruturada state-aware", () => {
  it("filtra estado e cidade antes dos critérios determinísticos", async () => {
    const iguais: Array<[string, unknown]> = [];
    const consulta = {
      select: vi.fn(),
      eq: vi.fn((coluna: string, valor: unknown) => {
        iguais.push([coluna, valor]);
        return consulta;
      }),
      in: vi.fn(() => consulta),
      gte: vi.fn(() => consulta),
      lte: vi.fn(() => consulta),
      order: vi.fn(() => consulta),
      limit: vi.fn(async () => ({ data: [], error: null })),
    };
    consulta.select.mockReturnValue(consulta);
    const supabase = {
      from: vi.fn(() => consulta),
    } as unknown as SupabaseClient;

    await carregarComparaveisMercadoComCliente(
      supabase,
      "usuario-1",
      entrada("Santa Luzia", "MG"),
    );

    expect(iguais).toContainEqual(["estado", "MG"]);
    expect(iguais).toContainEqual(["cidade_chave", "santa luzia"]);
  });

  it("não consulta a base quando a UF está ausente ou é inválida", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as SupabaseClient;

    await expect(carregarComparaveisMercadoComCliente(
      supabase,
      "usuario-1",
      { ...entrada("Campinas", "SP"), estado: null },
    )).resolves.toEqual([]);
    await expect(carregarComparaveisMercadoComCliente(
      supabase,
      "usuario-1",
      { ...entrada("Campinas", "SP"), estado: "XX" },
    )).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});
