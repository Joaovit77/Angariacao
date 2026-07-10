/* ================================================================
   HELPERS DE DATA
   Port literal da seção 3 do app.js original. Datas circulam pelo
   app sempre como string ISO "YYYY-MM-DD"; este é o ÚNICO módulo
   autorizado a usar `new Date` (regra de lint — MIGRATION_NEXT.md
   §3.5), porque o Date cru interpreta "YYYY-MM-DD" como UTC e
   desloca o dia em fusos negativos.
   ================================================================ */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface IntervaloSemana {
  start: string;
  end: string;
}

/** Semana de segunda a domingo, deslocada por `offset` semanas.
    Port literal de weekRange() (app.js, 5F) — inclusive o uso de
    toISOString(), que converte para UTC. */
export function weekRange(offset: number): IntervaloSemana {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = domingo
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISO(monday), end: toISO(sunday) };
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(isoA: string | null | undefined, isoB: string | null | undefined): number | null {
  const a = parseDate(isoA), b = parseDate(isoB);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// Soma dias a uma data ISO — usado para calcular a data do próximo
// lembrete de verificação de disponibilidade.
export function addDaysISO(iso: string | null | undefined, days: number): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 7); // "YYYY-MM"
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

export function monthLabelLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}

export function last6MonthKeys(): string[] {
  const keys: string[] = [];
  let k = currentMonthKey();
  for (let i = 0; i < 6; i++) { keys.unshift(k); k = shiftMonthKey(k, -1); }
  return keys;
}
