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
  consultaInicialDoImovel,
  urlInvestigadorDoImovel,
} from "@/lib/calculo/contextoInvestigador";
import { carregarContextoInvestigador } from "@/lib/investigadorImoveis";

const IMOVEL_ID = "11111111-1111-4111-8111-111111111111";
const OUTRO_ID = "22222222-2222-4222-8222-222222222222";
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
    select,
    filtrarId,
    filtrarUsuario,
    maybeSingle,
  };
}

function requisicao(id = IMOVEL_ID): Request {
  return new Request(`http://localhost/api/investigador-imoveis?imovel=${id}`, {
    headers: { Authorization: "Bearer token-valido" },
  });
}

describe("handoff Pipeline para Investigador", () => {
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

  it("navega somente com o identificador do imóvel", () => {
    const destino = new URL(urlInvestigadorDoImovel(IMOVEL_ID), "https://angario.test");
    expect(destino.pathname).toBe("/investigador-imoveis");
    expect([...destino.searchParams.keys()]).toEqual(["imovel"]);
    expect(destino.searchParams.get("imovel")).toBe(IMOVEL_ID);
    expect(destino.toString()).not.toContain("Rua");
    expect(destino.toString()).not.toContain("proprietario");

    const raiz = join(import.meta.dirname, "..");
    const drawer = readFileSync(join(raiz, "components/pipeline/PipelineView.tsx"), "utf8");
    const modal = readFileSync(join(raiz, "components/modais/ModalImovel.tsx"), "utf8");
    expect(drawer).toContain("href={urlInvestigadorDoImovel(imovel.id)}");
    expect(modal).toContain("router.push(urlInvestigadorDoImovel(imovel.id))");
    expect(drawer).toContain("Investigar na web");
    expect(modal).toContain("Investigar na web");
  });

  it("monta um prefill útil somente com campos reais e não sensíveis", () => {
    const consulta = consultaInicialDoImovel({
      id: IMOVEL_ID,
      codigo: "LD-123",
      referenciaCrm: "01860.001",
      endereco: "Rua Joel Braz de Oliveira, 741",
      bairro: "Gleba Palhano",
      cidade: "Londrina",
      estado: "PR",
      unidade: "101",
      bloco: "Torre 2",
      edificio: "Ed. Vivere",
      tipo: "Apartamento",
      quartos: 3,
      banheiros: 2,
      vagas: 2,
    });

    expect(consulta).toBe(
      "Rua Joel Braz de Oliveira, 741, unidade 101, bloco Torre 2, Gleba Palhano, Londrina, PR, Ed. Vivere, Apartamento, 3 quartos, 2 banheiros, 2 vagas, referência 01860.001, código LD-123",
    );
    expect(consulta).not.toContain("proprietário");
    expect(consulta).not.toContain("telefone");
    expect(consulta).not.toContain("R$");
  });

  it("não transforma campos ausentes em afirmações", () => {
    const consulta = consultaInicialDoImovel({
      id: IMOVEL_ID,
      endereco: "Rua Sergipe, 10",
      codigo: null,
      referenciaCrm: null,
      bairro: null,
      cidade: null,
      estado: null,
      unidade: null,
      bloco: null,
      edificio: null,
      tipo: null,
      quartos: null,
      banheiros: null,
      vagas: null,
    });
    expect(consulta).toBe("Rua Sergipe, 10");
    expect(consulta).not.toMatch(/quarto|banheiro|vaga|referência|código|null|undefined/);
  });

  it("resolve o imóvel acessível com RLS e filtro explícito pelo usuário autenticado", async () => {
    const fake = clienteComContexto({
      id: IMOVEL_ID,
      codigo: "LD-123",
      referencia_crm: null,
      endereco: "Rua Sergipe, 10",
      bairro: "Centro",
      cidade: "Londrina",
      estado: "PR",
      unidade: null,
      bloco: null,
      edificio: null,
      tipo: "Casa",
      quartos: 2,
      banheiros: null,
      vagas: 1,
      proprietario_nome: "não deve sair",
      proprietario_telefone: "não deve sair",
    });
    mocks.createClient.mockReturnValue(fake.cliente);

    const resposta = await GET(requisicao());
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(fake.from).toHaveBeenCalledWith("imoveis");
    expect(fake.filtrarId).toHaveBeenCalledWith("id", IMOVEL_ID);
    expect(fake.filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(corpo.consulta).toContain("Rua Sergipe, 10");
    expect(JSON.stringify(corpo)).not.toContain("não deve sair");
  });

  it("recusa UUID inválido antes de consultar autenticação ou banco", async () => {
    const resposta = await GET(requisicao("nao-e-uuid"));
    expect(resposta.status).toBe(400);
    await expect(resposta.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("não distingue imóvel de outro usuário de ID inexistente", async () => {
    const inacessivel = clienteComContexto(null);
    const inexistente = clienteComContexto(null);
    mocks.createClient
      .mockReturnValueOnce(inacessivel.cliente)
      .mockReturnValueOnce(inexistente.cliente);

    const respostaInacessivel = await GET(requisicao(IMOVEL_ID));
    const respostaInexistente = await GET(requisicao(OUTRO_ID));
    const [corpoInacessivel, corpoInexistente] = await Promise.all([
      respostaInacessivel.json(),
      respostaInexistente.json(),
    ]);

    expect(respostaInacessivel.status).toBe(404);
    expect(respostaInexistente.status).toBe(404);
    expect(corpoInacessivel).toEqual({ mensagem: MENSAGEM_GENERICA });
    expect(corpoInexistente).toEqual(corpoInacessivel);
    expect(inacessivel.filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-autenticado");
  });

  it("reconsulta o contexto após uma nova montagem ou refresh e nunca o armazena em memória", async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(Response.json({ consulta: "Rua Sergipe, 10" })),
    );
    vi.stubGlobal("fetch", fetcher);

    await carregarContextoInvestigador(IMOVEL_ID);
    await carregarContextoInvestigador(IMOVEL_ID);

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, opcoes] of fetcher.mock.calls) {
      const destino = new URL(String(url), "https://angario.test");
      expect([...destino.searchParams.keys()]).toEqual(["imovel"]);
      expect(destino.searchParams.get("imovel")).toBe(IMOVEL_ID);
      expect(opcoes).toMatchObject({
        cache: "no-store",
        headers: { Authorization: "Bearer token-valido" },
      });
      expect(opcoes.body).toBeUndefined();
    }
  });

  it("mantém o modo manual e não inicia investigação durante o prefill", () => {
    const raiz = join(import.meta.dirname, "..");
    const componente = readFileSync(
      join(raiz, "components/investigador/InvestigadorImoveisView.tsx"),
      "utf8",
    );
    const pagina = readFileSync(join(raiz, "app/(painel)/investigador-imoveis/page.tsx"), "utf8");
    const efeito = componente.slice(componente.indexOf("useEffect(() =>"), componente.indexOf("async function investigar"));

    expect(pagina).toContain('imovelIdInicial={imovelId || null}');
    expect(componente).toContain('<form className={styles.formulario} onSubmit={investigar}>');
    expect(componente).toContain('const [consulta, setConsulta] = useState("")');
    expect(efeito).toContain("carregarContextoInvestigador");
    expect(efeito).not.toContain("investigarImovel(");
  });
});
