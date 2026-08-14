import { describe, expect, it } from "vitest";
import { normalizarPedidoAssistente } from "@/lib/servidor/assistente/orquestrador";

describe("pedido do assistente", () => {
  it("limita historico e descarta contexto de entidade invalido", () => {
    const historico = Array.from({ length: 20 }, (_, i) => ({ papel: i % 2 ? "assistente" : "usuario", texto: `m${i}` }));
    const pedido = normalizarPedidoAssistente({ mensagem: "  consulte  ", contexto: { rota: "/pipeline", pagina: "Pipeline", entidade: { tipo: "imovel", id: "id com espaco", dados: { segredo: true } } }, historico });
    expect(pedido?.mensagem).toBe("consulte");
    expect(pedido?.historico).toHaveLength(12);
    expect(pedido?.contexto.entidade).toBeUndefined();
    expect(pedido?.contexto).not.toHaveProperty("dados");
  });

  it("rejeita mensagem vazia", () => {
    expect(normalizarPedidoAssistente({ mensagem: "   " })).toBeNull();
  });

  it("descarta drawer de imovel fora do Pipeline", () => {
    const pedido = normalizarPedidoAssistente({
      mensagem: "Qual imovel estou vendo?",
      contexto: { rota: "/agenda", pagina: "Agenda", superficie: "drawer", entidade: { tipo: "imovel", id: "uuid-antigo" } },
    });
    expect(pedido?.contexto.entidade).toBeUndefined();
  });
});
