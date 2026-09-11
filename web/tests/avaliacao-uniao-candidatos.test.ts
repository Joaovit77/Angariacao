/* ================================================================
   UNIÃO DE CANDIDATOS DA AVALIAÇÃO RÁPIDA

   A rota entrega candidatos; quem decide o que é comparável é
   avaliarImovel(). Contar candidatos vetoriais antes da validação
   geográfica esconde o mercado do bairro, porque a RPC vetorial só
   enxerga linhas que já possuem embedding.

   Caso real reproduzido: Avenida Inglaterra, 700 — Igapó, Londrina/PR.
   ================================================================ */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  avaliarImovel,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";

const mocks = vi.hoisted(() => ({ cliente: vi.fn(), embedding: vi.fn(), estruturados: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.cliente }));
vi.mock("@/lib/servidor/embeddingsImoveis", () => ({
  gerarEmbeddingsDeImoveis: mocks.embedding,
  modeloEmbeddingImoveis: () => "modelo-fixture",
}));
// Somente a leitura estruturada é substituída: o mapeamento do catálogo
// continua real para que o teste exercite o contrato de verdade.
vi.mock("@/lib/persistencia/comparaveisMercado", async (original) => ({
  ...(await original<typeof import("@/lib/persistencia/comparaveisMercado")>()),
  carregarComparaveisMercadoComCliente: mocks.estruturados,
}));
import { POST } from "@/app/api/avaliacao/comparaveis/route";

const HOJE = "2026-09-10";
const USUARIO = "usuario-fixture";

/** Igapó é o bairro postal da Av. Inglaterra, dentro do bairro oficial
    Inglaterra (Zona Sul). A coordenada é a real da avenida à altura do
    nº 700 e resolve para Zona Sul pelos polígonos do SIGLON, em acordo
    com o bairro. */
const ENTRADA: EntradaAvaliacao = {
  finalidade: "locacao",
  endereco: "Avenida Inglaterra, 700",
  bairro: "Igapó",
  cidade: "Londrina",
  estado: "PR",
  edificio: "Portal da Inglaterra",
  tipo: "Apartamento",
  areaM2: 55,
  quartos: 3,
  banheiros: 1,
  vagas: 1,
  conservacao: "Bom",
  latitude: -23.3456,
  longitude: -51.1472,
};

/** As três — e somente três — linhas com embedding na faixa objetiva do caso.
    Nenhuma delas sobrevive ao critério regional do motor. */
const LINHAS_VETORIAIS = [
  {
    id: "vetorial-california",
    portal: "chaves-na-mao",
    id_externo: "CA-48",
    url: "https://exemplo.test/ca-48",
    titulo: "Apartamento no Califórnia",
    tipo: "Apartamento",
    endereco: null,
    bairro: "Califórnia",
    cidade: "Londrina",
    estado: "PR",
    area_m2: 48,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    latitude: null,
    longitude: null,
    valor_anunciado: 1450,
    publicado_em: null,
    ultimo_visto_em: "2026-09-10T19:56:45.271Z",
    status_anuncio: "ativo",
    similaridade_vetorial: 0.81,
  },
  {
    id: "vetorial-olimpico",
    portal: "wimoveis",
    id_externo: "OL-60",
    url: "https://exemplo.test/ol-60",
    titulo: "Apartamento no Olímpico",
    tipo: "Apartamento",
    endereco: null,
    bairro: "Olímpico",
    cidade: "Londrina",
    estado: "PR",
    area_m2: 60,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    latitude: null,
    longitude: null,
    valor_anunciado: 1400,
    publicado_em: null,
    ultimo_visto_em: "2026-09-10T19:56:45.271Z",
    status_anuncio: "ativo",
    similaridade_vetorial: 0.79,
  },
  {
    id: "vetorial-aurora",
    portal: "viva-real",
    id_externo: "AU-71",
    url: "https://exemplo.test/au-71",
    titulo: "Apartamento na Aurora",
    tipo: "Apartamento",
    endereco: null,
    bairro: "Aurora",
    cidade: "Londrina",
    estado: "PR",
    area_m2: 71,
    quartos: 3,
    banheiros: 2,
    vagas: 1,
    latitude: null,
    longitude: null,
    valor_anunciado: 2900,
    publicado_em: null,
    ultimo_visto_em: "2026-09-09T19:28:03.866Z",
    status_anuncio: "ativo",
    similaridade_vetorial: 0.86,
  },
];

const METADADOS_VETORIAIS = [
  { id: "vetorial-california", regiao: "Zona Leste" },
  { id: "vetorial-olimpico", regiao: "Zona Oeste" },
  { id: "vetorial-aurora", regiao: null },
];

/** Comparáveis reais do Igapó. Nenhum possui embedding, então só a busca
    estruturada os alcança. */
function comparavelDoIgapo(
  id: string,
  endereco: string,
  areaM2: number,
  quartos: number,
  valorAnunciado: number,
  parcial: Partial<ComparavelAvaliacao> = {},
): ComparavelAvaliacao {
  return {
    origem: "externo",
    id,
    idExterno: id.toUpperCase(),
    codigo: "chaves-na-mao",
    endereco,
    bairro: "Igapó",
    cidade: "Londrina",
    estado: "PR",
    regiao: null,
    edificio: null,
    tipo: "Apartamento",
    areaM2,
    quartos,
    banheiros: null,
    vagas: null,
    conservacao: null,
    latitude: null,
    longitude: null,
    valorAnunciado,
    dataInformacao: "2026-08-22",
    url: `https://exemplo.test/${id}`,
    status: "Anunciado",
    similaridadeVetorial: null,
    historico: null,
    ...parcial,
  };
}

const ESTRUTURADOS_IGAPO = [
  comparavelDoIgapo("igapo-inglaterra-537", "Avenida Inglaterra, 537", 55, 2, 1400),
  comparavelDoIgapo("igapo-china-225", "Rua China, 225", 55, 3, 1050),
  comparavelDoIgapo("igapo-belgica-1413", "Rua Bélgica, 1413", 64, 3, 2500),
];

function clienteSupabase(
  linhas: unknown[] = LINHAS_VETORIAIS,
  metadados: unknown[] = METADADOS_VETORIAIS,
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: USUARIO } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: linhas, error: null }),
    from: vi.fn(() => ({
      select: () => ({
        in: () => Promise.resolve({ data: metadados, error: null }),
      }),
    })),
  };
}

async function candidatosDaRota(entrada: EntradaAvaliacao = ENTRADA) {
  const resposta = await POST(new Request("http://localhost/api/avaliacao/comparaveis", {
    method: "POST",
    headers: { Authorization: "Bearer sessao-fixture", "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
  }));
  expect(resposta.status).toBe(200);
  return await resposta.json() as { modo: string; comparaveis: ComparavelAvaliacao[] };
}

describe("candidatos da Avaliação Rápida com amostra vetorial de outra região", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-ficticia");
    vi.stubEnv("OPENAI_API_KEY", "chave-ficticia");
    mocks.cliente.mockReturnValue(clienteSupabase());
    mocks.embedding.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mocks.estruturados.mockResolvedValue(ESTRUTURADOS_IGAPO);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("não trata três candidatos vetoriais como amostra suficiente antes da validação regional", async () => {
    const dados = await candidatosDaRota();

    // A suficiência da amostra não pode ser decidida pela contagem bruta de
    // candidatos vetoriais: a RPC só enxerga linhas que já têm embedding.
    expect(mocks.estruturados).toHaveBeenCalledWith(
      expect.anything(),
      USUARIO,
      expect.objectContaining({ bairro: "Igapó", cidade: "Londrina", estado: "PR" }),
    );
    expect(dados.comparaveis.map((item) => item.id)).toEqual(
      expect.arrayContaining(ESTRUTURADOS_IGAPO.map((item) => item.id)),
    );
  });

  it("entrega ao motor o mercado do próprio bairro em vez de terminar sem referência", async () => {
    const dados = await candidatosDaRota();
    const resultado = avaliarImovel(ENTRADA, dados.comparaveis, HOJE);

    expect(resultado.situacao).not.toBe("insuficiente");
    expect(resultado.valorRecomendado).not.toBeNull();
    expect(resultado.comparaveis).toHaveLength(3);
    expect(resultado.comparaveis.every((item) => item.bairro === "Igapó")).toBe(true);
    expect(resultado.metodologia.regiaoReferencia).toBe("Zona Sul");
  });

  it("continua sem inventar valor quando não existe referência local real", async () => {
    mocks.estruturados.mockResolvedValue([]);
    const dados = await candidatosDaRota();
    const resultado = avaliarImovel(ENTRADA, dados.comparaveis, HOJE);

    expect(resultado.situacao).toBe("insuficiente");
    expect(resultado.valorRecomendado).toBeNull();
    expect(resultado.comparaveis).toHaveLength(0);
  });

  it("não deixa a amostra maior arrastar comparáveis de outra região para dentro", async () => {
    // Fortes em tudo — tipo, área, quartos, recência — e ainda assim de outra
    // zona da mesma cidade. Amostra maior não pode virar amostra mais frouxa.
    const outraRegiao = [
      comparavelDoIgapo("zona-norte-1", "Rua Cinco Conjuntos, 100", 55, 3, 3200, {
        bairro: "Cinco Conjuntos", regiao: "Zona Norte", idExterno: "ZN-1",
      }),
      comparavelDoIgapo("zona-leste-2", "Rua Lindóia, 200", 56, 3, 3400, {
        bairro: "Lindóia", regiao: "Zona Leste", idExterno: "ZL-2",
      }),
      comparavelDoIgapo("zona-oeste-3", "Rua Sabará, 300", 54, 3, 3300, {
        bairro: "Sabará", regiao: "Zona Oeste", idExterno: "ZO-3",
      }),
    ];
    mocks.estruturados.mockResolvedValue([...ESTRUTURADOS_IGAPO, ...outraRegiao]);
    const dados = await candidatosDaRota();
    const resultado = avaliarImovel(ENTRADA, dados.comparaveis, HOJE);

    expect(dados.comparaveis).toHaveLength(9);
    expect(resultado.comparaveis.map((item) => item.id).sort())
      .toEqual(ESTRUTURADOS_IGAPO.map((item) => item.id).sort());
    const usados = new Set(resultado.comparaveis.map((item) => item.id));
    expect(outraRegiao.some((item) => usados.has(item.id))).toBe(false);
  });

  it("mantém o próprio anúncio fora da amostra quando a avaliação nasce de um comparável", async () => {
    const alvo = comparavelDoIgapo(
      "b2b0f6d4-1c33-4f2a-9d51-7c4a8e5b6f10",
      "Avenida Inglaterra, 700",
      55,
      3,
      1600,
      { idExterno: "ALVO-700" },
    );
    const entrada: EntradaAvaliacao = {
      ...ENTRADA,
      origemExterna: {
        tipo: "comparavel",
        referenciaId: "b2b0f6d4-1c33-4f2a-9d51-7c4a8e5b6f10",
        comparavelId: "b2b0f6d4-1c33-4f2a-9d51-7c4a8e5b6f10",
        portal: "chaves-na-mao",
        idExterno: "ALVO-700",
      },
    };
    // O alvo já vetorizado chega pela RPC. A união não pode deixá-lo passar.
    const cliente = clienteSupabase(
      [...LINHAS_VETORIAIS, {
        ...LINHAS_VETORIAIS[0],
        id: "b2b0f6d4-1c33-4f2a-9d51-7c4a8e5b6f10",
        portal: "chaves-na-mao",
        id_externo: "ALVO-700",
        bairro: "Igapó",
        area_m2: 55,
        quartos: 3,
      }],
      METADADOS_VETORIAIS,
    );
    mocks.cliente.mockReturnValue(cliente);
    mocks.estruturados.mockResolvedValue(ESTRUTURADOS_IGAPO);

    const dados = await candidatosDaRota(entrada);
    expect(dados.comparaveis.some((item) => item.idExterno === "ALVO-700")).toBe(false);

    // E, mesmo que o alvo chegasse ao motor por qualquer outro caminho, ele
    // continua fora da própria amostra.
    const resultado = avaliarImovel(entrada, [...dados.comparaveis, alvo], HOJE);
    expect(resultado.comparaveis.some((item) => item.idExterno === "ALVO-700")).toBe(false);
    expect(resultado.comparaveis).toHaveLength(3);
  });

  it("preserva o fallback estruturado quando a geração de embedding falha", async () => {
    const cliente = clienteSupabase();
    mocks.cliente.mockReturnValue(cliente);
    mocks.embedding.mockRejectedValueOnce(new Error("embedding indisponível"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const dados = await candidatosDaRota();

    expect(dados.modo).toBe("estruturado");
    expect(cliente.rpc).not.toHaveBeenCalled();
    expect(dados.comparaveis.map((item) => item.id))
      .toEqual(ESTRUTURADOS_IGAPO.map((item) => item.id));
    expect(avaliarImovel(ENTRADA, dados.comparaveis, HOJE).situacao).not.toBe("insuficiente");
  });

  it("não regride o caso em que a amostra vetorial já era válida no próprio bairro", async () => {
    // Mesmas três ofertas do Igapó, agora vetorizadas. O complemento
    // estruturado devolve as mesmas linhas e não pode duplicá-las nem apagar
    // a similaridade semântica já calculada.
    const linhasIgapo = ESTRUTURADOS_IGAPO.map((item, indice) => ({
      id: item.id,
      portal: item.codigo,
      id_externo: item.idExterno,
      url: item.url,
      titulo: item.endereco,
      tipo: item.tipo,
      endereco: item.endereco,
      bairro: item.bairro,
      cidade: item.cidade,
      estado: item.estado,
      area_m2: item.areaM2,
      quartos: item.quartos,
      banheiros: null,
      vagas: null,
      latitude: null,
      longitude: null,
      valor_anunciado: item.valorAnunciado,
      publicado_em: item.dataInformacao,
      ultimo_visto_em: "2026-08-22T18:12:43.494Z",
      status_anuncio: "ativo",
      similaridade_vetorial: 0.9 - indice * 0.05,
    }));
    mocks.cliente.mockReturnValue(clienteSupabase(linhasIgapo, []));
    const dados = await candidatosDaRota();
    const resultado = avaliarImovel(ENTRADA, dados.comparaveis, HOJE);

    expect(dados.comparaveis).toHaveLength(3);
    expect(resultado.situacao).not.toBe("insuficiente");
    expect(resultado.comparaveis).toHaveLength(3);
    expect(resultado.metodologia.comparaveisComEmbedding).toBe(3);
  });
});
