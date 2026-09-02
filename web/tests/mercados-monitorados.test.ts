import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  identidadeMercadoMonitorado,
  normalizarEntradaMercadoMonitorado,
} from "@/lib/calculo/mercadosMonitorados";

const schema = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/20260901120000_fase5a_mercados_multiestado.sql", import.meta.url),
  "utf8",
);

describe("domínio de mercados monitorados", () => {
  it("normaliza cidade e UF com a mesma chave consolidada do produto", () => {
    expect(normalizarEntradaMercadoMonitorado({
      cidade: "  São   José dos Pinhais ",
      estado: " pr ",
      finalidade: "locacao",
      segmento: "residencial",
    })).toEqual({
      cidade: "São José dos Pinhais",
      estado: "PR",
      cidadeChave: "sao jose dos pinhais",
      finalidade: "locacao",
      segmento: "residencial",
      frequenciaDias: 30,
    });
    expect(normalizarEntradaMercadoMonitorado({
      cidade: "Sa\u0303o Paulo",
      estado: "São Paulo",
      finalidade: "locacao",
      segmento: "residencial",
    })).toMatchObject({ cidade: "São Paulo", estado: "SP", cidadeChave: "sao paulo" });
  });

  it("recusa UF inválida, cidade vazia e frequência fora do intervalo", () => {
    expect(() => normalizarEntradaMercadoMonitorado({
      cidade: "",
      estado: "PR",
      finalidade: "locacao",
      segmento: "residencial",
    })).toThrow(/cidade/i);
    expect(() => normalizarEntradaMercadoMonitorado({
      cidade: "Campinas",
      estado: "XX",
      finalidade: "locacao",
      segmento: "residencial",
    })).toThrow(/UF/i);
    expect(() => normalizarEntradaMercadoMonitorado({
      cidade: "Campinas",
      estado: "SP",
      finalidade: "locacao",
      segmento: "residencial",
      frequenciaDias: 0,
    })).toThrow(/frequência/i);
  });

  it("usa UF, finalidade e segmento na identidade sem colisões falsas", () => {
    const base = normalizarEntradaMercadoMonitorado({
      cidade: "Londrina",
      estado: "PR",
      finalidade: "locacao",
      segmento: "residencial",
    });
    expect(identidadeMercadoMonitorado(base)).toBe("PR:londrina:locacao:residencial");
    expect(identidadeMercadoMonitorado({ ...base, estado: "SP" }))
      .not.toBe(identidadeMercadoMonitorado(base));
    expect(identidadeMercadoMonitorado({ ...base, finalidade: "venda" }))
      .not.toBe(identidadeMercadoMonitorado(base));
    expect(identidadeMercadoMonitorado({ ...base, segmento: "comercial" }))
      .not.toBe(identidadeMercadoMonitorado(base));
  });

  it("persiste a unicidade composta, constraints e somente dois índices operacionais", () => {
    expect(schema).toContain("create table if not exists mercados_monitorados");
    expect(schema).toContain("unique (user_id, estado, cidade_chave, finalidade, segmento)");
    expect(schema).toContain("cidade_chave text generated always as");
    expect(schema).toContain("regexp_replace(normalize(trim(cidade), NFC), '[[:space:]]+', ' ', 'g')");
    expect(schema).toContain("frequencia_dias between 1 and 365");
    expect(schema).toContain("idx_mercados_monitorados_user_ativo");
    expect(schema).toContain("idx_mercados_monitorados_ativos_vencidos");
    expect(schema).toContain("trg_mercados_monitorados_updated_at");
    expect(migration).toContain("proxima_execucao_em timestamptz");
    expect(migration).toContain("lease_token uuid");
    expect(migration).toContain("lease_expira_em timestamptz");
  });

  it("isola leitura, criação, edição e exclusão por auth.uid", () => {
    expect(schema).toContain('create policy "select_own_mercados_monitorados"');
    expect(schema).toContain('create policy "insert_own_mercados_monitorados"');
    expect(schema).toContain('create policy "update_own_mercados_monitorados"');
    expect(schema).toContain('create policy "delete_own_mercados_monitorados"');
    expect(schema.match(/\(select auth\.uid\(\)\) = user_id/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain(
      "revoke all on table public.mercados_monitorados from anon, authenticated, service_role",
    );
    expect(schema).toContain("grant select, insert, update, delete on table mercados_monitorados to authenticated");
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.mercados_monitorados to service_role",
    );
  });

  it("não introduz cron, job ou claim antes da Fase 5B", () => {
    expect(migration).not.toMatch(/create\s+table\s+.*(?:jobs|execucoes|cobertura|ausencia)/i);
    expect(migration).not.toMatch(/create\s+(?:or\s+replace\s+)?function\s+.*claim/i);
    expect(migration).not.toMatch(/cron\./i);
  });

  it("não inventa PR para comparáveis antigos e conserva a UF no histórico", () => {
    expect(migration).toContain("where estado is not null");
    expect(migration).not.toMatch(/set\s+estado\s*=\s*['\"]PR['\"]/i);
    expect(migration).toContain("'estado', new.estado");
  });
});
