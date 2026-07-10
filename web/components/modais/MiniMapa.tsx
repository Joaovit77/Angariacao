"use client";

/* ================================================================
   MINI-MAPA do formulário de imóvel.
   Port de initMiniMap() (app.js, 6A): pino arrastável e clique em
   qualquer ponto reposiciona — é a forma mais confiável de acertar o
   número exato da casa, já que a busca automática só chega perto.
   A instância morre no cleanup do efeito (o app antigo zerava as
   referências no closeModal()).
   ================================================================ */
import { useEffect, useRef } from "react";
import L from "leaflet";

const LONDRINA_CENTER: [number, number] = [-23.3103, -51.1628];

interface Props {
  /** Coordenadas atuais do formulário (null = ainda não localizado). */
  lat: number | null;
  lng: number | null;
  /** Zoom desejado quando há coordenadas. */
  zoom: number;
  visivel: boolean;
  aoEscolherPonto: (lat: number, lng: number, origem: "clique" | "arraste") => void;
}

export default function MiniMapa({ lat, lng, zoom, visivel, aoEscolherPonto }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const aoEscolherRef = useRef(aoEscolherPonto);
  useEffect(() => {
    aoEscolherRef.current = aoEscolherPonto;
  }, [aoEscolherPonto]);

  // Coordenadas iniciais, só para o primeiro setView.
  const iniciaisRef = useRef<{ lat: number | null; lng: number | null }>({ lat, lng });

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const { lat: lat0, lng: lng0 } = iniciaisRef.current;
    const hasCoords = lat0 != null && lng0 != null;
    const center: [number, number] = hasCoords ? [lat0, lng0] : LONDRINA_CENTER;

    const mapa = L.map(el, { attributionControl: false }).setView(center, hasCoords ? 16 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);

    const marker = L.marker(center, { draggable: true }).addTo(mapa);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      aoEscolherRef.current(pos.lat, pos.lng, "arraste");
    });
    mapa.on("click", (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      aoEscolherRef.current(e.latlng.lat, e.latlng.lng, "clique");
    });

    mapaRef.current = mapa;
    markerRef.current = marker;
    return () => {
      mapaRef.current = null;
      markerRef.current = null;
      mapa.remove();
    };
  }, []);

  // Coordenadas vindas de fora (geocodificação / busca por CEP).
  useEffect(() => {
    if (lat == null || lng == null) return;
    const mapa = mapaRef.current;
    const marker = markerRef.current;
    if (!mapa || !marker) return;
    const t = setTimeout(() => {
      mapa.invalidateSize();
      mapa.setView([lat, lng], zoom);
      marker.setLatLng([lat, lng]);
    }, 100);
    return () => clearTimeout(t);
  }, [lat, lng, zoom]);

  // O mapa só ganha tamanho quando fica visível.
  useEffect(() => {
    if (!visivel) return;
    const t = setTimeout(() => mapaRef.current?.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [visivel]);

  // O Leaflet inicializa no div INTERNO (divRef), não no #map-mini. Se ele
  // inicializasse no #map-mini, o `className={visivel...}` do React sobrescreveria
  // a cada render as classes que o Leaflet adiciona ao container — em especial
  // `leaflet-container`, que traz `overflow:hidden`. Sem ela, os tiles (posição
  // absoluta) vazavam para fora dos 320px e sobrepunham a seção de baixo.
  return (
    <div id="map-mini" className={visivel ? "visible" : ""}>
      <div ref={divRef} style={{ height: "100%", borderRadius: "inherit", overflow: "hidden" }} />
    </div>
  );
}
