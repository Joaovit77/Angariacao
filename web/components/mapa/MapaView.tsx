"use client";

/* ================================================================
   VIEW: MAPA
   Port de viewMapa() (app.js, 5H). Mostra todos os imóveis com
   localização definida, coloridos por desfecho: verde = locado
   (conseguiu), vermelho = tentativa sem sucesso (perdido/cancelado/
   sem resposta), âmbar = em andamento.

   Três modos, trocados por botões: pinos, agrupado (clusters) e mapa
   de calor da captação. A legenda se adapta ao modo. O Leaflet toca
   `window`, então entra por import dinâmico sem SSR (MIGRATION_NEXT.md
   §11, risco 10).
   ================================================================ */
import dynamic from "next/dynamic";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { foiAngariado } from "@/lib/calculo/motor";
import { HEAT_GRADIENT, type ModoMapa } from "./MapaLeaflet";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), { ssr: false });

const MODOS: { id: ModoMapa; label: string }[] = [
  { id: "pinos", label: "Pinos" },
  { id: "agrupado", label: "Agrupado" },
  { id: "calor", label: "Calor" },
];

// linear-gradient a partir do MESMO gradiente do heatmap (fonte única).
const GRADIENTE_CSS = `linear-gradient(90deg, ${Object.entries(HEAT_GRADIENT)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([stop, cor]) => `${cor} ${Number(stop) * 100}%`)
  .join(", ")})`;

export default function MapaView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [modo, setModo] = useState<ModoMapa>("pinos");

  const comLocalizacao = imoveis.filter((i) => i.latitude != null && i.longitude != null);
  const semLocalizacao = imoveis.length - comLocalizacao.length;
  const angariadosLocalizados = comLocalizacao.filter(foiAngariado).length;

  if (imoveis.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <p className="page-sub">Onde você tentou e onde conseguiu angariar</p>
          </div>
        </div>
        <div className="empty-state card">
          <h3>Nenhum imóvel cadastrado ainda</h3>
          <p>Cadastre imóveis e localize os endereços no mapa para vê-los aqui.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">
            {modo === "calor"
              ? `${angariadosLocalizados} imóvel(is) angariado(s) no mapa de calor`
              : `${comLocalizacao.length} imóveis localizados no mapa`}
          </p>
        </div>
        <div className="page-actions">
          <div className="map-mode-switch" role="group" aria-label="Modo de visualização do mapa">
            {MODOS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={"map-mode-btn" + (modo === m.id ? " active" : "")}
                aria-pressed={modo === m.id}
                onClick={() => setModo(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
            + Nova angariação
          </button>
        </div>
      </div>
      <div className="map-page-wrap">
        <MapaLeaflet imoveis={imoveis} aoAbrirImovel={(id) => abrirModal("imovel", id)} modo={modo} />

        {semLocalizacao > 0 && (
          <div className="map-unlocated-note">
            {semLocalizacao}
            {" imóvel(is) sem localização definida. Abra o imóvel e clique em "}
            &quot;Localizar endereço no mapa&quot;.
          </div>
        )}

        {modo === "calor" ? (
          <div className="map-legend">
            <div className="map-legend-title">Calor da captação</div>
            {angariadosLocalizados === 0 ? (
              <div className="map-legend-row">Nenhum imóvel angariado localizado ainda.</div>
            ) : (
              <>
                <div className="map-legend-gradient" style={{ background: GRADIENTE_CSS }} />
                <div className="map-legend-scale">
                  <span>menos</span>
                  <span>mais captação</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="map-legend">
            <div className="map-legend-title">Legenda</div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#5fb896" }}></span>Locado (conseguiu)
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#e0b458" }}></span>Em andamento
            </div>
            <div className="map-legend-row">
              <span className="map-legend-dot" style={{ background: "#d97878" }}></span>Tentado, sem sucesso
            </div>
          </div>
        )}
      </div>
    </>
  );
}
