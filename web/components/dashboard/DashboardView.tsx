"use client";

/* ================================================================
   VIEW: DASHBOARD
   Port de viewDashboard() + afterRenderDashboard() (app.js, 5A).
   Todos os números vêm do motor de cálculo — a mesma fonte usada por
   Metas, Insights e Relatórios.

   Etapa 5 é somente-leitura: "+ Nova angariação" fica inerte até a
   Etapa 6. O fallback "Não foi possível carregar a biblioteca de
   gráficos" do app antigo não existe mais: o Chart.js agora entra
   pelo bundle, não por CDN.
   ================================================================ */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ChartConfiguration } from "chart.js/auto";
import Contador from "@/components/Contador";
import FocoDoDia from "@/components/dashboard/FocoDoDia";
import Grafico, { baseBarOptions, CHART_COLORS } from "@/components/graficos/Grafico";
import { kpisDashboard, seriesDashboard } from "@/lib/calculo/dashboard";
import { STATUS_FLOW } from "@/lib/constantes";
import { monthLabelLong } from "@/lib/datas";
import { fmtMoney } from "@/lib/formatadores";
import { analisarDashboard, resumoDoDia } from "@/lib/ia";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

function KpiCard({
  label,
  value,
  delta,
  unit,
  hint,
  description,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  unit?: string;
  hint?: string;
  description?: string;
}) {
  let deltaEl: React.ReactNode = null;
  if (delta !== null && delta !== undefined) {
    const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
    deltaEl = (
      <div className={`kpi-delta ${cls}`}>
        {arrow} {delta > 0 ? "+" : ""}
        {delta} vs. mês anterior
      </div>
    );
  } else if (hint) {
    deltaEl = <div className="kpi-delta flat">{hint}</div>;
  }

  return (
    <div className="card kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit ? <> <small>{unit}</small></> : null}
      </div>
      {deltaEl}
      {description && <div className="kpi-desc">{description}</div>}
    </div>
  );
}

/* Leitura por IA do Dashboard. Duas perguntas diferentes sobre a mesma
   carteira: "Ler os números" olha para trás (o que os KPIs dizem) e "O que
   fazer hoje" olha para frente (o que está vencendo). Compartilham a área
   de texto porque são alternativas, não complementares — pedir uma
   substitui a outra, e duas respostas na tela ao mesmo tempo só competiriam
   pela atenção.

   Os números NÃO saem daqui: o servidor relê tudo do banco e roda os mesmos
   cálculos puros da tela (ver app/api/ia). */
function LeituraIa() {
  const [carregando, setCarregando] = useState<"numeros" | "hoje" | null>(null);
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);

  if (!iaDisponivel) return null;

  async function pedir(qual: "numeros" | "hoje") {
    if (carregando) return;
    setCarregando(qual);
    const r = await (qual === "numeros" ? analisarDashboard() : resumoDoDia());
    setCarregando(null);
    if (!r.ok || !r.texto) {
      toast(r.mensagem || "A IA não respondeu agora.", "error");
      return;
    }
    setTitulo(qual === "numeros" ? "Leitura dos números" : "Por onde começar hoje");
    setTexto(r.texto);
  }

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title">
        <span>Leitura por IA</span>
        <span style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => pedir("numeros")}
            disabled={carregando !== null}
          >
            {carregando === "numeros" ? "Lendo..." : "Ler os números"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => pedir("hoje")}
            disabled={carregando !== null}
          >
            {carregando === "hoje" ? "Montando..." : "O que fazer hoje"}
          </button>
        </span>
      </div>
      {texto ? (
        <>
          <div className="section-note" style={{ marginBottom: "8px" }}>
            {titulo} · interpretação dos números desta tela
          </div>
          {/* Sem dangerouslySetInnerHTML: o texto vem de fora, e o escape do
              JSX é a defesa. Uma linha por parágrafo — serve tanto para a
              análise (3 parágrafos) quanto para o resumo do dia (lista). */}
          {texto
            .split("\n")
            .map((linha) => linha.trim())
            .filter(Boolean)
            .map((linha, i) => (
              <p key={i} className="drawer-notes" style={{ marginBottom: "6px" }}>
                {linha}
              </p>
            ))}
        </>
      ) : (
        <p className="section-note">
          A IA interpreta os números desta tela ou monta a lista do que priorizar hoje. Os dados
          vêm do seu banco — ela não recalcula nada.
        </p>
      )}
    </div>
  );
}

export default function DashboardView() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const abrirModal = useUiModal((s) => s.abrirModal);

  const kpis = kpisDashboard(imoveis, comissaoPercent);
  const { overall, mKey } = kpis;

  if (imoveis.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <p className="page-sub">Visão geral da sua produtividade</p>
          </div>
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
              + Nova angariação
            </button>
          </div>
        </div>
        <div className="empty-state card">
          <h3>Nenhum imóvel cadastrado ainda</h3>
          <p>Cadastre sua primeira angariação para começar a acompanhar seus resultados aqui.</p>
          <div style={{ marginTop: "16px" }}>
            <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
              + Cadastrar imóvel
            </button>
          </div>
        </div>
      </>
    );
  }

  const series = seriesDashboard(imoveis, comissaoPercent);
  const labels = series.labels;

  const angariacoesMes: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Angariações",
          data: series.angariacoesPorMes,
          backgroundColor: "#cca24a",
          borderRadius: 5,
          maxBarThickness: 34,
        },
      ],
    },
    options: baseBarOptions(),
  };

  const locadosMes: ChartConfiguration = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Angariados",
          data: series.angariacoesPorMes,
          backgroundColor: "#3a453a",
          borderRadius: 5,
          maxBarThickness: 26,
        },
        {
          label: "Locados",
          data: series.locadosPorMes,
          backgroundColor: "#5fb896",
          borderRadius: 5,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      ...baseBarOptions(),
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" },
        },
      },
    },
  };

  const bairroSorted = series.bairroTop8;
  const bairro: ChartConfiguration = {
    type: "bar",
    data: {
      labels: bairroSorted.map((x) => x[0]),
      datasets: [
        { data: bairroSorted.map((x) => x[1]), backgroundColor: "#cca24a", borderRadius: 5, maxBarThickness: 22 },
      ],
    },
    options: { ...baseBarOptions(), indexAxis: "y" },
  };

  const tipoSorted = series.tipos;
  const tipos: ChartConfiguration = {
    type: "doughnut",
    data: {
      labels: tipoSorted.map((x) => x[0]),
      datasets: [
        { data: tipoSorted.map((x) => x[1]), backgroundColor: CHART_COLORS, borderColor: "#171e19", borderWidth: 2 },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "right",
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", padding: 10 },
        },
      },
      maintainAspectRatio: false,
      responsive: true,
    },
  };

  const comEst = series.comissaoEstimadaPorMes;
  const comRec = series.comissaoRecebidaPorMes;
  const base = baseBarOptions();
  const comissao: ChartConfiguration = {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Estimada", data: comEst, borderColor: "#cca24a", backgroundColor: "#cca24a22", tension: 0.35, fill: true },
        { label: "Recebida", data: comRec, borderColor: "#5fb896", backgroundColor: "#5fb89622", tension: 0.35, fill: true },
      ],
    },
    options: {
      ...base,
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" },
        },
      },
      scales: {
        ...base.scales,
        y: { ...base.scales.y, ticks: { callback: (v: string | number) => fmtMoney(Number(v)) } },
      },
    },
  };

  const funilCounts = series.funil;
  const funil: ChartConfiguration = {
    type: "bar",
    data: {
      labels: [...STATUS_FLOW],
      datasets: [
        {
          data: funilCounts,
          backgroundColor: STATUS_FLOW.map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length]),
          borderRadius: 5,
          maxBarThickness: 22,
        },
      ],
    },
    options: { ...baseBarOptions(), indexAxis: "y" },
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">{monthLabelLong(mKey)} · visão geral da produtividade</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => router.push("/agenda")}>
            Ver agenda
          </button>
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
            + Nova angariação
          </button>
        </div>
      </div>

      <LeituraIa />

      <FocoDoDia />

      <div className="grid grid-3 anim-stagger" style={{ marginBottom: "16px" }}>
        <KpiCard label="Novos contatos no mês" value={<Contador valor={kpis.contatosThisMonth} />} delta={kpis.deltaContatos} unit="un." description="Imóveis que entraram no funil este mês" />
        <KpiCard label="Angariações no mês" value={<Contador valor={kpis.angariacoesThisMonth} />} delta={kpis.deltaAngariacoes} unit="un." description="Só conta ao chegar na etapa Angariado" />
        <KpiCard label="Imóveis locados no mês" value={<Contador valor={kpis.locadosThisMonth} />} delta={kpis.deltaLocados} unit="un." />
        <KpiCard label="Taxa de conversão" value={<Contador valor={overall.conversaoFechados} formatar={(n) => Math.round(n) + "%"} />} hint="Locado ÷ processos fechados" />
        <KpiCard label="Tempo médio até locação" value={overall.tempoMedio != null ? <Contador valor={overall.tempoMedio} /> : "—"} unit="dias" />
        <KpiCard label="Em andamento agora" value={<Contador valor={kpis.emAndamento} />} unit="imóveis" />
        <KpiCard label="Comissão estimada (mês)" value={<Contador valor={kpis.comissaoEstMes} formatar={fmtMoney} />} />
        <KpiCard label="Comissão recebida (mês)" value={<Contador valor={kpis.comissaoRecMes} formatar={fmtMoney} />} />
        <KpiCard label="Valor médio de aluguel" value={<Contador valor={overall.valorMedioAluguel} formatar={fmtMoney} />} />
      </div>

      <div className="grid grid-2 anim-stagger" style={{ marginBottom: "16px" }}>
        <div className="card chart-card">
          <div className="card-title">
            Angariações por mês <span className="section-note">últimos 6 meses</span>
          </div>
          <div className="chart-wrap">
            <Grafico id="chart-angariacoes-mes" config={angariacoesMes} />
          </div>
        </div>
        <div className="card chart-card">
          <div className="card-title">Locados vs. angariados por mês</div>
          <div className="chart-wrap">
            <Grafico id="chart-locados-mes" config={locadosMes} />
          </div>
        </div>
      </div>

      <div className="grid grid-2 anim-stagger" style={{ marginBottom: "16px" }}>
        <div className="card chart-card">
          <div className="card-title">
            Imóveis no pipeline por bairro <span className="section-note">top 8 · todos os status</span>
          </div>
          <div className="chart-wrap">
            <Grafico id="chart-bairro" config={bairro} />
          </div>
        </div>
        <div className="card chart-card">
          <div className="card-title">
            Tipos de imóveis no pipeline <span className="section-note">todos os status</span>
          </div>
          <div className="chart-wrap">
            <Grafico id="chart-tipos" config={tipos} />
          </div>
        </div>
      </div>

      <div className="grid grid-2 anim-stagger">
        <div className="card chart-card">
          <div className="card-title">
            Comissão: estimada vs. recebida <span className="section-note">últimos 6 meses</span>
          </div>
          <div className="chart-wrap">
            <Grafico id="chart-comissao" config={comissao} />
          </div>
        </div>
        <div className="card chart-card">
          <div className="card-title">Funil atual do pipeline</div>
          <div className="chart-wrap">
            <Grafico id="chart-funil" config={funil} />
          </div>
        </div>
      </div>
    </>
  );
}
