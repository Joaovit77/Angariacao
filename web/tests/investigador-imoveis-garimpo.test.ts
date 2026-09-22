// @vitest-environment jsdom

/* ================================================================
   C10 — QUARTA ORIGEM DO INVESTIGADOR: o Garimpo em Campo (V7 §14)

   `?imovelIdentificado=<uuid>` resolve, sob RLS e com filtro explícito de
   user_id, só o que identifica o LUGAR (endereço, unidade, bloco,
   edifício, bairro, cidade, UF, tipo). A observação livre da passagem e
   qualquer dado pessoal NUNCA atravessam — nem quando estão na linha. As
   três origens anteriores continuam como eram; nada vaza entre origens
   nem entre contas; carregar a página não pesquisa. Desde o C13B, quem
   anota `ultima_investigacao_em` é a RPC de servidor do C13A, na mesma
   transação que grava a memória (o trigger segue normalizando o instante
   por now()); o navegador só manda o UUID. Concluir NÃO muda situação,
   NÃO promove, NÃO escreve no Pipeline — mesmo achando um possível
   proprietário.
   ================================================================ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabase: vi.fn(),
  investigarImovel: vi.fn(),
  carregarContextoInvestigador: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));

import { GET } from "@/app/api/investigador-imoveis/route";
import {
  consultaInicialDoImovelIdentificado,
  parametrosDaReferenciaInvestigador,
  urlInvestigadorDoComparavel,
  urlInvestigadorDoImovel,
  urlInvestigadorDoImovelIdentificado,
  urlInvestigadorDoRadarAnuncio,
} from "@/lib/calculo/contextoInvestigador";
import { carregarContextoInvestigador, imovelIdentificadoDaReferencia, investigarImovel } from "@/lib/investigadorImoveis";

const IDENTIFICADO_ID = "55555555-5555-4555-8555-555555555555";
const IMOVEL_ID = "11111111-1111-4111-8111-111111111111";
const MENSAGEM_GENERICA =
  "Não foi possível carregar o imóvel indicado. Você ainda pode preencher a pesquisa manualmente.";
const raiz = join(import.meta.dirname, "..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8").replace(/\r\n/g, "\n");

/** A linha como o banco a devolveria — inclusive com o que NÃO pode sair. */
const LINHA_IDENTIFICADO = {
  id: IDENTIFICADO_ID,
  logradouro: "Rua das Palmeiras",
  numero: "120",
  unidade: "101",
  bloco: "B",
  edificio: "Ed. Solar",
  bairro: "Centro",
  cidade: "Londrina",
  estado: "PR",
  tipo: "Casa",
  // Se um dia a consulta trouxer mais do que deve, nada disto pode vazar:
  observacao: "Dona Maria, tel (43) 99999-0000, disse que aluga",
  telefone: "(43) 99999-0000",
  proprietario: "Maria",
  email: "maria@exemplo.com",
  cpf: "000.000.000-00",
};

function clienteComContexto(data: unknown, userId = "usuario-autenticado") {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const filtrarUsuario = vi.fn().mockReturnValue({ maybeSingle });
  const filtrarId = vi.fn().mockReturnValue({ eq: filtrarUsuario });
  const select = vi.fn().mockReturnValue({ eq: filtrarId });
  const from = vi.fn().mockReturnValue({ select });
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null });
  return { cliente: { auth: { getUser }, from }, from, select, filtrarId, filtrarUsuario };
}

function requisicao(parametro: string, id: string): Request {
  return new Request(`http://localhost/api/investigador-imoveis?${parametro}=${id}`, {
    headers: { Authorization: "Bearer token-valido" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  mocks.getSupabase.mockReturnValue({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token-valido" } } }) },
  });
});
afterEach(cleanup);

describe("handoff do Garimpo em Campo para o Investigador", () => {
  it("navega só com o UUID persistido, no quarto parâmetro, sem tocar os três anteriores", () => {
    const destino = new URL(urlInvestigadorDoImovelIdentificado(IDENTIFICADO_ID), "https://angario.test");
    expect(destino.pathname).toBe("/investigador-imoveis");
    expect([...destino.searchParams.entries()]).toEqual([["imovelIdentificado", IDENTIFICADO_ID]]);
    expect(destino.toString()).not.toMatch(/Rua|Palmeiras|observa|telefone/i);
    // As três referências existentes continuam com os mesmos parâmetros.
    expect([...new URL(urlInvestigadorDoImovel(IMOVEL_ID), "https://a.test").searchParams.keys()]).toEqual(["imovel"]);
    expect([...new URL(urlInvestigadorDoRadarAnuncio(IMOVEL_ID), "https://a.test").searchParams.keys()]).toEqual(["radarAnuncio"]);
    expect([...new URL(urlInvestigadorDoComparavel(IMOVEL_ID), "https://a.test").searchParams.keys()]).toEqual(["comparavel"]);
    expect(parametrosDaReferenciaInvestigador({ origem: "imovel-identificado", id: IDENTIFICADO_ID }).toString())
      .toBe(`imovelIdentificado=${IDENTIFICADO_ID}`);
  });

  it("a consulta leva endereço, unidade, bloco, edifício, bairro, cidade, UF e tipo — e nada mais", () => {
    const consulta = consultaInicialDoImovelIdentificado(LINHA_IDENTIFICADO);
    expect(consulta).toBe("Rua das Palmeiras, 120, unidade 101, bloco B, Centro, Londrina, PR, Ed. Solar, Casa");
    expect(consulta).not.toMatch(/Maria|9999|aluga|exemplo|000\.000|Dona/);
    // Campos ausentes não viram afirmações.
    expect(consultaInicialDoImovelIdentificado({
      id: IDENTIFICADO_ID, logradouro: "Rua X", numero: null, unidade: null, bloco: null, edificio: null,
      bairro: null, cidade: "Londrina", estado: null, tipo: null,
    })).toBe("Rua X, Londrina");
    // O tipo do recorte NÃO tem campo de observação nem de dado pessoal: é por construção.
    const fonte = ler("lib/calculo/contextoInvestigador.ts");
    const tipo = fonte.slice(fonte.indexOf("interface ImovelIdentificadoParaInvestigacao"), fonte.indexOf("export function consultaInicialDoImovelIdentificado"));
    expect(tipo).not.toMatch(/observacao|telefone|proprietario|email|cpf|whatsapp|nome/i);
  });

  it("GET resolve a quarta origem em imoveis_identificados, sob RLS e com filtro explícito de user_id, selecionando só o permitido", async () => {
    const fake = clienteComContexto(LINHA_IDENTIFICADO);
    mocks.createClient.mockReturnValue(fake.cliente);

    const resposta = await GET(requisicao("imovelIdentificado", IDENTIFICADO_ID));
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    expect(fake.from).toHaveBeenCalledExactlyOnceWith("imoveis_identificados");
    expect(fake.select).toHaveBeenCalledWith("id,logradouro,numero,unidade,bloco,edificio,bairro,cidade,estado,tipo");
    expect(fake.filtrarId).toHaveBeenCalledWith("id", IDENTIFICADO_ID);
    expect(fake.filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-autenticado");
    expect(corpo).toEqual({
      consulta: "Rua das Palmeiras, 120, unidade 101, bloco B, Centro, Londrina, PR, Ed. Solar, Casa",
      origem: "garimpo",
    });
    // Mesmo com a linha "suja", nada de observação ou PII na resposta.
    expect(JSON.stringify(corpo)).not.toMatch(/Maria|9999|aluga|exemplo|000\.000|observa|telefone/);
  });

  it("usuário A não lê identificado de B: filtro de user_id e erro indistinguível de inexistente", async () => {
    const deOutro = clienteComContexto(null, "usuario-a");
    const inexistente = clienteComContexto(null, "usuario-a");
    mocks.createClient.mockReturnValueOnce(deOutro.cliente).mockReturnValueOnce(inexistente.cliente);

    const primeira = await GET(requisicao("imovelIdentificado", IDENTIFICADO_ID));
    const segunda = await GET(requisicao("imovelIdentificado", "66666666-6666-4666-8666-666666666666"));

    expect(deOutro.filtrarUsuario).toHaveBeenCalledWith("user_id", "usuario-a");
    expect(primeira.status).toBe(404);
    expect(segunda.status).toBe(404);
    await expect(primeira.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
    await expect(segunda.json()).resolves.toEqual({ mensagem: MENSAGEM_GENERICA });
  });

  it("o contexto de uma origem não vaza para outra, e origem ambígua é recusada antes do banco", async () => {
    const fakeIdentificado = clienteComContexto(LINHA_IDENTIFICADO);
    const fakeImovel = clienteComContexto({ id: IMOVEL_ID, codigo: "LD-1", referencia_crm: null, endereco: "Rua Sergipe, 10", bairro: "Centro", cidade: "Londrina", estado: "PR", unidade: null, bloco: null, edificio: null, tipo: "Apartamento", quartos: 2, banheiros: 1, vagas: 1 });
    mocks.createClient.mockReturnValueOnce(fakeIdentificado.cliente).mockReturnValueOnce(fakeImovel.cliente);

    const garimpo = await (await GET(requisicao("imovelIdentificado", IDENTIFICADO_ID))).json();
    const pipeline = await (await GET(requisicao("imovel", IMOVEL_ID))).json();

    expect(fakeIdentificado.from).toHaveBeenCalledExactlyOnceWith("imoveis_identificados");
    expect(fakeImovel.from).toHaveBeenCalledExactlyOnceWith("imoveis");
    expect(garimpo.origem).toBe("garimpo");
    expect(pipeline.origem).toBe("pipeline");
    expect(garimpo.consulta).not.toContain("Sergipe");
    expect(pipeline.consulta).not.toContain("Palmeiras");

    mocks.createClient.mockClear();
    const ambigua = await GET(new Request(
      `http://localhost/api/investigador-imoveis?imovelIdentificado=${IDENTIFICADO_ID}&imovel=${IMOVEL_ID}`,
      { headers: { Authorization: "Bearer token-valido" } },
    ));
    const invalida = await GET(requisicao("imovelIdentificado", "nao-e-uuid"));
    expect(ambigua.status).toBe(400);
    expect(invalida.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("o cliente reconsulta o contexto sem POST e sem payload na URL", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ consulta: "Rua das Palmeiras, 120", origem: "garimpo" })));
    vi.stubGlobal("fetch", fetcher);
    const referencia = { origem: "imovel-identificado", id: IDENTIFICADO_ID } as const;
    await expect(carregarContextoInvestigador(referencia)).resolves.toEqual({ consulta: "Rua das Palmeiras, 120", origem: "garimpo" });
    const [url, opcoes] = fetcher.mock.calls[0];
    expect([...new URL(String(url), "https://angario.test").searchParams.entries()]).toEqual([["imovelIdentificado", IDENTIFICADO_ID]]);
    expect(opcoes.method).toBeUndefined();
    expect(opcoes.body).toBeUndefined();
    expect(opcoes.cache).toBe("no-store");
  });

  it("a página aceita o quarto parâmetro e carregar não dispara pesquisa; o painel do Garimpo linka e explica", () => {
    const pagina = ler("app/(painel)/investigador-imoveis/page.tsx");
    expect(pagina).toContain('{ origem: "imovel-identificado", id: valor(parametros.imovelIdentificado) }');
    const componente = ler("components/investigador/InvestigadorImoveisView.tsx");
    const efeito = componente.slice(componente.indexOf("useEffect(() =>"), componente.indexOf("async function investigar"));
    expect(efeito).toContain("carregarContextoInvestigador");
    expect(efeito).not.toContain("investigarImovel(");
    expect(efeito).not.toContain("persistirMemoria");
    expect(componente).toContain('garimpo: "Garimpo em Campo"');
    const painel = ler("components/prospeccao/PainelIdentificado.tsx");
    expect(painel).toContain("href={urlInvestigadorDoImovelIdentificado(item.id)}");
    expect(painel).toContain("Investigar na web");
    expect(painel).not.toMatch(/investigarImovel|\/api\/investigador/);
  });
});

describe("concluir investigação anota a data — pela RPC do C13A, e só ela", () => {
  it("o navegador não escreve mais ultima_investigacao_em: a data nasce na mesma transação da memória", () => {
    // Nenhum caminho de escrita da coluna no cliente: nem fronteira, nem Investigador.
    expect(ler("lib/prospeccao.ts")).not.toMatch(/update\(\{\s*ultima_investigacao_em/);
    expect(ler("lib/prospeccao.ts")).not.toContain("registrarInvestigacaoIdentificado");
    const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(semComentarios(ler("lib/investigadorImoveis.ts"))).not.toMatch(/ultima_investigacao_em|\.from\(|\.rpc\(/);
    // A RPC de servidor anota a data depois de gravar o evento e as afirmações.
    const rpc = ler("../supabase/migrations/20260915190000_prospeccao_memoria_identidade.sql");
    const corpo = rpc.slice(rpc.indexOf("function public.registrar_investigacao_identificado"), rpc.indexOf("function public.confirmar_atributo_identificado"));
    expect(corpo).toMatch(/update public\.imoveis_identificados\s+set ultima_investigacao_em = v_agora\s+where id = p_imovel_identificado_id;/);
    expect(corpo.indexOf("insert into public.imoveis_identificados_investigacoes")).toBeLessThan(corpo.indexOf("set ultima_investigacao_em"));
    expect(corpo).not.toMatch(/set situacao|promovid|imovel_id =/);
  });

  it("timestamp falso do cliente não prevalece: o trigger sobrescreve por now(), na migration base já aplicada", () => {
    const triggers = ler("../supabase/migrations/20260910193412_prospeccao_campo_triggers.sql");
    const proteger = triggers.slice(triggers.indexOf("function private.proteger_identificado()"), triggers.indexOf("function private.proteger_identificado()") + 2500);
    expect(proteger).toContain("if new.ultima_investigacao_em is distinct from old.ultima_investigacao_em then");
    expect(proteger).toContain("new.ultima_investigacao_em := now();");
    expect(triggers).toMatch(/create trigger [\w_]+\s+before update on public\.imoveis_identificados[\s\S]*?execute function private\.proteger_identificado\(\)/);
    // A coluna está no grant de update do cliente (e só ela, entre as de estado).
    const grants = ler("../supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql");
    const grantUpdate = grants.slice(grants.indexOf("grant update ("), grants.indexOf("on imoveis_identificados to authenticated", grants.indexOf("grant update (")));
    expect(grantUpdate).toContain("ultima_investigacao_em");
    expect(grantUpdate).not.toMatch(/situacao|imovel_id|promovido_em|tipo\b/);
    // Espelhado no schema canônico; nenhuma migration nova para isto no C10.
    expect(ler("../supabase-schema.sql")).toContain("new.ultima_investigacao_em := now();");
  });

  it("só a origem do Garimpo leva a referência ao servidor; Pipeline, Radar, Central e modo manual continuam sem persistência", async () => {
    expect(imovelIdentificadoDaReferencia({ origem: "imovel", id: IMOVEL_ID })).toBeNull();
    expect(imovelIdentificadoDaReferencia({ origem: "radar-anuncio", id: IMOVEL_ID })).toBeNull();
    expect(imovelIdentificadoDaReferencia({ origem: "comparavel", id: IMOVEL_ID })).toBeNull();
    expect(imovelIdentificadoDaReferencia(null)).toBeNull();
    expect(imovelIdentificadoDaReferencia({ origem: "imovel-identificado", id: IDENTIFICADO_ID })).toBe(IDENTIFICADO_ID);

    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ tipo: "erro", mensagem: "Fim controlado." }) + "\n", { status: 200 })));
    vi.stubGlobal("fetch", fetcher);
    await investigarImovel("Rua das Palmeiras, 120", () => {}, undefined, { origem: "imovel", id: IMOVEL_ID });
    await investigarImovel("Rua das Palmeiras, 120", () => {}, undefined, null);
    await investigarImovel("Rua das Palmeiras, 120", () => {});
    await investigarImovel("Rua das Palmeiras, 120", () => {}, undefined, { origem: "imovel-identificado", id: IDENTIFICADO_ID });
    const corpos = fetcher.mock.calls.map(([, opcoes]) => JSON.parse(String(opcoes.body)) as Record<string, unknown>);
    expect(corpos.slice(0, 3)).toEqual([{ consulta: "Rua das Palmeiras, 120" }, { consulta: "Rua das Palmeiras, 120" }, { consulta: "Rua das Palmeiras, 120" }]);
    expect(corpos[3]).toEqual({ consulta: "Rua das Palmeiras, 120", imovelIdentificado: IDENTIFICADO_ID });
    // Só o UUID: nenhum id de execução, usuário ou fato sai do navegador.
    expect(Object.keys(corpos[3]).sort()).toEqual(["consulta", "imovelIdentificado"]);
  });

  it("as derivadas continuam leitura: nunca-investigado / investigado-ha-mais-de-90-dias, sem coluna de status", async () => {
    const { derivarEtiquetasProspeccao } = await import("@/lib/calculo/etiquetasProspeccao");
    const { explicacaoInvestigar } = await import("@/components/prospeccao/PainelIdentificado");
    const base = { avistamentosTotal: 1, situacao: "identificado" as const, hoje: "2026-09-15" };
    const codigos = (ultimaInvestigacaoEm: string | null) =>
      derivarEtiquetasProspeccao({ ...base, ultimaInvestigacaoEm }).map((e) => e.codigo);
    expect(codigos(null)).toContain("nunca-investigado");
    expect(codigos("2026-09-01T10:00:00.000Z")).toContain("investigado");
    expect(codigos("2026-09-01T10:00:00.000Z")).not.toContain("investigado-ha-mais-de-90-dias");
    expect(codigos("2026-05-01T10:00:00.000Z")).toContain("investigado-ha-mais-de-90-dias");
    expect(explicacaoInvestigar({ ...base, ultimaInvestigacaoEm: null }, base.hoje)).toContain("Ainda não foi pesquisado na web");
    expect(explicacaoInvestigar({ ...base, ultimaInvestigacaoEm: "2026-05-01T10:00:00.000Z" }, base.hoje)).toContain("há mais de 90 dias");
    expect(explicacaoInvestigar({ ...base, ultimaInvestigacaoEm: "2026-09-01T10:00:00.000Z" }, base.hoje)).toMatch(/^Última pesquisa na web em /);
    // Nenhuma coluna de estado de investigação: só a data.
    const c2a = ler("../supabase/migrations/20260910184310_prospeccao_campo.sql");
    expect(c2a).toContain("ultima_investigacao_em timestamptz");
    expect(c2a).not.toMatch(/investigacao_estado|investigacao_status|investigado boolean/);
  });
});

describe("a tela do Investigador: pesquisa só no clique; concluir anota; nada promove", () => {
  it("carregar a página com ?imovelIdentificado preenche o contexto e NÃO pesquisa nem anota", async () => {
    vi.doMock("@/lib/investigadorImoveis", () => ({
      carregarContextoInvestigador: mocks.carregarContextoInvestigador,
      investigarImovel: mocks.investigarImovel,
    }));
    mocks.carregarContextoInvestigador.mockResolvedValue({ consulta: "Rua das Palmeiras, 120, Casa", origem: "garimpo" });
    const { default: InvestigadorImoveisView } = await import("@/components/investigador/InvestigadorImoveisView");

    render(createElement(InvestigadorImoveisView, {
      imovelIdInicial: null,
      referenciaInicial: { origem: "imovel-identificado", id: IDENTIFICADO_ID },
    }));
    await waitFor(() => expect(screen.getByText(/carregados do Garimpo em Campo/)).toBeTruthy());
    expect(mocks.carregarContextoInvestigador).toHaveBeenCalledExactlyOnceWith(
      { origem: "imovel-identificado", id: IDENTIFICADO_ID }, expect.any(AbortSignal),
    );
    expect((document.getElementById("consulta-investigador") as HTMLTextAreaElement).value).toBe("Rua das Palmeiras, 120, Casa");
    expect(mocks.investigarImovel).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/investigadorImoveis");
  });

  it("concluída (inclusive achando um 'possível proprietário'), leva a referência do Garimpo ao servidor e mostra o que a memória guardou — e só isso", async () => {
    vi.doMock("@/lib/investigadorImoveis", () => ({
      carregarContextoInvestigador: mocks.carregarContextoInvestigador,
      investigarImovel: mocks.investigarImovel,
    }));
    mocks.carregarContextoInvestigador.mockResolvedValue({ consulta: "Rua das Palmeiras, 120, Casa", origem: "garimpo" });
    mocks.investigarImovel.mockImplementation(async (_consulta: string, aoEvento: (e: unknown) => void) => {
      aoEvento({ tipo: "etapa", etapa: "gerando-buscas" });
      aoEvento({ tipo: "resultado", dados: {
        ok: true, consultaOriginal: "x", consultas: ["x"], pesquisasEvitadas: 0, encerramentoAntecipado: false, limiteAtingido: false,
        memoria: { estado: "salva", execucaoId: "77777777-7777-4777-8777-777777777777", atributosSalvos: 0, atributosRecusados: 0 },
        resultados: [{
          url: "https://anuncio.test/1", dominio: "anuncio.test", titulo: "Casa das Palmeiras — fale com o proprietário",
          descricao: "Proprietário Sr. José, direto.", confianca: "muito-forte", evidencias: ["endereço"], contradicoes: [],
          consultas: ["x"], preco: null, area: null, quartos: null, vagas: null, endereco: "Rua das Palmeiras, 120",
          condominio: null, referencia: null, comparavelId: null,
        }],
      } });
    });
    const { default: InvestigadorImoveisView } = await import("@/components/investigador/InvestigadorImoveisView");
    render(createElement(InvestigadorImoveisView, {
      imovelIdInicial: null,
      referenciaInicial: { origem: "imovel-identificado", id: IDENTIFICADO_ID },
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Investigar imóvel" })).not.toHaveProperty("disabled", true));

    await act(async () => {
      screen.getByRole("button", { name: "Investigar imóvel" }).click();
    });
    await waitFor(() => expect(document.body.textContent).toContain("Investigação registrada na memória do imóvel"));
    expect(mocks.investigarImovel).toHaveBeenCalledExactlyOnceWith(
      "Rua das Palmeiras, 120, Casa", expect.any(Function), undefined, { origem: "imovel-identificado", id: IDENTIFICADO_ID },
    );
    expect(document.body.textContent).toContain("fale com o proprietário");
    // Não há botão de transformar em oportunidade aqui, nem escrita no Pipeline.
    expect(document.body.textContent).not.toMatch(/Transformar em oportunidade|Concluir vínculo/);
    vi.doUnmock("@/lib/investigadorImoveis");
  });

  it("falha na pesquisa não anota nada", async () => {
    vi.doMock("@/lib/investigadorImoveis", () => ({
      carregarContextoInvestigador: mocks.carregarContextoInvestigador,
      investigarImovel: mocks.investigarImovel,
    }));
    mocks.carregarContextoInvestigador.mockResolvedValue({ consulta: "Rua das Palmeiras, 120, Casa", origem: "garimpo" });
    mocks.investigarImovel.mockImplementation(async (_consulta: string, aoEvento: (e: unknown) => void) => {
      aoEvento({ tipo: "erro", mensagem: "A pesquisa na web está indisponível agora." });
    });
    const { default: InvestigadorImoveisView } = await import("@/components/investigador/InvestigadorImoveisView");
    render(createElement(InvestigadorImoveisView, {
      imovelIdInicial: null,
      referenciaInicial: { origem: "imovel-identificado", id: IDENTIFICADO_ID },
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Investigar imóvel" })).not.toHaveProperty("disabled", true));
    await act(async () => {
      screen.getByRole("button", { name: "Investigar imóvel" }).click();
    });
    await waitFor(() => expect(document.body.textContent).toContain("indisponível agora"));
    expect(document.body.textContent).not.toMatch(/memória do imóvel/);
    expect(document.querySelector("[data-memoria]")).toBeNull();
    vi.doUnmock("@/lib/investigadorImoveis");
  });

  it("stream interrompido mostra erro, limpa andamento e permite nova tentativa", async () => {
    vi.doMock("@/lib/investigadorImoveis", () => ({
      carregarContextoInvestigador: mocks.carregarContextoInvestigador,
      investigarImovel: mocks.investigarImovel,
    }));
    mocks.carregarContextoInvestigador.mockResolvedValue({ consulta: "Rua das Palmeiras, 120, Casa", origem: "garimpo" });
    mocks.investigarImovel.mockImplementation(async (_consulta: string, aoEvento: (e: unknown) => void) => {
      aoEvento({ tipo: "etapa", etapa: "pesquisando-web" });
      throw new Error("A investigação foi interrompida antes de concluir. Tente novamente.");
    });
    const { default: InvestigadorImoveisView } = await import("@/components/investigador/InvestigadorImoveisView");
    render(createElement(InvestigadorImoveisView, {
      imovelIdInicial: null,
      referenciaInicial: { origem: "imovel-identificado", id: IDENTIFICADO_ID },
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Investigar imóvel" })).not.toHaveProperty("disabled", true));
    await act(async () => { screen.getByRole("button", { name: "Investigar imóvel" }).click(); });
    await waitFor(() => expect(document.body.textContent).toContain("A investigação foi interrompida antes de concluir."));
    expect(document.body.textContent).not.toContain("Investigação em andamento");
    expect(screen.getByRole("button", { name: "Investigar imóvel" })).not.toHaveProperty("disabled", true);
    vi.doUnmock("@/lib/investigadorImoveis");
  });

  it("estrutural: investigação não promove, não vincula, não escreve no Pipeline nem muda situação", () => {
    for (const arquivo of [
      "components/investigador/InvestigadorImoveisView.tsx",
      "lib/investigadorImoveis.ts",
      "lib/servidor/investigadorImoveis.ts",
      "lib/calculo/investigadorImoveis.ts",
      "app/api/investigador-imoveis/route.ts",
    ]) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).not.toMatch(/vincular_promocao|vincularPromocao|salvarImovel|definir_situacao|iniciarPromocao|abrirImovelDoGarimpo|situacao/);
      expect(fonte, arquivo).not.toMatch(/from\(["']imoveis["']\)\s*\.\s*(insert|update|upsert)/);
    }
    // A rota não escreve nada por conta própria: a memória entra pelo módulo
    // de servidor do C13B, que só chama a RPC do C13A.
    const rota = ler("app/api/investigador-imoveis/route.ts");
    expect(rota).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.upsert\(/);
    expect(rota).toContain("persistirMemoriaDaInvestigacao({");
    const servidor = ler("lib/servidor/memoriaIdentidade.ts");
    expect(servidor).toMatch(/\.rpc\(RPC_REGISTRAR_INVESTIGACAO, parametros\)/);
    expect(servidor).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|vincular_promocao|salvarImovel|definir_situacao|promovid/);
  });
});
