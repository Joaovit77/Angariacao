import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabase: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));

import { GET } from "@/app/api/investigador-imoveis/route";
import {
  consultaInicialDoAnuncio,
  urlInvestigadorDoComparavel,
  urlInvestigadorDoRadarAnuncio,
} from "@/lib/calculo/contextoInvestigador";
import { carregarContextoInvestigador } from "@/lib/investigadorImoveis";
import { carregarIdsComparaveisDosAnunciosComCliente } from "@/lib/persistencia/referenciasInvestigador";

const RADAR_ID = "33333333-3333-4333-8333-333333333333";
const COMPARAVEL_ID = "44444444-4444-4444-8444-444444444444";
const MENSAGEM_GENERICA =
  "Não foi possível carregar o imóvel indicado. Você ainda pode preencher a pesquisa manualmente.";

function clienteComContexto(data: unknown, userId = "usuario-autenticado", error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const filtrarUsuario = vi.fn().mockReturnValue({ maybeSingle });
  const filtrarId = vi.fn().mockReturnValue({ eq: filtrarUsuario });
  const select = vi.fn().mockReturnValue({ eq: filtrarId });
  const from = vi.fn().mockReturnValue({ select });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null });
  return {
    cliente: { auth: { getUser }, from },
    from,
    filtrarId,
    filtrarUsuario,
  };
}

function requisicao(parametro: "radarAnuncio" | "comparavel", id: string): Request {
  return new Request(`http://localhost/api/investigador-imoveis?${parametro}=${id}`, {
    headers: { Authorization: "Bearer token-valido" },
  });
}

describe("handoff Central e Radar para Investigador", () => {
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

  it("navega somente com o UUID persistido correspondente à origem", () => {
    const radar = new URL(urlInvestigadorDoRadarAnuncio(RADAR_ID), "https://angario.test");
    const central = new URL(urlInvestigadorDoComparavel(COMPARAVEL_ID), "https://angario.test");

    expect([...radar.searchParams.entries()]).toEqual([["radarAnuncio", RADAR_ID]]);
    expect([...central.searchParams.entries()]).toEqual([["comparavel", COMPARAVEL_ID]]);
    expect(`${radar}${central}`).not.toMatch(/Rua|Londrina|telefone|preco|descri/i);
  });

  it("monta uma consulta objetiva do anúncio sem copiar preço, descrição ou contato", () => {
    const consulta = consultaInicialDoAnuncio({
      portal: "olx",
      idExterno: "olx-987",
      titulo: "Apartamento anunciado por R$ 4.500",
      endereco: "Rua João Wyclif, 300",
      bairro: "Gleba Palhano",
      cidade: "Londrina",
      estado: "PR",
      tipo: "Apartamento",
      areaM2: 92,
      quartos: 3,
      banheiros: 2,
      vagas: 2,
    });

    expect(consulta).toBe(
      "Rua João Wyclif, 300, Gleba Palhano, Londrina, PR, Apartamento, 92 m², 3 quartos, 2 banheiros, 2 vagas, anúncio OLX olx-987",
    );
    expect(consulta).not.toContain("4.500");
  });

  it("resolve um anúncio do Radar pela linha do usuário e usa apenas dados públicos", async () => {
    const fake = clienteComContexto({
      id: RADAR_ID,
      portal: "olx",
      id_externo: "olx-123",
      dados: {
        titulo: "Apartamento na Gleba",
        endereco: "Rua João Wyclif, 300",
        bairro: "Gleba Palhano",
        cidade: "Londrina",
        tipo: "Apartamento",
        areaM2: 92,
        quartos: 3,
        banheiros: 2,
        vagas: 2,
        preco: 4500,
        descricao: "não deve sair",
        telefone: "não deve sair",
      },
    });
    mocks.createClient.mockReturnValue(fake.cliente);

    const resposta = await GET(requisicao("radarAnuncio", RADAR_ID));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(fake.from).toHaveBeenCalledWith("radar_anuncios");
    expect(fake.filtrarId).toHaveBeenCalledWith("id", RADAR_ID);
    expect(fake.filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(corpo.origem).toBe("radar");
    expect(corpo.consulta).toContain("Rua João Wyclif, 300");
    expect(JSON.stringify(corpo)).not.toMatch(/não deve sair|4500/);
  });

  it("resolve o comparável da Central com filtro explícito pelo proprietário", async () => {
    const fake = clienteComContexto({
      id: COMPARAVEL_ID,
      portal: "chaves-na-mao",
      id_externo: "cnm-456",
      titulo: "Casa no Centro",
      endereco: "Rua Sergipe, 10",
      bairro: "Centro",
      cidade: "Londrina",
      estado: "PR",
      tipo: "Casa",
      area_m2: "130.5",
      quartos: 3,
      banheiros: 2,
      vagas: 1,
      valor_anunciado: 6000,
    });
    mocks.createClient.mockReturnValue(fake.cliente);

    const resposta = await GET(requisicao("comparavel", COMPARAVEL_ID));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(fake.from).toHaveBeenCalledWith("comparaveis_mercado");
    expect(fake.filtrarId).toHaveBeenCalledWith("id", COMPARAVEL_ID);
    expect(fake.filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(corpo).toMatchObject({ origem: "central" });
    expect(corpo.consulta).toContain("130,5 m²");
    expect(JSON.stringify(corpo)).not.toContain("6000");
  });

  it("não distingue referência inacessível de inexistente e rejeita origens ambíguas", async () => {
    const inacessivel = clienteComContexto(null);
    const inexistente = clienteComContexto(null);
    mocks.createClient
      .mockReturnValueOnce(inacessivel.cliente)
      .mockReturnValueOnce(inexistente.cliente);

    const primeira = await GET(requisicao("comparavel", COMPARAVEL_ID));
    const segunda = await GET(requisicao("comparavel", "55555555-5555-4555-8555-555555555555"));
    const ambigua = await GET(new Request(
      `http://localhost/api/investigador-imoveis?comparavel=${COMPARAVEL_ID}&radarAnuncio=${RADAR_ID}`,
      { headers: { Authorization: "Bearer token-valido" } },
    ));

    expect(primeira.status).toBe(404);
    expect(segunda.status).toBe(404);
    await expect(primeira.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
    await expect(segunda.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(ambigua.status).toBe(400);
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
  });

  it("reconsulta a referência após refresh sem POST nem payload na URL", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({
      consulta: "Rua Sergipe, 10",
      origem: "central",
    })));
    vi.stubGlobal("fetch", fetcher);

    const referencia = { origem: "comparavel", id: COMPARAVEL_ID } as const;
    await carregarContextoInvestigador(referencia);
    await carregarContextoInvestigador(referencia);

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, opcoes] of fetcher.mock.calls) {
      const destino = new URL(String(url), "https://angario.test");
      expect([...destino.searchParams.entries()]).toEqual([["comparavel", COMPARAVEL_ID]]);
      expect(opcoes.method).toBeUndefined();
      expect(opcoes.body).toBeUndefined();
      expect(opcoes.cache).toBe("no-store");
    }
  });

  it("mapeia somente comparáveis persistidos do usuário e deixa os demais sem ação", async () => {
    const executarIn = vi.fn().mockResolvedValue({
      data: [{ id: COMPARAVEL_ID, portal: "olx", id_externo: "persistido" }],
      error: null,
    });
    const filtrarPortal = vi.fn().mockReturnValue({ in: executarIn });
    const filtrarUsuario = vi.fn().mockReturnValue({ eq: filtrarPortal });
    const select = vi.fn().mockReturnValue({ eq: filtrarUsuario });
    const from = vi.fn().mockReturnValue({ select });
    const anuncios = [
      { portal: "olx", idExterno: "persistido", titulo: "A", url: "https://olx.test/a", anunciante: "incerto" },
      { portal: "olx", idExterno: "transitorio", titulo: "B", url: "https://olx.test/b", anunciante: "incerto" },
    ] as const;

    const ids = await carregarIdsComparaveisDosAnunciosComCliente(
      { from } as never,
      "usuario-autenticado",
      [...anuncios],
    );

    expect(from).toHaveBeenCalledWith("comparaveis_mercado");
    expect(filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(filtrarPortal).toHaveBeenCalledWith("portal", "olx");
    expect(executarIn).toHaveBeenCalledWith("id_externo", ["persistido", "transitorio"]);
    expect(ids.get("olx:persistido")).toBe(COMPARAVEL_ID);
    expect(ids.has("olx:transitorio")).toBe(false);
  });

  it("exibe atalhos contextuais sem iniciar automaticamente a investigação", () => {
    const raiz = join(import.meta.dirname, "..");
    const central = readFileSync(join(raiz, "components/central/CentralAngariacaoView.tsx"), "utf8");
    const investigador = readFileSync(
      join(raiz, "components/investigador/InvestigadorImoveisView.tsx"),
      "utf8",
    );
    const efeito = investigador.slice(
      investigador.indexOf("useEffect(() =>"),
      investigador.indexOf("async function investigar"),
    );

    expect(central).toContain("urlInvestigadorDoRadarAnuncio(item.id)");
    expect(central).toContain("comparavelId ? <Link");
    expect(central).toContain("urlInvestigadorDoComparavel(comparavelId)");
    expect(efeito).toContain("carregarContextoInvestigador");
    expect(efeito).not.toContain("investigarImovel(");
  });
});
