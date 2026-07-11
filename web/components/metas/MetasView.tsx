"use client";

/* ================================================================
   VIEW: METAS
   Port de viewMetas() + goalCard() + renderMetaHistory() (app.js, 5C).
   "Realizado" de angariações usa a data de entrada em Angariado;
   locados idem para Locado; comissão pela data de recebimento.

   Etapa 5 é somente-leitura: o modal de metas chega na Etapa 6.
   ================================================================ */
import Contador from "@/components/Contador";
import {
  comissaoRecebidaValor,
  faturamentoContratosNoMes,
  imoveisAngariadosNoMes,
  imoveisLocadosNoMes,
} from "@/lib/calculo/motor";
import { currentMonthKey, monthKey, monthLabelLong } from "@/lib/datas";
import { fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel, Meta } from "@/lib/tipos";
import BadgesConquistas from "./BadgesConquistas";

function comissaoRecebidaNoMes(imoveis: Imovel[], key: string, comissaoPercent: number): number {
  return imoveis.reduce(
    (s, i) =>
      i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === key
        ? s + comissaoRecebidaValor(i, comissaoPercent)
        : s,
    0,
  );
}

function GoalCard({
  label,
  current,
  target,
  unit,
  note,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  note?: string;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  // Termômetro: gradiente laranja→verde de comprimento fixo (o do track),
  // recortado pelo width — a ponta da barra reflete o progresso. Acima de
  // 90% ganha o pulso/brilho discreto (.pulsante).
  const pulsante = pct >= 90;
  const fmt = (v: number) => (unit === "money" ? fmtMoney(v) : `${v}${unit ? " " + unit : ""}`);

  return (
    <div className="card goal-card">
      <div className="goal-head">
        <div className="goal-title">{label}</div>
        <div className="goal-foot">
          <span className="pct">
            <Contador valor={pct} formatar={(n) => n.toFixed(0) + "%"} />
          </span>
        </div>
      </div>
      <div className="goal-numbers">
        <div className="goal-current">
          <Contador valor={current} formatar={fmt} />
        </div>
        <div className="goal-target">/ {target > 0 ? fmt(target) : "sem meta"}</div>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill termometro${pulsante ? " pulsante" : ""}`}
          style={{ width: `${pct}%`, "--pct": Math.max(pct, 1) } as React.CSSProperties}
        ></div>
      </div>
      <div className="goal-foot">
        <span>{target > 0 ? (pct >= 100 ? "Meta atingida 🎉" : `Faltam ${fmt(remaining)}`) : "—"}</span>
      </div>
      {note && (
        <div className="kpi-desc" style={{ marginTop: "8px" }}>
          {note}
        </div>
      )}
    </div>
  );
}

export default function MetasView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const metas = useAppStore((s) => s.metas);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const abrirModal = useUiModal((s) => s.abrirModal);

  const mKey = currentMonthKey();
  const meta: Meta = metas[mKey] || { angariacoes: 0, locados: 0, comissao: 0, faturamento: 0 };
  const thisMonth = imoveisAngariadosNoMes(imoveis, mKey);
  const locadosThisMonth = imoveisLocadosNoMes(imoveis, mKey);
  const comissaoRecMes = comissaoRecebidaNoMes(imoveis, mKey, comissaoPercent);
  const faturamentoMes = faturamentoContratosNoMes(imoveis, mKey);

  const hasGoals = meta.angariacoes > 0 || meta.locados > 0 || meta.comissao > 0 || meta.faturamento > 0;
  const historico = Object.keys(metas).sort().reverse().slice(0, 6);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Metas</h1>
          <p className="page-sub">{monthLabelLong(mKey)}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("meta")}>
            {hasGoals ? "Editar metas do mês" : "+ Definir metas"}
          </button>
        </div>
      </div>

      {!hasGoals ? (
        <div className="empty-state card">
          <h3>Nenhuma meta definida para este mês</h3>
          <p>
            Defina metas de angariação, locação e comissão para acompanhar seu progresso ao longo do
            mês.
          </p>
          <div style={{ marginTop: "16px" }}>
            <button type="button" className="btn btn-primary" onClick={() => abrirModal("meta")}>
              + Definir metas
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-4 anim-stagger">
          <GoalCard
            label="Angariações"
            current={thisMonth.length}
            target={meta.angariacoes}
            unit="un."
            note="Conta ao chegar na etapa Angariado"
          />
          <GoalCard label="Imóveis locados" current={locadosThisMonth.length} target={meta.locados} unit="un." />
          <GoalCard label="Comissão recebida" current={comissaoRecMes} target={meta.comissao} unit="money" />
          <GoalCard
            label="Faturamento em contratos"
            current={faturamentoMes}
            target={meta.faturamento}
            unit="money"
            note="Soma dos aluguéis dos imóveis locados no mês"
          />
        </div>
      )}

      <div className="divider"></div>
      <BadgesConquistas />

      <div className="divider"></div>
      <div className="card-title" style={{ marginBottom: "14px" }}>
        Histórico de metas
      </div>
      {historico.length === 0 ? (
        <p className="section-note">Nenhum histórico ainda.</p>
      ) : (
        <div className="card table-scroll" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Meta angariações</th>
                <th>Realizado</th>
                <th>Meta locados</th>
                <th>Realizado</th>
                <th>Meta comissão</th>
                <th>Recebido</th>
                <th>Meta faturamento</th>
                <th>Realizado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((k) => {
                const m = metas[k];
                const ang = imoveisAngariadosNoMes(imoveis, k).length;
                const loc = imoveisLocadosNoMes(imoveis, k).length;
                const rec = comissaoRecebidaNoMes(imoveis, k, comissaoPercent);
                const fat = faturamentoContratosNoMes(imoveis, k);
                return (
                  <tr key={k}>
                    <td className="cell-strong">{monthLabelLong(k)}</td>
                    <td>{m.angariacoes || "—"}</td>
                    <td className="cell-dim">{ang}</td>
                    <td>{m.locados || "—"}</td>
                    <td className="cell-dim">{loc}</td>
                    <td>{m.comissao ? fmtMoney(m.comissao) : "—"}</td>
                    <td className="cell-dim">{fmtMoney(rec)}</td>
                    {/* Metas de meses anteriores à coluna podem não ter faturamento. */}
                    <td>{m.faturamento ? fmtMoney(m.faturamento) : "—"}</td>
                    <td className="cell-dim">{fmtMoney(fat)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
