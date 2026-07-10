/* ================================================================
   DASHBOARD — KPIs e séries dos gráficos (parte pura)
   Extraído de viewDashboard()/afterRenderDashboard() (app.js, 5A)
   sem alterar nenhuma fórmula: a view só desenha o que sai daqui.
   Puro e testável — é o que permite conferir os números contra o
   BASELINE_ETAPA0.md sem depender do browser.
   ================================================================ */
import { currentMonthKey, last6MonthKeys, monthKey, monthLabel, shiftMonthKey } from "../datas";
import { STATUS_FLOW } from "../constantes";
import type { Imovel } from "../tipos";
import {
  comissaoEstimada,
  comissaoRecebidaValor,
  groupCount,
  imoveisAngariadosNoMes,
  imoveisContatadosNoMes,
  imoveisLocadosNoMes,
  metricsForRange,
  type MetricsForRange,
} from "./motor";

const STATUS_FUNIL: readonly string[] = STATUS_FLOW;

export interface KpisDashboard {
  mKey: string;
  contatosThisMonth: number;
  angariacoesThisMonth: number;
  locadosThisMonth: number;
  deltaContatos: number;
  deltaAngariacoes: number;
  deltaLocados: number;
  comissaoEstMes: number;
  comissaoRecMes: number;
  emAndamento: number;
  overall: MetricsForRange;
}

export function kpisDashboard(imoveis: Imovel[], comissaoPercent: number): KpisDashboard {
  const mKey = currentMonthKey();
  const prevKey = shiftMonthKey(mKey, -1);
  const contatosThisMonth = imoveisContatadosNoMes(imoveis, mKey);
  const contatosPrevMonth = imoveisContatadosNoMes(imoveis, prevKey);
  const thisMonth = imoveisAngariadosNoMes(imoveis, mKey);
  const prevMonth = imoveisAngariadosNoMes(imoveis, prevKey);
  const locadosThisMonth = imoveisLocadosNoMes(imoveis, mKey);
  const locadosPrevMonth = imoveisLocadosNoMes(imoveis, prevKey);

  // Estimada só sobre os locados do mês — a comissão só entra quando o imóvel é locado.
  const comissaoEstMes = locadosThisMonth.reduce((s, i) => s + comissaoEstimada(i, comissaoPercent), 0);
  const comissaoRecMes = imoveis.reduce((s, i) => {
    if (i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === mKey)
      return s + comissaoRecebidaValor(i, comissaoPercent);
    return s;
  }, 0);

  return {
    mKey,
    contatosThisMonth: contatosThisMonth.length,
    angariacoesThisMonth: thisMonth.length,
    locadosThisMonth: locadosThisMonth.length,
    deltaContatos: contatosThisMonth.length - contatosPrevMonth.length,
    deltaAngariacoes: thisMonth.length - prevMonth.length,
    deltaLocados: locadosThisMonth.length - locadosPrevMonth.length,
    comissaoEstMes,
    comissaoRecMes,
    emAndamento: imoveis.filter((i) => STATUS_FUNIL.includes(i.status) && i.status !== "Locado").length,
    overall: metricsForRange(imoveis, comissaoPercent),
  };
}

export interface SeriesDashboard {
  labels: string[];
  angariacoesPorMes: number[];
  locadosPorMes: number[];
  bairroTop8: Array<[string, number]>;
  tipos: Array<[string, number]>;
  comissaoEstimadaPorMes: number[];
  comissaoRecebidaPorMes: number[];
  funil: number[];
}

export function seriesDashboard(imoveis: Imovel[], comissaoPercent: number): SeriesDashboard {
  const keys = last6MonthKeys();
  const bairroCounts = groupCount(imoveis, (i) => i.bairro);
  const tipoCounts = groupCount(imoveis, (i) => i.tipo);

  return {
    labels: keys.map(monthLabel),
    angariacoesPorMes: keys.map((k) => imoveisAngariadosNoMes(imoveis, k).length),
    locadosPorMes: keys.map((k) => imoveisLocadosNoMes(imoveis, k).length),
    bairroTop8: Object.entries(bairroCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
    tipos: Object.entries(tipoCounts).sort((a, b) => b[1] - a[1]),
    comissaoEstimadaPorMes: keys.map((k) =>
      imoveisLocadosNoMes(imoveis, k).reduce((s, i) => s + comissaoEstimada(i, comissaoPercent), 0),
    ),
    comissaoRecebidaPorMes: keys.map((k) =>
      imoveis
        .filter((i) => i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === k)
        .reduce((s, i) => s + comissaoRecebidaValor(i, comissaoPercent), 0),
    ),
    funil: STATUS_FLOW.map((s) => imoveis.filter((i) => i.status === s).length),
  };
}
