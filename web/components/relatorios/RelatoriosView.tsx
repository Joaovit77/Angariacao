"use client";

/* ================================================================
   VIEW: RELATÓRIOS
   Port de viewRelatorios() + reportDoc() + reportStat() (app.js, 5F).
   Os números vêm de lib/calculo/relatorios.ts.
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { relatorioMensal, relatorioSemanal, weekRangeLabel, type DadosRelatorio } from "@/lib/calculo/relatorios";
import { currentMonthKey, monthLabelLong, shiftMonthKey, todayISO } from "@/lib/datas";
import { fmtDate, fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";

function ReportStat({
  label,
  value,
  delta,
  isMoney,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  isMoney?: boolean;
}) {
  let cmp: React.ReactNode = null;
  if (delta !== null && delta !== undefined) {
    const color = delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--text-faint)";
    const txt = isMoney ? fmtMoney(Math.abs(delta)) : Math.abs(delta);
    cmp = (
      <div className="report-stat-cmp" style={{ color }}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {txt} vs. período anterior
      </div>
    );
  }
  return (
    <div className="report-stat">
      <div className="report-stat-label">{label}</div>
      <div className="report-stat-value">{value}</div>
      {cmp}
    </div>
  );
}

function ReportDoc({ d, responsavel }: { d: DadosRelatorio; responsavel: string }) {
  const deltaContatos = d.contatosAtual - d.contatosAnterior;
  const deltaTotal = d.totalAtual - d.totalAnterior;
  const deltaLocados = d.locadosAtual - d.locadosAnterior;
  const deltaComissao = d.comissaoRec - d.comissaoRecAnterior;

  return (
    <div className="report-doc">
      <div className="report-print-header">
        <div className="rph-brand">
          Painel de Angariações<span className="rph-brand-sub">Relatório de produtividade</span>
        </div>
        <div className="rph-meta">
          <span>Responsável: {responsavel}</span>
          <span>Emitido em: {fmtDate(todayISO())}</span>
        </div>
      </div>
      <h2>{d.title}</h2>
      <div className="report-period">{d.period}</div>

      <div className="report-stat-row anim-stagger">
        <ReportStat label="Novos contatos" value={d.contatosAtual} delta={deltaContatos} />
        <ReportStat label="Angariações" value={d.totalAtual} delta={deltaTotal} />
        <ReportStat label="Locados" value={d.locadosAtual} delta={deltaLocados} />
        <ReportStat label="Conversão" value={d.conversao.toFixed(0) + "%"} />
        <ReportStat label="Comissão recebida" value={fmtMoney(d.comissaoRec)} delta={deltaComissao} isMoney />
      </div>
      <p className="section-note" style={{ marginBottom: "18px" }}>
        &quot;Angariações&quot; conta apenas imóveis que chegaram na etapa Angariado no período — não
        os contatos ainda em andamento.
      </p>

      <div className="report-section-title">Comissão</div>
      <div className="grid grid-2" style={{ marginBottom: "10px" }}>
        <div className="report-stat">
          <div className="report-stat-label">Estimada no período</div>
          <div className="report-stat-value">{fmtMoney(d.comissaoEst)}</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-label">Recebida no período</div>
          <div className="report-stat-value">{fmtMoney(d.comissaoRec)}</div>
        </div>
      </div>

      <div className="report-section-title">Imóveis angariados no período</div>
      {d.imoveisAtual.length === 0 ? (
        <p className="section-note">Nenhum imóvel chegou na etapa Angariado neste período.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Ref. CRM</th>
                <th>Endereço</th>
                <th>Tipo</th>
                <th>Status atual</th>
                <th>Aluguel</th>
              </tr>
            </thead>
            <tbody>
              {d.imoveisAtual.map((i) => (
                <tr key={i.id}>
                  <td className="cell-strong">{i.codigo || "—"}</td>
                  <td className="cell-dim">{i.referenciaCrm || "—"}</td>
                  <td>{i.endereco}</td>
                  <td className="cell-dim">{i.tipo}</td>
                  <td>
                    <span className="badge" data-status={i.status}>
                      {i.status}
                    </span>
                  </td>
                  <td>{fmtMoney(i.valorAluguel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RelatoriosView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const { usuario } = useSessao();

  const [modo, setModo] = useState<"mensal" | "semanal">("mensal");
  const [mesKey, setMesKey] = useState(() => currentMonthKey());
  const [semanaOffset, setSemanaOffset] = useState(0);

  const dados =
    modo === "mensal"
      ? relatorioMensal(imoveis, comissaoPercent, mesKey)
      : relatorioSemanal(imoveis, comissaoPercent, semanaOffset);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-sub">Resumo de produtividade para acompanhamento e prestação de contas</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        </div>
      </div>

      <div className="pipeline-toolbar">
        <div className="view-toggle">
          <button type="button" className={modo === "mensal" ? "active" : ""} onClick={() => setModo("mensal")}>
            Mensal
          </button>
          <button type="button" className={modo === "semanal" ? "active" : ""} onClick={() => setModo("semanal")}>
            Semanal
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {modo === "mensal" ? (
            <>
              <button type="button" className="icon-btn" onClick={() => setMesKey((k) => shiftMonthKey(k, -1))}>
                ‹
              </button>
              <span className="cell-strong" style={{ minWidth: "150px", textAlign: "center" }}>
                {monthLabelLong(mesKey)}
              </span>
              <button type="button" className="icon-btn" onClick={() => setMesKey((k) => shiftMonthKey(k, 1))}>
                ›
              </button>
            </>
          ) : (
            <>
              <button type="button" className="icon-btn" onClick={() => setSemanaOffset((o) => o - 1)}>
                ‹
              </button>
              <span className="cell-strong" style={{ minWidth: "220px", textAlign: "center" }}>
                {weekRangeLabel(semanaOffset)}
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSemanaOffset((o) => o + 1)}
                disabled={semanaOffset >= 0}
              >
                ›
              </button>
            </>
          )}
        </div>
      </div>

      <div id="report-doc">
        <ReportDoc d={dados} responsavel={usuario?.email || "-"} />
      </div>
    </>
  );
}
