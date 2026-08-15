import { describe, expect, it, vi } from "vitest";
import {
  TIPOS_PEDIDO_IA,
  despacharPedidoIa,
  ehTipoPedidoIa,
  type ContextoHandlerIa,
  type HandlerIa,
} from "@/lib/servidor/ia/dispatcher";

const base = {
  corpo: { tipo: "rascunhar-resposta", imovelId: "imovel-1" },
  supabase: {} as ContextoHandlerIa["supabase"],
  userId: "usuario-1",
  executor: {} as ContextoHandlerIa["executor"],
};

describe("dispatcher de IA", () => {
  it("preserva todos os tipos aceitos pela rota", () => {
    expect(TIPOS_PEDIDO_IA).toEqual([
      "sugerir-roteiros",
      "analisar-abordagens",
      "analisar-dashboard",
      "analisar-mapa",
      "resumo-dia",
      "explicar-foco",
      "extrair-anuncio",
      "rascunhar-resposta",
      "gerar-anuncio",
      "abordagem-anuncio",
    ]);
    for (const tipo of TIPOS_PEDIDO_IA) expect(ehTipoPedidoIa(tipo)).toBe(true);
    expect(ehTipoPedidoIa("outro")).toBe(false);
    expect(ehTipoPedidoIa(null)).toBe(false);
  });

  it("devolve null para domínio ainda mantido no fluxo legado", async () => {
    const resposta = await despacharPedidoIa(
      "gerar-anuncio",
      { ...base, corpo: { tipo: "gerar-anuncio" } },
      {},
    );
    expect(resposta).toBeNull();
  });

  it("encaminha atendimento ao handler tipado sem alterar o contexto", async () => {
    const esperado = Response.json({ ok: true, rascunho: "Resposta" });
    const handler: HandlerIa<"rascunhar-resposta"> = vi.fn(async () => esperado);

    const resposta = await despacharPedidoIa("rascunhar-resposta", base, {
      "rascunhar-resposta": handler,
    });

    expect(resposta).toBe(esperado);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ ...base, tipo: "rascunhar-resposta" });
  });
});
