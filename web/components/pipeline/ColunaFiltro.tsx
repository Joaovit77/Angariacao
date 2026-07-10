"use client";

/* ================================================================
   Cabeçalho de coluna filtrável (estilo Windows Explorer).
   Port de pipelineColHeader() / pipelineColMenu() do app.js: rótulo
   + seta de ordenação + botão de funil. O funil fica destacado
   quando há um subconjunto real selecionado (não quando tudo/nada
   está marcado, espelhando o Explorer). O menu é position:fixed
   para escapar do overflow da tabela.
   ================================================================ */
import { useEffect } from "react";
import { PIPELINE_COL_EMPTY, PIPELINE_COL_LABEL, type PipelineCol } from "@/lib/calculo/filtros";
import { usePipelineUi } from "@/lib/uiPipeline";

// Reposiciona o menu para dentro da viewport caso vaze pela direita.
function ajustarPosicaoMenuColuna() {
  const menu = document.querySelector<HTMLElement>(".col-menu");
  if (!menu) return;
  const r = menu.getBoundingClientRect();
  const excesso = r.right - (window.innerWidth - 8);
  if (excesso > 0) menu.style.left = Math.max(8, r.left - excesso) + "px";
}

function Menu({ col, distintos }: { col: PipelineCol; distintos: string[] }) {
  const { colFilters, colSort, menuPos, setColSort, toggleColValue, colSelectAll, colClear } =
    usePipelineUi();
  const selecionados = colFilters[col];

  useEffect(() => {
    requestAnimationFrame(ajustarPosicaoMenuColuna);
  }, []);

  const sortAsc = colSort.key === col && colSort.dir === "asc" ? "active" : "";
  const sortDesc = colSort.key === col && colSort.dir === "desc" ? "active" : "";

  return (
    <div
      className="col-menu"
      style={{ top: `${menuPos.top}px`, left: `${menuPos.left}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="col-menu-sort">
        <button type="button" className={sortAsc} onClick={() => setColSort(col, "asc")}>
          A &rarr; Z
        </button>
        <button type="button" className={sortDesc} onClick={() => setColSort(col, "desc")}>
          Z &rarr; A
        </button>
      </div>
      <div className="col-menu-actions">
        <button type="button" onClick={() => colSelectAll(col, distintos)}>
          Selecionar todos
        </button>
        <button type="button" onClick={() => colClear(col)}>
          Limpar
        </button>
      </div>
      <div className="col-menu-list">
        {distintos.length === 0 ? (
          <div className="col-menu-empty">Sem valores</div>
        ) : (
          distintos.map((v) => (
            <label className="col-menu-item" key={v || "(vazio)"}>
              <input
                type="checkbox"
                checked={selecionados.includes(v)}
                onChange={() => toggleColValue(col, v)}
              />
              <span>{v === "" ? PIPELINE_COL_EMPTY : v}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function ColunaFiltro({ col, distintos }: { col: PipelineCol; distintos: string[] }) {
  const { colFilters, colSort, openCol, abrirColMenu, fecharColMenu } = usePipelineUi();
  const label = PIPELINE_COL_LABEL[col];
  const n = colFilters[col].length;
  const ativo = n > 0 && n < distintos.length;
  const seta = colSort.key === col ? (colSort.dir === "desc" ? " ▾" : " ▴") : "";

  function alternarMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (openCol === col) {
      fecharColMenu();
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    abrirColMenu(col, { top: Math.round(r.bottom + 4), left: Math.round(r.left) });
  }

  return (
    <th className="th-filter">
      <span className="th-filter-inner">
        <span className="th-filter-label">
          {label}
          {seta}
        </span>
        <button
          type="button"
          className={`col-funnel-btn ${ativo ? "active" : ""}`}
          title={`Filtrar ${label}`}
          onClick={alternarMenu}
        >
          <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
            <path d="M1 2h10L7 6.5V11L5 9.5V6.5z" fill="currentColor" />
          </svg>
        </button>
      </span>
      {openCol === col && <Menu col={col} distintos={distintos} />}
    </th>
  );
}
