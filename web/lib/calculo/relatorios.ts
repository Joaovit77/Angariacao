/* ================================================================
   RELATÓRIOS — números do documento (parte pura)
   Port literal de renderMonthlyReport()/renderWeeklyReport()
   (app.js, 5F), sem a montagem de HTML.

   Atenção (comportamento preservado): a "conversão" do relatório usa
   definição própria — locados no período ÷ angariados no período —
   e por isso pode divergir da taxa do Dashboard. É intencional.
   ================================================================ */
import { monthKey, monthLabelLong, shiftMonthKey, weekRange } from "../datas";
import { fmtDate } from "../formatadores";
import type { Imovel } from "../tipos";
import {
  comissaoEstimada,
  comissaoRecebidaValor,
  dateEnteredStatus,
  imoveisAngariadosNoMes,
  imoveisAngariadosNoPeriodo,
  imoveisContatadosNoMes,
  imoveisContatadosNoPeriodo,
  imoveisLocadosNoMes,
} from "./motor";

export interface DadosRelatorio {
  title: string;
  period: string;
  contatosAtual: number;
  contatosAnterior: number;
  totalAtual: number;
  totalAnterior: number;
  locadosAtual: number;
  locadosAnterior: number;
  conversao: number;
  comissaoEst: number;
  comissaoRec: number;
  comissaoRecAnterior: number;
  imoveisAtual: Imovel[];
}

export function weekRangeLabel(offset: number): string {
  const { start, end } = weekRange(offset);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function relatorioMensal(imoveis: Imovel[], comissaoPercent: number, key: string): DadosRelatorio {
  const prevKey = shiftMonthKey(key, -1);
  const contatos = imoveisContatadosNoMes(imoveis, key);
  const contatosPrev = imoveisContatadosNoMes(imoveis, prevKey);
  const cur = imoveisAngariadosNoMes(imoveis, key);
  const prev = imoveisAngariadosNoMes(imoveis, prevKey);
  const curLocados = imoveisLocadosNoMes(imoveis, key);
  const prevLocados = imoveisLocadosNoMes(imoveis, prevKey);
  // Comissão estimada considera só os imóveis locados no período — a comissão
  // só é recebida quando o imóvel é locado.
  const comissaoEst = curLocados.reduce((s, i) => s + comissaoEstimada(i, comissaoPercent), 0);
  const comissaoRec = imoveis.reduce(
    (s, i) =>
      i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === key
        ? s + comissaoRecebidaValor(i, comissaoPercent)
        : s,
    0,
  );
  const comissaoRecPrev = imoveis.reduce(
    (s, i) =>
      i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === prevKey
        ? s + comissaoRecebidaValor(i, comissaoPercent)
        : s,
    0,
  );

  return {
    title: "Relatório Mensal",
    period: monthLabelLong(key),
    contatosAtual: contatos.length,
    contatosAnterior: contatosPrev.length,
    totalAtual: cur.length,
    totalAnterior: prev.length,
    locadosAtual: curLocados.length,
    locadosAnterior: prevLocados.length,
    conversao: cur.length ? (curLocados.length / cur.length) * 100 : 0,
    comissaoEst,
    comissaoRec,
    comissaoRecAnterior: comissaoRecPrev,
    imoveisAtual: cur,
  };
}

export function relatorioSemanal(imoveis: Imovel[], comissaoPercent: number, offset: number): DadosRelatorio {
  const { start, end } = weekRange(offset);
  const { start: prevStart, end: prevEnd } = weekRange(offset - 1);
  const contatos = imoveisContatadosNoPeriodo(imoveis, start, end);
  const contatosPrev = imoveisContatadosNoPeriodo(imoveis, prevStart, prevEnd);
  const cur = imoveisAngariadosNoPeriodo(imoveis, start, end);
  const prev = imoveisAngariadosNoPeriodo(imoveis, prevStart, prevEnd);
  const noIntervalo = (i: Imovel, a: string, b: string) => {
    const d = dateEnteredStatus(i, "Locado");
    return d != null && d >= a && d <= b;
  };
  const curLocados = imoveis.filter((i) => i.status === "Locado" && noIntervalo(i, start, end));
  const prevLocados = imoveis.filter((i) => i.status === "Locado" && noIntervalo(i, prevStart, prevEnd));
  // Comissão estimada considera só os imóveis locados no período — a comissão
  // só é recebida quando o imóvel é locado.
  const comissaoEst = curLocados.reduce((s, i) => s + comissaoEstimada(i, comissaoPercent), 0);
  const recebidaEntre = (a: string, b: string) =>
    imoveis.reduce(
      (s, i) =>
        i.status === "Locado" &&
        i.comissaoRecebida &&
        i.comissaoRecebidaData != null &&
        i.comissaoRecebidaData >= a &&
        i.comissaoRecebidaData <= b
          ? s + comissaoRecebidaValor(i, comissaoPercent)
          : s,
      0,
    );

  return {
    title: "Relatório Semanal",
    period: `${fmtDate(start)} a ${fmtDate(end)}`,
    contatosAtual: contatos.length,
    contatosAnterior: contatosPrev.length,
    totalAtual: cur.length,
    totalAnterior: prev.length,
    locadosAtual: curLocados.length,
    locadosAnterior: prevLocados.length,
    conversao: cur.length ? (curLocados.length / cur.length) * 100 : 0,
    comissaoEst,
    comissaoRec: recebidaEntre(start, end),
    comissaoRecAnterior: recebidaEntre(prevStart, prevEnd),
    imoveisAtual: cur,
  };
}
