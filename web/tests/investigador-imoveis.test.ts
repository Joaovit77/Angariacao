import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analisarCorrespondenciasInvestigacao,
  canonicalizarUrlInvestigacao,
  consultaInvestigadorValida,
  deduplicarResultadosInvestigacao,
  extrairCamposInvestigacao,
  gerarConsultasInvestigacao,
  haEvidenciaSuficiente,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { buscarImovelNaWeb, BuscaWebIndisponivel } from "@/lib/servidor/investigadorImoveis";

const chaveAnterior = process.env.RAPIDAPI_KEY;

function resultado(parcial: Partial<ResultadoWebInvestigacao> = {}): ResultadoWebInvestigacao {
  return {
    titulo: "Apartamento no Ed Vivere Palhano",
    url: "https://imobiliaria.test/imovel/123",
    dominio: "imobiliaria.test",
    descricao: "Ed Vivere Palhano com 79 m², 3 quartos e 2 vagas.",
    consultas: ["Vivere Palhano"],
    preco: null,
    endereco: null,
    referencia: null,
    condominio: "Ed Vivere Palhano",
    quartos: 3,
    vagas: 2,
    area: 79,
    ...parcial,
  };
}

function respostaRapid(
  titulo: string,
  descricao: string,
  link = "https://imobiliaria.test/imovel/123",
): Response {
  return new Response(JSON.stringify({
    organic_results: [{ title: titulo, description: descricao, link }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("Investigador de Imóveis", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.RAPIDAPI_KEY = "segredo-de-teste";
  });

  afterAll(() => {
    if (chaveAnterior == null) delete process.env.RAPIDAPI_KEY;
    else process.env.RAPIDAPI_KEY = chaveAnterior;
  });

  it("gera no máximo três buscas rastreáveis e conserva a referência exata", () => {
    expect(gerarConsultasInvestigacao("01860.001")).toEqual([
      '"01860.001" imóvel',
      '"01860.001" aluguel',
      '"01860.001" imobiliária',
    ]);
    expect(gerarConsultasInvestigacao("Vivere Palhano 79m² 3 quartos Londrina")).toHaveLength(3);
    expect(gerarConsultasInvestigacao("a".repeat(500))).toHaveLength(3);
    expect(consultaInvestigadorValida("a".repeat(500))).toBe(true);
    expect(consultaInvestigadorValida("a".repeat(501))).toBe(false);
  });

  it("só extrai valores únicos e não escolhe um item de uma listagem agregada", () => {
    expect(extrairCamposInvestigacao("R$ 680.000 · 79 m² · 3 quartos · 2 vagas")).toMatchObject({
      preco: 680_000,
      referencia: null,
      area: 79,
      quartos: 3,
      vagas: 2,
    });
    expect(extrairCamposInvestigacao("78,76 m², 3 quartos; 79 m², 2 quartos")).toMatchObject({
      area: null,
      quartos: null,
    });
  });

  it.each([
    "Ref. 01860.001",
    "Referência: 01860.001",
    "Código do imóvel 01860.001",
    "Cód. 01860.001",
  ])("extrai referência quando existe contexto explícito: %s", (texto) => {
    expect(extrairCamposInvestigacao(texto).referencia).toBe("01860.001");
  });

  it("preserva letras, hífen e barra quando o código está rotulado", () => {
    expect(extrairCamposInvestigacao("Cód. ABC-123/4").referencia).toBe("ABC-123/4");
  });

  it.each([
    ["Aluguel R$ 2.700", 2_700],
    ["Aluguel 2.700", 2_700],
    ["Venda R$ 670.000", 670_000],
    ["Venda 670.000", 670_000],
    ["Valor 2.700", 2_700],
    ["Preço 670.000", 670_000],
    ["2.700 por mês", 2_700],
    ["2.700/mês", 2_700],
    ["mensais 2.700", 2_700],
    ["locação 2.700", 2_700],
    ["Imóvel para alugar por 2.700", 2_700],
  ])("trata contexto monetário sem inventar referência: %s", (texto, preco) => {
    expect(extrairCamposInvestigacao(texto)).toMatchObject({
      preco,
      referencia: null,
    });
  });

  it.each([
    "2.700",
    "670.000",
    "Apartamento 3 quartos - 2.700",
    "3.Read more",
  ])("mantém número sem contexto suficiente como ambíguo: %s", (texto) => {
    expect(extrairCamposInvestigacao(texto)).toMatchObject({
      preco: null,
      referencia: null,
    });
  });

  it("preserva a referência estrutural validada quando ela aparece isolada", () => {
    expect(extrairCamposInvestigacao("01860.001").referencia).toBe("01860.001");
  });

  it("permite preço e referência explícitos no mesmo título e descrição", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      respostaRapid(
        "Casa para alugar - R$ 2.700",
        "Ref. 01860.001 em condomínio residencial.",
      ),
    );
    const busca = await buscarImovelNaWeb("01860.001", ['"01860.001" imóvel'], fetcher);
    expect(busca.resultados[0]).toMatchObject({
      preco: 2_700,
      referencia: "01860.001",
    });
  });

  it("classifica referência igual sem conflito como correspondência muito forte", () => {
    const [correspondencia] = analisarCorrespondenciasInvestigacao("01860.001", [
      resultado({
        titulo: "Casa REF 01860.001",
        descricao: "REF: 01860.001 no Condomínio Ilha do Sol.",
        referencia: "01860.001",
        condominio: "Condomínio Ilha do Sol",
        area: null,
        quartos: null,
        vagas: null,
      }),
    ]);
    expect(correspondencia.confianca).toBe("muito-forte");
    expect(correspondencia.contradicoes).toEqual([]);
    expect(haEvidenciaSuficiente([correspondencia])).toBe(false);
  });

  it("reduz referência igual quando empreendimentos explícitos divergem", () => {
    const correspondencias = analisarCorrespondenciasInvestigacao("01860.001", [
      resultado({
        titulo: "Casa REF 01860.001",
        referencia: "01860.001",
        condominio: "Condomínio Ilha do Sol",
        area: null,
        quartos: null,
        vagas: null,
      }),
      resultado({
        titulo: "Casa REF 01860.001",
        url: "https://outra.test/imovel/456",
        dominio: "outra.test",
        referencia: "01860.001",
        condominio: "Residencial Vivendas do Arvoredo",
        area: null,
        quartos: null,
        vagas: null,
      }),
    ]);
    expect(correspondencias.every((item) => item.confianca === "possivel")).toBe(true);
    expect(correspondencias[0].contradicoes).toContain(
      "Empreendimento diverge entre resultados com a mesma referência",
    );
    expect(haEvidenciaSuficiente(correspondencias)).toBe(false);
  });

  it("reconhece endereço igual com área compatível", () => {
    const [correspondencia] = analisarCorrespondenciasInvestigacao(
      "Rua Joel Braz de Oliveira, 741 Londrina 79 m²",
      [resultado({
        endereco: "Rua Joel Braz de Oliveira, 741",
        descricao: "Casa na Rua Joel Braz de Oliveira, 741, Londrina, com 80 m².",
        area: 80,
        condominio: null,
        quartos: null,
        vagas: null,
      })],
    );
    expect(correspondencia.confianca).toBe("muito-forte");
    expect(correspondencia.evidencias).toEqual(expect.arrayContaining([
      expect.stringContaining("Endereço idêntico"),
      expect.stringContaining("Área compatível"),
    ]));
    expect(correspondencia.contradicoes).toEqual([]);
  });

  it("não encerra cedo só com endereço e repetição dos termos da consulta", () => {
    const [correspondencia] = analisarCorrespondenciasInvestigacao(
      "Rua Joel Braz de Oliveira, 741 Londrina",
      [resultado({
        titulo: "Casa na Rua Joel Braz de Oliveira, 741 em Londrina",
        descricao: "Imóvel disponível na Rua Joel Braz de Oliveira, 741, Londrina.",
        endereco: "Rua Joel Braz de Oliveira, 741",
        area: null,
        condominio: null,
        quartos: null,
        vagas: null,
      })],
    );
    expect(correspondencia.confianca).toBe("muito-forte");
    expect(correspondencia.evidencias).toEqual(expect.arrayContaining([
      expect.stringContaining("Endereço idêntico"),
      expect.stringContaining("Termos principais encontrados"),
    ]));
    expect(haEvidenciaSuficiente([correspondencia])).toBe(false);
  });

  it("limita endereço igual quando a área é muito incompatível", () => {
    const [correspondencia] = analisarCorrespondenciasInvestigacao(
      "Rua Joel Braz de Oliveira, 741 Londrina 79 m²",
      [resultado({
        endereco: "Rua Joel Braz de Oliveira, 741",
        descricao: "Casa na Rua Joel Braz de Oliveira, 741, Londrina, com 140 m².",
        area: 140,
        condominio: null,
        quartos: null,
        vagas: null,
      })],
    );
    expect(correspondencia.confianca).toBe("forte");
    expect(correspondencia.contradicoes).toContain("Área incompatível: 140 m²");
  });

  it("não transforma ausência de campo em contradição", () => {
    const [correspondencia] = analisarCorrespondenciasInvestigacao(
      "Vivere Palhano 79 m² 3 quartos 2 vagas",
      [resultado({ area: null, quartos: null, vagas: null })],
    );
    expect(correspondencia.contradicoes).toEqual([]);
    expect(correspondencia.evidencias).toEqual([
      expect.stringContaining("Mesmo condomínio"),
    ]);
  });

  it("dados conflitantes reduzem a classificação sem apagar evidências favoráveis", () => {
    const [correspondencia] = analisarCorrespondenciasInvestigacao(
      "Vivere Palhano 79 m² 3 quartos",
      [resultado({ quartos: 2 })],
    );
    expect(correspondencia.confianca).toBe("possivel");
    expect(correspondencia.evidencias).toEqual(expect.arrayContaining([
      expect.stringContaining("Mesmo condomínio"),
      expect.stringContaining("Área compatível"),
    ]));
    expect(correspondencia.contradicoes).toContain("Quantidade de quartos diferente: 2");
  });

  it("canonicaliza tracking, remove repetição no mesmo domínio e preserva outra fonte", () => {
    expect(canonicalizarUrlInvestigacao("https://www.Exemplo.com/imovel/1/?utm_source=x#foto"))
      .toBe("https://exemplo.com/imovel/1");
    const duplicado = resultado({
      url: "https://imobiliaria.test/imovel/123?utm_source=google",
      consultas: ["segunda busca"],
    });
    const outraFonte = resultado({ url: "https://portal.test/anuncio/abc", dominio: "portal.test" });
    const unicos = deduplicarResultadosInvestigacao([resultado(), duplicado, outraFonte]);
    expect(unicos).toHaveLength(2);
    expect(unicos[0].consultas).toHaveLength(2);
  });

  it("descarta esquema de URL inseguro mesmo quando o provider o devolve", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      organic_results: [{
        title: "Resultado inválido",
        description: "Não deve chegar à interface.",
        link: "javascript:alert(1)",
        displayedLink: "https://imobiliaria.test",
      }],
    }), { status: 200 }));
    const busca = await buscarImovelNaWeb("consulta", ["consulta"], fetcher);
    expect(busca.resultados).toEqual([]);
  });

  it("usa o contrato real do provider e resolve o redirecionamento do Google", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        meta: {},
        organic_results: [{
          title: "Vivere Palhano 79 m²",
          description: "Apartamento com 3 quartos em Londrina.",
          link: "/goto?url=token",
          displayedLink: "https://imobiliaria.test › imovel",
          position: 1,
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://imobiliaria.test/imovel/123?utm_source=google" },
      }));

    const busca = await buscarImovelNaWeb("Vivere Palhano", ["Vivere Palhano"], fetcher);
    const chamada = new URL(String(fetcher.mock.calls[0][0]));
    const opcoes = fetcher.mock.calls[0][1] as RequestInit;
    expect(chamada.hostname).toBe("google-search-api7.p.rapidapi.com");
    expect(chamada.searchParams.get("keyword")).toBe("Vivere Palhano");
    expect(chamada.searchParams.get("device")).toBe("Desktop");
    expect(opcoes.headers).toMatchObject({
      "x-rapidapi-key": "segredo-de-teste",
      "x-rapidapi-host": "google-search-api7.p.rapidapi.com",
    });
    expect(busca.resultados[0]).toMatchObject({
      titulo: "Vivere Palhano 79 m²",
      url: "https://imobiliaria.test/imovel/123?utm_source=google",
      dominio: "imobiliaria.test",
      area: 79,
      quartos: 3,
    });
  });

  it("para após a primeira pesquisa quando há evidência suficiente", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      respostaRapid("Vivere Palhano 79 m²", "Vivere Palhano com 79 m² e 3 quartos."),
    );
    const busca = await buscarImovelNaWeb(
      "Vivere Palhano 79 m² 3 quartos",
      ["busca 1", "busca 2", "busca 3"],
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(busca.consultasExecutadas).toEqual(["busca 1"]);
    expect(busca.encerramentoAntecipado).toBe(true);
    expect(busca.pesquisasEvitadas).toBe(2);
  });

  it("executa a segunda pesquisa quando a primeira é inconclusiva", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(respostaRapid("Imóvel no Centro", "Anúncio sem características.", "https://portal.test/1"))
      .mockResolvedValueOnce(respostaRapid("Vivere Palhano 79 m²", "Vivere Palhano com 79 m² e 3 quartos."));
    const busca = await buscarImovelNaWeb(
      "Vivere Palhano 79 m² 3 quartos",
      ["busca 1", "busca 2", "busca 3"],
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca.consultasExecutadas).toEqual(["busca 1", "busca 2"]);
    expect(busca.pesquisasEvitadas).toBe(1);
  });

  it("executa no máximo três pesquisas quando nenhuma é conclusiva", async () => {
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(respostaRapid("Imóvel genérico", "Sem coincidências.", "https://portal.test/imovel"))
    );
    const busca = await buscarImovelNaWeb(
      "Vivere Palhano 79 m² 3 quartos",
      ["busca 1", "busca 2", "busca 3", "busca 4"],
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(busca.consultasExecutadas).toHaveLength(3);
    expect(busca.encerramentoAntecipado).toBe(false);
  });

  it("mantém resposta parcial quando uma pesquisa intermediária falha", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(respostaRapid("Imóvel no Centro", "Anúncio genérico.", "https://portal.test/1"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(respostaRapid("Vivere Palhano 79 m²", "Vivere Palhano com 79 m² e 3 quartos."));
    const busca = await buscarImovelNaWeb(
      "Vivere Palhano 79 m² 3 quartos",
      ["busca 1", "busca 2", "busca 3"],
      fetcher,
    );
    expect(busca.falhas).toBe(1);
    expect(busca.resultados.length).toBeGreaterThan(0);
    expect(busca.consultasExecutadas).toHaveLength(3);
  });

  it("para após 429 e preserva os resultados obtidos anteriormente", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(respostaRapid("Imóvel no Centro", "Anúncio genérico.", "https://portal.test/1"))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(respostaRapid("Não deve executar", "Terceira pesquisa."));
    const busca = await buscarImovelNaWeb(
      "Vivere Palhano 79 m² 3 quartos",
      ["busca 1", "busca 2", "busca 3"],
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(busca.limiteAtingido).toBe(true);
    expect(busca.resultados).toHaveLength(1);
    expect(busca.pesquisasEvitadas).toBe(1);
  });

  it("trata 429 e só utiliza Retry-After quando o header existe", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const comRetry = vi.fn().mockResolvedValue(new Response(null, {
      status: 429,
      headers: { "Retry-After": "17" },
    }));
    await expect(buscarImovelNaWeb("consulta", ["consulta"], comRetry)).rejects.toMatchObject({
      motivo: "limite",
      retryAfterSegundos: 17,
    } satisfies Partial<BuscaWebIndisponivel>);

    const semRetry = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    await expect(buscarImovelNaWeb("consulta", ["consulta"], semRetry)).rejects.toMatchObject({
      motivo: "limite",
      retryAfterSegundos: undefined,
    } satisfies Partial<BuscaWebIndisponivel>);
  });

  it("não inclui credencial nem headers sensíveis no diagnóstico", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 429,
      headers: {
        "Retry-After": "10",
        "x-ratelimit-requests-remaining": "0",
        "x-rapidapi-key": "segredo-vazado",
        authorization: "Bearer token-vazado",
        "x-ratelimit-requests-limit": "segredo-no-header-permitido",
      },
    }));
    await expect(buscarImovelNaWeb("consulta-privada", ["consulta-privada"], fetcher)).rejects.toBeInstanceOf(
      BuscaWebIndisponivel,
    );
    const logs = JSON.stringify(aviso.mock.calls);
    expect(logs).toContain("x-ratelimit-requests-remaining");
    expect(logs).not.toContain("segredo-de-teste");
    expect(logs).not.toContain("segredo-vazado");
    expect(logs).not.toContain("token-vazado");
    expect(logs).not.toContain("authorization");
    expect(logs).not.toContain("consulta-privada");
    expect(logs).not.toContain("segredo-no-header-permitido");
  });
});
