/* ================================================================
   INVESTIGADOR (B3.1): pontuação determinística dos mantidos.

   O B2 decide o que fica; o B3 só decide a ordem entre o que ficou, e
   sempre dentro da faixa. Estes testes provam os pesos aprovados, os
   casos do plano e, principalmente, o que NÃO pode mudar: conjunto de
   resultados, faixa, evidências, contradições, regra de parada, memória
   (conteúdo e ordem) e o payload do cliente. Nenhuma chamada real.
   ================================================================ */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deduplicarResultadosInvestigacao,
  haEvidenciaSuficiente,
  ordenarMantidosInvestigacao,
  PESOS_PONTUACAO_INVESTIGACAO,
  planejarPesquisasInvestigacao,
  PONTUACAO_MAXIMA_INVESTIGACAO,
  PONTUACAO_MINIMA_INVESTIGACAO,
  pontuarCorrespondenciaInvestigacao,
  resumirPontuacaoInvestigacao,
  triarCorrespondenciasInvestigacao,
  VERSAO_PONTUACAO_INVESTIGACAO,
  type ResultadoWebInvestigacao,
  type SinaisCorrespondencia,
} from "@/lib/calculo/investigadorImoveis";
import { extrairAfirmacoesDaInvestigacao } from "@/lib/calculo/memoriaIdentidade";
import { atributosParaRpc } from "@/lib/servidor/memoriaIdentidade";
import { CONJUNTOS_RELEVANCIA, resultadoDaFixture } from "./fixtures/investigadorRelevancia";
import {
  CONJUNTOS_PONTUACAO,
  ENTRADA_MICHIGAN,
  resultadoWeb,
} from "./fixtures/investigadorPontuacao";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), persistirMemoria: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/referenciasAvaliacaoInvestigador", () => ({
  associarReferenciasAvaliacaoDoInvestigador: async (_s: unknown, _u: unknown, resultados: unknown) => resultados,
}));
vi.mock("@/lib/servidor/memoriaIdentidade", async (importar) => {
  const real = await importar<typeof import("@/lib/servidor/memoriaIdentidade")>();
  return { ...real, persistirMemoriaDaInvestigacao: mocks.persistirMemoria };
});

import { POST } from "@/app/api/investigador-imoveis/route";

const NEUTRO: SinaisCorrespondencia = {
  referenciaIdentica: false,
  enderecoIdentico: false,
  condominioIdentico: false,
  areaCompativel: false,
  quartosIguais: false,
  vagasIguais: false,
  contradicoesGraves: 0,
  contradicoesCaracteristica: 0,
};

/** Dedupe → B2 → B3, como a rota faz. */
function pipeline(entrada: string, resultados: ResultadoWebInvestigacao[]) {
  const triagem = triarCorrespondenciasInvestigacao(entrada, deduplicarResultadosInvestigacao(resultados));
  const mantidosAntes = [...triagem.mantidos];
  const pontuados = ordenarMantidosInvestigacao(triagem, triagem.mantidos);
  return { triagem, mantidosAntes, pontuados, ordenados: pontuados.map((item) => item.correspondencia) };
}

function pontosDe(entrada: string, resultado: ResultadoWebInvestigacao) {
  const [item] = triarCorrespondenciasInvestigacao(entrada, [resultado]).itens;
  return { item, pontuacao: pontuarCorrespondenciaInvestigacao(item.sinais) };
}

const TODOS_OS_CONJUNTOS = [
  ...CONJUNTOS_RELEVANCIA.map((c) => ({ nome: c.nome, entrada: c.entrada, resultados: c.fixtures.map((f) => resultadoDaFixture(f)) })),
  ...CONJUNTOS_PONTUACAO.map((c) => ({ nome: c.caso, entrada: c.entrada, resultados: c.resultados })),
];

/* ------------------------------------------------------------------
   Pesos aprovados, um a um.
   ------------------------------------------------------------------ */
describe("pesos da v1", () => {
  it("versão explícita do algoritmo", () => {
    expect(VERSAO_PONTUACAO_INVESTIGACAO).toBe("b3.1-v1");
    expect(PESOS_PONTUACAO_INVESTIGACAO).toEqual({
      referencia: 3, endereco: 3, empreendimento: 2, area: 1, quartos: 1, vagas: 1,
      "contradicao-grave": -3, "contradicao-caracteristica": -1,
    });
  });

  it.each([
    ["referenciaIdentica", "referencia", 3],
    ["enderecoIdentico", "endereco", 3],
    ["condominioIdentico", "empreendimento", 2],
    ["areaCompativel", "area", 1],
    ["quartosIguais", "quartos", 1],
    ["vagasIguais", "vagas", 1],
  ] as const)("%s sozinho vale %s = %i", (sinal, motivo, pontos) => {
    expect(pontuarCorrespondenciaInvestigacao({ ...NEUTRO, [sinal]: true })).toEqual({ pontos, motivos: [{ motivo, pontos }] });
  });

  it("cada contradição grave vale −3 e cada contradição de característica vale −1", () => {
    for (const vezes of [1, 2, 3]) {
      expect(pontuarCorrespondenciaInvestigacao({ ...NEUTRO, contradicoesGraves: vezes }))
        .toEqual({ pontos: -3 * vezes, motivos: [{ motivo: "contradicao-grave", pontos: -3 * vezes }] });
      expect(pontuarCorrespondenciaInvestigacao({ ...NEUTRO, contradicoesCaracteristica: vezes }))
        .toEqual({ pontos: -vezes, motivos: [{ motivo: "contradicao-caracteristica", pontos: -vezes }] });
    }
  });

  it("sem sinal nenhum: zero, sem motivos", () => {
    expect(pontuarCorrespondenciaInvestigacao(NEUTRO)).toEqual({ pontos: 0, motivos: [] });
  });

  it("a soma dos motivos é o score, e os motivos seguem a ordem do catálogo", () => {
    const pontuacao = pontuarCorrespondenciaInvestigacao({
      ...NEUTRO, enderecoIdentico: true, areaCompativel: true, vagasIguais: true, contradicoesCaracteristica: 1,
    });
    expect(pontuacao).toEqual({
      pontos: 4,
      motivos: [
        { motivo: "endereco", pontos: 3 },
        { motivo: "area", pontos: 1 },
        { motivo: "vagas", pontos: 1 },
        { motivo: "contradicao-caracteristica", pontos: -1 },
      ],
    });
  });

  it("termos principais valem zero", () => {
    const { item, pontuacao } = pontosDe(
      "Rua Michigan, 610, Jardim Presidente, Londrina",
      resultadoWeb("https://portal.test/t", "Casas no Jardim Presidente, Londrina, Michigan"),
    );
    expect(item.correspondencia.evidencias).toEqual([expect.stringMatching(/^Termos principais encontrados/)]);
    expect(pontuacao).toEqual({ pontos: 0, motivos: [] });
  });

  it("LD-### vale zero: código interno não é referência nem na entrada nem no resultado", () => {
    const entrada = "Rua Michigan, 610, Londrina, código LD-146";
    const comEndereco = pontosDe(entrada, resultadoWeb("https://portal.test/ld1", "Casa Rua Michigan 610 Londrina", "Cód. LD-146"));
    expect(comEndereco.pontuacao.motivos.map((m) => m.motivo)).toEqual(["endereco"]);
    const soCodigo = pontosDe(entrada, resultadoWeb("https://outro.test/ld2", "Peça LD-146", "Ref. LD-146"));
    expect(soCodigo.pontuacao.motivos.map((m) => m.motivo)).not.toContain("referencia");
    expect(soCodigo.item.sinais.referenciaIdentica).toBe(false);
  });
});

/* ------------------------------------------------------------------
   Limites do score.
   ------------------------------------------------------------------ */
describe("score limitado", () => {
  const ENTRADA_COMPLETA = "Rua Michigan, 610, Residencial Aurora, 120 m², 3 quartos, 2 vagas, Ref. 01860.001";

  it("máximo possível (11): referência, endereço, empreendimento e as três características", () => {
    const { pontuacao } = pontosDe(ENTRADA_COMPLETA, resultadoWeb(
      "https://portal.test/max", "Casa Rua Michigan, 610 - Residencial Aurora", "120 m², 3 quartos, 2 vagas, Ref. 01860.001",
    ));
    expect(pontuacao.pontos).toBe(PONTUACAO_MAXIMA_INVESTIGACAO);
    expect(PONTUACAO_MAXIMA_INVESTIGACAO).toBe(11);
  });

  it("mínimo possível (−12): três contradições graves e as três características divergentes", () => {
    const { pontuacao } = pontosDe(ENTRADA_COMPLETA, resultadoWeb(
      "https://portal.test/min", "Casa Rua Sergipe, 900 - Residencial Bosque", "300 m², 5 quartos, 4 vagas, Ref. 09999.002",
    ));
    expect(pontuacao.pontos).toBe(PONTUACAO_MINIMA_INVESTIGACAO);
    expect(PONTUACAO_MINIMA_INVESTIGACAO).toBe(-12);
  });

  it("toda combinação que a análise consegue produzir fica dentro dos limites, e os dois extremos são alcançados", () => {
    const referencia = [
      { referenciaIdentica: false, graves: 0 }, { referenciaIdentica: true, graves: 0 },
      { referenciaIdentica: true, graves: 1 }, { referenciaIdentica: true, graves: 2 },
      { referenciaIdentica: false, graves: 1 },
    ];
    const tres = [{ igual: false, contra: 0 }, { igual: true, contra: 0 }, { igual: false, contra: 1 }];
    const vistos = new Set<number>();
    for (const r of referencia) for (const e of tres) for (const c of tres)
      for (const a of tres) for (const q of tres) for (const v of tres) {
        const { pontos } = pontuarCorrespondenciaInvestigacao({
          referenciaIdentica: r.referenciaIdentica,
          enderecoIdentico: e.igual,
          condominioIdentico: c.igual,
          areaCompativel: a.igual,
          quartosIguais: q.igual,
          vagasIguais: v.igual,
          contradicoesGraves: r.graves + e.contra + c.contra,
          contradicoesCaracteristica: a.contra + q.contra + v.contra,
        });
        expect(pontos).toBeGreaterThanOrEqual(PONTUACAO_MINIMA_INVESTIGACAO);
        expect(pontos).toBeLessThanOrEqual(PONTUACAO_MAXIMA_INVESTIGACAO);
        vistos.add(pontos);
      }
    expect(Math.min(...vistos)).toBe(PONTUACAO_MINIMA_INVESTIGACAO);
    expect(Math.max(...vistos)).toBe(PONTUACAO_MAXIMA_INVESTIGACAO);
  });
});

/* ------------------------------------------------------------------
   Casos do plano.
   ------------------------------------------------------------------ */
describe("casos do plano: ordem de hoje × ordem do B3", () => {
  it.each(CONJUNTOS_PONTUACAO.map((c) => [c.caso, c] as const))("%s", (_caso, conjunto) => {
    const { mantidosAntes, ordenados } = pipeline(conjunto.entrada, conjunto.resultados);
    expect(mantidosAntes.map((r) => r.url)).toEqual(conjunto.ordemB2);
    expect(ordenados.map((r) => r.url)).toEqual(conjunto.ordemB3);
  });

  it("A. endereço + três características pontua acima de só endereço, na mesma faixa", () => {
    const { pontuados } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[0].resultados);
    const [a1, a3] = pontuados;
    expect([a1.correspondencia.confianca, a3.correspondencia.confianca]).toEqual(["muito-forte", "muito-forte"]);
    expect([a1.pontuacao.pontos, a3.pontuacao.pontos]).toEqual([6, 3]);
  });

  it("B. o empate de hoje (mesma faixa, 0 contradições, 3 evidências) caía no título; agora cai nas características", () => {
    const { mantidosAntes, pontuados } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[1].resultados);
    const [b1, b2] = mantidosAntes;
    expect([b1.evidencias.length, b1.contradicoes.length]).toEqual([b2.evidencias.length, b2.contradicoes.length]);
    expect(b1.evidencias.some((e) => e.startsWith("Termos principais"))).toBe(true);
    expect(pontuados.map((i) => [i.correspondencia.url, i.pontuacao.pontos])).toEqual([
      ["https://portal-e.test/b2", 5], ["https://portal-d.test/b1", 4], ["https://portal-f.test/b3", 3],
    ]);
  });

  it("C. empreendimento + características: +2 e +1 por característica", () => {
    const { pontuados } = pipeline(CONJUNTOS_PONTUACAO[2].entrada, CONJUNTOS_PONTUACAO[2].resultados);
    expect(pontuados.map((i) => [i.correspondencia.confianca, i.pontuacao.pontos])).toEqual([
      ["muito-forte", 5], ["forte", 3], ["possivel", 3], ["indicio", 2],
    ]);
  });

  it("D. score maior numa faixa menor não atravessa a faixa", () => {
    const { pontuados } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[3].resultados);
    const [d4, d1] = pontuados;
    expect(d4.correspondencia.confianca).toBe("muito-forte");
    expect(d1.correspondencia.confianca).toBe("forte");
    expect(d1.pontuacao.pontos).toBeGreaterThan(d4.pontuacao.pontos);
    expect(d1.pontuacao.motivos.map((m) => m.motivo)).toEqual(["endereco", "area", "vagas", "contradicao-caracteristica"]);
  });

  it("E. inconclusivo pobre continua na lista, com score zero, no fim", () => {
    const { triagem, pontuados } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[4].resultados);
    expect(triagem.itens.filter((i) => i.relevancia === "inconclusivo")).toHaveLength(2);
    expect(pontuados.slice(1).map((i) => i.pontuacao.pontos)).toEqual([0, 0]);
  });

  it("F. três fontes com os mesmos pontos: domínio e corroboração não somam; a cópia da mesma página conta uma vez", () => {
    const { pontuados, mantidosAntes } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[5].resultados);
    expect(pontuados).toHaveLength(3);
    expect(pontuados.map((i) => i.pontuacao.pontos)).toEqual([5, 5, 5]);
    const resumo = resumirPontuacaoInvestigacao(mantidosAntes, pontuados);
    // Medido e registrado, mas sem efeito na ordem.
    expect(resumo.corroboraveis).toBe(3);
    expect(resumo.multiplasEtapas).toBe(1);
    expect(resumo.rankingMudou).toBe(false);
  });

  it("J. sem memória: nada é lido, o log diz que a memória não foi utilizada e a ordem é a da entrada", () => {
    const { pontuados, mantidosAntes } = pipeline(CONJUNTOS_PONTUACAO[6].entrada, CONJUNTOS_PONTUACAO[6].resultados);
    expect(pontuados.map((i) => i.pontuacao.pontos)).toEqual([3, 3, 3, 0]);
    expect(resumirPontuacaoInvestigacao(mantidosAntes, pontuados).memoria).toBe("nao-utilizada");
  });

  it("as fixtures do B2 continuam exatamente na mesma ordem", () => {
    for (const conjunto of CONJUNTOS_RELEVANCIA) {
      const { mantidosAntes, ordenados } = pipeline(conjunto.entrada, conjunto.fixtures.map((f) => resultadoDaFixture(f)));
      expect(ordenados.map((r) => r.url)).toEqual(mantidosAntes.map((r) => r.url));
    }
  });
});

/* ------------------------------------------------------------------
   Invariantes: o B3 só reordena.
   ------------------------------------------------------------------ */
describe("o B3 só reordena", () => {
  it.each(TODOS_OS_CONJUNTOS.map((c) => [c.nome, c] as const))("%s", (_nome, { entrada, resultados }) => {
    const { triagem, mantidosAntes, ordenados } = pipeline(entrada, resultados);
    // Mesmo conjunto, mesmos objetos, nenhum irrelevante.
    expect(ordenados).toHaveLength(triagem.mantidos.length);
    expect(new Set(ordenados)).toEqual(new Set(triagem.mantidos));
    const irrelevantes = new Set(triagem.itens.filter((i) => i.relevancia === "irrelevante").map((i) => i.correspondencia.url));
    expect(ordenados.some((r) => irrelevantes.has(r.url))).toBe(false);
    // A lista do B2 (a da memória) não foi reordenada nem trocada.
    expect(triagem.mantidos).toEqual(mantidosAntes);
    triagem.mantidos.forEach((r, i) => expect(r).toBe(mantidosAntes[i]));
    // Faixa, evidências e contradições idênticas por resultado.
    const porUrl = new Map(mantidosAntes.map((r) => [r.url, JSON.stringify([r.confianca, r.evidencias, r.contradicoes])]));
    for (const r of ordenados) expect(JSON.stringify([r.confianca, r.evidencias, r.contradicoes])).toBe(porUrl.get(r.url));
    // Faixa nunca é atravessada.
    const ordem = { "muito-forte": 4, forte: 3, possivel: 2, indicio: 1 };
    for (let i = 1; i < ordenados.length; i += 1) {
      expect(ordem[ordenados[i - 1].confianca]).toBeGreaterThanOrEqual(ordem[ordenados[i].confianca]);
    }
    // A regra de parada não enxerga diferença.
    expect(haEvidenciaSuficiente(ordenados)).toBe(haEvidenciaSuficiente(mantidosAntes));
  });

  it("é determinístico: a ordem de chegada dos resultados não muda a ordem final", () => {
    for (const { entrada, resultados } of TODOS_OS_CONJUNTOS) {
      const direto = pipeline(entrada, resultados).ordenados.map((r) => r.url);
      const invertido = pipeline(entrada, [...resultados].reverse()).ordenados.map((r) => r.url);
      expect(invertido).toEqual(direto);
      expect(pipeline(entrada, resultados).pontuados).toEqual(pipeline(entrada, resultados).pontuados);
    }
  });

  it("URL é o último desempate: tudo igual, vence a URL menor, em qualquer ordem de chegada", () => {
    const iguais = ["https://c.test/x", "https://a.test/x", "https://b.test/x"]
      .map((url) => resultadoWeb(url, "Casa Rua Michigan, 610", "3 quartos."));
    for (const lista of [iguais, [...iguais].reverse()]) {
      const { pontuados } = pipeline(ENTRADA_MICHIGAN, lista);
      expect(new Set(pontuados.map((i) => i.pontuacao.pontos)).size).toBe(1);
      expect(pontuados.map((i) => i.correspondencia.url)).toEqual(["https://a.test/x", "https://b.test/x", "https://c.test/x"]);
    }
  });

  it("uma lista enriquecida depois do B2 (atalho de avaliação) é reordenada pelos mesmos sinais, sem perder o campo", () => {
    const { triagem } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[1].resultados);
    const enriquecida = triagem.mantidos.map((r) => ({ ...r, comparavelId: `id-${r.url.slice(-2)}` }));
    const ordenados = ordenarMantidosInvestigacao(triagem, enriquecida).map((i) => i.correspondencia);
    expect(ordenados.map((r) => r.comparavelId)).toEqual(["id-b2", "id-b1", "id-b3"]);
  });
});

/* ------------------------------------------------------------------
   Resumo para o log: só contagens e códigos.
   ------------------------------------------------------------------ */
describe("resumo da pontuação", () => {
  it("versão, distribuição, motivos por resultado e mudanças de posição", () => {
    const { mantidosAntes, pontuados } = pipeline(ENTRADA_MICHIGAN, CONJUNTOS_PONTUACAO[1].resultados);
    expect(resumirPontuacaoInvestigacao(mantidosAntes, pontuados)).toEqual({
      versao: "b3.1-v1",
      pontuados: 3,
      distribuicao: { "<=0": 0, "1-2": 0, "3-4": 2, "5-6": 1, ">=7": 0 },
      motivos: { endereco: 3, quartos: 1, area: 1, vagas: 1 },
      rankingMudou: true,
      posicoesAlteradas: 2,
      topoMudou: true,
      corroboraveis: 0,
      multiplasEtapas: 0,
      memoria: "nao-utilizada",
    });
  });

  it("lista vazia: nada pontuado, nada mudou", () => {
    expect(resumirPontuacaoInvestigacao([], [])).toMatchObject({
      pontuados: 0, rankingMudou: false, posicoesAlteradas: 0, topoMudou: false, memoria: "nao-utilizada",
    });
  });
});

/* ------------------------------------------------------------------
   Rota: cliente recebe a ordem nova; memória recebe o mesmo de antes.
   ------------------------------------------------------------------ */
const chaveAnterior = process.env.RAPIDAPI_KEY;
const USUARIO_ID = "11111111-1111-4111-8111-111111111111";
const IDENTIFICADO = "55555555-5555-4555-8555-555555555555";

const ORGANICOS_CASO_B = [
  { title: "Casa na Rua Michigan, 610 - Jardim Presidente", description: "3 quartos.", link: "https://portal-d.test/b1" },
  { title: "Rua Michigan 610", description: "Área 120 m², 2 vagas.", link: "https://portal-e.test/b2" },
  { title: "Rua Michigan, 610", description: "", link: "https://portal-f.test/b3" },
];

function clienteSupabase() {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id: IDENTIFICADO }, error: null });
  const eq = vi.fn();
  eq.mockReturnValue({ eq, maybeSingle });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null }) },
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) }),
  };
}

function requisicao(corpo: Record<string, unknown>): Request {
  return new Request("http://localhost/api/investigador-imoveis", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-sessao", "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

async function eventosDe(resposta: Response) {
  return (await resposta.text()).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
}

describe("rota POST com o B3", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.RAPIDAPI_KEY = "chave-local-simulada";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.createClient.mockReturnValue(clienteSupabase());
    mocks.persistirMemoria.mockReset().mockResolvedValue({
      estado: "salva", execucaoId: "x", atributosSalvos: 1, atributosRecusados: 0,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic_results: ORGANICOS_CASO_B }), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  afterAll(() => {
    if (chaveAnterior === undefined) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = chaveAnterior;
  });

  it("cliente recebe a ordem do B3; memória recebe a lista do B2, com o mesmo conteúdo e a mesma ordem", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const eventos = await eventosDe(await POST(requisicao({ consulta: ENTRADA_MICHIGAN, imovelIdentificado: IDENTIFICADO })));
    const final = eventos.at(-1);
    expect(final.tipo).toBe("resultado");
    expect(final.dados.resultados.map((r: { url: string }) => r.url))
      .toEqual(["https://portal-e.test/b2", "https://portal-d.test/b1", "https://portal-f.test/b3"]);

    // O que a memória recebia antes do B3: os mantidos do B2, montados
    // como o servidor monta, na ordem da análise.
    const [primeira] = planejarPesquisasInvestigacao(ENTRADA_MICHIGAN);
    const comoOServidorMonta = ORGANICOS_CASO_B.map((o) => resultadoWeb(o.link, o.title, o.description, [primeira.consulta]));
    const esperado = triarCorrespondenciasInvestigacao(ENTRADA_MICHIGAN, deduplicarResultadosInvestigacao(comoOServidorMonta)).mantidos;

    expect(mocks.persistirMemoria).toHaveBeenCalledTimes(1);
    const [{ resultados: paraMemoria }] = mocks.persistirMemoria.mock.calls[0];
    expect(paraMemoria).toEqual(esperado);
    expect(paraMemoria.map((r: { url: string }) => r.url))
      .toEqual(["https://portal-d.test/b1", "https://portal-e.test/b2", "https://portal-f.test/b3"]);
    expect(atributosParaRpc(extrairAfirmacoesDaInvestigacao(paraMemoria).afirmacoes))
      .toEqual(atributosParaRpc(extrairAfirmacoesDaInvestigacao(esperado).afirmacoes));
    // Mesmo conteúdo que o cliente vê: só a ordem difere.
    const doCliente = new Map(final.dados.resultados.map((r: { url: string }) => [r.url, r]));
    for (const r of paraMemoria) expect(doCliente.get(r.url)).toEqual(r);
  });

  it("o cliente não recebe score, pontuação, motivos nem sinais", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const eventos = await eventosDe(await POST(requisicao({ consulta: ENTRADA_MICHIGAN })));
    const cliente = JSON.stringify(eventos);
    for (const campo of ["pontuacao", "pontos", "score", "motivos", "sinais", "versao", "b3.1", "rankingMudou"]) {
      expect(cliente).not.toContain(campo);
    }
    // Cada card continua com os campos de sempre, e só eles.
    const permitidos = new Set([
      "area", "comparavelId", "condominio", "confianca", "consultas", "contradicoes", "descricao", "dominio",
      "endereco", "evidencias", "preco", "quartos", "referencia", "titulo", "url", "vagas",
    ]);
    for (const resultado of eventos.at(-1).dados.resultados) {
      expect(Object.keys(resultado).filter((chave) => !permitidos.has(chave))).toEqual([]);
    }
  });

  it("o log de conclusão traz o bloco agregado, sem URL, domínio, título, endereço, consulta nem valores", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await eventosDe(await POST(requisicao({ consulta: ENTRADA_MICHIGAN, imovelIdentificado: IDENTIFICADO })));
    const conclusao = info.mock.calls.find(([rotulo]) => String(rotulo).includes("investigação concluída"))?.[1] as Record<string, unknown>;
    expect(conclusao.pontuacao).toEqual({
      versao: "b3.1-v1",
      pontuados: 3,
      distribuicao: { "<=0": 0, "1-2": 0, "3-4": 2, "5-6": 1, ">=7": 0 },
      motivos: { endereco: 3, quartos: 1, area: 1, vagas: 1 },
      rankingMudou: true,
      posicoesAlteradas: 2,
      topoMudou: true,
      corroboraveis: 0,
      multiplasEtapas: 0,
      memoria: "nao-utilizada",
    });
    const logs = JSON.stringify(info.mock.calls);
    for (const trecho of ["Michigan", "Jardim", "Presidente", "Londrina", "portal-", ".test", "120 m", "3 quartos", "2 vagas"]) {
      expect(logs).not.toContain(trecho);
    }
  });

  it("no Garimpo, a leitura B3.2a posterior não altera o resumo do score B3.1", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const cliente = clienteSupabase();
    mocks.createClient.mockReturnValue(cliente);
    await eventosDe(await POST(requisicao({ consulta: ENTRADA_MICHIGAN, imovelIdentificado: IDENTIFICADO })));
    const tabelas = cliente.from.mock.calls.map(([tabela]) => tabela);
    expect(tabelas).toContain("imoveis_identificados"); // a posse, como antes
    expect(tabelas).toContain("imoveis_identificados_atributos"); // leitura B3.2a após o pipeline
    expect(tabelas).not.toContain("imoveis_identificados_investigacoes");
    const conclusao = info.mock.calls.find(([rotulo]) => String(rotulo).includes("investigação concluída"))?.[1] as {
      pontuacao: { memoria: string };
    };
    expect(conclusao.pontuacao.memoria).toBe("nao-utilizada");
  });
});
