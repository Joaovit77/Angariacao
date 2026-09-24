// @vitest-environment jsdom

/* ================================================================
   G1 — PONTO NO MAPA PREENCHE O LOGRADOURO

   Em campo, 24/09: novo local, pino ajustado no mapa, salvo. A passagem
   ficou "Marcada no mapa · até 25 m", mas o imóvel nasceu só "Londrina ·
   PR", pedindo "Digitar o endereço". A coordenada escolhida já era o
   endereço; faltava perguntar ao Nominatim qual rua passa ali.

   O que não pode mudar: a coordenada salva é a que a pessoa escolheu
   (nunca a que o geocoder devolve), a precisão continua "mapa", e só o
   logradouro é sugerido. Nada aqui chama o Nominatim real: a consulta
   reversa é injetada.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  estado: {
    itens: [] as unknown[],
    detalhe: null as unknown,
    salvando: false,
    erro: null as string | null,
    criar: vi.fn(),
    adicionarAvistamento: vi.fn(),
    reservarFoto: vi.fn(),
    finalizarFoto: vi.fn(),
    buscarDuplicatas: vi.fn<(alvo: unknown) => Promise<unknown[] | null>>(async () => []),
  },
  fecharModal: vi.fn(),
  viaCep: vi.fn(),
  cidadePadrao: vi.fn(),
  /** Onde o próximo toque no mapa (falso) cai. */
  proximoPonto: { latitude: -23.3315, longitude: -51.1792 },
}));

vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: { fecharModal: typeof cenario.fecharModal }) => unknown) =>
    seletor({ fecharModal: cenario.fecharModal }),
}));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: "usuario-1" } }),
}));
vi.mock("@/lib/persistencia/cidadePadrao", () => ({
  carregarCidadePadraoDaConta: (...argumentos: unknown[]) => cenario.cidadePadrao(...argumentos),
}));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } }),
}));
vi.mock("@/lib/geo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geo")>()),
  buscarEnderecosViaCep: (...argumentos: unknown[]) => cenario.viaCep(...argumentos),
}));
// O mapa real é Leaflet; aqui um botão faz o papel do toque/arraste do pino.
vi.mock("@/components/prospeccao/MapaProspeccao", () => ({
  default: ({ localizacao, aoEscolherPonto }: {
    localizacao: { precisaoLocalizacao: string };
    aoEscolherPonto?: (ponto: { latitude: number; longitude: number }) => void;
  }) => createElement("button", {
    type: "button",
    "data-testid": "mapa",
    "data-precisao": localizacao.precisaoLocalizacao,
    onClick: () => aoEscolherPonto?.({ ...cenario.proximoPonto }),
  }, "Tocar no mapa"),
}));

import ModalAvistamento, { ESPERA_RUA_DO_PONTO_MS } from "@/components/modais/ModalAvistamento";
import { ACURACIA_MAPA_METROS } from "@/lib/calculo/prospeccao";
import {
  logradouroDoPonto,
  logradouroDoReverso,
  type ResultadoPosicaoAparelho,
  type ResultadoReversoNominatim,
} from "@/lib/geo";

const armazemVazio = { ler: async () => null, salvar: async () => {}, limpar: async () => {} };
const gpsBom: ResultadoPosicaoAparelho = { ok: true, latitude: -23.3300, longitude: -51.1800, acuraciaMetros: 18 };

type Reverso = (ponto: { latitude: number; longitude: number }) => Promise<string | null>;

function abrirModal(logradouroDoPontoFalso: Reverso, extras: {
  geocodificar?: (...argumentos: unknown[]) => Promise<null>;
  props?: Record<string, unknown>;
} = {}) {
  return render(createElement(ModalAvistamento, {
    armazemRascunho: armazemVazio,
    dependenciasLocalizacao: {
      capturarPosicao: async () => gpsBom,
      geocodificar: extras.geocodificar ?? (async () => null),
      logradouroDoPonto: logradouroDoPontoFalso,
    },
    ...extras.props,
  }));
}

const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;

async function tocarNoMapa(ponto: { latitude: number; longitude: number }) {
  cenario.proximoPonto = ponto;
  if (!screen.queryByTestId("mapa")) {
    fireEvent.click(await screen.findByRole("button", { name: "Ver no mapa ou ajustar o ponto" }));
  }
  // O mapa entra por dynamic(): na primeira carga ele demora um instante.
  fireEvent.click(await screen.findByTestId("mapa"));
}

async function salvar() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar passagem" }));
  await waitFor(() => expect(cenario.estado.criar).toHaveBeenCalled(), { timeout: 3000 });
  return cenario.estado.criar.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>];
}

const PONTO_A = { latitude: -23.331556, longitude: -51.179215 };
const PONTO_B = { latitude: -23.310591, longitude: -51.159586 };

beforeEach(() => {
  vi.clearAllMocks();
  cenario.estado.itens = [];
  cenario.estado.detalhe = null;
  cenario.estado.criar.mockResolvedValue(true);
  cenario.viaCep.mockReset().mockResolvedValue([]);
  cenario.cidadePadrao.mockReset().mockResolvedValue({ origem: "configurada", cidade: "Londrina", uf: "PR" });
});
afterEach(cleanup);

describe("G1 — cenário de campo: novo local → ponto no mapa → salvar", () => {
  it("o imóvel identificado nasce com o logradouro do ponto, e a coordenada salva é a escolhida", async () => {
    const reverso = vi.fn<Reverso>(async () => "Rua Eurico Hummig");
    const geocodificar = vi.fn(async () => null);
    abrirModal(reverso, { geocodificar });
    await screen.findByText(/precisão aproximada: 18 m/);
    await waitFor(() => expect(campo("Cidade").value).toBe("Londrina"));

    await tocarNoMapa(PONTO_A);
    // Salva sem esperar a rua aparecer: quem está na rua não fica olhando o campo.
    const [, identidade, avistamento] = await salvar();

    expect(reverso).toHaveBeenCalledWith(PONTO_A);
    expect(identidade).toMatchObject({ logradouro: "Rua Eurico Hummig", cidade: "Londrina", estado: "PR" });
    expect(avistamento).toMatchObject({
      latitude: PONTO_A.latitude,
      longitude: PONTO_A.longitude,
      acuraciaMetros: ACURACIA_MAPA_METROS,
      precisaoLocalizacao: "mapa",
    });
    // A rua sugerida não dispara geocodificação que pudesse mexer no ponto.
    expect(geocodificar).not.toHaveBeenCalled();
  });

  it("o campo mostra a rua sugerida, com o aviso para conferir, e o ponto continua o escolhido", async () => {
    abrirModal(async () => "Rua Eurico Hummig");
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Rua Eurico Hummig"), { timeout: 3000 });
    expect(screen.getByText(/Rua sugerida pelo ponto marcado no mapa/)).toBeTruthy();
    expect(screen.getByTestId("mapa").getAttribute("data-precisao")).toBe("mapa");
    // Número, bairro e CEP não vêm do ponto.
    expect(campo("Número").value).toBe("");
    expect(campo("Bairro").value).toBe("");
    expect(campo("CEP").value).toBe("");
  });
});

describe("G1 — a sugestão ajuda e sai do caminho", () => {
  it("edição manual depois da sugestão fica, mesmo com o pino movido de novo", async () => {
    const reverso = vi.fn<Reverso>()
      .mockResolvedValueOnce("Rua Eurico Hummig")
      .mockResolvedValueOnce("Avenida Paraná");
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Rua Eurico Hummig"), { timeout: 3000 });

    fireEvent.change(campo("Logradouro"), { target: { value: "Rua Eurico Hummig (fundos)" } });
    await tocarNoMapa(PONTO_B);
    await waitFor(() => expect(reverso).toHaveBeenCalledTimes(2), { timeout: 3000 });
    // Dá tempo de a resposta chegar e ser (corretamente) ignorada.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(campo("Logradouro").value).toBe("Rua Eurico Hummig (fundos)");
    expect(screen.queryByText(/Rua sugerida pelo ponto marcado no mapa/)).toBeNull();

    const [, identidade, avistamento] = await salvar();
    expect(identidade).toMatchObject({ logradouro: "Rua Eurico Hummig (fundos)" });
    expect(avistamento).toMatchObject({ latitude: PONTO_B.latitude, longitude: PONTO_B.longitude, precisaoLocalizacao: "mapa" });
  });

  it("apagar a rua sugerida vale: o salvar não traz a sugestão de volta", async () => {
    abrirModal(async () => "Rua Eurico Hummig");
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Rua Eurico Hummig"), { timeout: 3000 });
    fireEvent.change(campo("Logradouro"), { target: { value: "" } });
    fireEvent.change(campo("Ponto de referência"), { target: { value: "Casa azul da esquina" } });
    const [, identidade] = await salvar();
    expect(identidade).toMatchObject({ logradouro: "", pontoReferencia: "Casa azul da esquina" });
  });

  it("mover o pino enquanto a rua ainda é a sugerida acompanha o novo ponto", async () => {
    const reverso = vi.fn<Reverso>()
      .mockResolvedValueOnce("Rua Eurico Hummig")
      .mockResolvedValueOnce("Avenida Paraná");
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Rua Eurico Hummig"), { timeout: 3000 });
    await tocarNoMapa(PONTO_B);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Avenida Paraná"), { timeout: 3000 });
    expect(reverso).toHaveBeenLastCalledWith(PONTO_B);
  });

  it("resposta atrasada de um ponto antigo não sobrescreve a do ponto mais recente", async () => {
    let responderAntigo!: (rua: string | null) => void;
    const reverso = vi.fn<Reverso>()
      .mockImplementationOnce(() => new Promise((resolve) => { responderAntigo = resolve; }))
      .mockResolvedValueOnce("Avenida Paraná");
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(reverso).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await tocarNoMapa(PONTO_B);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Avenida Paraná"), { timeout: 3000 });

    responderAntigo("Rua Eurico Hummig");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(campo("Logradouro").value).toBe("Avenida Paraná");
    const [, identidade] = await salvar();
    expect(identidade).toMatchObject({ logradouro: "Avenida Paraná" });
  });

  it("toques seguidos no mapa viram uma consulta só, a do último ponto, e só depois da espera", async () => {
    const PONTO_C = { latitude: -23.320001, longitude: -51.170002 };
    const chamadasEm: number[] = [];
    const reverso = vi.fn<Reverso>(async () => {
      chamadasEm.push(performance.now());
      return "Avenida Paraná";
    });
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await tocarNoMapa(PONTO_B);
    await tocarNoMapa(PONTO_C);
    const ultimoToqueEm = performance.now();
    // Antes da espera mínima, nenhuma consulta saiu.
    await new Promise((resolve) => setTimeout(resolve, ESPERA_RUA_DO_PONTO_MS - 200));
    expect(reverso).not.toHaveBeenCalled();

    await waitFor(() => expect(campo("Logradouro").value).toBe("Avenida Paraná"), { timeout: 3000 });
    expect(reverso).toHaveBeenCalledTimes(1);
    expect(reverso).toHaveBeenCalledWith(PONTO_C);
    expect(chamadasEm[0] - ultimoToqueEm).toBeGreaterThanOrEqual(ESPERA_RUA_DO_PONTO_MS - 5);
  });

  it("duas consultas nunca saem com menos de 1,1 s entre si (política do Nominatim público)", async () => {
    expect(ESPERA_RUA_DO_PONTO_MS).toBeGreaterThanOrEqual(1_100);
    const chamadasEm: number[] = [];
    const reverso = vi.fn<Reverso>(async () => {
      chamadasEm.push(performance.now());
      return "Rua Eurico Hummig";
    });
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(reverso).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // Novo toque logo depois da primeira consulta: a segunda espera o intervalo inteiro.
    await tocarNoMapa(PONTO_B);
    await waitFor(() => expect(reverso).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(reverso).toHaveBeenLastCalledWith(PONTO_B);
    expect(chamadasEm[1] - chamadasEm[0]).toBeGreaterThanOrEqual(1_100 - 5);
  });

  it("arrastar o pino não consulta no meio do caminho: o mapa só entrega o ponto ao soltar ou tocar", () => {
    const mapa = readFileSync(resolve("components/prospeccao/MapaProspeccao.tsx"), "utf8");
    expect(mapa).toContain('pino.on("dragend"');
    expect(mapa).not.toMatch(/\.on\("(drag|move|dragstart)"/);
  });
});

describe("G1 — sem rua confiável, nada é inventado", () => {
  it("resposta sem rua mantém o campo vazio e salva só a coordenada, como antes", async () => {
    const reverso = vi.fn<Reverso>(async () => null);
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    const [, identidade, avistamento] = await salvar();
    expect(reverso).toHaveBeenCalledWith(PONTO_A);
    expect(identidade).toMatchObject({ logradouro: "" });
    expect(avistamento).toMatchObject({ latitude: PONTO_A.latitude, longitude: PONTO_A.longitude, precisaoLocalizacao: "mapa" });
  });

  it("falha do serviço não impede salvar nem mexe no ponto", async () => {
    abrirModal(async () => { throw new Error("fora do ar"); });
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    const [, identidade, avistamento] = await salvar();
    expect(identidade).toMatchObject({ logradouro: "" });
    expect(avistamento).toMatchObject({ latitude: PONTO_A.latitude, longitude: PONTO_A.longitude, precisaoLocalizacao: "mapa" });
  });
});

describe("G1 — convivência com o ViaCEP e com os outros campos", () => {
  it("rua escolhida no ViaCEP não é trocada pelo ponto; número, bairro, cidade, UF e CEP seguem do ViaCEP", async () => {
    cenario.viaCep.mockResolvedValue([{ cep: "86050-464", logradouro: "Rua Eurico Hummig", bairro: "Higienópolis", localidade: "Londrina", uf: "PR" }]);
    const reverso = vi.fn<Reverso>(async () => "Rua Piauí");
    abrirModal(reverso);
    await screen.findByText(/precisão aproximada: 18 m/);
    await waitFor(() => expect(campo("Cidade").value).toBe("Londrina"));

    fireEvent.change(campo("Logradouro"), { target: { value: "Rua Eurico Hu, 404" } });
    fireEvent.click(await screen.findByRole("option", { name: /Rua Eurico Hummig/ }, { timeout: 3000 }));
    expect(campo("Logradouro").value).toBe("Rua Eurico Hummig");
    expect(campo("Número").value).toBe("404");

    // Pino na esquina: o ponto é ajustado, a rua escolhida fica.
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(reverso).toHaveBeenCalledTimes(1), { timeout: 3000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(campo("Logradouro").value).toBe("Rua Eurico Hummig");

    const [, identidade, avistamento] = await salvar();
    expect(identidade).toMatchObject({
      logradouro: "Rua Eurico Hummig",
      numero: "404",
      bairro: "Higienópolis",
      cidade: "Londrina",
      estado: "PR",
      cep: "86050-464",
    });
    expect(avistamento).toMatchObject({ latitude: PONTO_A.latitude, longitude: PONTO_A.longitude, precisaoLocalizacao: "mapa" });
  });

  it("depois de sugerida pelo mapa, uma escolha no ViaCEP vence como nova ação explícita", async () => {
    cenario.viaCep.mockResolvedValue([{ cep: "86010-400", logradouro: "Avenida Paraná", bairro: "Centro", localidade: "Londrina", uf: "PR" }]);
    abrirModal(async () => "Rua Eurico Hummig");
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await waitFor(() => expect(campo("Logradouro").value).toBe("Rua Eurico Hummig"), { timeout: 3000 });

    fireEvent.change(campo("Logradouro"), { target: { value: "Avenida Paran" } });
    fireEvent.click(await screen.findByRole("option", { name: /Avenida Paraná/ }, { timeout: 3000 }));
    expect(campo("Logradouro").value).toBe("Avenida Paraná");
    expect(campo("Bairro").value).toBe("Centro");
  });

  it("nova passagem de imóvel já registrado não consulta o ponto (não há campo de endereço ali)", async () => {
    const reverso = vi.fn<Reverso>(async () => "Rua Eurico Hummig");
    cenario.estado.detalhe = {
      identificado: { id: "ident-1", logradouro: null, numero: null, pontoReferencia: null, bairro: null, cidade: "Londrina", estado: "PR", cep: null },
      avistamentos: [],
    };
    abrirModal(reverso, { props: { imovelIdentificadoId: "ident-1" } });
    await screen.findByText(/precisão aproximada: 18 m/);
    await tocarNoMapa(PONTO_A);
    await new Promise((resolve) => setTimeout(resolve, ESPERA_RUA_DO_PONTO_MS + 300));
    expect(reverso).not.toHaveBeenCalled();
  });
});

describe("G1 — leitura da resposta reversa do Nominatim", () => {
  // Resposta real de /reverse?format=jsonv2 (ponto público em Londrina, 24/09).
  const respostaReal = {
    lat: "-23.3315563",
    lon: "-51.1792156",
    category: "building",
    addresstype: "building",
    display_name: "404, Rua Eurico Hummig, Higienópolis, Londrina, Paraná, Região Sul, 86050-464, Brasil",
    address: {
      house_number: "404",
      road: "Rua Eurico Hummig",
      suburb: "Higienópolis",
      city: "Londrina",
      state: "Paraná",
      "ISO3166-2-lvl4": "BR-PR",
      postcode: "86050-464",
      country: "Brasil",
      country_code: "br",
    },
  };

  it("usa só o campo estruturado da rua; nada de recortar o display_name", () => {
    expect(logradouroDoReverso(respostaReal)).toBe("Rua Eurico Hummig");
    expect(logradouroDoReverso({ ...respostaReal, address: { ...respostaReal.address, road: "  Rua   Larga " } })).toBe("Rua Larga");
  });

  it("sem rua, fora do Brasil ou resposta de erro, devolve nada", () => {
    const semRua: Record<string, string> = { ...respostaReal.address };
    delete semRua.road;
    expect(logradouroDoReverso({ ...respostaReal, address: semRua })).toBeNull();
    expect(logradouroDoReverso({ ...respostaReal, address: { ...respostaReal.address, road: "   " } })).toBeNull();
    expect(logradouroDoReverso({ ...respostaReal, address: { ...respostaReal.address, country_code: "py" } })).toBeNull();
    // O que o /reverse devolve quando não há nada no ponto (mar, mato).
    expect(logradouroDoReverso({ error: "Unable to geocode" } as unknown as ResultadoReversoNominatim)).toBeNull();
    expect(logradouroDoReverso(null)).toBeNull();
  });

  it("consulta o /reverse com a coordenada do ponto e devolve só a rua", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify(respostaReal), { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    try {
      await expect(logradouroDoPonto({ latitude: -23.3315563, longitude: -51.1792156 })).resolves.toBe("Rua Eurico Hummig");
      const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/reverse\?/);
      const parametros = new URL(url).searchParams;
      expect(parametros.get("lat")).toBe("-23.3315563");
      expect(parametros.get("lon")).toBe("-51.1792156");
      expect(parametros.get("format")).toBe("jsonv2");
      expect(parametros.get("addressdetails")).toBe("1");
      expect(init.headers).toMatchObject({ "Accept-Language": "pt-BR" });

      fetchFalso.mockResolvedValueOnce(new Response("", { status: 503 }));
      await expect(logradouroDoPonto({ latitude: -23.3, longitude: -51.1 })).resolves.toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
