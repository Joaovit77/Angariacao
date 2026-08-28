import { describe, expect, it } from "vitest";
import { notificacoesDaCentral, tempoRelativoNotificacao } from "@/lib/calculo/notificacoes";
import type { Imovel } from "@/lib/tipos";

function imovel(parcial: Partial<Imovel>): Imovel {
  return {
    id: "imovel-1",
    endereco: "Rua Paraná, 123",
    status: "Em negociação",
    ...parcial,
  };
}

describe("central de notificações", () => {
  it("materializa mensagens e eventos persistidos, ordenados e contextualizados", () => {
    const notificacoes = notificacoesDaCentral([
      imovel({
        codigo: "LD-258",
        proprietarioNome: "Marta",
        notas: [
          {
            id: "wa:mensagem-1",
            texto: "Resposta pelo WhatsApp: Este imóvel já foi locado",
            data: "2026-08-28T14:31:00",
          },
          {
            id: "sophia:evento-1",
            texto: "Comissão paga pelo Sistema Principal",
            data: "2026-08-28T15:00:00",
            lida: true,
          },
          {
            id: "nota-manual",
            texto: "Ligar na semana que vem",
            data: "2026-08-28T16:00:00",
          },
        ],
      }),
    ]);

    expect(notificacoes).toHaveLength(2);
    expect(notificacoes[0]).toMatchObject({
      id: "imovel-1:sophia:evento-1",
      tipo: "evento-sistema",
      titulo: "Comissão paga pelo Sistema Principal",
      descricao: "LD-258 · Rua Paraná, 123",
      lida: true,
      destino: "imovel",
    });
    expect(notificacoes[1]).toMatchObject({
      id: "imovel-1:wa:mensagem-1",
      tipo: "mensagem-recebida",
      titulo: "Marta respondeu",
      descricao: "Este imóvel já foi locado",
      lida: false,
      destino: "conversa",
    });
  });

  it("deduplica pelo evento estável sem misturar imóveis distintos", () => {
    const nota = {
      id: "wa:externo-1",
      texto: "Resposta pelo WhatsApp: Olá",
      data: "2026-08-28T14:00:00",
    };
    const notificacoes = notificacoesDaCentral([
      imovel({ notas: [nota, { ...nota }] }),
      imovel({ id: "imovel-2", endereco: "Rua A", notas: [{ ...nota }] }),
    ]);
    expect(notificacoes.map((item) => item.id)).toEqual([
      "imovel-2:wa:externo-1",
      "imovel-1:wa:externo-1",
    ]);
  });

  it("formata horário relativo sem transformar data inválida em informação falsa", () => {
    const agora = new Date("2026-08-28T15:00:00").getTime();
    expect(tempoRelativoNotificacao("2026-08-28T14:58:00", agora)).toBe("Há 2 min");
    expect(tempoRelativoNotificacao("2026-08-28T12:00:00", agora)).toBe("Há 3 h");
    expect(tempoRelativoNotificacao("", agora)).toBe("Horário não informado");
  });
});
