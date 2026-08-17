import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFINICOES_FERRAMENTAS } from "@/lib/servidor/assistente/ferramentas";

describe("ferramentas somente leitura", () => {
  it("nao expoe ferramenta de mutacao", () => {
    expect(DEFINICOES_FERRAMENTAS.map((x) => x.name)).toEqual([
      "buscar_imoveis", "contar_imoveis", "contar_angariacoes", "buscar_marcos_imoveis", "consultar_imovel", "consultar_entidade_atual", "buscar_agenda", "consultar_mensagens_agendadas", "buscar_followups", "buscar_estagnados", "consultar_foco_do_dia", "obter_metricas",
    ]);
  });

  it("nao usa operacoes de escrita e aplica user_id nas consultas", () => {
    const fonte = readFileSync(join(process.cwd(), "lib/servidor/assistente/ferramentas.ts"), "utf8");
    expect(fonte).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
    expect(fonte).toContain('.eq("user_id", userId)');
  });
});
