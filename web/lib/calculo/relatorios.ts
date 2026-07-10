/* ================================================================
   RELATÓRIOS — números do documento (parte pura)
   Derivado de renderMonthlyReport()/renderWeeklyReport() (app.js, 5F),
   sem a montagem de HTML.

   Achado A3 (pós-migração, MIGRATION_NEXT.md §15): a "Conversão" do
   relatório usava definição própria — locados ÷ angariados no período —
   diferente do Dashboard, o que confundia (Julho aparecia 100% aqui e
   33% lá). Alinhada à MESMA definição do Dashboard (conversaoFechados):
   locados ÷ processos fechados. Continua escopada ao período — um
   relatório de período deve permanecer do período. Esta é uma divergência
   INTENCIONAL do comportamento do app antigo.
   ================================================================ */
import { STATUS_TERMINAL_NEGATIVE } from "../constantes";
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

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

// Imóveis que ENTRARAM num status terminal negativo (Perdido/Cancelado/Sem
// resposta) dentro do período — a outra metade dos "processos fechados", ao
// lado dos locados no período.
function terminaisNoMes(imoveis: Imovel[], key: string): number {
  return imoveis.filter((i) => TERMINAIS.includes(i.status) && monthKey(dateEnteredStatus(i, i.status)) === key).length;
}
function terminaisNoPeriodo(imoveis: Imovel[], start: string, end: string): number {
  return imoveis.filter((i) => {
    if (!TERMINAIS.includes(i.status)) return false;
    const d = dateEnteredStatus(i, i.status);
    return d != null && d >= start && d <= end;
  }).length;
}

// Mesma fórmula do Dashboard (motor `conversaoFechados`), escopada ao período.
function pctConversaoFechados(locados: number, terminais: number): number {
  const fechados = locados + terminais;
  return fechados ? (locados / fechados) * 100 : 0;
}

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
    conversao: pctConversaoFechados(curLocados.length, terminaisNoMes(imoveis, key)),
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
    conversao: pctConversaoFechados(curLocados.length, terminaisNoPeriodo(imoveis, start, end)),
    comissaoEst,
    comissaoRec: recebidaEntre(start, end),
    comissaoRecAnterior: recebidaEntre(prevStart, prevEnd),
    imoveisAtual: cur,
  };
}
