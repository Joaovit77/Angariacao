"use client";

/* ================================================================
   VIEW: INSIGHTS
   Port de viewInsights() (app.js, 5E). As regras vivem em
   lib/calculo/insights.ts — a view só desenha os cards.
   ================================================================ */
import { buildInsights } from "@/lib/calculo/insights";
import { useAppStore } from "@/lib/store";

export default function InsightsView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const insights = buildInsights(imoveis, comissaoPercent);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Insights</h1>
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
        insights.map((i, idx) => (
          <div className="insight-card" key={idx}>
            <div className={`insight-icon ${i.tone}`}>{i.icon}</div>
            <div>
              <div className="insight-title">{i.title}</div>
              <div className="insight-text">{i.text}</div>
            </div>
          </div>
        ))
      )}
    </>
  );
}
