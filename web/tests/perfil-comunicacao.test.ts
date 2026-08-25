import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PERFIL_COMUNICACAO_PADRAO,
  normalizarPerfilComunicacao,
  textoParaExpressoes,
} from "@/lib/perfilComunicacao";

describe("perfil de comunicação", () => {
  it("usa default seguro para conta existente sem configuração", () => {
    expect(normalizarPerfilComunicacao(null)).toEqual(PERFIL_COMUNICACAO_PADRAO);
  });

  it("normaliza enums e limita listas humanas", () => {
    expect(
      normalizarPerfilComunicacao({
        formalidade: "invalida",
        tamanho: "medio",
        emojis: "nenhum",
        tratamento: "automatico",
        expressoesPreferidas: [" Entendi! ", "entendi!", 42],
      }),
    ).toMatchObject({
      formalidade: "natural",
      tamanho: "medio",
      emojis: "nenhum",
      tratamento: "automatico",
      expressoesPreferidas: ["Entendi!"],
    });
    expect(textoParaExpressoes("Perfeito!\nTranquilo!;Entendi!")).toEqual([
      "Perfeito!",
      "Tranquilo!",
      "Entendi!",
    ]);
  });

  it("mantém perfil na user_config protegida pelo próprio user_id", () => {
    const schema = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
    expect(schema).toContain("perfil_comunicacao jsonb not null");
    expect(schema).toMatch(/create policy "select_own_config"[\s\S]*using \(auth\.uid\(\) = user_id\)/);
    expect(schema).toMatch(/create policy "select_own_protocolos"[\s\S]*using \(auth\.uid\(\) = user_id\)/);
    expect(schema).toMatch(/create policy "select_own_imoveis"[\s\S]*using \(auth\.uid\(\) = user_id\)/);
  });
});
