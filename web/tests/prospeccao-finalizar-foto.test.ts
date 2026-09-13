import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raiz = new URL("../../", import.meta.url);
const sql = readFileSync(
  new URL("supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql", raiz),
  "utf8",
).replace(/\r\n/g, "\n");
const fn = sql.match(
  /create or replace function public\.finalizar_foto_avistamento\([\s\S]*?\n\$\$;/i,
)?.[0] ?? "";

describe("C5 — prova de finalização da foto", () => {
  it("consulta os dois objetos antes da ativação", () => {
    expect(fn).toContain("o.name = v_foto.caminho");
    expect(fn).toContain("o.name = v_foto.caminho_miniatura");
    const ativacao = fn.indexOf("set estado = 'ativa'");
    expect(ativacao).toBeGreaterThan(fn.indexOf("'nenhum_objeto'"));
    expect(ativacao).toBeGreaterThan(fn.indexOf("'miniatura_ausente'"));
    expect(ativacao).toBeGreaterThan(fn.indexOf("'original_ausente'"));
  });

  it("mantém a reserva em cada combinação incompleta", () => {
    expect(fn).toMatch(/not v_tem_original and not v_tem_miniatura[\s\S]*?'nenhum_objeto'/);
    expect(fn).toMatch(/v_tem_original and not v_tem_miniatura[\s\S]*?'miniatura_ausente'/);
    expect(fn).toMatch(/v_tem_miniatura and not v_tem_original[\s\S]*?'original_ausente'/);
    expect(fn.match(/set estado = 'ativa'/g)).toHaveLength(1);
  });

  it("é idempotente ativa + ambos e não rebaixa ativa + ausente", () => {
    const ramoAtiva = fn.match(
      /if v_foto\.estado = 'ativa' then[\s\S]*?\n  end if;/i,
    )?.[0] ?? "";
    expect(ramoAtiva).toContain("v_tem_original and v_tem_miniatura");
    expect(ramoAtiva).toContain("'repetida', true");
    expect(ramoAtiva).toContain("'codigo', 'objeto_ausente'");
    expect(ramoAtiva).not.toMatch(/set estado|update public\.imoveis_identificados_fotos/i);
  });
});
