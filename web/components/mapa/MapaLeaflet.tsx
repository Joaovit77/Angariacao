"use client";

/* ================================================================
   Instância Leaflet da view Mapa. Port de afterRenderMapa()
   (app.js, 5H): a instância nasce no useEffect e é removida no
   cleanup — o mesmo `bigMap.remove()` que o renderCurrentView()
   fazia ao trocar de view (MIGRATION_NEXT.md §12).

   Três modos de visualização (prop `modo`), trocados por botões na
   view sem recriar o mapa: só a CAMADA DE DADOS é reconstruída.
     - "pinos":    um marcador por imóvel, colorido pelo status.
     - "agrupado": os mesmos marcadores agrupados em clusters.
     - "calor":    mapa de calor da CAPTAÇÃO — só entram os imóveis
                   angariados (foiAngariado), mostrando onde você
                   efetivamente capta.

   O popup é montado com nós do DOM (textContent), não com string
   HTML: é o equivalente ao escapeHtml() do app antigo, sem
   dangerouslySetInnerHTML. Os ícones (pino e cluster) usam divIcon
   pelo mesmo motivo do MiniMapa: o ícone PNG padrão do Leaflet quebra
   no bundler.
   ================================================================ */
import { useEffect, useRef } from "react";
import L from "leaflet";
// Plugins do Leaflet 1.9 (efeito colateral: estendem o `L` global com
// markerClusterGroup / heatLayer). O CSS estrutural do cluster entra no
// layout.tsx; o heat não tem CSS.
import "leaflet.markercluster";
import "leaflet.heat";
import { STATUS_TERMINAL_NEGATIVE } from "@/lib/constantes";
import { foiAngariado } from "@/lib/calculo/motor";
import { fmtMoney } from "@/lib/formatadores";
import type { Imovel } from "@/lib/tipos";

export type ModoMapa = "pinos" | "agrupado" | "calor";

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;
const LONDRINA_CENTER: [number, number] = [-23.3103, -51.1628];

/* Gradiente do mapa de calor — do menos ao mais captado. Exportado para a
   legenda (MapaView) montar a mesma escala: fonte única, nunca divergem. */
export const HEAT_GRADIENT: Record<number, string> = {
  0.2: "#2f6f57",
  0.45: "#5fb896",
  0.7: "#e0b458",
  1.0: "#d98f2b",
};

export function markerColorForStatus(status: string): string {
  if (status === "Locado") return "#5fb896";
  if (TERMINAIS.includes(status)) return "#d97878";
  return "#e0b458";
}

function conteudoPopup(i: Imovel, aoAbrirImovel: (id: string) => void): HTMLElement {
  const wrap = document.createElement("div");

  const titulo = document.createElement("div");
  titulo.className = "map-popup-title";
  titulo.textContent = i.codigo || i.endereco;
  wrap.appendChild(titulo);

  const endereco = document.createElement("div");
  endereco.className = "map-popup-row";
  endereco.textContent = i.endereco + (i.bairro ? ", " + i.bairro : "");
  wrap.appendChild(endereco);

  const status = document.createElement("div");
  status.className = "map-popup-row";
  status.textContent = `${i.status} · ${fmtMoney(i.valorAluguel)}`;
  wrap.appendChild(status);

  const link = document.createElement("div");
  link.className = "map-popup-link";
  link.textContent = "Ver / editar imóvel";
  link.addEventListener("click", () => aoAbrirImovel(i.id));
  wrap.appendChild(link);

  return wrap;
}

function criarMarcador(i: Imovel, aoAbrir: (id: string) => void): L.Marker {
  const color = markerColorForStatus(i.status);
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #12151a;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  const marker = L.marker([Number(i.latitude), Number(i.longitude)], { icon });
  marker.bindPopup(conteudoPopup(i, aoAbrir));
  return marker;
}

/* Ícone do cluster na paleta do app (dourado), em vez do tema claro padrão do
   MarkerCluster.Default.css — que destoaria do fundo escuro. */
function iconeCluster(cluster: L.MarkerCluster): L.DivIcon {
  const n = cluster.getChildCount();
  const size = n < 10 ? 34 : n < 50 ? 40 : 46;
  return L.divIcon({
    className: "",
    html: `<div class="map-cluster-icon" style="width:${size}px;height:${size}px;">${n}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MapaLeaflet({
  imoveis,
  aoAbrirImovel,
  modo,
}: {
  imoveis: Imovel[];
  aoAbrirImovel: (id: string) => void;
  modo: ModoMapa;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const camadaRef = useRef<L.Layer | null>(null);
  const jaEnquadrouRef = useRef(false);
  const aoAbrirRef = useRef(aoAbrirImovel);
  useEffect(() => {
    aoAbrirRef.current = aoAbrirImovel;
  }, [aoAbrirImovel]);

  // Cria a instância do mapa uma única vez.
  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const mapa = L.map(el, { attributionControl: true }).setView(LONDRINA_CENTER, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(mapa);
    mapaRef.current = mapa;
    return () => {
      mapa.remove();
      mapaRef.current = null;
      camadaRef.current = null;
      jaEnquadrouRef.current = false;
    };
  }, []);

  // (Re)constrói a camada de dados quando muda o modo ou a lista de imóveis.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (camadaRef.current) {
      mapa.removeLayer(camadaRef.current);
      camadaRef.current = null;
    }

    const comLocalizacao = imoveis.filter((i) => i.latitude != null && i.longitude != null);
    const aoAbrir = (id: string) => aoAbrirRef.current(id);

    // Pontos usados para enquadrar: no calor, só os angariados (é o que aparece).
    const usados = modo === "calor" ? comLocalizacao.filter(foiAngariado) : comLocalizacao;

    if (modo === "calor") {
      const pontos: [number, number, number][] = usados.map((i) => [
        Number(i.latitude),
        Number(i.longitude),
        1,
      ]);
      camadaRef.current = L.heatLayer(pontos, {
        radius: 28,
        blur: 20,
        maxZoom: 15,
        minOpacity: 0.35,
        gradient: HEAT_GRADIENT,
      }).addTo(mapa);
    } else {
      const marcadores = comLocalizacao.map((i) => criarMarcador(i, aoAbrir));
      if (modo === "agrupado") {
        const grupo = L.markerClusterGroup({
          iconCreateFunction: iconeCluster,
          showCoverageOnHover: false,
          maxClusterRadius: 50,
        });
        marcadores.forEach((m) => grupo.addLayer(m));
        camadaRef.current = grupo.addTo(mapa);
      } else {
        camadaRef.current = L.featureGroup(marcadores).addTo(mapa);
      }
    }

    // Enquadra só na primeira montagem, para trocar de modo não resetar o zoom.
    if (!jaEnquadrouRef.current && usados.length) {
      const coords = usados.map((i) => [Number(i.latitude), Number(i.longitude)] as [number, number]);
      if (coords.length === 1) mapa.setView(coords[0], 14);
      else mapa.fitBounds(L.latLngBounds(coords).pad(0.2));
      jaEnquadrouRef.current = true;
    }
  }, [modo, imoveis]);

  return <div id="map-big" ref={divRef}></div>;
}
