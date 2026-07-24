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
import { CATEGORIAS_MAPA, type CategoriaMapa, categoriaMapa } from "@/lib/calculo/mapa";
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
  // Categoria isolada pela legenda (null = todas). Clicar numa categoria mostra
  // só ela; clicar de novo (ou em "ver todos") volta a mostrar tudo.
  const [filtro, setFiltro] = useState<CategoriaMapa | null>(null);

  const comLocalizacao = imoveis.filter((i) => i.latitude != null && i.longitude != null);
  const semLocalizacao = imoveis.length - comLocalizacao.length;
  const angariadosLocalizados = comLocalizacao.filter(foiAngariado).length;

  // Quantos localizados há em cada categoria — o número ao lado de cada linha
  // da legenda, e o que decide se a linha é clicável (categoria vazia não é).
  const contagem: Record<CategoriaMapa, number> = { locado: 0, angariado: 0, andamento: 0, "sem-sucesso": 0 };
  for (const i of comLocalizacao) contagem[categoriaMapa(i)]++;
  const visiveis = filtro ? contagem[filtro] : comLocalizacao.length;

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
              : filtro
                ? `${visiveis} de ${comLocalizacao.length} imóveis — ${CATEGORIAS_MAPA.find((c) => c.id === filtro)?.label.toLowerCase()}`
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
        <MapaLeaflet
          imoveis={imoveis}
          aoAbrirImovel={(id) => abrirModal("imovel", id)}
          modo={modo}
          filtro={modo === "calor" ? null : filtro}
        />

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
            <div className="map-legend-title">
              <span>Legenda</span>
              {filtro && (
                <button type="button" className="map-legend-clear" onClick={() => setFiltro(null)}>
                  ver todos
                </button>
              )}
            </div>
            {CATEGORIAS_MAPA.map((c) => {
              const total = contagem[c.id];
              const ativo = filtro === c.id;
              // Com um filtro ativo, as outras categorias ficam apagadas; sem
              // nenhum imóvel na categoria, a linha não filtra (não há o que ver).
              const apagado = filtro != null && !ativo;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`map-legend-row map-legend-filtro${ativo ? " ativo" : ""}${apagado ? " apagado" : ""}`}
                  aria-pressed={ativo}
                  disabled={total === 0}
                  title={total === 0 ? "Nenhum imóvel localizado nesta categoria" : "Clique para ver só esta categoria"}
                  onClick={() => setFiltro(ativo ? null : c.id)}
                >
                  <span className="map-legend-dot" style={{ background: c.cor }}></span>
                  <span className="map-legend-label">{c.label}</span>
                  <span className="map-legend-count">{total}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
