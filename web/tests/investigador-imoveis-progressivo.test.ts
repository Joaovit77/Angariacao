/* ================================================================
   INVESTIGADOR (B1): pesquisas progressivas.

   Precisão primeiro, ampliação controlada depois. O plano é uma função
   pura do texto; a fila só avança sem evidência suficiente, sem 429 e
   com orçamento A2. Nenhuma chamada real: tudo com fetch simulado.

   Os endereços de Bela Cintra, Oscar Freire e Cayowaá reproduzem o
   FORMATO das consultas montadas pelo Pipeline, Radar e Garimpo; não há
   regra específica para eles.
   ================================================================ */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planejarPesquisasInvestigacao } from "@/lib/calculo/investigadorImoveis";
import { buscarImovelNaWeb, BuscaWebIndisponivel } from "@/lib/servidor/investigadorImoveis";
import {
  MARGEM_FINALIZACAO_INVESTIGACAO_MS,
  ORCAMENTO_TOTAL_INVESTIGACAO_MS,
} from "@/lib/servidor/investigadorOrcamento";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { POST } from "@/app/api/investigador-imoveis/route";

const chaveAnterior = process.env.RAPIDAPI_KEY;

const PIPELINE_BELA_CINTRA = "Rua Bela Cintra, 986, unidade 52, bloco A, Consolação, São Paulo, SP, "
  + "Edifício Bela Vista, Apartamento, 2 quartos, 1 banheiro, 1 vaga, referência 01860.001";
const RADAR_OSCAR_FREIRE = "Rua Oscar Freire, 900, Jardim Paulista, São Paulo, SP, Apartamento, 75 m², "
  + "2 quartos, 1 vaga, anúncio Chaves na Mão 123456";
const GARIMPO_CAYOWAA = "Rua Cayowaá, 1500, Perdizes, São Paulo, SP, Casa";

/** Consulta e resultado com evidência suficiente pela regra existente
    (mesmo condomínio + área + quartos, sem contradição). */
const CONSULTA_COM_EVIDENCIA = "Ed. Vivere Palhano, 79 m², 3 quartos, Gleba Palhano, Londrina";
const ORGANICO_COM_EVIDENCIA = {
  title: "Ed. Vivere Palhano 79 m²",
  description: "Ed. Vivere Palhano com 79 m² e 3 quartos.",
  link: "https://imobiliaria.test/imovel/vivere",
};

function organicoGenerico(indice: number) {
  const textos = ["esquina arborizada", "próxima ao parque", "rua tranquila", "vista livre"];
  return {
    title: `Imóvel genérico ${indice} ${textos[indice % 4]}`,
    description: `Anúncio ${indice} sem identidade, ${textos[indice % 4]}.`,
    link: `https://portal.test/anuncio/${indice}`,
  };
}

function resposta(organicos: unknown[]): Response {
  return new Response(JSON.stringify({ organic_results: organicos }), { status: 200 });
}

function palavrasDaConsulta(consulta: string) {
  return new URL(consulta).searchParams.get("keyword");
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

describe("planejarPesquisasInvestigacao: plano progressivo e determinístico", () => {
  it("Pipeline com referência: referência exata, depois endereço e contexto, depois a rua sem número", () => {
    expect(planejarPesquisasInvestigacao(PIPELINE_BELA_CINTRA)).toEqual([
      { etapa: "especifica", consulta: '"01860.001" imóvel' },
      {
        etapa: "nucleo",
        consulta: "Rua Bela Cintra, 986, Consolação, São Paulo, SP, Edifício Bela Vista, Apartamento imóvel",
      },
      {
        etapa: "logradouro",
        consulta: "Rua Bela Cintra, Consolação, São Paulo, SP, Edifício Bela Vista, Apartamento imóvel",
      },
    ]);
  });

  it("Radar sem referência: texto completo primeiro, depois sem área/quartos/vagas/anúncio, depois sem número", () => {
    expect(planejarPesquisasInvestigacao(RADAR_OSCAR_FREIRE)).toEqual([
      { etapa: "especifica", consulta: `${RADAR_OSCAR_FREIRE} imóvel` },
      { etapa: "nucleo", consulta: "Rua Oscar Freire, 900, Jardim Paulista, São Paulo, SP, Apartamento imóvel" },
      { etapa: "logradouro", consulta: "Rua Oscar Freire, Jardim Paulista, São Paulo, SP, Apartamento imóvel" },
    ]);
  });

  it("Garimpo sem detalhe restritivo: o núcleo igual ao texto não vira etapa redundante", () => {
    expect(planejarPesquisasInvestigacao(GARIMPO_CAYOWAA)).toEqual([
      { etapa: "especifica", consulta: `${GARIMPO_CAYOWAA} imóvel` },
      { etapa: "logradouro", consulta: "Rua Cayowaá, Perdizes, São Paulo, SP, Casa imóvel" },
    ]);
  });

  it("condomínio rotulado sem endereço amplia para o núcleo e para aí", () => {
    expect(planejarPesquisasInvestigacao(CONSULTA_COM_EVIDENCIA)).toEqual([
      { etapa: "especifica", consulta: `${CONSULTA_COM_EVIDENCIA} imóvel` },
      { etapa: "nucleo", consulta: "Ed. Vivere Palhano, Gleba Palhano, Londrina imóvel" },
    ]);
  });

  it.each([
    ["só a rua com número, sem contexto para ampliar", "Rua Bela Cintra, 986"],
    ["tipo, quartos e cidade", "Casa 3 quartos Londrina"],
    ["bairro e cidade", "Apartamento 2 quartos Gleba Palhano Londrina"],
    ["rua sem número", "Rua Francisco Bernardino Leite, Califórnia, Londrina"],
    ["título solto de anúncio", "Apartamento com 3 quartos à venda, 79 m² em Gleba Palhano"],
    ["só a referência", "01860.001"],
  ])("sem âncora para ampliar (%s): só a pesquisa específica", (_caso, entrada) => {
    const plano = planejarPesquisasInvestigacao(entrada);
    expect(plano).toHaveLength(1);
    expect(plano[0].etapa).toBe("especifica");
  });

  it("toda etapa ampliada conserva a âncora: nunca termina em rua, bairro ou cidade sozinhos", () => {
    for (const [entrada, ancora] of [
      [PIPELINE_BELA_CINTRA, "Rua Bela Cintra"],
      [RADAR_OSCAR_FREIRE, "Rua Oscar Freire"],
      [GARIMPO_CAYOWAA, "Rua Cayowaá"],
      [CONSULTA_COM_EVIDENCIA, "Ed. Vivere Palhano"],
    ]) {
      for (const pesquisa of planejarPesquisasInvestigacao(entrada).slice(1)) {
        expect(pesquisa.consulta).toContain(ancora);
        expect(pesquisa.consulta.replace(ancora, "").replace(/imóvel|,|\s/g, "")).not.toBe("");
      }
    }
  });

  it("é determinístico, respeita o teto de três e não repete consulta normalizada", () => {
    for (const entrada of [PIPELINE_BELA_CINTRA, RADAR_OSCAR_FREIRE, GARIMPO_CAYOWAA, "x".repeat(500)]) {
      const plano = planejarPesquisasInvestigacao(entrada);
      expect(planejarPesquisasInvestigacao(entrada)).toEqual(plano);
      expect(planejarPesquisasInvestigacao(`  ${entrada.replace(/ /g, "   ")}  `)).toEqual(plano);
      expect(plano.length).toBeLessThanOrEqual(3);
      const chaves = plano.map((item) => item.consulta.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
      expect(new Set(chaves).size).toBe(chaves.length);
      expect(plano.every((item) => item.consulta.length <= 500)).toBe(true);
    }
  });

  it("rua + número com e sem vírgula são âncoras com progressão equivalente", () => {
    expect(planejarPesquisasInvestigacao("Rua Michigan, 610, Londrina")).toEqual([
      { etapa: "especifica", consulta: "Rua Michigan, 610, Londrina imóvel" },
      { etapa: "logradouro", consulta: "Rua Michigan, Londrina imóvel" },
    ]);
    expect(planejarPesquisasInvestigacao("Rua Michigan 610 Londrina")).toEqual([
      { etapa: "especifica", consulta: "Rua Michigan 610 Londrina imóvel" },
      { etapa: "logradouro", consulta: "Rua Michigan Londrina imóvel" },
    ]);
    const comDetalhes = (separador: string) => planejarPesquisasInvestigacao(
      `Rua Michigan${separador}610, Jardim Presidente, Londrina, Casa, 3 quartos, 2 vagas`,
    ).map((item) => item.etapa);
    expect(comDetalhes(" ")).toEqual(["especifica", "nucleo", "logradouro"]);
    expect(comDetalhes(" ")).toEqual(comDetalhes(", "));
  });

  it("número que faz parte do nome da rua não é número do imóvel", () => {
    expect(planejarPesquisasInvestigacao("Rua 10 de Dezembro, Centro, Londrina")).toHaveLength(1);
    expect(planejarPesquisasInvestigacao("Rua 10 de Dezembro Centro Londrina")).toHaveLength(1);
    expect(planejarPesquisasInvestigacao("Avenida 7 de Setembro, 3 quartos, Londrina")).toHaveLength(1);
    // Com o número do imóvel depois do nome, a âncora é a rua inteira.
    for (const entrada of ["Rua 10 de Dezembro, 45, Centro, Londrina", "Rua 10 de Dezembro 45 Centro Londrina"]) {
      const plano = planejarPesquisasInvestigacao(entrada);
      expect(plano.map((item) => item.etapa)).toEqual(["especifica", "logradouro"]);
      expect(plano[1].consulta).toMatch(/^Rua 10 de Dezembro,? Centro/);
      expect(plano[1].consulta).not.toContain("45");
    }
  });

  it("número com letra não é suportado pelo extrator atual: nenhuma das formas amplia", () => {
    expect(planejarPesquisasInvestigacao("Rua Michigan, 610A, Londrina")).toHaveLength(1);
    expect(planejarPesquisasInvestigacao("Rua Michigan 610A Londrina")).toHaveLength(1);
  });

  it("entrada genérica continua com uma etapa", () => {
    expect(planejarPesquisasInvestigacao("Casa 3 quartos Londrina")).toHaveLength(1);
    expect(planejarPesquisasInvestigacao("Rua Michigan Londrina")).toHaveLength(1);
  });

  it("não confunde palavras que começam como rótulos com código ou anúncio", () => {
    expect(planejarPesquisasInvestigacao("Rua do Refúgio, 45, Codó, Anunciação, Londrina, 3 quartos")[1]).toEqual({
      etapa: "nucleo",
      consulta: "Rua do Refúgio, 45, Codó, Anunciação, Londrina imóvel",
    });
  });
});

describe("fila progressiva: quantas chamadas e por quê", () => {
  const fila = ["etapa 1", "etapa 2", "etapa 3"];

  it("caso A — a primeira etapa já tem evidência suficiente: 1 chamada, próximas não executam", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta([ORGANICO_COM_EVIDENCIA]));
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(busca).toMatchObject({
      consultasExecutadas: ["etapa 1"],
      motivoParada: "evidencia-suficiente",
      encerramentoAntecipado: true,
      pesquisasEvitadas: 2,
    });
    expect(busca.etapas).toEqual([{ resultados: 1, novos: 1, falhou: false, orcamentoRestanteMs: null }]);
  });

  it("caso B — primeira vazia, segunda encontra: a terceira não executa", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([]))
      .mockResolvedValueOnce(resposta([ORGANICO_COM_EVIDENCIA]));
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => palavrasDaConsulta(String(url)))).toEqual(["etapa 1", "etapa 2"]);
    expect(busca.motivoParada).toBe("evidencia-suficiente");
    expect(busca.etapas.map((etapa) => [etapa.resultados, etapa.novos])).toEqual([[0, 0], [1, 1]]);
  });

  it("caso C — duas primeiras vazias e com orçamento: a terceira executa e o plano se esgota", async () => {
    let agora = 0;
    const fetcher = vi.fn()
      .mockImplementationOnce(async () => { agora += 1_000; return resposta([]); })
      .mockImplementationOnce(async () => { agora += 1_000; return resposta([]); })
      .mockImplementationOnce(async () => { agora += 1_000; return resposta([organicoGenerico(3)]); });
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(busca.motivoParada).toBe("plano-esgotado");
    expect(busca.etapas.map((etapa) => etapa.orcamentoRestanteMs)).toEqual([42_000, 41_000, 40_000]);
    expect(busca.etapas.map((etapa) => etapa.novos)).toEqual([0, 0, 1]);
  });

  it("resultado inconclusivo continua avançando: quantidade de resultados, sozinha, não para a fila", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([1, 2, 3, 4].map(organicoGenerico)))
      .mockResolvedValueOnce(resposta([5, 6].map(organicoGenerico)))
      .mockResolvedValueOnce(resposta([7].map(organicoGenerico)));
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(busca.motivoParada).toBe("plano-esgotado");
  });

  it("plano de uma etapa só: 1 chamada mesmo sem evidência, motivo plano-esgotado", async () => {
    const fetcher = vi.fn().mockResolvedValue(resposta([organicoGenerico(1)]));
    const busca = await buscarImovelNaWeb("Casa 3 quartos Londrina", ["Casa 3 quartos Londrina imóvel"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(busca).toMatchObject({ motivoParada: "plano-esgotado", encerramentoAntecipado: false, pesquisasEvitadas: 0 });
  });

  it("caso D — orçamento acaba depois da primeira: a segunda não executa e o parcial é preservado", async () => {
    let agora = 0;
    const fetcher = vi.fn(async () => { agora += 39_000; return resposta([organicoGenerico(1)]); });
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(busca.resultados).toHaveLength(1);
    expect(busca).toMatchObject({
      motivoParada: "orcamento",
      orcamentoEsgotado: true,
      pesquisasEvitadas: 2,
      orcamentoRestanteNaParadaMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS - MARGEM_FINALIZACAO_INVESTIGACAO_MS - 39_000,
    });
  });

  it("caso E — timeout da primeira não encerra a investigação: a segunda tenta com o orçamento que sobra", async () => {
    let agora = 0;
    const fetcher = vi.fn()
      .mockImplementationOnce(async () => { agora += 22_000; throw new DOMException("tempo", "TimeoutError"); })
      .mockImplementationOnce(async () => { agora += 1_000; return resposta([ORGANICO_COM_EVIDENCIA]); });
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca).toMatchObject({ falhas: 1, motivoParada: "evidencia-suficiente" });
    expect(busca.etapas).toEqual([
      { resultados: 0, novos: 0, falhou: true, orcamentoRestanteMs: 42_000 },
      { resultados: 1, novos: 1, falhou: false, orcamentoRestanteMs: 20_000 },
    ]);
  });

  it("timeout em todas e orçamento esgotado: erro controlado com o resumo das etapas", async () => {
    let agora = 0;
    const fetcher = vi.fn(async () => { agora += 21_000; throw new DOMException("tempo", "TimeoutError"); });
    await expect(buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher as typeof fetch, undefined, {
      deadlineMs: ORCAMENTO_TOTAL_INVESTIGACAO_MS, agoraMs: () => agora,
    })).rejects.toMatchObject({
      motivo: "orcamento",
      resumo: { consultasExecutadas: 2, falhas: 2, motivoParada: "orcamento" },
    } satisfies Partial<BuscaWebIndisponivel>);
  });

  it("429 numa etapa intermediária para a fila com motivo limite-provider e preserva a anterior", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([organicoGenerico(1)]))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca).toMatchObject({ motivoParada: "limite-provider", limiteAtingido: true });
    expect(busca.resultados).toHaveLength(1);
  });

  it("caso F — o mesmo anúncio em duas etapas conta como novo só uma vez", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([organicoGenerico(1)]))
      .mockResolvedValueOnce(resposta([{ ...organicoGenerico(1), link: "https://www.portal.test/anuncio/1/?utm_source=google" }, organicoGenerico(2)]));
    const busca = await buscarImovelNaWeb(CONSULTA_COM_EVIDENCIA, fila.slice(0, 2), fetcher);
    expect(busca.etapas.map((etapa) => [etapa.resultados, etapa.novos])).toEqual([[1, 1], [2, 1]]);
  });
});

/* ------------------------------------------------------------------
   Rota: o plano chega ao provider e a conclusão explica as etapas.
   ------------------------------------------------------------------ */

const USUARIO_ID = "11111111-1111-4111-8111-111111111111";

function clienteSupabase() {
  const consultaIn = vi.fn().mockResolvedValue({ data: [], error: null });
  const eq = vi.fn().mockReturnValue({ in: consultaIn });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null }) },
    from: vi.fn().mockReturnValue({ select }),
  };
}

function requisicao(consulta: string): Request {
  return new Request("http://localhost/api/investigador-imoveis", {
    method: "POST",
    headers: { Authorization: "Bearer token-de-sessao", "Content-Type": "application/json" },
    body: JSON.stringify({ consulta }),
  });
}

async function eventosDe(respostaRota: Response) {
  return (await respostaRota.text()).trim().split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
}

function conclusoes(info: { mock: { calls: unknown[][] } }) {
  return info.mock.calls
    .filter(([rotulo]) => String(rotulo).includes("investigação concluída"))
    .map(([, dados]) => dados as Record<string, unknown>);
}

describe("rota POST com pesquisas progressivas", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.createClient.mockReturnValue(clienteSupabase());
  });

  it("envia ao provider as consultas do plano, na ordem, e registra etapas sem texto da consulta", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(resposta([organicoGenerico(1)]))
      .mockResolvedValueOnce(resposta([organicoGenerico(1), organicoGenerico(2)]))
      .mockResolvedValueOnce(resposta([]));
    vi.stubGlobal("fetch", fetcher);

    const eventos = await eventosDe(await POST(requisicao(RADAR_OSCAR_FREIRE)));
    const plano = planejarPesquisasInvestigacao(RADAR_OSCAR_FREIRE).map((item) => item.consulta);
    expect(fetcher.mock.calls.map(([url]) => palavrasDaConsulta(String(url)))).toEqual(plano);
    const final = eventos.at(-1);
    expect(final.tipo).toBe("resultado");
    expect(final.dados.consultas).toEqual(plano);
    // Caso F na rota: o card repetido entre etapas aparece uma vez.
    expect(final.dados.resultados).toHaveLength(2);

    const [conclusao] = conclusoes(info);
    expect(conclusao).toMatchObject({
      consultas: 3,
      encerramento: "concluida",
      etapasPlanejadas: 3,
      motivoParada: "plano-esgotado",
      etapas: [
        { etapa: "especifica", resultados: 1, novos: 1, falhou: false },
        { etapa: "nucleo", resultados: 2, novos: 1, falhou: false },
        { etapa: "logradouro", resultados: 0, novos: 0, falhou: false },
      ],
    });
    expect(typeof (conclusao.etapas as { orcamentoRestanteMs: unknown }[])[0].orcamentoRestanteMs).toBe("number");
    const texto = JSON.stringify(info.mock.calls);
    expect(texto).not.toContain("Oscar Freire");
    expect(texto).not.toContain("Jardim Paulista");
    // Nenhum campo de B1 chega ao cliente.
    expect(JSON.stringify(eventos)).not.toContain("motivoParada");
    expect(JSON.stringify(eventos)).not.toContain("etapasPlanejadas");
  });

  it("caso G — sem âncora: uma pesquisa só, mesmo inconclusiva, e nenhuma consulta genérica", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockResolvedValue(resposta([organicoGenerico(1)]));
    vi.stubGlobal("fetch", fetcher);

    const eventos = await eventosDe(await POST(requisicao("Casa 3 quartos Londrina")));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(palavrasDaConsulta(String(fetcher.mock.calls[0][0]))).toBe("Casa 3 quartos Londrina imóvel");
    expect(eventos.at(-1)).toMatchObject({ tipo: "resultado", dados: { pesquisasEvitadas: 0, encerramentoAntecipado: false } });
    expect(conclusoes(info)[0]).toMatchObject({
      consultas: 1, etapasPlanejadas: 1, motivoParada: "plano-esgotado", encerramento: "concluida",
    });
  });

  it("caso D na rota: orçamento recusa a próxima etapa, cards mantidos e motivo observável", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let agora = 0;
    vi.spyOn(performance, "now").mockImplementation(() => agora);
    const fetcher = vi.fn(async () => { agora += 39_000; return resposta([organicoGenerico(1)]); });
    vi.stubGlobal("fetch", fetcher);

    const eventos = await eventosDe(await POST(requisicao(RADAR_OSCAR_FREIRE)));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const final = eventos.at(-1);
    expect(final.dados.resultados).toHaveLength(1);
    expect(final.dados.aviso).toContain("tempo disponível");
    expect(conclusoes(info)[0]).toMatchObject({
      encerramento: "orcamento-parcial",
      etapasPlanejadas: 3,
      motivoParada: "orcamento",
      consultasPuladasPorOrcamento: 2,
      orcamentoRestanteNaParadaMs: 3_000,
      etapas: [{ etapa: "especifica", orcamentoRestanteMs: 42_000 }],
    });
  });

  it("falha total: a conclusão de erro também diz o tamanho do plano e o motivo", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("t", "TimeoutError")));
    const eventos = await eventosDe(await POST(requisicao(GARIMPO_CAYOWAA)));
    expect(eventos.at(-1).tipo).toBe("erro");
    expect(conclusoes(info)[0]).toMatchObject({
      consultas: 2,
      falhas: 2,
      encerramento: "provider-indisponivel",
      etapasPlanejadas: 2,
      motivoParada: "plano-esgotado",
      etapas: [
        { etapa: "especifica", falhou: true },
        { etapa: "logradouro", falhou: true },
      ],
    });
  });
});
