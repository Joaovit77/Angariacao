/* ================================================================
   C5b — DESCARTAR ≠ EXCLUIR (§13.3)

   Descartar é a ação cotidiana: `situacao = 'descartado'` por
   `definir_situacao_identificado`, preservando avistamentos, fotos,
   classificações, etiquetas e datas. Estes testes travam que o descarte
   NUNCA se aproxima do hard delete: não chama a rota, não toca Storage,
   não apaga linha — e que a lista o esconde por padrão, com filtro para
   revê-lo.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { descartarIdentificado, listarIdentificados, SITUACOES_VISIVEIS_PROSPECCAO } from "@/lib/prospeccao";

const RAIZ = resolve("..");
const lerSql = (relativo: string) =>
  readFileSync(resolve(RAIZ, relativo), "utf8").replace(/\r\n/g, "\n");
const MIGRATION_C2E = lerSql("supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql");

function funcao(sql: string, nome: string): string {
  const trecho = sql.match(
    new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente.`);
  return trecho;
}

describe("descartar preserva o histórico", () => {
  it("é um update de situação por RPC do navegador, sem delete, sem Storage e sem rota", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, repetida: false }, error: null }));
    const from = vi.fn();
    const storage = { from: vi.fn() };
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const client = { rpc, from, storage } as unknown as SupabaseClient;

    const resultado = await descartarIdentificado("identificado-1", "Sem interesse", client);

    expect(resultado).toEqual({ repetida: false });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("definir_situacao_identificado", {
      p_imovel_identificado_id: "identificado-1",
      p_situacao: "descartado",
      p_motivo: "Sem interesse",
    });
    expect(from).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
    expect(fetchFalso).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("no banco, definir_situacao_identificado só atualiza a identidade — nunca apaga nem toca fotos", () => {
    const corpo = funcao(MIGRATION_C2E, "definir_situacao_identificado");
    expect(corpo).toMatch(/update public\.imoveis_identificados/i);
    expect(corpo).not.toMatch(/\bdelete\b/i);
    expect(corpo).not.toMatch(/imoveis_identificados_(?:fotos|avistamentos|classificacoes|etiquetas)/i);
    expect(corpo).not.toMatch(/storage\./i);
    expect(corpo).toMatch(/descartado_em/);
    expect(corpo).toMatch(/descartado_motivo/);
    // Descartado pode ser reavistado e voltar: a RPC aceita a transição inversa.
    expect(corpo).toMatch(/'identificado'/);
    // E a exclusão em andamento bloqueia a troca de situação (§13.4).
    expect(corpo).toMatch(/exclusao_em_andamento/);
  });

  it("descartar não é exclusão coordenada: a UI usa `descartar`, e só o botão próprio abre o hard delete", () => {
    const painel = readFileSync(resolve("components/prospeccao/PainelIdentificado.tsx"), "utf8");
    const descarte = painel.match(/async function confirmarDescarte\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(descarte).toContain("await descartar(item.id");
    expect(descarte).not.toMatch(/excluir|removerFoto|DialogoExcluirIdentificado/);
    expect(painel).toContain("Descartar esta identificação e preservar todo o histórico?");
  });
});

describe("a lista esconde o descartado por padrão e o filtro o traz de volta", () => {
  function clienteDeListagem() {
    const encadeavel = {
      select: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn(),
      then: (resolver: (valor: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null, count: 0 }).then(resolver),
    };
    for (const chave of ["select", "in", "is", "order", "range"] as const) {
      encadeavel[chave].mockReturnValue(encadeavel);
    }
    return { client: { from: vi.fn(() => encadeavel) } as unknown as SupabaseClient, encadeavel };
  }

  it("descartado e fundido ficam fora das situações visíveis", () => {
    expect(SITUACOES_VISIVEIS_PROSPECCAO).not.toContain("descartado");
    expect(SITUACOES_VISIVEIS_PROSPECCAO).not.toContain("fundido");
    expect(SITUACOES_VISIVEIS_PROSPECCAO).toEqual(["identificado", "investigando", "promovendo", "promovido"]);
  });

  it("por padrão filtra por situação visível e sem exclusão pendente; com incluirOcultos não filtra", async () => {
    const { client, encadeavel } = clienteDeListagem();
    await listarIdentificados({}, client);
    expect(encadeavel.in).toHaveBeenCalledWith("situacao", [...SITUACOES_VISIVEIS_PROSPECCAO]);
    expect(encadeavel.is).toHaveBeenCalledWith("exclusao_solicitada_em", null);

    const oculto = clienteDeListagem();
    await listarIdentificados({ incluirOcultos: true }, oculto.client);
    expect(oculto.encadeavel.in).not.toHaveBeenCalled();
    expect(oculto.encadeavel.is).not.toHaveBeenCalled();
  });
});
