import { afterEach, describe, expect, it, vi } from "vitest";

const getSupabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase }));

import { buscarNaCentral } from "@/lib/centralAngariacao";

describe("iniciador declarado pela Central", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(["monitor_navegador", "verificar_agora", "pesquisar"] as const)(
    "envia %s sem alterar filtros ou resposta",
    async (iniciador) => {
      getSupabase.mockReturnValue({ auth: { getSession: vi.fn(async () => ({
        data: { session: { access_token: "token-fixture" } },
      })) } });
      const fetchFalso = vi.fn(async () => new Response(JSON.stringify({
        ok: true, anuncios: [], urlPesquisa: "", execucaoId: "id-gerado-pelo-servidor",
      })));
      vi.stubGlobal("fetch", fetchFalso);
      const filtros = { portal: "olx" as const, cidade: "Londrina", estado: "PR" };
      const resposta = await buscarNaCentral(filtros, iniciador);
      const [url, opcoes] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/central-angariacao/buscar");
      expect(opcoes.headers).toMatchObject({ "x-angario-iniciador": iniciador });
      expect(JSON.parse(String(opcoes.body))).toEqual(filtros);
      expect(resposta).toMatchObject({ ok: true, execucaoId: "id-gerado-pelo-servidor" });
    },
  );
});
