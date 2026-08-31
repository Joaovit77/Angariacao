import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntradaAvaliacao } from "@/lib/calculo/avaliacao";

const mocks = vi.hoisted(() => ({
  getSupabase: vi.fn(),
}));

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: mocks.getSupabase,
}));

import {
  carregarHistoricoAvaliacoes,
  registrarValorFinalAvaliacao,
} from "@/lib/persistencia/avaliacoes";

const entrada: EntradaAvaliacao = {
  imovelId: "imovel-1",
  finalidade: "locacao",
  endereco: "Rua das Palmeiras, 120",
  bairro: "Cinco Conjuntos",
  cidade: "Londrina",
  estado: "PR",
  edificio: null,
  tipo: "Casa",
  areaM2: 82,
  quartos: 3,
  banheiros: 2,
  vagas: 1,
  conservacao: "Bom",
  diferenciais: ["moveis-planejados", "box-banheiros"],
  latitude: -23.267,
  longitude: -51.174,
};

function consultaFalsa<T>(data: T) {
  const consulta: Record<string, ReturnType<typeof vi.fn> | ((resolver: (valor: unknown) => unknown) => Promise<unknown>)> = {};
  consulta.select = vi.fn(() => consulta);
  consulta.eq = vi.fn(() => consulta);
  consulta.in = vi.fn(() => consulta);
  consulta.order = vi.fn(() => consulta);
  consulta.limit = vi.fn(() => consulta);
  consulta.then = (resolver: (valor: { data: T; error: null }) => unknown) => (
    Promise.resolve({ data, error: null }).then(resolver)
  );
  return consulta;
}

function bancoHistoricoFalso() {
  const linha = {
    id: "avaliacao-1",
    imovel_id: "imovel-1",
    finalidade: "locacao",
    valor_proprietario: "2300",
    valor_minimo: "1900",
    valor_recomendado: "2100",
    valor_maximo: "2400",
    nivel_confianca: "Boa",
    score_confianca: 78,
    quantidade_comparaveis: 7,
    dados_entrada: entrada,
    created_at: "2026-08-31T13:00:00.000Z",
  };
  const ajuste = {
    avaliacao_id: "avaliacao-1",
    valor_final: "2250",
    justificativa: "Posicionamento comercial",
    created_at: "2026-08-31T14:00:00.000Z",
  };
  const consultaAvaliacoes = consultaFalsa([linha]);
  const consultaAjustes = consultaFalsa([ajuste]);
  const from = vi.fn((tabela: string) => (
    tabela === "avaliacoes_imoveis" ? consultaAvaliacoes : consultaAjustes
  ));
  mocks.getSupabase.mockReturnValue({ from });
  return { consultaAvaliacoes, consultaAjustes, from };
}

describe("histórico editável de avaliações", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recupera a entrada e a decisão comercial mais recente sem alterar o cálculo", async () => {
    const banco = bancoHistoricoFalso();

    const historico = await carregarHistoricoAvaliacoes("usuario-1", "imovel-1");

    expect(historico).toEqual([expect.objectContaining({
      id: "avaliacao-1",
      imovelId: "imovel-1",
      valorProprietario: 2300,
      valorRecomendado: 2100,
      valorFinalCorretor: 2250,
      justificativaValorFinal: "Posicionamento comercial",
      entrada,
    })]);
    expect(banco.from).toHaveBeenCalledWith("avaliacoes_imoveis");
    expect(banco.from).toHaveBeenCalledWith("ajustes_valor_avaliacao");
    expect(banco.consultaAvaliacoes.select).toHaveBeenCalledWith(expect.stringContaining("dados_entrada"));
    expect(banco.consultaAvaliacoes.eq).toHaveBeenNthCalledWith(1, "user_id", "usuario-1");
    expect(banco.consultaAvaliacoes.eq).toHaveBeenNthCalledWith(2, "imovel_id", "imovel-1");
    expect(banco.consultaAjustes.eq).toHaveBeenCalledWith("user_id", "usuario-1");
    expect(banco.consultaAjustes.in).toHaveBeenCalledWith("avaliacao_id", ["avaliacao-1"]);
  });

  it("registra o valor final como nova decisão append-only vinculada à avaliação", async () => {
    const resposta = {
      avaliacao_id: "avaliacao-1",
      valor_final: "2350",
      justificativa: "Margem de negociação",
      created_at: "2026-08-31T15:00:00.000Z",
    };
    const consulta = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: resposta, error: null }),
    };
    consulta.insert.mockReturnValue(consulta);
    consulta.select.mockReturnValue(consulta);
    const from = vi.fn(() => consulta);
    mocks.getSupabase.mockReturnValue({ from });

    const ajuste = await registrarValorFinalAvaliacao(
      "usuario-1",
      "avaliacao-1",
      2350,
      "  Margem de negociação  ",
    );

    expect(from).toHaveBeenCalledWith("ajustes_valor_avaliacao");
    expect(consulta.insert).toHaveBeenCalledWith({
      user_id: "usuario-1",
      avaliacao_id: "avaliacao-1",
      valor_final: 2350,
      justificativa: "Margem de negociação",
    });
    expect(ajuste).toEqual({
      valorFinal: 2350,
      justificativa: "Margem de negociação",
      criadoEm: "2026-08-31T15:00:00.000Z",
    });
  });
});
