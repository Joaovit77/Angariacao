import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarComNavegador } from "@/lib/servidor/scraperCentralAngariacao";

const mocks = vi.hoisted(() => {
  const page = {
    setDefaultTimeout: vi.fn(),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    locator: vi.fn(() => ({
      first: () => ({ waitFor: vi.fn().mockResolvedValue(undefined) }),
      evaluateAll: vi.fn().mockResolvedValue([{
        url: "https://www.vivareal.com.br/imovel/apartamento-id-2904079401/?origem=busca",
        titulo: "Apartamento para alugar em Londrina",
        paragrafos: ["Rua Sergipe", "R$ 3.200", "IPTU R$ 130"],
        imagem: "",
      }]),
    })),
  };
  const close = vi.fn().mockResolvedValue(undefined);
  const launch = vi.fn().mockResolvedValue({
    newContext: vi.fn().mockResolvedValue({ newPage: vi.fn().mockResolvedValue(page) }),
    close,
  });
  return { page, close, launch };
});

vi.mock("playwright-core", () => ({ chromium: { launch: mocks.launch } }));

describe("Viva Real pelo navegador local, sem navegação real", () => {
  const caminhoAnterior = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  afterEach(() => {
    if (caminhoAnterior === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = caminhoAnterior;
    vi.clearAllMocks();
  });

  it("preserva ID e endereço e não transforma o primeiro R$ nem o IPTU em aluguel", async () => {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = process.execPath;
    const anuncios = await buscarComNavegador(
      { portal: "viva-real", cidade: "Londrina", estado: "PR" },
      "https://www.vivareal.com.br/aluguel/parana/londrina/apartamento_residencial/",
    );

    expect(anuncios).toHaveLength(1);
    expect(anuncios[0]).toMatchObject({
      idExterno: "2904079401",
      preco: null,
      endereco: "Rua Sergipe",
      cidade: "Londrina",
      bairro: null,
      anunciante: "incerto",
    });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.page.goto).toHaveBeenCalledTimes(1);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });
});
