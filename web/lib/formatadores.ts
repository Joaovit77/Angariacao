/* ================================================================
   FORMATADORES
   Port literal da seção 3 do app.js original. O escapeHtml legado
   NÃO foi portado de propósito: no React/JSX o escape de dados do
   usuário é automático (decisão registrada no MIGRATION_NEXT.md,
   Etapa 2).
   ================================================================ */
import { parseDate } from "./datas";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  return d!.toLocaleDateString("pt-BR");
}

export function fmtDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  return d!.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/** "11/07/2026 14:32" a partir de "2026-07-11T14:32" — manipulação de
    string pura (a parte da data reusa o fmtDate). */
export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [data, hora] = iso.split("T");
  const dataFmt = fmtDate(data);
  return hora ? `${dataFmt} ${hora.slice(0, 5)}` : dataFmt;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function fmtMoneyFull(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
