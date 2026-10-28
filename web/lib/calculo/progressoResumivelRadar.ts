import type { ReceiptJanelaRadar } from "./coberturaJanelaRadar";

/** Progresso do motor passivo; não altera os tipos ou emissores da interface publicada. */
export interface ProgressoRadar extends Partial<ReceiptJanelaRadar> {
  varreduraId: string; estado: "in_progress" | "complete" | "partial" | "failed";
  paginasConcluidas: number; resultadosColetados: number; admitidos: number;
  totalDeclarado: number | null; proximaPagina: number | null; motivo?: string;
  execucao?: "in_progress" | "complete" | "failed";
}
