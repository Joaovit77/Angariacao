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
  resumoExecutivoInsights,
} from "@/lib/calculo/insights";
import Contador from "@/components/Contador";
import { analisarIdadeAnuncio } from "@/lib/calculo/idadeAnuncio";
import { useAppStore } from "@/lib/store";
import { usePipelineUi } from "@/lib/uiPipeline";
import { IconeInsight } from "./icones";

function CartaoInsight({ i, aoAbrirNoPipeline, destaque }: {
  i: Insight;
  aoAbrirNoPipeline: (a: InsightAction) => void;
  destaque?: boolean;
}) {
  return (
    <div className={`insight-card ${i.tone}${destaque ? " insight-card-attention" : ""}`}>
      <div className={`insight-icon ${i.tone}`}>
        <IconeInsight nome={i.icon} />
      </div>
      <div className="insight-body">
        {destaque && (
          <div className="insight-urgency">
            <span className="insight-urgency-dot" />
            {i.tone === "bad" ? "Ação prioritária" : "Acompanhar"}
          </div>
        )}
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
  const resumo = resumoExecutivoInsights(imoveis, comissaoPercent);

  function abrirNoPipeline(action: InsightAction) {
    if (action.tipo === "coluna") aplicarFiltroColuna(action.col, action.valor);
    else aplicarBusca(action.termo);
    router.push("/pipeline");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">O que merece sua atenção e o que está funcionando na carteira</p>
        </div>
      </div>
      <section className="insight-overview" aria-label="Resumo executivo">
        <div className="insight-overview-head">
          <div>
            <span className="insight-eyebrow">Visão executiva</span>
            <h2>Saúde da carteira</h2>
          </div>
          <span className={resumo.precisamAtencao > 0 ? "insight-health warn" : "insight-health pos"}>
            {resumo.precisamAtencao > 0 ? `${resumo.precisamAtencao} pedem atenção` : "Carteira em dia"}
          </span>
        </div>
        <div className="insight-kpi-grid">
          <div className="insight-kpi bad">
            <span>Precisam de atenção</span>
            <strong><Contador valor={resumo.precisamAtencao} /></strong>
            <small>sem movimento além do prazo</small>
          </div>
          <div className="insight-kpi pos">
            <span>Taxa de angariação</span>
            <strong>{resumo.taxaAngariacao != null ? `${Math.round(resumo.taxaAngariacao)}%` : "—"}</strong>
            <small>entre captações com desfecho</small>
          </div>
          <div className="insight-kpi info">
            <span>Conversão em locação</span>
            <strong>{resumo.conversaoLocacao != null ? `${Math.round(resumo.conversaoLocacao)}%` : "—"}</strong>
            <small>entre processos encerrados</small>
          </div>
          <div className="insight-kpi neutral">
            <span>Em andamento</span>
            <strong><Contador valor={resumo.emAndamento} /></strong>
            <small>imóveis ainda ativos</small>
          </div>
        </div>
      </section>

      {resumo.prioridades.length > 0 && (
        <section className="insight-priorities">
          <div className="insight-priorities-head">
            <div>
              <span className="insight-eyebrow">Próximas ações</span>
              <h2>Comece por estes imóveis</h2>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                aplicarFiltroColuna("status", resumo.prioridades[0].status);
                router.push("/pipeline");
              }}
            >
              Ver carteira
            </button>
          </div>
          <div className="insight-priority-list">
            {resumo.prioridades.map((item, indice) => (
              <button
                type="button"
                className="insight-priority-row"
                key={item.id}
                onClick={() => abrirNoPipeline({ tipo: "busca", termo: item.busca })}
              >
                <span className="insight-priority-rank">{indice + 1}</span>
                <span className="insight-priority-main">
                  <strong>{item.identificador}</strong>
                  <small>{item.endereco}</small>
                </span>
                <span className="badge" data-status={item.status}>{item.status}</span>
                <span className="insight-priority-days">
                  <strong>{item.diasParado}</strong>
                  <small>dias parado</small>
                </span>
                <span className="insight-priority-arrow">→</span>
              </button>
            ))}
          </div>
        </section>
      )}
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
            <section className={`insight-group${grupo === "acao" ? " insight-group-attention" : ""}`} key={grupo}>
              <div className="insight-group-head">
                <span className="insight-group-icon">
                  <IconeInsight nome={meta.icon} />
                </span>
                <div className="insight-group-headtext">
                  <h2 className="insight-group-title">{meta.label}</h2>
                  <p className="insight-group-sub">{meta.sub}</p>
                </div>
                {grupo === "acao" && <span className="insight-attention-label">Prioridade</span>}
                <span className="insight-group-count">{doGrupo.length}</span>
              </div>
              <div className="insight-grid anim-stagger">
                {doGrupo.map((i, idx) => (
                  <CartaoInsight key={idx} i={i} destaque={grupo === "acao"} aoAbrirNoPipeline={abrirNoPipeline} />
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
