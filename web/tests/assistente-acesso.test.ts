import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { podeUsarIa, tokenDaRequisicao } from "@/lib/servidor/iaAcesso";

function supabasePermissao(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { cliente: { from } as unknown as SupabaseClient, from, select, eq };
}

describe("acesso ao assistente", () => {
  it("extrai bearer sem aceitar outro esquema", () => {
    expect(tokenDaRequisicao(new Request("http://local", { headers: { authorization: "Bearer abc" } }))).toBe("abc");
    expect(tokenDaRequisicao(new Request("http://local", { headers: { authorization: "Basic abc" } }))).toBe("");
  });

  it("nega por padrao e filtra a permissao pelo usuario autenticado", async () => {
    const fake = supabasePermissao(null);
    await expect(podeUsarIa(fake.cliente, "user-1")).resolves.toBe(false);
    expect(fake.from).toHaveBeenCalledWith("ia_permissoes");
    expect(fake.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("libera somente o booleano true", async () => {
    await expect(podeUsarIa(supabasePermissao({ liberado: true }).cliente, "user-1")).resolves.toBe(true);
    await expect(podeUsarIa(supabasePermissao({ liberado: "true" }).cliente, "user-1")).resolves.toBe(false);
  });
});
