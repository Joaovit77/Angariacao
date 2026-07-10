"use client";

/* ================================================================
   Instância Leaflet da view Mapa. Port de afterRenderMapa()
   (app.js, 5H): a instância nasce no useEffect e é removida no
   cleanup — o mesmo `bigMap.remove()` que o renderCurrentView()
   fazia ao trocar de view (MIGRATION_NEXT.md §12).

   O popup é montado com nós do DOM (textContent), não com string
   HTML: é o equivalente ao escapeHtml() do app antigo, sem
   dangerouslySetInnerHTML.
   ================================================================ */
import { useEffect, useRef } from "react";
import L from "leaflet";
import { STATUS_TERMINAL_NEGATIVE } from "@/lib/constantes";
import { fmtMoney } from "@/lib/formatadores";
import type { Imovel } from "@/lib/tipos";

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;
const LONDRINA_CENTER: [number, number] = [-23.3103, -51.1628];

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

export default function MapaLeaflet({
  imoveis,
  aoAbrirImovel,
}: {
  imoveis: Imovel[];
  aoAbrirImovel: (id: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const imoveisRef = useRef(imoveis);
  const aoAbrirRef = useRef(aoAbrirImovel);
  useEffect(() => {
    imoveisRef.current = imoveis;
    aoAbrirRef.current = aoAbrirImovel;
  }, [imoveis, aoAbrirImovel]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const comLocalizacao = imoveisRef.current.filter((i) => i.latitude != null && i.longitude != null);
    const center: [number, number] = comLocalizacao.length
      ? [
          comLocalizacao.reduce((s, i) => s + Number(i.latitude), 0) / comLocalizacao.length,
          comLocalizacao.reduce((s, i) => s + Number(i.longitude), 0) / comLocalizacao.length,
        ]
      : LONDRINA_CENTER;

    const mapa = L.map(el, { attributionControl: true }).setView(center, comLocalizacao.length ? 12 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(mapa);

    const markers: L.Marker[] = [];
    comLocalizacao.forEach((i) => {
      const color = markerColorForStatus(i.status);
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #12151a;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([Number(i.latitude), Number(i.longitude)], { icon }).addTo(mapa);
      marker.bindPopup(conteudoPopup(i, (id) => aoAbrirRef.current(id)));
      markers.push(marker);
    });

    if (markers.length > 1) {
      const group = L.featureGroup(markers);
      mapa.fitBounds(group.getBounds().pad(0.2));
    }

    return () => {
      mapa.remove();
    };
  }, []);

  return <div id="map-big" ref={divRef}></div>;
}
