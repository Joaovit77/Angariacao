import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avaliarOportunidade } from "@/lib/calculo/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";
import { buscarComNavegador } from "@/lib/servidor/scraperCentralAngariacao";
import { tituloWimoveis } from "@/lib/servidor/tituloWimoveis";

const navegador = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock("playwright-core", () => ({ chromium: { launch: navegador.launch } }));

const filtros = { portal: "wimoveis" as const, cidade: "Londrina", estado: "PR" };
const prefixoImagem = "123e4567-e89b-12d3-a456-426614174000.jpg";
const prefixoHash = "abcdef0123456789abcdef0123456789abcdef01";

function cardHtml(titulo: string): string {
  return `<article data-qa="posting PROPERTY" data-id="3018468881" data-to-posting="/propriedades/apartamento-3018468881.html">
    <div data-qa="POSTING_CARD_GALLERY"><img alt="${titulo}" src="https://img.wimoveis.com.br/a.jpg"></div>
    <div data-qa="POSTING_CARD_PRICE">R$ 1.900</div>
    <div data-qa="POSTING_CARD_FEATURES">2 quartos, 70 m²</div>
    <div class="location-address">Rua Exemplo, 20</div>
    <div data-qa="POSTING_CARD_LOCATION">Centro, Londrina</div>
  </article>`;
}

describe("R4.2c — título e anunciante do Wimoveis", () => {
  it.each([
    [`${prefixoImagem} · Apartamento mobiliado para locação`, "Apartamento mobiliado para locação"],
    [`${prefixoHash} · Salão para alugar`, "Salão para alugar"],
    ["Apartamento mobiliado no Palhano", "Apartamento mobiliado no Palhano"],
    ["Apartamento · mobiliado no Palhano", "Apartamento · mobiliado no Palhano"],
    [`${prefixoHash} · `, `${prefixoHash} · `],
    [`${prefixoImagem} · !!!`, `${prefixoImagem} · !!!`],
    ["12345 · Apartamento", "12345 · Apartamento"],
  ])("limpa apenas prefixo técnico comprovado: %s", (original, esperado) => {
    expect(tituloWimoveis(original)).toBe(esperado);
  });

  it.each([
    [`${prefixoImagem} · Apartamento mobiliado para locação`, "Apartamento mobiliado para locação"],
    [`${prefixoHash} · Salão para alugar`, "Salão para alugar"],
  ])("Firecrawl entrega título útil aos consumidores sem mudar identidade e demais campos", (original, esperado) => {
    const semFiltro = extrairAnunciosFirecrawl(cardHtml(original), filtros)[0];
    const comFiltro = extrairAnunciosFirecrawl(cardHtml(original), { ...filtros, somenteProprietario: true })[0];
    expect(semFiltro).toMatchObject({
      titulo: esperado, idExterno: "3018468881", preco: 1900, cidade: "Londrina",
      endereco: "Rua Exemplo, 20", anunciante: "incerto",
      url: "https://www.wimoveis.com.br/propriedades/apartamento-3018468881.html",
    });
    expect(comFiltro).toEqual(semFiltro);
    expect(avaliarOportunidade(comFiltro).motivos).toContain("anunciante ainda precisa ser confirmado");
    expect(avaliarOportunidade(comFiltro).motivos).not.toContain("anúncio direto com o proprietário");
    expect(avaliarOportunidade({ ...comFiltro, anunciante: "proprietario" }).nota)
      .toBeGreaterThan(avaliarOportunidade(comFiltro).nota);
  });
});

describe("R4.2c — caminho Playwright local sem rede", () => {
  beforeEach(() => {
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", process.execPath);
    vi.stubEnv("VERCEL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([false, true])("mantém anunciante incerto com somenteProprietario=%s", async (somenteProprietario) => {
    const card = {
      id: "3018468881", url: "/propriedades/apartamento-3018468881.html",
      titulo: `${prefixoImagem} · Apartamento mobiliado para locação`,
      preco: "R$ 1.900", caracteristicas: "2 quartos, 70 m²",
      endereco: "Rua Exemplo, 20", local: "Centro, Londrina", imagem: "https://img.wimoveis.com.br/a.jpg",
    };
    const locator = {
      first: () => ({ waitFor: vi.fn().mockResolvedValue(undefined) }),
      evaluateAll: vi.fn().mockResolvedValue([card]),
    };
    const page = {
      setDefaultTimeout: vi.fn(), addInitScript: vi.fn().mockResolvedValue(undefined),
      route: vi.fn().mockResolvedValue(undefined), goto: vi.fn().mockResolvedValue({ status: () => 200 }),
      getByRole: vi.fn().mockReturnValue({ isVisible: vi.fn().mockResolvedValue(false) }),
      locator: vi.fn().mockReturnValue(locator),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    navegador.launch.mockResolvedValue({ newContext: vi.fn().mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page) }), close });

    const resultado = await buscarComNavegador(
      { ...filtros, somenteProprietario }, "https://www.wimoveis.com.br/aluguel/imoveis/pr/londrina",
    );
    expect(resultado).toEqual([expect.objectContaining({
      titulo: "Apartamento mobiliado para locação", anunciante: "incerto",
      idExterno: "3018468881", preco: 1900, endereco: "Rua Exemplo, 20",
      url: "https://www.wimoveis.com.br/propriedades/apartamento-3018468881.html",
    })]);
    expect(locator.evaluateAll).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
