/* ================================================================
   INVESTIGADOR (B2): gate de relevância.

   A análise de correspondência ordena, mas nunca descartava: um clipe de
   música que dividia uma palavra com a rua chegava ao usuário como
   "indício". O gate retira só o ruído com evidência concreta, antes da
   regra de parada, da UI e da memória. Ausência de dado não é motivo.
   Nenhuma chamada real: tudo com fetch simulado.
   ================================================================ */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analisarCorrespondenciasInvestigacao,
  deduplicarResultadosInvestigacao,
  extrairCamposInvestigacao,
  haEvidenciaSuficiente,
  MAXIMO_BUSCAS_POR_INVESTIGACAO,
  resumirTriagemInvestigacao,
  triarCorrespondenciasInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { buscarImovelNaWeb } from "@/lib/servidor/investigadorImoveis";
import {
  CONJUNTOS_RELEVANCIA,
  GARIMPO_CAYOWAA,
  RADAR_OSCAR_FREIRE,
  resultadoDaFixture,
} from "./fixtures/investigadorRelevancia";

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

/** Resultado como o servidor monta: campos extraídos de título + descrição. */
function resultado(titulo: string, descricao = "", url = "https://portal.test/anuncio/1"): ResultadoWebInvestigacao {
  return {
    titulo,
    url,
    dominio: new URL(url).hostname,
    descricao,
    consultas: ["q"],
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}

function triar(entrada: string, titulo: string, descricao = "", url?: string) {
  const [item] = triarCorrespondenciasInvestigacao(entrada, [resultado(titulo, descricao, url)]).itens;
  return item;
}

const MICHIGAN = "Rua Michigan, 610, Jardim Presidente, Londrina";

describe("casos obrigatórios do gate", () => {
  it("A. endereço idêntico permanece como relevante", () => {
    const item = triar(MICHIGAN, "Casa na Rua Michigan 610 Londrina");
    expect(item).toMatchObject({ relevancia: "relevante", motivo: null });
    expect(item.correspondencia.confianca).toBe("muito-forte");
  });

  it("B. mesma referência permanece como relevante, mesmo sem nenhum outro campo", () => {
    expect(triar("01860.001", "Ref. 01860.001", "")).toMatchObject({ relevancia: "relevante", motivo: null });
  });

  it("C. mesmo empreendimento com características compatíveis permanece como relevante", () => {
    const item = triar("Ed. Vivere Palhano, 79 m², 3 quartos, Londrina", "Ed. Vivere Palhano 79 m²", "3 quartos.");
    expect(item.relevancia).toBe("relevante");
    expect(item.correspondencia.confianca).toBe("muito-forte");
  });

  describe("D. endereço explicitamente diferente", () => {
    it("outra rua, e a procurada não aparece: descartado", () => {
      expect(triar(MICHIGAN, "Casa à venda na Rua Sergipe, 610 - Londrina", "3 quartos."))
        .toMatchObject({ relevancia: "irrelevante", motivo: "endereco-divergente" });
    });

    it("outra rua, mas a procurada aparece fora do número (endereço da imobiliária): fica", () => {
      expect(triar(MICHIGAN, "Casa à venda na Michigan, Jardim Presidente", "Imobiliária Exemplo - Av. Paraná, 100."))
        .toMatchObject({ relevancia: "inconclusivo", motivo: null });
    });

    it("\"endereço\" que o extrator monta de frase genérica (\"rua tranquila, 12 minutos\") não descarta", () => {
      const item = triar(MICHIGAN, "Casa em rua tranquila, 12 minutos do centro", "3 quartos.");
      expect(item.correspondencia.endereco).toBe("rua tranquila, 12");
      expect(item).toMatchObject({ relevancia: "inconclusivo", motivo: null });
    });

    it("sinal positivo mais forte vence: mesma referência com outro número fica", () => {
      const item = triar("Rua Michigan, 610, Londrina, Ref. 01860.001", "Casa Rua Michigan, 612, Londrina", "Ref. 01860.001");
      expect(item.relevancia).toBe("relevante");
      expect(item.correspondencia.contradicoes).toContain("Endereço diferente: Rua Michigan, 612");
      expect(item.correspondencia.confianca).not.toBe("muito-forte");
    });

    it("sinal positivo mais forte vence: mesmo edifício com outro número fica", () => {
      const item = triar("Rua Michigan, 610, Edifício Aurora, Londrina", "Apartamento Edifício Aurora, Rua Michigan, 620");
      expect(item.relevancia).toBe("relevante");
      expect(item.correspondencia.contradicoes).toContain("Endereço diferente: Rua Michigan, 620");
    });
  });

  it("E. referência explicitamente diferente não parece forte e não é descartada (pode ser outra imobiliária)", () => {
    const item = triar("Casa Ref. 01860.001, 3 quartos", "Casa 3 quartos | Cód. CA-7781", "Jardim Presidente.");
    expect(item).toMatchObject({ relevancia: "inconclusivo", motivo: null });
    expect(["muito-forte", "forte"]).not.toContain(item.correspondencia.confianca);
    expect(item.correspondencia.contradicoes).toContain("Referência diferente: CA-7781");
  });

  describe("F. fora do domínio imobiliário", () => {
    it("música/vídeo sem nenhum sinal de imóvel: descartado", () => {
      expect(triar(RADAR_OSCAR_FREIRE, "Oscar Freire - Ao Vivo", "Ouça a música completa.", "https://video.test/v/1"))
        .toMatchObject({ relevancia: "irrelevante", motivo: "conteudo-nao-imobiliario" });
    });

    it("divide só uma palavra solta com a consulta: descartado mesmo sem marcador de outro assunto", () => {
      expect(triar(RADAR_OSCAR_FREIRE, "Oscar 2026: lista dos vencedores", "A premiação desta noite.", "https://n.test/o"))
        .toMatchObject({ relevancia: "irrelevante", motivo: "sem-relacao-com-a-entrada" });
    });

    it("vídeo de imóvel continua: um sinal do domínio basta para não descartar", () => {
      expect(triar(RADAR_OSCAR_FREIRE, "Tour em vídeo: apartamento na Oscar Freire", "", "https://video.test/v/2").relevancia)
        .toBe("inconclusivo");
    });

    it("sinal só na URL também conta", () => {
      expect(triar(RADAR_OSCAR_FREIRE, "Oscar 2026", "Lista.", "https://portal.test/imoveis/sp/9981").relevancia)
        .toBe("inconclusivo");
    });

    it("entrada sem âncora (\"Casa 3 quartos Londrina\"): só o marcador explícito descarta", () => {
      expect(triar("Casa 3 quartos Londrina", "Londrina Esporte Clube", "Resultado da rodada.").relevancia)
        .toBe("inconclusivo");
      expect(triar("Casa 3 quartos Londrina", "Londrina - música ao vivo", "Show hoje.").motivo)
        .toBe("conteudo-nao-imobiliario");
    });
  });

  it("G. snippet pobre, sem contradição: não é descartado por falta de dado", () => {
    for (const [titulo, descricao] of [
      ["Casas à venda em Jardim Presidente, Londrina", ""],
      ["Imóvel no Jardim Presidente", ""],
      ["Michigan - Jardim Presidente", ""],
    ]) {
      expect(triar(MICHIGAN, titulo, descricao)).toMatchObject({ relevancia: "inconclusivo", motivo: null });
    }
  });

  it("H. mesma rua, número diferente: outro imóvel, descartado", () => {
    const item = triar(MICHIGAN, "Casa na Rua Michigan 612 Londrina", "3 quartos, 2 vagas");
    expect(item).toMatchObject({ relevancia: "irrelevante", motivo: "endereco-divergente" });
  });

  it("I. 610 não casa com 6100: é outro número da mesma rua", () => {
    const item = triar(MICHIGAN, "Casa na Rua Michigan, 6100, Londrina");
    expect(item.correspondencia.evidencias.some((texto) => texto.startsWith("Endereço idêntico"))).toBe(false);
    expect(item).toMatchObject({ relevancia: "irrelevante", motivo: "endereco-divergente" });
  });

  it("J. \"Av.\", \"Av\" e \"Avenida\" continuam equivalentes, para manter e para descartar", () => {
    for (const titulo of ["Apto na Av. Higienópolis, 1000", "Apto na Av Higienópolis 1000", "Apto na Avenida Higienópolis, 1000"]) {
      expect(triar("Avenida Higienópolis, 1000, Londrina", titulo).relevancia).toBe("relevante");
    }
    expect(triar("Avenida Higienópolis, 1000, Londrina", "Apto na Av. Higienópolis, 1020").motivo)
      .toBe("endereco-divergente");
  });

  it("K. rua sem número na entrada não vira condomínio nem âncora de descarte", () => {
    const item = triar("Rua Michigan, 3 quartos, 2 vagas, Londrina", "Casa Rua Michigan, 610, Londrina, 3 quartos, 2 vagas");
    expect(item.correspondencia.evidencias.some((texto) => texto.startsWith("Mesmo condomínio"))).toBe(false);
    expect(item).toMatchObject({ relevancia: "inconclusivo", motivo: null });
  });

  it("L. resultado duplicado não conta duas vezes: o gate trabalha sobre o conjunto deduplicado", () => {
    const ruido = resultado("Oscar Freire - Ao Vivo", "Ouça a música completa.", "https://video.test/v/1?utm_source=x");
    const copia = { ...ruido, url: "https://www.video.test/v/1", consultas: ["outra"] };
    const certo = resultado("Apartamento Rua Oscar Freire, 900", "", "https://portal.test/of900");
    const unicos = deduplicarResultadosInvestigacao([ruido, copia, certo]);
    expect(unicos).toHaveLength(2);
    expect(resumirTriagemInvestigacao(triarCorrespondenciasInvestigacao(RADAR_OSCAR_FREIRE, unicos))).toEqual({
      analisados: 2,
      mantidos: 1,
      relevantes: 1,
      inconclusivos: 0,
      descartados: 1,
      motivosDescarte: { "conteudo-nao-imobiliario": 1 },
    });
  });
});

describe("o gate só retira: não mexe na análise nem na regra de parada", () => {
  const conjuntos = CONJUNTOS_RELEVANCIA.map((conjunto) => ({
    ...conjunto,
    unicos: deduplicarResultadosInvestigacao(conjunto.fixtures.map((fixture) => resultadoDaFixture(fixture))),
  }));

  it("os mantidos são a análise de antes menos os descartados, com a mesma confiança e a mesma ordem", () => {
    for (const { entrada, unicos } of conjuntos) {
      const triagem = triarCorrespondenciasInvestigacao(entrada, unicos);
      const descartados = new Set(triagem.itens.filter((item) => item.motivo).map((item) => item.correspondencia.url));
      expect(triagem.mantidos).toEqual(
        analisarCorrespondenciasInvestigacao(entrada, unicos).filter((item) => !descartados.has(item.url)),
      );
    }
  });

  it("toda correspondência muito forte é relevante: o gate não tira o que encerraria a fila", () => {
    for (const { entrada, unicos } of conjuntos) {
      const triagem = triarCorrespondenciasInvestigacao(entrada, unicos);
      for (const item of triagem.itens.filter((i) => i.correspondencia.confianca === "muito-forte")) {
        expect(item.relevancia).toBe("relevante");
      }
      expect(haEvidenciaSuficiente(triagem.mantidos))
        .toBe(haEvidenciaSuficiente(analisarCorrespondenciasInvestigacao(entrada, unicos)));
    }
  });

  it("é determinístico e a mesma entrada dá o mesmo veredito", () => {
    for (const { entrada, unicos } of conjuntos) {
      expect(triarCorrespondenciasInvestigacao(entrada, unicos)).toEqual(triarCorrespondenciasInvestigacao(entrada, unicos));
    }
  });
});

/* ------------------------------------------------------------------
   Simulação ANTES × DEPOIS nas fixtures representativas. Antes, todos
   os únicos eram exibidos. O foco é o falso negativo: nenhum imóvel
   certo ou anúncio incompleto pode sair.
   ------------------------------------------------------------------ */
describe("simulação antes × depois nas fixtures", () => {
  it.each(CONJUNTOS_RELEVANCIA.flatMap((conjunto) =>
    conjunto.fixtures.map((fixture) => [conjunto.nome, fixture.id, conjunto.entrada, fixture] as const)
  ))("%s, %s: veredito de produto", (_nome, _id, entrada, fixture) => {
    const [item] = triarCorrespondenciasInvestigacao(entrada, [resultadoDaFixture(fixture)]).itens;
    expect(item.relevancia).toBe(fixture.esperado);
  });

  it("contagens por conjunto e nenhum falso negativo", () => {
    const tabela = CONJUNTOS_RELEVANCIA.map(({ nome, entrada, fixtures }) => {
      const brutos = fixtures.map((fixture) => resultadoDaFixture(fixture));
      const unicos = deduplicarResultadosInvestigacao(brutos);
      const antes = analisarCorrespondenciasInvestigacao(entrada, unicos);
      const triagem = triarCorrespondenciasInvestigacao(entrada, unicos);
      const naturezaDe = (url: string) => fixtures.find((fixture) => fixture.url === url)?.natureza;
      const perdidos = triagem.itens
        .filter((item) => item.motivo)
        .map((item) => naturezaDe(item.correspondencia.url))
        .filter((natureza) => natureza === "imovel-certo" || natureza === "anuncio-incompleto");
      expect(perdidos).toEqual([]);
      return {
        nome,
        brutos: brutos.length,
        unicos: unicos.length,
        exibidosAntes: antes.length,
        ...resumirTriagemInvestigacao(triagem),
        confiancaMantidos: triagem.mantidos.map((item) => item.confianca),
      };
    });
    expect(tabela).toEqual([
      {
        nome: "Pipeline (referência + endereço + edifício)",
        brutos: 7, unicos: 7, exibidosAntes: 7,
        analisados: 7, mantidos: 5, relevantes: 2, inconclusivos: 3, descartados: 2,
        motivosDescarte: { "endereco-divergente": 1, "conteudo-nao-imobiliario": 1 },
        confiancaMantidos: ["muito-forte", "muito-forte", "possivel", "indicio", "indicio"],
      },
      {
        nome: "Radar (endereço + características + anúncio)",
        brutos: 7, unicos: 7, exibidosAntes: 7,
        analisados: 7, mantidos: 4, relevantes: 1, inconclusivos: 3, descartados: 3,
        motivosDescarte: { "conteudo-nao-imobiliario": 3 },
        confiancaMantidos: ["muito-forte", "indicio", "indicio", "indicio"],
      },
      {
        nome: "Garimpo (rua com número, sem detalhes)",
        brutos: 5, unicos: 5, exibidosAntes: 5,
        analisados: 5, mantidos: 4, relevantes: 1, inconclusivos: 3, descartados: 1,
        motivosDescarte: { "endereco-divergente": 1 },
        confiancaMantidos: ["muito-forte", "possivel", "indicio", "indicio"],
      },
    ]);
  });
});

/* ------------------------------------------------------------------
   Fila (B1 + A2) com o gate: ruído não encerra a fila, e o gate não
   cria pesquisa além do plano.
   ------------------------------------------------------------------ */
const chaveAnterior = process.env.RAPIDAPI_KEY;

const RUIDO = [
  { title: "Oscar Freire - Ao Vivo (Clipe Oficial)", description: "Ouça a música.", link: "https://video.test/v/1" },
  { title: "Oscar Freire (médico) – Wikipédia", description: "Nasceu em Salvador.", link: "https://enciclopedia.test/of" },
];
const CERTO = {
  title: "Apartamento 2 quartos Rua Oscar Freire, 900 - Jardim Paulista",
  description: "75 m², 1 vaga.",
  link: "https://portal.test/anuncio/of900",
};

function resposta(organicos: unknown[]): Response {
  return new Response(JSON.stringify({ organic_results: organicos }), { status: 200 });
}

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.RAPIDAPI_KEY = "chave-local-simulada";
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => {
  if (chaveAnterior === undefined) delete process.env.RAPIDAPI_KEY;
  else process.env.RAPIDAPI_KEY = chaveAnterior;
});

describe("fila progressiva com o gate", () => {
  const fila = ["etapa 1", "etapa 2", "etapa 3"];

  it("primeira etapa só com ruído: a fila segue o plano e para quando o imóvel certo aparece", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta(RUIDO))
      .mockResolvedValueOnce(resposta([CERTO, RUIDO[0]]));
    const busca = await buscarImovelNaWeb(RADAR_OSCAR_FREIRE, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca).toMatchObject({ motivoParada: "evidencia-suficiente", encerramentoAntecipado: true, pesquisasEvitadas: 1 });
    expect(busca.descartadosPorEtapa).toEqual([2, 0]);
    // A busca entrega tudo; o gate é aplicado na rota. Nada some antes.
    expect(busca.resultados).toHaveLength(4);
  });

  it("tudo descartado em todas as etapas: no máximo o plano (3), nunca uma quarta pesquisa", async () => {
    const fetcher = vi.fn().mockImplementation(async () => resposta(RUIDO));
    const busca = await buscarImovelNaWeb(RADAR_OSCAR_FREIRE, [...fila, "etapa 4"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(MAXIMO_BUSCAS_POR_INVESTIGACAO);
    expect(busca).toMatchObject({ motivoParada: "plano-esgotado", encerramentoAntecipado: false });
    expect(busca.descartadosPorEtapa).toEqual([2, 0, 0]);
  });

  it("resultado muito forte junto com ruído continua economizando chamadas", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta([...RUIDO, CERTO]));
    const busca = await buscarImovelNaWeb(RADAR_OSCAR_FREIRE, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(busca).toMatchObject({ motivoParada: "evidencia-suficiente", pesquisasEvitadas: 2 });
    expect(busca.descartadosPorEtapa).toEqual([2]);
  });

  it("429 depois do ruído: para pelo limite, como antes, e conta o que já foi descartado", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta(RUIDO))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const busca = await buscarImovelNaWeb(RADAR_OSCAR_FREIRE, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca).toMatchObject({ motivoParada: "limite-provider", limiteAtingido: true });
    expect(busca.descartadosPorEtapa).toEqual([2, 0]);
  });
});

/* ------------------------------------------------------------------
   Rota: ruído não chega ao cliente nem à memória; o log conta.
   ------------------------------------------------------------------ */
const USUARIO_ID = "11111111-1111-4111-8111-111111111111";
const IDENTIFICADO = "55555555-5555-4555-8555-555555555555";

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

async function eventosDe(respostaRota: Response) {
  return (await respostaRota.text()).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
}

function conclusao(info: { mock: { calls: unknown[][] } }) {
  return info.mock.calls.find(([rotulo]) => String(rotulo).includes("investigação concluída"))?.[1] as Record<string, unknown>;
}

describe("rota POST com o gate", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.createClient.mockReturnValue(clienteSupabase());
    mocks.persistirMemoria.mockReset().mockResolvedValue({
      estado: "salva", execucaoId: "x", atributosSalvos: 1, atributosRecusados: 0,
    });
  });

  it("descartados não chegam ao cliente nem à memória; o log conta só números e códigos", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta([...RUIDO, CERTO])));

    const eventos = await eventosDe(await POST(requisicao({ consulta: RADAR_OSCAR_FREIRE, imovelIdentificado: IDENTIFICADO })));
    const final = eventos.at(-1);
    expect(final.tipo).toBe("resultado");
    expect(final.dados.resultados.map((item: { url: string }) => item.url)).toEqual(["https://portal.test/anuncio/of900"]);
    expect(final.dados.aviso).toBeUndefined();

    const [{ resultados: paraMemoria }] = mocks.persistirMemoria.mock.calls[0];
    expect(paraMemoria.map((item: { url: string }) => item.url)).toEqual(["https://portal.test/anuncio/of900"]);

    expect(conclusao(info)).toMatchObject({
      resultadosBrutos: 3,
      resultadosUnicos: 3,
      resultadosExibidos: 1,
      resultadosRelevantes: 1,
      resultadosInconclusivos: 0,
      resultadosDescartados: 2,
      motivosDescarte: { "conteudo-nao-imobiliario": 2 },
      etapas: [{ etapa: "especifica", resultados: 3, novos: 3, descartados: 2 }],
    });
    const logs = JSON.stringify(info.mock.calls);
    for (const trecho of ["Oscar Freire", "Jardim Paulista", "Clipe", "Salvador", "video.test", "of900"]) {
      expect(logs).not.toContain(trecho);
    }
    // Nenhum metadado técnico do gate chega ao cliente.
    const cliente = JSON.stringify(eventos);
    for (const campo of ["relevancia", "motivo", "descartad", "irrelevante"]) expect(cliente).not.toContain(campo);
  });

  it("tudo descartado: resposta vazia com o aviso de sempre, sem erro", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta(RUIDO)));

    const eventos = await eventosDe(await POST(requisicao({ consulta: GARIMPO_CAYOWAA })));
    expect(eventos.at(-1)).toMatchObject({
      tipo: "resultado",
      dados: { ok: true, resultados: [], aviso: "Nenhuma possível correspondência apareceu nessas buscas." },
    });
    expect(conclusao(info)).toMatchObject({
      encerramento: "concluida",
      resultadosUnicos: 2,
      resultadosExibidos: 0,
      resultadosDescartados: 2,
      etapas: [
        { etapa: "especifica", descartados: 2 },
        { etapa: "logradouro", descartados: 0 },
      ],
    });
  });
});
