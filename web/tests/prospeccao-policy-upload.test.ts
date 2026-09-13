import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raiz = new URL("../../", import.meta.url);
const sql = readFileSync(
  new URL("supabase/migrations/20260911115908_prospeccao_campo_exclusao_storage.sql", raiz),
  "utf8",
).replace(/\r\n/g, "\n");
const policy = sql.match(
  /create policy "fachadas_insert_reserva_aberta"[\s\S]*?\n  \);/i,
)?.[0] ?? "";
const tabelas = readFileSync(
  new URL("supabase/migrations/20260910184310_prospeccao_campo.sql", raiz),
  "utf8",
).replace(/\r\n/g, "\n");

describe("C5 — policy de upload reservado", () => {
  it("mantém todas as condições de posse e vínculo do C2f", () => {
    expect(policy).toContain("bucket_id = 'fachadas'");
    expect(policy).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(policy).toContain("name in (f.caminho, f.caminho_miniatura)");
    expect(policy).toContain("f.estado = 'reservada'");
    expect(policy).toContain("f.user_id = (select auth.uid())");
    expect(policy).toContain("a.id = f.avistamento_id");
    expect(policy).toContain("a.user_id = (select auth.uid())");
    expect(policy).toContain("i.id = f.imovel_identificado_id");
    expect(policy).toContain("i.user_id = (select auth.uid())");
  });

  it("fecha a corrida reserva → exclusão → upload da aba antiga", () => {
    expect(policy).toContain("i.exclusao_solicitada_em is null");
    expect(policy).toContain("i.situacao <> 'fundido'");
  });

  it("não concede update nem delete para contornar conflito", () => {
    const policies = [...sql.matchAll(/^create policy "[^"]+"[\s\S]*?;/gim)]
      .map((resultado) => resultado[0]);
    expect(policies).toHaveLength(2);
    expect(policies.join("\n")).not.toMatch(/for (?:update|delete) to authenticated/i);
  });

  it("mantém uma única foto por avistamento no índice total", () => {
    expect(tabelas).toMatch(
      /create unique index if not exists idx_identificados_fotos_avistamento_unico\s+on public\.imoveis_identificados_fotos \(avistamento_id\)/i,
    );
  });
});
