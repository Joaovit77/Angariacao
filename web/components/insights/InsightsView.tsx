"use client";

/* ================================================================
   VIEW: INSIGHTS
   Port de viewInsights() (app.js, 5E). As regras vivem em
   lib/calculo/insights.ts — a view só desenha os cards, agora
   agrupados por seção e com um atalho pro Pipeline filtrado.
   ================================================================ */
import { useRouter } from "next/navigation";
import {
  buildInsights,
  INSIGHT_GROUP_META,
  INSIGHT_GROUP_ORDER,
  type Insight,
  type InsightAction,
} from "@/lib/calculo/insights";
import { useAppStore } from "@/lib/store";
import { usePipelineUi } from "@/lib/uiPipeline";
import { IconeInsight } from "./icones";

function CartaoInsight({ i, aoAbrirNoPipeline }: { i: Insight; aoAbrirNoPipeline: (a: InsightAction) => void }) {
  return (
    <div className={`insight-card ${i.tone}`}>
      <div className={`insight-icon ${i.tone}`}>
        <IconeInsight nome={i.icon} />
      </div>
      <div className="insight-body">
        <div className="insight-title">{i.title}</div>
        <div className="insight-text">{i.text}</div>
        {i.action && (
          <button type="button" className="insight-action" onClick={() => aoAbrirNoPipeline(i.action!)}>
            {i.action.rotulo ?? "Ver no Pipeline →"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function InsightsView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const aplicarFiltroColuna = usePipelineUi((s) => s.aplicarFiltroColuna);
  const aplicarBusca = usePipelineUi((s) => s.aplicarBusca);
  const router = useRouter();
  const insights = buildInsights(imoveis, comissaoPercent);

  function abrirNoPipeline(action: InsightAction) {
    if (action.tipo === "coluna") aplicarFiltroColuna(action.col, action.valor);
    else aplicarBusca(action.termo);
    router.push("/pipeline");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">Leitura automática dos seus dados de angariação</p>
        </div>
      </div>
      {insights.length === 0 ? (
        <div className="insight-empty card">
          <h3 style={{ fontFamily: "var(--font-display)", color: "var(--text-dim)", marginBottom: "8px" }}>
            Ainda sem dados suficientes
          </h3>
          <p>
            Cadastre mais imóveis e atualize os status ao longo do funil para que insights confiáveis
            comecem a aparecer aqui.
          </p>
        </div>
      ) : (
        INSIGHT_GROUP_ORDER.map((grupo) => {
          const doGrupo = insights.filter((i) => i.group === grupo);
          if (doGrupo.length === 0) return null;
          const meta = INSIGHT_GROUP_META[grupo];
          return (
            <section className="insight-group" key={grupo}>
              <div className="insight-group-head">
                <span className="insight-group-icon">
                  <IconeInsight nome={meta.icon} />
                </span>
                <div className="insight-group-headtext">
                  <h2 className="insight-group-title">{meta.label}</h2>
                  <p className="insight-group-sub">{meta.sub}</p>
                </div>
                <span className="insight-group-count">{doGrupo.length}</span>
              </div>
              <div className="insight-grid anim-stagger">
                {doGrupo.map((i, idx) => (
                  <CartaoInsight key={idx} i={i} aoAbrirNoPipeline={abrirNoPipeline} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
