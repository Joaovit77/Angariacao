import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* R5 na rota real da Central: aquisição e retry reais; banco, cache e rede
   simulados. A espera real do retry é a mínima (750 ms, jitter fixado). */

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  salvarComparaveisMercado: vi.fn(),
  registrarEvento: vi.fn(),
  buscarComNavegador: vi.fn(),
}));
const armazenamentos = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/comparaveisMercado", () => ({ salvarComparaveisMercado: mocks.salvarComparaveisMercado }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/scraperCentralAngariacao", () => ({
  buscarComNavegador: mocks.buscarComNavegador,
  NavegadorIndisponivel: class NavegadorIndisponivel extends Error {},
}));
vi.mock("@vercel/functions", () => ({
  getCache: ({ namespace }: { namespace: string }) => ({
    get: async (chave: string) => armazenamentos.get(namespace)?.get(chave) ?? null,
    set: async (chave: string, valor: unknown) => {
      if (!armazenamentos.has(namespace)) armazenamentos.set(namespace, new Map());
      armazenamentos.get(namespace)!.set(chave, valor);
    },
  }),
}));

import { POST } from "@/app/api/central-angariacao/buscar/route";

const HTML_OLX = `<section class="olx-adcard">
  <a data-testid="adcard-link" title="Casa para alugar" href="https://pr.olx.com.br/imoveis/casa-1525177784">Casa</a>
  <span class="olx-adcard__price">R$ 2.500</span>
  <span class="olx-adcard__location">Londrina, Centro</span>
</section>`;
const CARD_CHAVES = `<a href="/imovel/casa-para-alugar-pr-londrina-centro/id-35106344/">
  <h2>Casa para alugar no Centro</h2><p>Rua Exemplo</p><p>Centro, Londrina/PR</p><p>R$ 2.500</p></a>`;

const ok = (html: string) => Response.json({ success: true, data: { rawHtml: html, metadata: { statusCode: 200 } } });
const status = (codigo: number) => new Response("Firecrawl internal error ECONNRESET", { status: codigo });

function fetchEm(...passos: Response[]) {
  const fila = [...passos];
  const requisicao = vi.fn<(url: string | URL | Request) => Promise<Response>>(async () => {
    const passo = fila.shift();
    if (!passo) throw new Error("chamada inesperada");
    return passo;
  });
  vi.stubGlobal("fetch", requisicao);
  return requisicao;
}

function buscar(filtros: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/central-angariacao/buscar", {
    method: "POST",
    headers: { Authorization: "Bearer token-valido", "Content-Type": "application/json", "x-angario-iniciador": "pesquisar" },
    body: JSON.stringify({ cidade: "Londrina", estado: "PR", ...filtros }),
  }));
}

const eventoCentral = () => {
  const chamada = mocks.registrarEvento.mock.calls.find(([e]) => String(e.evento).startsWith("central-busca-"));
  return { evento: chamada?.[0].evento as string, detalhe: JSON.parse(chamada?.[0].detalhe ?? "{}") };
};

describe("R5: retry na rota da Central", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    armazenamentos.clear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-sintetica");
    vi.stubEnv("VERCEL", "1");
    mocks.createClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "usuario-central" } }, error: null }) },
    });
    mocks.salvarComparaveisMercado.mockImplementation(async (_db, _usuario, anuncios: unknown[]) => anuncios.length);
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("37–38. 503 → retry → sucesso: resposta normal, persistência uma vez, mesma execução", async () => {
    const requisicao = fetchEm(status(503), ok(HTML_OLX));
    const resposta = await buscar({ portal: "olx" });
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toMatchObject({ ok: true, anuncios: [expect.objectContaining({ idExterno: "1525177784" })] });
    expect(corpo.aviso).toBeUndefined();
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledOnce();
    expect(mocks.buscarComNavegador).not.toHaveBeenCalled();

    const { evento, detalhe } = eventoCentral();
    expect(evento).toBe("central-busca-ok");
    expect(detalhe).toMatchObject({
      execucao_id: corpo.execucaoId, tentativas_firecrawl: 2, comparaveis_salvos: 1, iniciador: "pesquisar",
    });
    expect(detalhe.fases.filter((f: { fase: string }) => f.fase === "retry_agendado")).toEqual([
      expect.objectContaining({ codigo: "firecrawl_5xx", backoff_ms: 750, tentativa: 1 }),
    ]);
    expect(new Set(detalhe.fases.map((f: { coleta_id: string }) => f.coleta_id)).size).toBe(1);
  });

  it("duas falhas: mensagem genérica de sempre, sem persistência e sem termos técnicos", async () => {
    const requisicao = fetchEm(status(503), status(503));
    const resposta = await buscar({ portal: "olx" });
    const texto = await resposta.text();

    expect(JSON.parse(texto)).toMatchObject({
      ok: false, anuncios: [],
      aviso: "O serviço de consulta não respondeu agora. A pesquisa pronta ainda pode ser aberta.",
    });
    for (const tecnico of ["503", "ECONNRESET", "Firecrawl", "internal error", "firecrawl_"]) expect(texto).not.toContain(tecnico);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(mocks.salvarComparaveisMercado).not.toHaveBeenCalled();
    expect(eventoCentral().evento).toBe("central-busca-falhou");
    expect(eventoCentral().detalhe.tentativas_firecrawl).toBe(2);
  });

  it("falha não transitória (500) mantém 1 chamada e a mesma mensagem", async () => {
    const requisicao = fetchEm(status(500), ok(HTML_OLX));
    const corpo = await (await buscar({ portal: "wimoveis", tipo: "Apartamento" })).json();
    expect(corpo.ok).toBe(false);
    expect(requisicao).toHaveBeenCalledOnce();
  });

  it("Chaves: Firecrawl 503 vai ao fallback HTTP sem retry Firecrawl e persiste uma vez", async () => {
    const requisicao = fetchEm(status(503), new Response(CARD_CHAVES, { status: 200 }));
    const corpo = await (await buscar({ portal: "chaves-na-mao" })).json();
    expect(corpo).toMatchObject({ ok: true, anuncios: [expect.objectContaining({ idExterno: "35106344" })] });
    expect(requisicao.mock.calls.filter(([url]) => String(url).includes("api.firecrawl.dev"))).toHaveLength(1);
    expect(requisicao).toHaveBeenCalledTimes(2);
    expect(mocks.salvarComparaveisMercado).toHaveBeenCalledOnce();
    expect(eventoCentral().detalhe).toMatchObject({ tentativas_firecrawl: 1, aquisicao: "http_direto" });
  });
});
