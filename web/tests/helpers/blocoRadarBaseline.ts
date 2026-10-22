import { readFileSync } from "node:fs";
import { expect } from "vitest";

/** Preserva as âncoras históricas; retira somente a extensão literal autorizada e validada. */
export function semBlocoRadarBaseline(schema: string): string {
  const migration = readFileSync(new URL("../../../supabase/migrations/20261021120000_radar_baseline_cobertura_novos.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const bloco = "-- BEGIN RADAR BASELINE COBERTURA NOVOS\n" + migration.trimEnd() + "\n-- END RADAR BASELINE COBERTURA NOVOS\n";
  expect(schema.split(bloco)).toHaveLength(2);
  const populacao = readFileSync(new URL("../../../supabase/migrations/20261022180000_radar_chaves_populacao_qualificada.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const extensao = "-- BEGIN RADAR CHAVES POPULACAO QUALIFICADA\n" + populacao.trimEnd() + "\n-- END RADAR CHAVES POPULACAO QUALIFICADA\n";
  expect(schema.split(extensao)).toHaveLength(2);
  return schema.replace("\n" + bloco, "").replace("\n" + extensao, "");
}
