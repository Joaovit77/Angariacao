import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

describe("proteção dos marcos no banco", () => {
  it("mantém RLS por proprietário", () => {
    expect(SCHEMA).toContain('create policy "select_own_imoveis"');
    expect(SCHEMA).toContain("auth.uid() = user_id");
  });

  it("torna status e histórico atômicos e impede edição comum da trilha", () => {
    expect(SCHEMA).toContain("create trigger trg_imoveis_status_history");
    expect(SCHEMA).toContain("before insert or update on imoveis");
    expect(SCHEMA).toContain("new.status_history := coalesce(old.status_history");
    expect(SCHEMA).toContain("new.status is not distinct from old.status");
  });

  it("carimba autoria autenticada no banco e não faz backfill por updated_at", () => {
    expect(SCHEMA).toContain("ator uuid := auth.uid()");
    expect(SCHEMA).toContain("jsonb_build_object('userId', ator::text, 'source', 'usuario')");
    const blocoMarcos = SCHEMA.slice(SCHEMA.indexOf("MARCOS PERMANENTES DO FUNIL"), SCHEMA.indexOf("Atualiza updated_at automaticamente"));
    expect(blocoMarcos).not.toContain("new.updated_at");
  });
});
