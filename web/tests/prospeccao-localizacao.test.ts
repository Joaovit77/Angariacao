// @vitest-environment jsdom

/* ================================================================
   C6 — LOCALIZAÇÃO: GPS, endereço rápido, fallback e "só melhora"

   O aparelho mede (gps + acuracia_metros), o humano marca (mapa), o
   endereço aproxima (geocodificado) e a ausência é "desconhecida" —
   nunca zero. A tela não vende aproximação como exatidão, o rascunho
   e a foto do C5 não mudam, e o snapshot só melhora. Nada aqui usa GPS
   ou Nominatim reais: navigator.geolocation e geocodeEndereco são
   injetados.
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
  },
  fecharModal: vi.fn(),
  viaCep: vi.fn(),
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
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) } }),
}));
// A pesquisa de rua é a MESMA do restante do sistema (lib/geo → /api/viacep).
vi.mock("@/lib/geo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geo")>()),
  buscarEnderecosViaCep: (...argumentos: unknown[]) => cenario.viaCep(...argumentos),
}));
// O mapa real é Leaflet; aqui só interessa que ele receba a localização.
vi.mock("@/components/prospeccao/MapaProspeccao", () => ({
  default: ({ localizacao }: { localizacao: { precisaoLocalizacao: string; acuraciaMetros: number | null } }) =>
    createElement("div", { "data-testid": "mapa", "data-precisao": localizacao.precisaoLocalizacao, "data-raio": localizacao.acuraciaMetros ?? "" }),
}));

import ModalAvistamento from "@/components/modais/ModalAvistamento";
import {
  ACURACIA_GEOCODE_METROS,
  ACURACIA_MAPA_METROS,
  descreverLocalizacao,
  escolherLocalizacao,
  gpsImpreciso,
  LIMIAR_GPS_IMPRECISO_METROS,
  localizacaoDoGeocode,
  localizacaoDoGps,
  localizacaoDoMapa,
  resumirAvistamentos,
  type AvistamentoProspeccao,
} from "@/lib/calculo/prospeccao";
import { capturarPosicaoAtual, OPCOES_POSICAO_APARELHO, type ResultadoPosicaoAparelho } from "@/lib/geo";

const armazemVazio = { ler: async () => null, salvar: async () => {}, limpar: async () => {} };
const gpsBom: ResultadoPosicaoAparelho = { ok: true, latitude: -23.31, longitude: -51.16, acuraciaMetros: 12 };
const semGps: ResultadoPosicaoAparelho = { ok: false, motivo: "indisponivel" };

function geolocationFalsa(resposta: { coords?: Partial<GeolocationCoordinates>; erro?: number }) {
  const getCurrentPosition = vi.fn((sucesso: PositionCallback, falha?: PositionErrorCallback) => {
    if (resposta.coords) sucesso({ coords: resposta.coords, timestamp: 0 } as GeolocationPosition);
    else falha?.({ code: resposta.erro ?? 0, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
  });
  return { getCurrentPosition } as unknown as Geolocation;
}

function abrirModal(deps: {
  capturarPosicao?: () => Promise<ResultadoPosicaoAparelho>;
  geocodificar?: (...argumentos: string[]) => Promise<{ lat: number; lon: number; precisao: "endereco" | "rua" | "bairro" | "cidade"; usedFallback: boolean } | null>;
} = {}, props: Record<string, unknown> = {}) {
  return render(createElement(ModalAvistamento, {
    armazemRascunho: armazemVazio,
    dependenciasLocalizacao: {
      capturarPosicao: deps.capturarPosicao ?? (async () => semGps),
      geocodificar: deps.geocodificar ?? (async () => null),
    },
    ...props,
  }));
}

function preencher(rotulo: string, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

async function salvar() {
  fireEvent.click(screen.getByRole("button", { name: "Salvar avistamento" }));
  await waitFor(() => expect(cenario.estado.criar).toHaveBeenCalled());
  return cenario.estado.criar.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>];
}

beforeEach(() => {
  vi.clearAllMocks();
  cenario.estado.itens = [];
  cenario.estado.detalhe = null;
  cenario.estado.criar.mockResolvedValue(true);
  cenario.estado.adicionarAvistamento.mockResolvedValue(true);
  // mockReset: uma fila de Once que um teste não consumiu não pode vazar para o próximo.
  cenario.viaCep.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe("C6 — vocabulário puro de localização", () => {
  it("cada origem declara a própria acurácia; ausência é desconhecida, nunca zero", () => {
    expect(localizacaoDoGps({ latitude: -23.3, longitude: -51.1, acuraciaMetros: 8 }))
      .toEqual({ latitude: -23.3, longitude: -51.1, acuraciaMetros: 8, precisaoLocalizacao: "gps" });
    expect(localizacaoDoGps({ latitude: -23.3, longitude: -51.1, acuraciaMetros: 0 }).acuraciaMetros).toBeNull();
    expect(localizacaoDoGeocode({ lat: -23.3, lon: -51.1, precisao: "rua" }))
      .toEqual({ latitude: -23.3, longitude: -51.1, acuraciaMetros: ACURACIA_GEOCODE_METROS.rua, precisaoLocalizacao: "geocodificado" });
    expect(localizacaoDoMapa({ latitude: -23.3, longitude: -51.1 }).acuraciaMetros).toBe(ACURACIA_MAPA_METROS);
    expect(escolherLocalizacao([])).toEqual({ latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida" });
    expect(escolherLocalizacao([null, undefined])).toMatchObject({ precisaoLocalizacao: "desconhecida" });
    expect(ACURACIA_GEOCODE_METROS.endereco).toBeLessThan(ACURACIA_GEOCODE_METROS.rua);
    expect(ACURACIA_GEOCODE_METROS.rua).toBeLessThan(ACURACIA_GEOCODE_METROS.bairro);
    expect(ACURACIA_GEOCODE_METROS.bairro).toBeLessThan(ACURACIA_GEOCODE_METROS.cidade);
  });

  it("entre candidatas, o menor raio vence; empate segue GPS → mapa → geocodificado", () => {
    const gps = localizacaoDoGps({ latitude: 1, longitude: 1, acuraciaMetros: 20 });
    const gpsRuim = localizacaoDoGps({ latitude: 2, longitude: 2, acuraciaMetros: 300 });
    const mapa = localizacaoDoMapa({ latitude: 3, longitude: 3 });
    const geo = localizacaoDoGeocode({ lat: 4, lon: 4, precisao: "endereco" });
    expect(escolherLocalizacao([gpsRuim, geo]).precisaoLocalizacao).toBe("geocodificado");
    expect(escolherLocalizacao([gps, geo]).precisaoLocalizacao).toBe("gps");
    expect(escolherLocalizacao([gpsRuim, mapa]).precisaoLocalizacao).toBe("mapa");
    expect(escolherLocalizacao([mapa, localizacaoDoGps({ latitude: 5, longitude: 5, acuraciaMetros: ACURACIA_MAPA_METROS })]).precisaoLocalizacao).toBe("gps");
    // Sem raio a candidata vale menos que qualquer medida.
    expect(escolherLocalizacao([{ ...gps, acuraciaMetros: null }, geo]).precisaoLocalizacao).toBe("geocodificado");
    // Coordenada fora de faixa não é candidata.
    expect(escolherLocalizacao([{ ...gps, latitude: 95 }]).precisaoLocalizacao).toBe("desconhecida");
  });

  it("descreve sem fingir exatidão e marca GPS impreciso acima do limiar", () => {
    expect(descreverLocalizacao({ latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida" }))
      .toBe("Sem localização registrada");
    expect(descreverLocalizacao(localizacaoDoGps({ latitude: 1, longitude: 1, acuraciaMetros: 12 })))
      .toBe("GPS · precisão aproximada: 12 m");
    const ruim = localizacaoDoGps({ latitude: 1, longitude: 1, acuraciaMetros: LIMIAR_GPS_IMPRECISO_METROS + 1 });
    expect(gpsImpreciso(ruim)).toBe(true);
    expect(descreverLocalizacao(ruim)).toContain("GPS impreciso");
    expect(descreverLocalizacao(localizacaoDoGeocode({ lat: 1, lon: 1, precisao: "bairro" })))
      .toBe("Aproximada pelo endereço · pode variar 1,5 km");
    expect(descreverLocalizacao(localizacaoDoMapa({ latitude: 1, longitude: 1 }))).toContain("Marcada no mapa");
  });
});

describe("C6 — navigator.geolocation com cada saída nomeada", () => {
  it("posição válida devolve latitude, longitude e acurácia, com alta precisão e prazo", async () => {
    const geo = geolocationFalsa({ coords: { latitude: -23.31, longitude: -51.16, accuracy: 9.4 } });
    await expect(capturarPosicaoAtual(geo)).resolves.toEqual({ ok: true, latitude: -23.31, longitude: -51.16, acuraciaMetros: 9.4 });
    expect((geo.getCurrentPosition as ReturnType<typeof vi.fn>).mock.calls[0][2]).toEqual(OPCOES_POSICAO_APARELHO);
    expect(OPCOES_POSICAO_APARELHO.enableHighAccuracy).toBe(true);
    expect(OPCOES_POSICAO_APARELHO.timeout).toBeGreaterThan(0);
  });

  it("permissão negada, indisponível, timeout e falha genérica são resultados, não exceções", async () => {
    await expect(capturarPosicaoAtual(geolocationFalsa({ erro: 1 }))).resolves.toEqual({ ok: false, motivo: "negada" });
    await expect(capturarPosicaoAtual(geolocationFalsa({ erro: 2 }))).resolves.toEqual({ ok: false, motivo: "indisponivel" });
    await expect(capturarPosicaoAtual(geolocationFalsa({ erro: 3 }))).resolves.toEqual({ ok: false, motivo: "timeout" });
    await expect(capturarPosicaoAtual(geolocationFalsa({ erro: 99 }))).resolves.toEqual({ ok: false, motivo: "falha" });
    await expect(capturarPosicaoAtual(undefined)).resolves.toEqual({ ok: false, motivo: "indisponivel" });
    await expect(capturarPosicaoAtual(geolocationFalsa({ coords: { latitude: Number.NaN, longitude: 1, accuracy: 1 } })))
      .resolves.toEqual({ ok: false, motivo: "falha" });
  });
});

describe("C6 — o modal mede, avisa e cai para o endereço", () => {
  it("GPS válido vai para o avistamento como gps com acuracia_metros, e a tela mostra a precisão", async () => {
    abrirModal({ capturarPosicao: async () => gpsBom });
    await screen.findByText("GPS · precisão aproximada: 12 m");
    // O mapa entra por dynamic(): aguarda o chunk montar.
    expect((await screen.findByTestId("mapa")).getAttribute("data-raio")).toBe("12");

    const [, , avistamento] = await salvar();
    expect(avistamento).toMatchObject({ latitude: -23.31, longitude: -51.16, acuraciaMetros: 12, precisaoLocalizacao: "gps" });
  });

  it("GPS impreciso é guardado, mas a tela avisa em voz alta", async () => {
    abrirModal({ capturarPosicao: async () => ({ ...gpsBom, acuraciaMetros: 350 }) });
    await screen.findByText(/GPS impreciso · precisão aproximada: 350 m/);
    expect(screen.getByText(/Leitura imprecisa/)).toBeTruthy();
    const [, , avistamento] = await salvar();
    expect(avistamento).toMatchObject({ acuraciaMetros: 350, precisaoLocalizacao: "gps" });
  });

  it("permissão negada explica e cai para o endereço: geocodificado com a acurácia do nível", async () => {
    const geocodificar = vi.fn(async () => ({ lat: -23.32, lon: -51.17, precisao: "endereco" as const, usedFallback: false }));
    abrirModal({ capturarPosicao: async () => ({ ok: false, motivo: "negada" }), geocodificar });
    await screen.findByText(/Permissão de localização negada/);
    preencher("Logradouro", "Avenida Inglaterra");
    preencher("Número", "1200");
    preencher("Cidade", "Londrina");

    const [, , avistamento] = await salvar();
    expect(geocodificar).toHaveBeenCalledWith("Avenida Inglaterra, 1200", "", "Londrina");
    expect(avistamento).toMatchObject({
      latitude: -23.32, longitude: -51.17, acuraciaMetros: ACURACIA_GEOCODE_METROS.endereco, precisaoLocalizacao: "geocodificado",
    });
  });

  it("timeout do GPS oferece tentar de novo; a segunda leitura vale", async () => {
    const capturarPosicao = vi.fn<() => Promise<ResultadoPosicaoAparelho>>()
      .mockResolvedValueOnce({ ok: false, motivo: "timeout" })
      .mockResolvedValueOnce(gpsBom);
    abrirModal({ capturarPosicao });
    await screen.findByText(/GPS não respondeu a tempo/);
    fireEvent.click(screen.getByRole("button", { name: "Usar minha localização" }));
    await screen.findByText("GPS · precisão aproximada: 12 m");
    expect(capturarPosicao).toHaveBeenCalledTimes(2);
  });

  it("sem GPS e sem endereço suficiente, salva como desconhecida — e nunca bloqueia", async () => {
    abrirModal();
    await screen.findByText(/Este aparelho não oferece localização/);
    preencher("Logradouro", "Rua sem cidade");
    const [, , avistamento] = await salvar();
    expect(avistamento).toMatchObject({ latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida" });
  });

  it("geocode que não acha nada ou falha também termina em desconhecida", async () => {
    abrirModal({ geocodificar: async () => { throw new Error("nominatim fora"); } });
    await screen.findByText(/Este aparelho não oferece localização/);
    preencher("Logradouro", "Rua X");
    preencher("Cidade", "Londrina");
    const [, , avistamento] = await salvar();
    expect(avistamento).toMatchObject({ precisaoLocalizacao: "desconhecida" });
  });

  it("GPS bom vence o geocode: com posição medida o endereço nem é consultado", async () => {
    const geocodificar = vi.fn(async () => ({ lat: 0, lon: 0, precisao: "endereco" as const, usedFallback: false }));
    abrirModal({ capturarPosicao: async () => gpsBom, geocodificar });
    await screen.findByText(/precisão aproximada: 12 m/);
    preencher("Logradouro", "Rua X");
    preencher("Cidade", "Londrina");
    const [, , avistamento] = await salvar();
    expect(geocodificar).not.toHaveBeenCalled();
    expect(avistamento).toMatchObject({ precisaoLocalizacao: "gps" });
  });

  it("novo avistamento de identidade conhecida geocodifica pelo endereço já salvo", async () => {
    cenario.estado.detalhe = {
      identificado: { id: "identificado-1", logradouro: "Rua Sergipe", numero: "500", bairro: "Centro", cidade: "Londrina", estado: "PR", pontoReferencia: null },
      avistamentos: [],
    };
    const geocodificar = vi.fn(async () => ({ lat: -23.3, lon: -51.1, precisao: "rua" as const, usedFallback: true }));
    abrirModal({ geocodificar }, { imovelIdentificadoId: "identificado-1" });
    await screen.findByText(/Este aparelho não oferece localização/);
    fireEvent.click(screen.getByRole("button", { name: "Salvar avistamento" }));
    await waitFor(() => expect(cenario.estado.adicionarAvistamento).toHaveBeenCalled());
    expect(geocodificar).toHaveBeenCalledWith("Rua Sergipe, 500", "Centro", "Londrina");
    expect(cenario.estado.adicionarAvistamento.mock.calls[0][2]).toMatchObject({
      acuraciaMetros: ACURACIA_GEOCODE_METROS.rua, precisaoLocalizacao: "geocodificado",
    });
  });
});

describe("C6 — endereço rápido pelo precedente EnderecoAutocompleteViaCep", () => {
  const resultadoViaCep = { cep: "86046-000", logradouro: "Avenida Inglaterra", bairro: "Igapó", localidade: "Londrina", uf: "PR" };

  it("digita a rua, recebe sugestões e a seleção preenche bairro, cidade, UF e CEP; número fica com o corretor", async () => {
    cenario.estado.itens = [{ id: "x", cidade: "Londrina", estado: "PR" }];
    cenario.viaCep.mockResolvedValue([resultadoViaCep]);
    abrirModal();
    await waitFor(() => expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Londrina"));

    preencher("Logradouro", "Avenida Ingl");
    const opcao = await screen.findByRole("option", { name: /Avenida Inglaterra/ }, { timeout: 3000 });
    expect(cenario.viaCep).toHaveBeenCalledWith(
      expect.objectContaining({ uf: "PR", cidade: "Londrina", logradouro: "Avenida Ingl" }),
      expect.anything(),
    );
    fireEvent.click(opcao);

    expect((screen.getByLabelText("Logradouro") as HTMLInputElement).value).toBe("Avenida Inglaterra");
    expect((screen.getByLabelText("Bairro") as HTMLInputElement).value).toBe("Igapó");
    expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Londrina");
    expect((screen.getByLabelText("Estado") as HTMLInputElement).value).toBe("PR");
    expect((screen.getByLabelText("CEP") as HTMLInputElement).value).toBe("86046-000");
    expect((screen.getByLabelText("Número") as HTMLInputElement).value).toBe("");

    preencher("Número", "1200");
    const [, identidade] = await salvar();
    expect(identidade).toMatchObject({ logradouro: "Avenida Inglaterra", numero: "1200", bairro: "Igapó", cidade: "Londrina", estado: "PR", cep: "86046-000" });
  });

  it("edição manual depois da sugestão é preservada; retorno vazio não apaga; nova sugestão troca só o que era dela", async () => {
    cenario.estado.itens = [{ id: "x", cidade: "Londrina", estado: "PR" }];
    cenario.viaCep
      .mockResolvedValueOnce([resultadoViaCep])
      .mockResolvedValueOnce([{ logradouro: "Rua Paraná", localidade: "Londrina", uf: "PR" }])
      .mockResolvedValueOnce([{ ...resultadoViaCep, logradouro: "Rua Sergipe", bairro: "Centro", cep: "86020-000" }]);
    abrirModal();
    await waitFor(() => expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Londrina"));

    // O autocomplete guarda cache por consulta no módulo: consulta própria deste teste.
    preencher("Logradouro", "Avenida Inglat");
    fireEvent.click(await screen.findByRole("option", { name: /Avenida Inglaterra/ }, { timeout: 3000 }));
    expect((screen.getByLabelText("Bairro") as HTMLInputElement).value).toBe("Igapó");

    // O corretor corrige o bairro à mão.
    preencher("Bairro", "Inglaterra");

    // Nova sugestão sem bairro nem CEP: nada é apagado.
    preencher("Logradouro", "Rua Par");
    fireEvent.click(await screen.findByRole("option", { name: /Rua Paraná/ }, { timeout: 3000 }));
    expect((screen.getByLabelText("Bairro") as HTMLInputElement).value).toBe("Inglaterra");
    expect((screen.getByLabelText("CEP") as HTMLInputElement).value).toBe("86046-000");

    // Nova sugestão com bairro: o manual fica; o CEP, que era do ViaCEP, acompanha.
    preencher("Logradouro", "Rua Serg");
    fireEvent.click(await screen.findByRole("option", { name: /Rua Sergipe/ }, { timeout: 3000 }));
    expect((screen.getByLabelText("Bairro") as HTMLInputElement).value).toBe("Inglaterra");
    expect((screen.getByLabelText("CEP") as HTMLInputElement).value).toBe("86020-000");
  });

  it("falha do ViaCEP não impede preencher tudo à mão", async () => {
    cenario.estado.itens = [{ id: "x", cidade: "Londrina", estado: "PR" }];
    cenario.viaCep.mockRejectedValue(new Error("fora"));
    abrirModal();
    await waitFor(() => expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("Londrina"));
    preencher("Logradouro", "Rua Manual");
    await screen.findByText(/Não foi possível buscar endereços agora/, {}, { timeout: 3000 });
    preencher("Número", "10");
    preencher("Bairro", "Bairro Manual");
    preencher("CEP", "86000-000");
    const [, identidade] = await salvar();
    expect(identidade).toMatchObject({ logradouro: "Rua Manual", numero: "10", bairro: "Bairro Manual", cep: "86000-000" });
  });

  it("sem registro anterior, cidade e UF ficam a cargo do corretor e a pesquisa espera por eles", async () => {
    abrirModal();
    await screen.findByText(/Este aparelho não oferece localização/);
    expect((screen.getByLabelText("Cidade") as HTMLInputElement).value).toBe("");
    preencher("Logradouro", "Avenida Inglaterra");
    await screen.findByText(/Informe cidade e UF para pesquisar/);
    expect(cenario.viaCep).not.toHaveBeenCalled();
  });

  it("estrutural: o modal reusa o componente e a função de pesquisa existentes, sem provider novo", () => {
    const modal = readFileSync(resolve("components/modais/ModalAvistamento.tsx"), "utf8");
    expect(modal).toContain('from "@/components/formularios/EnderecoAutocompleteViaCep"');
    expect(modal).toContain('from "@/lib/geo"');
    // Nenhuma chamada direta a serviço externo: só os helpers de lib/geo.
    expect(modal).not.toMatch(/openstreetmap|viacep\.com|fetch\(/i);
    expect(modal).toContain("geocodeEndereco");
    expect(modal).toContain("capturarPosicaoAtual");
  });
});

describe("C6 — o snapshot só melhora (núcleo puro e trigger)", () => {
  function avistamento(id: string, loc: Partial<AvistamentoProspeccao>): AvistamentoProspeccao {
    return {
      id, imovelIdentificadoId: "i", observadoEm: `2026-09-1${id.length}T10:00:00.000Z`, createdAt: "2026-09-12T10:00:00.000Z",
      observacao: "", observacaoRevisao: 1, classificacaoEstado: "pendente",
      latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida", ...loc,
    };
  }
  const gps8 = avistamento("a", { latitude: 1, longitude: 1, acuraciaMetros: 8, precisaoLocalizacao: "gps" });
  const gps20 = avistamento("bb", { latitude: 2, longitude: 2, acuraciaMetros: 20, precisaoLocalizacao: "gps" });
  const gps300 = avistamento("ccc", { latitude: 3, longitude: 3, acuraciaMetros: 300, precisaoLocalizacao: "gps" });
  const geo = avistamento("dddd", { latitude: 4, longitude: 4, acuraciaMetros: 50, precisaoLocalizacao: "geocodificado" });
  const semCoordenada = avistamento("eeeee", {});

  it("coordenada melhor substitui pior; pior não substitui melhor; menor raio vence entre GPS", () => {
    expect(resumirAvistamentos([gps300, gps8]).melhorLocalizacao?.avistamentoId).toBe("a");
    expect(resumirAvistamentos([gps8, gps300]).melhorLocalizacao?.avistamentoId).toBe("a");
    expect(resumirAvistamentos([gps20, gps300]).melhorLocalizacao?.acuraciaMetros).toBe(20);
  });

  it("geocodificado não degrada GPS bom, mas vence GPS de carro; tentativa sem coordenada não apaga nada", () => {
    expect(resumirAvistamentos([gps8, geo]).melhorLocalizacao?.precisaoLocalizacao).toBe("gps");
    expect(resumirAvistamentos([gps300, geo]).melhorLocalizacao?.precisaoLocalizacao).toBe("geocodificado");
    const resumo = resumirAvistamentos([gps8, semCoordenada]);
    expect(resumo.avistamentoCorrenteId).toBe("eeeee");
    expect(resumo.melhorLocalizacao?.avistamentoId).toBe("a");
  });

  it("o trigger do C2c aplica a mesma regra: menor acuracia_metros, nulos por último, sem coordenada ignorado", () => {
    const migration = readFileSync(resolve("..", "supabase/migrations/20260910193412_prospeccao_campo_triggers.sql"), "utf8").replace(/\r\n/g, "\n");
    const funcao = migration.match(/create or replace function private\.recalcular_agregados_identificado[\s\S]*?\n\$\$;/)?.[0] ?? "";
    expect(funcao).toMatch(/where a\.imovel_identificado_id = p_imovel_id\s+and a\.latitude is not null\s+and a\.longitude is not null\s+order by a\.acuracia_metros asc nulls last/);
    expect(funcao).toMatch(/precisao_localizacao = coalesce\(v_precisao, 'desconhecida'\)/);
    // Nenhuma migration nova do C6: a garantia já existe e não é duplicada.
    const migrations = readFileSync(resolve("..", "supabase-schema.sql"), "utf8");
    expect((migrations.match(/recalcular_agregados_identificado\(/g) ?? []).length).toBeGreaterThan(0);
  });
});
