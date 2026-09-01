import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));

import { GET } from "@/app/api/avaliacao/contexto/route";
import {
  avaliarImovel,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";
import {
  urlAvaliacaoDoComparavel,
  urlAvaliacaoDoRadarAnuncio,
} from "@/lib/calculo/contextoAvaliacao";
import { carregarContextoAvaliacao } from "@/lib/contextoAvaliacao";
import { registrarAvaliacao } from "@/lib/persistencia/avaliacoes";

const RADAR_ID = "33333333-3333-4333-8333-333333333333";
const COMPARAVEL_ID = "44444444-4444-4444-8444-444444444444";
const MENSAGEM_GENERICA =
  "Não foi possível carregar o anúncio indicado. Você ainda pode preencher a avaliação manualmente.";

function clienteComRespostas(respostas: Array<{ data: unknown; error: unknown }>) {
  const fila = [...respostas];
  const consulta: Record<string, ReturnType<typeof vi.fn>> = {};
  consulta.eq = vi.fn(() => consulta);
  consulta.order = vi.fn(() => consulta);
  consulta.limit = vi.fn(() => consulta);
  consulta.maybeSingle = vi.fn(async () => fila.shift() || { data: null, error: null });
  const select = vi.fn(() => consulta);
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: "usuario-autenticado" } },
    error: null,
  });
  return { cliente: { auth: { getUser }, from }, from, select, consulta };
}

function requisicao(parametro: "radarAnuncio" | "comparavel", id: string): Request {
  return new Request(`http://localhost/api/avaliacao/contexto?${parametro}=${id}`, {
    headers: { Authorization: "Bearer token-valido" },
  });
}

describe("handoff da Central e do Radar para Avaliação Rápida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.getSupabase.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "token-valido" } },
        }),
      },
    });
  });

  it("navega somente com o UUID persistido da origem", () => {
    const radar = new URL(urlAvaliacaoDoRadarAnuncio(RADAR_ID), "https://angario.test");
    const central = new URL(urlAvaliacaoDoComparavel(COMPARAVEL_ID), "https://angario.test");

    expect([...radar.searchParams.entries()]).toEqual([["radarAnuncio", RADAR_ID]]);
    expect([...central.searchParams.entries()]).toEqual([["comparavel", COMPARAVEL_ID]]);
    expect(`${radar}${central}`).not.toMatch(/Rua|Londrina|telefone|preco|descri|4500/i);
  });

  it("resolve o comparável da Central sob o usuário e devolve apenas o prefill necessário", async () => {
    const fake = clienteComRespostas([{ data: {
      id: COMPARAVEL_ID,
      portal: "olx",
      id_externo: "olx-123",
      finalidade: "locacao",
      endereco: "Rua João Wyclif, 300",
      bairro: "Gleba Palhano",
      cidade: "Londrina",
      estado: "PR",
      tipo: "Apartamento",
      area_privativa_m2: "92.5",
      area_m2: 90,
      quartos: 3,
      banheiros: 2,
      vagas: 2,
      valor_anunciado: 4500,
      telefone: "não deve sair",
    }, error: null }]);
    mocks.createClient.mockReturnValue(fake.cliente);

    const resposta = await GET(requisicao("comparavel", COMPARAVEL_ID));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(fake.from).toHaveBeenCalledWith("comparaveis_mercado");
    expect(fake.consulta.eq).toHaveBeenCalledWith("id", COMPARAVEL_ID);
    expect(fake.consulta.eq).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(corpo).toMatchObject({
      origem: "central",
      prefill: {
        finalidade: "locacao",
        endereco: "Rua João Wyclif, 300",
        areaM2: 92.5,
        quartos: 3,
      },
      origemExterna: {
        tipo: "comparavel",
        referenciaId: COMPARAVEL_ID,
        comparavelId: COMPARAVEL_ID,
        portal: "olx",
        idExterno: "olx-123",
      },
    });
    expect(JSON.stringify(corpo)).not.toMatch(/4500|telefone|valor.anunciado|não deve sair/i);
  });

  it("resolve o Radar pelo snapshot e localiza o comparável equivalente sem expor preço", async () => {
    const fake = clienteComRespostas([
      { data: {
        id: RADAR_ID,
        portal: "wimoveis",
        id_externo: "wim-987",
        dados: {
          endereco: "Rua Bélgica, 80",
          bairro: "Igapó",
          cidade: "Londrina",
          tipo: "Casa",
          areaM2: 130,
          quartos: 3,
          banheiros: 2,
          vagas: 2,
          preco: 3200,
          descricao: "não deve sair",
          telefone: "não deve sair",
        },
      }, error: null },
      { data: { id: COMPARAVEL_ID }, error: null },
    ]);
    mocks.createClient.mockReturnValue(fake.cliente);

    const resposta = await GET(requisicao("radarAnuncio", RADAR_ID));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(fake.from).toHaveBeenNthCalledWith(1, "radar_anuncios");
    expect(fake.from).toHaveBeenNthCalledWith(2, "comparaveis_mercado");
    expect(fake.consulta.eq).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(fake.consulta.eq).toHaveBeenCalledWith("portal", "wimoveis");
    expect(fake.consulta.eq).toHaveBeenCalledWith("id_externo", "wim-987");
    expect(corpo).toMatchObject({
      origem: "radar",
      prefill: { endereco: "Rua Bélgica, 80", areaM2: 130, quartos: 3 },
      origemExterna: {
        tipo: "radar-anuncio",
        referenciaId: RADAR_ID,
        comparavelId: COMPARAVEL_ID,
      },
    });
    expect(JSON.stringify(corpo)).not.toMatch(/3200|telefone|descri|não deve sair/i);
  });

  it("não distingue referência inacessível de inexistente e rejeita UUID ou origem ambígua", async () => {
    const fake = clienteComRespostas([
      { data: null, error: null },
      { data: null, error: null },
    ]);
    mocks.createClient.mockReturnValue(fake.cliente);

    const inacessivel = await GET(requisicao("comparavel", COMPARAVEL_ID));
    const inexistente = await GET(requisicao("comparavel", "55555555-5555-4555-8555-555555555555"));
    const invalido = await GET(requisicao("comparavel", "nao-e-uuid"));
    const ambiguo = await GET(new Request(
      `http://localhost/api/avaliacao/contexto?comparavel=${COMPARAVEL_ID}&radarAnuncio=${RADAR_ID}`,
      { headers: { Authorization: "Bearer token-valido" } },
    ));

    expect(inacessivel.status).toBe(404);
    expect(inexistente.status).toBe(404);
    await expect(inacessivel.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
    await expect(inexistente.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(invalido.status).toBe(400);
    expect(ambiguo.status).toBe(400);
  });

  it("reconsulta a referência no refresh sem POST nem payload imobiliário", async () => {
    const contexto = {
      origem: "central",
      prefill: {
        finalidade: "locacao",
        endereco: "Rua Sergipe, 10",
        bairro: "Centro",
        cidade: "Londrina",
        estado: "PR",
        tipo: "Apartamento",
        areaM2: 70,
        quartos: 2,
        banheiros: 1,
        vagas: 1,
      },
      origemExterna: {
        tipo: "comparavel",
        referenciaId: COMPARAVEL_ID,
        comparavelId: COMPARAVEL_ID,
        portal: "olx",
        idExterno: "olx-123",
      },
    } as const;
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json(contexto)));
    vi.stubGlobal("fetch", fetcher);
    const referencia = { origem: "comparavel", id: COMPARAVEL_ID } as const;

    await carregarContextoAvaliacao(referencia);
    await carregarContextoAvaliacao(referencia);

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, opcoes] of fetcher.mock.calls) {
      const destino = new URL(String(url), "https://angario.test");
      expect([...destino.searchParams.entries()]).toEqual([["comparavel", COMPARAVEL_ID]]);
      expect(opcoes.method).toBeUndefined();
      expect(opcoes.body).toBeUndefined();
      expect(opcoes.cache).toBe("no-store");
    }
  });

  it("exibe Avaliar apenas para a Central persistida, usa o Radar persistido e não calcula no efeito", () => {
    const raiz = join(import.meta.dirname, "..");
    const central = readFileSync(join(raiz, "components/central/CentralAngariacaoView.tsx"), "utf8");
    const avaliacao = readFileSync(join(raiz, "components/avaliacao/AvaliacaoRapidaView.tsx"), "utf8");
    const efeito = avaliacao.slice(
      avaliacao.indexOf("useEffect(() =>"),
      avaliacao.indexOf("function atualizar"),
    );

    expect(central).toContain("urlAvaliacaoDoRadarAnuncio(item.id)");
    expect(central).toContain("comparavelId ? <Link");
    expect(central).toContain("urlAvaliacaoDoComparavel(comparavelId)");
    expect(efeito).toContain("carregarContextoAvaliacao");
    expect(efeito).not.toContain("calcular(");
    expect(avaliacao).toContain("valor anunciado não foi usado como expectativa nem como insumo do cálculo");
  });

  it("preserva os acessos existentes do Pipeline e o preenchimento manual", () => {
    const raiz = join(import.meta.dirname, "..");
    const pagina = readFileSync(join(raiz, "app/(painel)/avaliacao/page.tsx"), "utf8");
    const tela = readFileSync(join(raiz, "components/avaliacao/AvaliacaoRapidaView.tsx"), "utf8");
    const modal = readFileSync(join(raiz, "components/modais/ModalImovel.tsx"), "utf8");

    expect(pagina).toContain("imovelIdInicial={imovelIdInicial}");
    expect(tela).toContain("formularioInicial(imoveis, imovelIdInicial)");
    expect(tela).toContain("Preencher um novo endereço");
    expect(modal).toContain("/avaliacao?imovel=");
  });
});

describe("autocomparação e persistência da avaliação externa", () => {
  const entrada: EntradaAvaliacao = {
    imovelId: null,
    finalidade: "locacao",
    endereco: "Rua A, 10",
    bairro: "Centro",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    conservacao: "Bom",
    origemExterna: {
      tipo: "radar-anuncio",
      referenciaId: RADAR_ID,
      comparavelId: COMPARAVEL_ID,
      portal: "olx",
      idExterno: "olx-alvo",
    },
  };

  function comparavel(
    id: string,
    idExterno: string,
    valor: number,
  ): ComparavelAvaliacao {
    return {
      origem: "externo",
      id,
      idExterno,
      codigo: "olx",
      endereco: "Rua A, 20",
      bairro: "Centro",
      cidade: "Londrina",
      tipo: "Apartamento",
      areaM2: 70,
      quartos: 2,
      banheiros: 1,
      vagas: 1,
      valorAnunciado: valor,
      dataInformacao: "2026-08-30",
      status: "Anunciado",
    };
  }

  it("não usa o anúncio-alvo nem outra linha com a mesma identidade como comparável de si mesmo", () => {
    const resultado = avaliarImovel(entrada, [
      comparavel(COMPARAVEL_ID, "olx-alvo", 9999),
      comparavel("duplicata-global", "olx-alvo", 9999),
      comparavel("comp-1", "outro-1", 2100),
      comparavel("comp-2", "outro-2", 2200),
      comparavel("comp-3", "outro-3", 2300),
    ], "2026-09-01");

    expect(resultado.metodologia.comparaveisCandidatos).toBe(3);
    expect(resultado.comparaveis.map((item) => item.id).sort())
      .toEqual(["comp-1", "comp-2", "comp-3"]);
    expect(resultado.valorRecomendado).toBe(2200);
  });

  it("registra a origem no snapshot, mantém imovel_id nulo e não cria Imovel", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: "avaliacao-1", created_at: "2026-09-01T12:00:00.000Z" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    mocks.getSupabase.mockReturnValue({ from });
    const resultado = avaliarImovel(entrada, [
      comparavel("comp-1", "outro-1", 2100),
      comparavel("comp-2", "outro-2", 2200),
      comparavel("comp-3", "outro-3", 2300),
    ], "2026-09-01");

    await registrarAvaliacao("usuario-autenticado", entrada, null, resultado);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("avaliacoes_imoveis");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "usuario-autenticado",
      imovel_id: null,
      valor_proprietario: null,
      dados_entrada: expect.objectContaining({
        imovelId: null,
        origemExterna: entrada.origemExterna,
      }),
    }));
  });
});
