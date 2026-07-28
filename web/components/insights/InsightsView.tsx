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
import { analisarIdadeAnuncio } from "@/lib/calculo/idadeAnuncio";
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

/**
 * Conversão por idade do anúncio no momento do garimpo.
 *
 * Responde a pergunta que o maior balde de perdas levanta ("chegamos tarde" é
 * 30 dos 50 encerramentos) e que nenhum outro número do painel alcança: a
 * partir de quantos dias de anúncio o garimpo deixa de compensar.
 *
 * Só aparece quando existe o que mostrar — enquanto a coleta não acumular, um
 * card de zeros só ocuparia espaço e ensinaria a ignorar a seção.
 */
function IdadeDoAnuncio() {
  const imoveis = useAppStore((s) => s.imoveis);
  const analise = analisarIdadeAnuncio(imoveis);
  if (analise.comIdade === 0) return null;

  const comAlgumDesfecho = analise.faixas.some((f) => f.decididos > 0);

  return (
    <section className="insight-group">
      <div className="insight-group-head">
        <span className="insight-group-icon">
          <IconeInsight nome="relogio" />
        </span>
        <div className="insight-group-headtext">
          <h2 className="insight-group-title">Idade do anúncio</h2>
          <p className="insight-group-sub">
            Quanto tempo o anúncio já estava no ar quando você o encontrou, cruzado com o desfecho
          </p>
        </div>
        <span className="insight-group-count">{analise.comIdade}</span>
      </div>

      {!comAlgumDesfecho ? (
        <p className="section-note">
          Nenhum dos {analise.comIdade} imóveis com idade registrada teve desfecho ainda. A leitura
          aparece conforme eles forem angariados ou encerrados.
        </p>
      ) : (
        <div className="card table-scroll" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Idade do anúncio</th>
                <th>Decididos</th>
                <th>Angariados</th>
                <th>Conversão</th>
                <th>Em aberto</th>
              </tr>
            </thead>
            <tbody>
              {analise.faixas.map((f) => (
                <tr key={f.id}>
                  <td className="cell-strong">{f.rotulo}</td>
                  <td className="cell-dim">{f.decididos}</td>
                  <td className="cell-dim">{f.angariados}</td>
                  <td>
                    {f.taxa == null ? (
                      <span className="cell-dim">—</span>
                    ) : (
                      <>
                        {f.taxa.toFixed(0)}%
                        {/* Amostra pequena mente com cara de número: 1 de 3 vira
                            "33%". A marca é parte do contrato da medida. */}
                        {!f.amostraSuficiente && (
                          <span className="cell-dim"> · amostra baixa</span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="cell-dim">{f.emAberto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="section-note" style={{ marginTop: "10px" }}>
        {analise.semIdade > 0 && (
          <>
            {analise.semIdade} imóveis não têm a idade registrada e ficam fora desta conta — a coleta
            começou depois deles.{" "}
          </>
        )}
        Compare faixas dentro do mesmo canal: OLX e garimpo em site cadastram o lead em momentos
        diferentes, e misturá-los compara populações distintas.
      </p>
    </section>
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

      <IdadeDoAnuncio />
    </>
  );
}
