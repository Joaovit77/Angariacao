import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../../supabase/migrations/20260902183304_fase5b_coleta_mercados.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
describe("contrato SQL do scheduler de mercados", () => {
  it("schema canônico contém exatamente a migration revisada", () => {
    expect(schema.replace(/\r/g, "")).toContain(migration.replace(/\r/g, "").trim());
  });
  it("não cria tabelas nem altera histórico, Radar ou overloads da Avaliação", () => {
    expect(migration).not.toMatch(/create\s+table|create\s+extension|cron\.schedule|drop\s+function|alter\s+table/i);
    expect(migration).not.toMatch(/(?:insert into|update|delete from)\s+(?:public\.)?(?:radar_|comparaveis_mercado|observacoes_comparaveis)/i);
  });
  it("usa transação curta, lock atômico e lease limitado", () => {
    expect(migration).toMatch(/for update skip locked/i);
    expect(migration).toContain("least(greatest(coalesce(p_limite, 1), 1), 2)");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("m.lease_token = p_lease_token");
    expect(migration).toContain("m.lease_expira_em > now()");
  });
  it("todas as funções são invoker e têm search_path vazio e grants fechados", () => {
    expect(migration.match(/security invoker/g)).toHaveLength(3);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(3);
    expect(migration).not.toMatch(/security definer|grant all|to authenticated|to anon/i);
    expect(migration.match(/from public, anon, authenticated, service_role/g)).toHaveLength(3);
  });
  it("estado operacional protegido preserva payloads inertes da 5A", () => {
    expect(migration).toContain("if current_user = 'authenticated'");
    expect(migration).toContain("if new.proxima_execucao_em is not null");
    expect(migration).toContain("is distinct from");
    expect(migration).toContain("errcode = '42501'");
  });
});
