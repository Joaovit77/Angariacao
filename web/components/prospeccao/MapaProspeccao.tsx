"use client";

/* ================================================================
   MAPA DO GARIMPO EM CAMPO (C6)

   Molde do MiniMapa: Leaflet direto, instância em useEffect com cleanup,
   pino por divIcon (o PNG padrão do Leaflet quebra no bundler). A
   diferença é o CÍRCULO: o raio é `acuracia_metros`, e ele aparece
   sempre que há raio — o mapa mostra a incerteza em vez de escondê-la.
   Sem coordenada, mostra a cidade e diz que não há posição.

   Quem monta este componente o faz por dynamic({ ssr: false }).
   ================================================================ */
import { useEffect, useRef } from "react";
import L from "leaflet";

import { descreverLocalizacao, type LocalizacaoAvistamento } from "@/lib/calculo/prospeccao";

import styles from "./Prospeccao.module.css";

const CENTRO_PADRAO: [number, number] = [-23.3103, -51.1628];

function pinoIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#e0b458;border:2px solid #12151a;box-shadow:0 2px 5px rgba(0,0,0,.45);transform:rotate(-45deg);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

/** Zoom que enquadra o círculo: quanto maior a incerteza, mais longe. */
export function zoomParaRaio(acuraciaMetros: number | null): number {
  if (acuraciaMetros === null || acuraciaMetros <= 0) return 17;
  if (acuraciaMetros <= 30) return 18;
  if (acuraciaMetros <= 120) return 17;
  if (acuraciaMetros <= 400) return 16;
  if (acuraciaMetros <= 1500) return 14;
  return 12;
}

export interface PropsMapaProspeccao {
  localizacao: LocalizacaoAvistamento;
  /** Com este callback o pino é arrastável e o clique reposiciona: é a
      origem "mapa". Sem ele, o mapa é somente leitura. */
  aoEscolherPonto?: (ponto: { latitude: number; longitude: number }) => void;
  altura?: number;
}

export default function MapaProspeccao({ localizacao, aoEscolherPonto, altura = 240 }: PropsMapaProspeccao) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const pinoRef = useRef<L.Marker | null>(null);
  const circuloRef = useRef<L.Circle | null>(null);
  const aoEscolherRef = useRef(aoEscolherPonto);
  useEffect(() => {
    aoEscolherRef.current = aoEscolherPonto;
  }, [aoEscolherPonto]);
  const editavel = Boolean(aoEscolherPonto);
  const temCoordenada = localizacao.latitude !== null && localizacao.longitude !== null;

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const mapa = L.map(el, { attributionControl: false }).setView(CENTRO_PADRAO, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
    mapa.on("click", (evento: L.LeafletMouseEvent) => {
      if (!aoEscolherRef.current) return;
      aoEscolherRef.current({ latitude: evento.latlng.lat, longitude: evento.latlng.lng });
    });
    mapaRef.current = mapa;
    return () => {
      mapaRef.current = null;
      pinoRef.current = null;
      circuloRef.current = null;
      mapa.remove();
    };
  }, []);

  // Pino e círculo seguem a localização; o círculo só existe com raio.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (localizacao.latitude === null || localizacao.longitude === null) {
      pinoRef.current?.remove();
      circuloRef.current?.remove();
      pinoRef.current = null;
      circuloRef.current = null;
      return;
    }
    const centro: [number, number] = [localizacao.latitude, localizacao.longitude];
    if (!pinoRef.current) {
      const pino = L.marker(centro, { draggable: editavel, icon: pinoIcon() }).addTo(mapa);
      pino.on("dragend", () => {
        const posicao = pino.getLatLng();
        aoEscolherRef.current?.({ latitude: posicao.lat, longitude: posicao.lng });
      });
      pinoRef.current = pino;
    } else {
      pinoRef.current.setLatLng(centro);
    }
    const raio = localizacao.acuraciaMetros !== null && localizacao.acuraciaMetros > 0
      ? localizacao.acuraciaMetros
      : null;
    if (raio === null) {
      circuloRef.current?.remove();
      circuloRef.current = null;
    } else if (!circuloRef.current) {
      circuloRef.current = L.circle(centro, {
        radius: raio,
        color: "#e0b458",
        weight: 1,
        fillColor: "#e0b458",
        fillOpacity: 0.12,
      }).addTo(mapa);
    } else {
      circuloRef.current.setLatLng(centro);
      circuloRef.current.setRadius(raio);
    }
    const temporizador = setTimeout(() => {
      mapa.invalidateSize();
      mapa.setView(centro, zoomParaRaio(raio));
    }, 100);
    return () => clearTimeout(temporizador);
  }, [editavel, localizacao.acuraciaMetros, localizacao.latitude, localizacao.longitude]);

  return (
    <div className={styles.mapa} data-precisao={localizacao.precisaoLocalizacao}>
      <div
        ref={divRef}
        className={styles.mapaCanvas}
        style={{ height: altura }}
        role="img"
        aria-label={temCoordenada ? `Mapa: ${descreverLocalizacao(localizacao)}` : "Mapa sem posição registrada"}
      />
      <p className={styles.mapaLegenda}>
        {descreverLocalizacao(localizacao)}
        {editavel && temCoordenada ? " · arraste o pino ou toque no mapa para corrigir" : ""}
      </p>
    </div>
  );
}
