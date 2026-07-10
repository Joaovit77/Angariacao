"use client";

/* ================================================================
   VIEW: MAPA
   Port de viewMapa() (app.js, 5H). Mostra todos os imóveis com
   localização definida, coloridos por desfecho: verde = locado
   (conseguiu), vermelho = tentativa sem sucesso (perdido/cancelado/
   sem resposta), âmbar = em andamento.

   O Leaflet toca `window`, então entra por import dinâmico sem SSR
   (MIGRATION_NEXT.md §11, risco 10).
   ================================================================ */
import dynamic from "next/dynamic";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), { ssr: false });

export default function MapaView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const comLocalizacao = imoveis.filter((i) => i.latitude != null && i.longitude != null);
  const semLocalizacao = imoveis.length - comLocalizacao.length;

  if (imoveis.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1 className="page-title">Mapa</h1>
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
          <h1 className="page-title">Mapa</h1>
          <p className="page-sub">{comLocalizacao.length} imóveis localizados no mapa</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
            + Nova angariação
          </button>
        </div>
      </div>
      <div className="map-page-wrap">
        <MapaLeaflet imoveis={imoveis} aoAbrirImovel={(id) => abrirModal("imovel", id)} />
        {semLocalizacao > 0 && (
          <div className="map-unlocated-note">
            {semLocalizacao}
            {" imóvel(is) sem localização definida. Abra o imóvel e clique em "}
            &quot;Localizar endereço no mapa&quot;.
          </div>
        )}
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
      </div>
    </>
  );
}
