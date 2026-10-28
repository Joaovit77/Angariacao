/** Escopo explícito: observar pela primeira vez não comprova publicação recente no portal. */
export const CONTRATO_JANELA_CHAVES_RADAR = "chaves_traversable_window_v1" as const;
export interface ReceiptJanelaRadar {
  contrato_cobertura: typeof CONTRATO_JANELA_CHAVES_RADAR;
  coverage_scope: "traversable_window";
  traversable_window_complete: boolean;
  portal_universe_complete: null;
  baseline_kind: "baseline_janela_navegavel";
  newness_scope: "novo_para_o_radar";
  terminality_scope: "fim_janela_navegavel_publicada";
  observed_count: number;
  declared_total: number | null;
  delta: number | null;
  avisos: Array<"DECLARED_TOTAL_MISMATCH">;
  metadata_total_comparisons: Array<{ pagina: number; campo: "numberOfItems" | "realResults"; declared_total: number; observed_count: number; delta: number; origem: ObservacaoTotalRadar["origem"] }>;
  declared_total_observations: Array<{ pagina: number; declared_total: number | null; delta: number | null; em: string; metadata: ObservacaoTotalRadar[] }>;
}
export interface ObservacaoTotalRadar {
  campo: "numberOfItems" | "realResults" | "totalListing" | "totalPages" | "maxPages" | "pageBreak";
  valor: number | number[];
  origem: "json_ld" | "hidratacao_json" | "flight_literal";
}
