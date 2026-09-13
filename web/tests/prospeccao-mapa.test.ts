// @vitest-environment jsdom

/* ================================================================
   C6 — MAPA DO GARIMPO EM CAMPO

   O mapa mostra a incerteza em vez de escondê-la: pino na coordenada,
   círculo com raio = acuracia_metros, legenda honesta. Leaflet é o
   precedente real (MiniMapa/MapaLeaflet) e entra por dynamic({ssr:false});
   aqui ele é substituído por um duplo que registra o que foi desenhado.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => {
  const camada = () => ({ addTo: vi.fn().mockReturnThis(), remove: vi.fn() });
  const estado = {
    setView: vi.fn(),
    circulos: [] as { centro: unknown; opcoes: { radius: number }; setRadius: ReturnType<typeof vi.fn>; setLatLng: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[],
    pinos: [] as { centro: unknown; opcoes: { draggable: boolean }; on: ReturnType<typeof vi.fn>; setLatLng: ReturnType<typeof vi.fn>; getLatLng: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[],
    mapaRemovido: vi.fn(),
    eventosDoMapa: {} as Record<string, (evento: unknown) => void>,
  };
  const L = {
    map: vi.fn(() => {
      const mapa = {
        setView: (...argumentos: unknown[]) => { estado.setView(...argumentos); return mapa; },
        on: vi.fn((nome: string, handler: (evento: unknown) => void) => { estado.eventosDoMapa[nome] = handler; }),
        invalidateSize: vi.fn(),
        remove: estado.mapaRemovido,
      };
      return mapa;
    }),
    tileLayer: vi.fn(() => camada()),
    divIcon: vi.fn(() => ({})),
    marker: vi.fn((centro: unknown, opcoes: { draggable: boolean }) => {
      const pino = { centro, opcoes, ...camada(), on: vi.fn(), setLatLng: vi.fn(), getLatLng: vi.fn(() => ({ lat: -23.5, lng: -51.5 })) };
      estado.pinos.push(pino);
      return pino;
    }),
    circle: vi.fn((centro: unknown, opcoes: { radius: number }) => {
      const circulo = { centro, opcoes, ...camada(), setRadius: vi.fn(), setLatLng: vi.fn() };
      estado.circulos.push(circulo);
      return circulo;
    }),
  };
  return { L, estado };
});

vi.mock("leaflet", () => ({ default: leaflet.L }));

import MapaProspeccao, { zoomParaRaio } from "@/components/prospeccao/MapaProspeccao";

const gps12 = { latitude: -23.31, longitude: -51.16, acuraciaMetros: 12, precisaoLocalizacao: "gps" as const };

beforeEach(() => {
  vi.useFakeTimers();
  leaflet.estado.setView.mockClear();
  leaflet.estado.circulos.length = 0;
  leaflet.estado.pinos.length = 0;
  leaflet.estado.mapaRemovido.mockClear();
  leaflet.L.map.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("C6 — MapaProspeccao", () => {
  it("desenha pino e círculo com raio = acuracia_metros e legenda honesta", () => {
    render(createElement(MapaProspeccao, { localizacao: gps12 }));
    act(() => { vi.runAllTimers(); });

    expect(leaflet.estado.pinos).toHaveLength(1);
    expect(leaflet.estado.pinos[0].centro).toEqual([-23.31, -51.16]);
    expect(leaflet.estado.pinos[0].opcoes.draggable).toBe(false);
    expect(leaflet.estado.circulos).toHaveLength(1);
    expect(leaflet.estado.circulos[0].opcoes.radius).toBe(12);
    expect(leaflet.estado.setView).toHaveBeenLastCalledWith([-23.31, -51.16], zoomParaRaio(12));
    expect(screen.getByText("GPS · precisão aproximada: 12 m")).toBeTruthy();
    expect(screen.getByRole("img", { name: /Mapa: GPS/ })).toBeTruthy();
  });

  it("geocodificado deixa claro que é aproximado, com círculo largo e zoom mais aberto", () => {
    render(createElement(MapaProspeccao, {
      localizacao: { latitude: -23.3, longitude: -51.1, acuraciaMetros: 250, precisaoLocalizacao: "geocodificado" },
    }));
    act(() => { vi.runAllTimers(); });
    expect(leaflet.estado.circulos[0].opcoes.radius).toBe(250);
    expect(zoomParaRaio(250)).toBeLessThan(zoomParaRaio(12));
    expect(screen.getByText(/Aproximada pelo endereço · pode variar 250 m/)).toBeTruthy();
    expect(document.querySelector('[data-precisao="geocodificado"]')).toBeTruthy();
  });

  it("sem coordenada não desenha pino nem círculo, e diz isso", () => {
    render(createElement(MapaProspeccao, {
      localizacao: { latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida" },
    }));
    act(() => { vi.runAllTimers(); });
    expect(leaflet.estado.pinos).toHaveLength(0);
    expect(leaflet.estado.circulos).toHaveLength(0);
    expect(screen.getByRole("img", { name: "Mapa sem posição registrada" })).toBeTruthy();
    expect(screen.getByText("Sem localização registrada")).toBeTruthy();
  });

  it("com aoEscolherPonto o pino é arrastável e clique/arraste devolvem a coordenada", () => {
    const aoEscolherPonto = vi.fn();
    render(createElement(MapaProspeccao, { localizacao: gps12, aoEscolherPonto }));
    act(() => { vi.runAllTimers(); });
    expect(leaflet.estado.pinos[0].opcoes.draggable).toBe(true);
    expect(screen.getByText(/arraste o pino ou toque no mapa/)).toBeTruthy();

    act(() => { leaflet.estado.eventosDoMapa.click({ latlng: { lat: -23.4, lng: -51.4 } }); });
    expect(aoEscolherPonto).toHaveBeenCalledWith({ latitude: -23.4, longitude: -51.4 });

    const aoArrastar = leaflet.estado.pinos[0].on.mock.calls.find(([nome]) => nome === "dragend")?.[1] as () => void;
    act(() => { aoArrastar(); });
    expect(aoEscolherPonto).toHaveBeenCalledWith({ latitude: -23.5, longitude: -51.5 });
  });

  it("acompanha a localização nova sem recriar o mapa, e some com ela quando volta a nulo", () => {
    const { rerender } = render(createElement(MapaProspeccao, { localizacao: gps12 }));
    act(() => { vi.runAllTimers(); });
    rerender(createElement(MapaProspeccao, { localizacao: { ...gps12, latitude: -23.35, acuraciaMetros: 40 } }));
    act(() => { vi.runAllTimers(); });
    expect(leaflet.L.map).toHaveBeenCalledTimes(1);
    expect(leaflet.estado.pinos).toHaveLength(1);
    expect(leaflet.estado.pinos[0].setLatLng).toHaveBeenCalledWith([-23.35, -51.16]);
    expect(leaflet.estado.circulos[0].setRadius).toHaveBeenCalledWith(40);

    rerender(createElement(MapaProspeccao, {
      localizacao: { latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida" },
    }));
    expect(leaflet.estado.pinos[0].remove).toHaveBeenCalled();
    expect(leaflet.estado.circulos[0].remove).toHaveBeenCalled();
  });

  it("estrutural: entra por dynamic({ ssr: false }) no molde do MiniMapa e não traz dependência nova", () => {
    const painel = readFileSync(resolve("components/prospeccao/PainelIdentificado.tsx"), "utf8");
    const modal = readFileSync(resolve("components/modais/ModalAvistamento.tsx"), "utf8");
    expect(painel).toMatch(/dynamic\(\(\) => import\("\.\/MapaProspeccao"\), \{ ssr: false \}\)/);
    expect(modal).toMatch(/dynamic\(\(\) => import\("@\/components\/prospeccao\/MapaProspeccao"\), \{ ssr: false \}\)/);
    const mapa = readFileSync(resolve("components/prospeccao/MapaProspeccao.tsx"), "utf8");
    expect(mapa).toContain('from "leaflet"');
    expect(mapa).toContain("L.circle(");
    expect(mapa).toContain("radius: raio");
    const pacote = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pacote.dependencies).filter((nome) => /leaflet|map/i.test(nome)).sort())
      .toEqual(["leaflet", "leaflet.heat", "leaflet.markercluster"]);
  });
});
