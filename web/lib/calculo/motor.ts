/* ================================================================
   MOTOR DE CÁLCULO
   Port literal da seção 4 do app.js original. Todas as métricas
   derivadas dos imóveis vivem aqui, para que Dashboard, Metas,
   Insights e Relatórios usem a mesma fonte de verdade e nunca
   divirjam entre si.

   Diferença de FORMA (não de lógica) vs. o original: as funções
   não leem mais o STATE global — recebem os imóveis e o
   comissaoPercent por parâmetro, o que mantém o módulo puro e
   testável (decisão registrada no MIGRATION_NEXT.md, Etapa 2).

   A verdade sobre o progresso de um imóvel mora no statusHistory,
   não no campo status atual nem na existência do registro.
   ================================================================ */
import { STATUS_TERMINAL_NEGATIVE, STALE_DAYS_THRESHOLD } from "../constantes";
import { daysBetween, monthKey, todayISO } from "../datas";
import type { Imovel } from "../tipos";

// Retorna a data (ISO) em que o imóvel entrou em determinado status,
// usando o histórico de transições. Cai para dataAngariacao se não
// houver histórico (compatibilidade com registros antigos).
export function dateEnteredStatus(imovel: Imovel, status: string): string | null {
  const hist = imovel.statusHistory || [];
  const entry = hist.find((h) => h.status === status);
  return entry ? entry.date : (status === "Novo contato" ? imovel.dataAngariacao ?? null : null);
}

export function currentStatusSince(imovel: Imovel): string | null {
  const hist = imovel.statusHistory || [];
  if (hist.length === 0) return imovel.dataAngariacao ?? null;
  return hist[hist.length - 1].date;
}

export function isPausado(imovel: Imovel): boolean {
  return !!(imovel.pausadoAte && imovel.pausadoAte >= todayISO());
}

export function isStale(imovel: Imovel): boolean {
  if ((STATUS_TERMINAL_NEGATIVE as readonly string[]).includes(imovel.status) || imovel.status === "Locado") return false;
  if (isPausado(imovel)) return false;
  const since = currentStatusSince(imovel);
  const d = daysBetween(since, todayISO());
  return d !== null && d >= STALE_DAYS_THRESHOLD;
}

export function daysInCurrentStatus(imovel: Imovel): number | null {
  const since = currentStatusSince(imovel);
  return daysBetween(since, todayISO());
}

export function comissaoEstimada(imovel: Imovel, comissaoPercent: number): number {
  return (imovel.valorAluguel || 0) * (comissaoPercent / 100);
}

export function comissaoRecebidaValor(imovel: Imovel, comissaoPercent: number): number {
  return imovel.status === "Locado" && imovel.comissaoRecebida ? (imovel.comissaoRecebidaValor ?? comissaoEstimada(imovel, comissaoPercent)) : 0;
}

export function tempoAteLocacao(imovel: Imovel): number | null {
  if (imovel.status !== "Locado") return null;
  const dLocado = dateEnteredStatus(imovel, "Locado");
  return daysBetween(imovel.dataAngariacao, dLocado);
}

export interface MetricsForRange {
  total: number;
  locados: number;
  perdidosCancelados: number;
  conversaoGeral: number;
  conversaoFechados: number;
  tempoMedio: number | null;
  comissaoEst: number;
  comissaoRec: number;
  valorMedioAluguel: number;
}

export function metricsForRange(imoveis: Imovel[], comissaoPercent: number): MetricsForRange {
  const total = imoveis.length;
  const locados = imoveis.filter((i) => i.status === "Locado");
  const perdidosCancelados = imoveis.filter((i) => (STATUS_TERMINAL_NEGATIVE as readonly string[]).includes(i.status));
  const fechados = locados.length + perdidosCancelados.length;
  const conversaoGeral = total ? (locados.length / total) * 100 : 0;
  const conversaoFechados = fechados ? (locados.length / fechados) * 100 : 0;
  const tempos = locados.map(tempoAteLocacao).filter((t): t is number => t != null && t >= 0);
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  // Comissão estimada só sobre os locados — a comissão só é recebida quando o
  // imóvel é locado.
  const comissaoEst = locados.reduce((s, i) => s + comissaoEstimada(i, comissaoPercent), 0);
  const comissaoRec = imoveis.reduce((s, i) => s + comissaoRecebidaValor(i, comissaoPercent), 0);
  const valorMedioAluguel = total ? imoveis.reduce((s, i) => s + (i.valorAluguel || 0), 0) / total : 0;
  return { total, locados: locados.length, perdidosCancelados: perdidosCancelados.length, conversaoGeral, conversaoFechados, tempoMedio, comissaoEst, comissaoRec, valorMedioAluguel };
}

// Um imóvel só conta como "angariado" quando o funil realmente marca
// a passagem pela etapa "Angariado" — simplesmente cadastrar o imóvel
// ou fazer o primeiro contato NÃO conta como angariação concluída.
export function foiAngariado(imovel: Imovel): boolean {
  return dateEnteredStatus(imovel, "Angariado") != null;
}

export function dataAngariadoEfetiva(imovel: Imovel): string | null {
  return dateEnteredStatus(imovel, "Angariado");
}

export function imoveisAngariadosNoMes(imoveis: Imovel[], key: string): Imovel[] {
  return imoveis.filter((i) => foiAngariado(i) && monthKey(dataAngariadoEfetiva(i)) === key);
}

export function imoveisAngariadosNoPeriodo(imoveis: Imovel[], start: string, end: string): Imovel[] {
  return imoveis.filter((i) => {
    const d = dataAngariadoEfetiva(i);
    return d != null && d >= start && d <= end;
  });
}

// "Contato" é o topo do funil: todo imóvel que entrou no pipeline,
// independente de já ter sido efetivamente angariado ou não.
export function imoveisContatadosNoMes(imoveis: Imovel[], key: string): Imovel[] {
  return imoveis.filter((i) => monthKey(i.dataAngariacao) === key);
}

export function imoveisContatadosNoPeriodo(imoveis: Imovel[], start: string, end: string): Imovel[] {
  return imoveis.filter((i) => i.dataAngariacao != null && i.dataAngariacao >= start && i.dataAngariacao <= end);
}

export function imoveisLocadosNoMes(imoveis: Imovel[], key: string): Imovel[] {
  return imoveis.filter((i) => i.status === "Locado" && monthKey(dateEnteredStatus(i, "Locado")) === key);
}

export function groupCount(imoveis: Imovel[], keyFn: (i: Imovel) => string | null | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  imoveis.forEach((i) => {
    const k = keyFn(i) || "Não informado";
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}
