/* Testes de carregarEstado (Etapa 3) — port do loadState() legado.
   Usa um cliente Supabase fake para verificar o mapeamento das 4
   tabelas, a montagem das metas por month_key, o default de config
   e a propagação de erro (com o comportamento legado de IGNORAR
   erro em user_config). */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarEstado } from "@/lib/persistencia/carregarEstado";
import dbJson from "./fixtures-db.json";

type Resultado = { data: unknown; error: unknown };

function clienteFake(tabelas: Record<string, Resultado>): SupabaseClient {
  return {
    from(tabela: string) {
      const res = tabelas[tabela] ?? { data: null, error: null };
      const promessa = Promise.resolve(res);
      return {
        select: () =>
          Object.assign(promessa, {
            maybeSingle: () => Promise.resolve(res),
          }),
      };
    },
  } as unknown as SupabaseClient;
}

const METAS_ROWS = [
  { user_id: "u", month_key: "2026-06", angariacoes: 4, locados: 2, comissao: "4000", faturamento: "15000" },
  // Linha sem a coluna faturamento (banco anterior à migração) — vira 0.
  { user_id: "u", month_key: "2026-07", angariacoes: null, locados: null, comissao: null },
];

describe("carregarEstado", () => {
  it("mapeia as 4 tabelas para o shape do STATE legado", async () => {
    const estado = await carregarEstado(clienteFake({
      imoveis: { data: dbJson.imoveisRows, error: null },
      metas: { data: METAS_ROWS, error: null },
      agenda: { data: dbJson.agendaRows, error: null },
      user_config: { data: { user_id: "u", comissao_percent: "50", agenda_tipos: ["Avaliação", "Fotos"] }, error: null },
    }));
    expect(estado.imoveis).toHaveLength(dbJson.imoveisRows.length);
    expect(estado.imoveis[0].valorAluguel).toBe(3500.5); // Number() aplicado
    expect(estado.agenda).toHaveLength(2);
    // metas por month_key, com coerções do app antigo (null -> 0, string -> Number)
    expect(estado.metas).toEqual({
      "2026-06": { angariacoes: 4, locados: 2, comissao: 4000, faturamento: 15000 },
      "2026-07": { angariacoes: 0, locados: 0, comissao: 0, faturamento: 0 },
    });
    // agenda_tipos (jsonb) vira o array de tipos personalizados
    expect(estado.config).toEqual({ comissaoPercent: 50, agendaTipos: ["Avaliação", "Fotos"] });
  });

  it("sem linha de user_config, vale o default comissaoPercent = 100", async () => {
    const estado = await carregarEstado(clienteFake({
      imoveis: { data: [], error: null },
      metas: { data: [], error: null },
      agenda: { data: [], error: null },
      user_config: { data: null, error: null },
    }));
    expect(estado.config).toEqual({ comissaoPercent: 100, agendaTipos: [] });
    expect(estado.imoveis).toEqual([]);
    expect(estado.metas).toEqual({});
    expect(estado.agenda).toEqual([]);
  });

  it("erro em imoveis/metas/agenda propaga (quem chama reverte e avisa)", async () => {
    await expect(carregarEstado(clienteFake({
      imoveis: { data: null, error: new Error("RLS negou") },
      metas: { data: [], error: null },
      agenda: { data: [], error: null },
      user_config: { data: null, error: null },
    }))).rejects.toThrow("RLS negou");
  });

  it("comportamento legado: erro em user_config NÃO derruba o carregamento", async () => {
    const estado = await carregarEstado(clienteFake({
      imoveis: { data: [], error: null },
      metas: { data: [], error: null },
      agenda: { data: [], error: null },
      user_config: { data: null, error: new Error("config indisponível") },
    }));
    expect(estado.config).toEqual({ comissaoPercent: 100, agendaTipos: [] });
  });

  it("data null nas tabelas vira coleção vazia (paridade com `|| []` legado)", async () => {
    const estado = await carregarEstado(clienteFake({
      imoveis: { data: null, error: null },
      metas: { data: null, error: null },
      agenda: { data: null, error: null },
      user_config: { data: null, error: null },
    }));
    expect(estado.imoveis).toEqual([]);
    expect(estado.metas).toEqual({});
    expect(estado.agenda).toEqual([]);
  });
});
