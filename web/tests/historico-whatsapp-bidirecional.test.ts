import { describe, expect, it, vi } from "vitest";
import {
  MAX_MENSAGENS_ATENDIMENTO,
  contextoAtendimentoDoImovel,
  conversaAtendimento,
  promptDecidirAtendimento,
  selecionarMensagensAtendimento,
} from "@/lib/ia/atendimento";
import {
  notaDaMensagemEnviada,
} from "@/lib/calculo/notas";
import { notaDaResposta } from "@/lib/calculo/webhookWhatsapp";
import { idMensagemEvolution, registrarMensagemEnviada } from "@/lib/servidor/historicoWhatsapp";
import type { Imovel, NotaImovel } from "@/lib/tipos";

function recebida(id: string, texto: string, data: string, moderna = true): NotaImovel {
  return {
    id: `wa:${id}`,
    texto: `Resposta pelo WhatsApp: ${texto}`,
    data,
    ...(moderna
      ? { direcao: "recebida" as const, autor: "proprietario" as const, origem: "webhook-evolution" as const }
      : {}),
  };
}

function enviada(id: string, texto: string, data: string): NotaImovel {
  return notaDaMensagemEnviada(id, texto, data, "webhook-evolution");
}

function imovel(notas: NotaImovel[]): Imovel {
  return { id: "imovel-1", status: "Em negociação", notas } as Imovel;
}

describe("histórico bidirecional do atendimento", () => {
  it("1. preserva alternância entre proprietário e corretor", () => {
    const selecao = selecionarMensagensAtendimento(imovel([
      recebida("1", "Qual é a taxa?", "2026-08-17T09:00"),
      enviada("2", "A administração é de 10%.", "2026-08-17T09:01"),
      recebida("3", "E esse valor é sobre o aluguel?", "2026-08-17T09:02"),
    ]));
    expect(selecao.anteriores).toEqual([
      { autor: "proprietario", texto: "Qual é a taxa?" },
      { autor: "corretor", texto: "A administração é de 10%." },
    ]);
    expect(selecao.mensagemAtual).toBe("E esse valor é sobre o aluguel?");
    expect(selecao.historicoBidirecional).toBe(true);
    expect(selecao.classificacaoHistorico).toBe("historico_completo");
  });

  it("2. mantém duas mensagens consecutivas do proprietário", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("1", "Boa tarde", "2026-08-17T09:00"),
      recebida("2", "Qual é a taxa?", "2026-08-17T09:01"),
    ]));
    expect(s.anteriores).toEqual([{ autor: "proprietario", texto: "Boa tarde" }]);
    expect(s.mensagemAtual).toBe("Qual é a taxa?");
  });

  it("3. mantém duas mensagens consecutivas do corretor", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("1", "Como funciona?", "2026-08-17T09:00"),
      enviada("2", "Cuidamos da administração.", "2026-08-17T09:01"),
      enviada("3", "A taxa é de 10%.", "2026-08-17T09:02"),
      recebida("4", "Sobre qual valor?", "2026-08-17T09:03"),
    ]));
    expect(s.anteriores.slice(-2)).toEqual([
      { autor: "corretor", texto: "Cuidamos da administração." },
      { autor: "corretor", texto: "A taxa é de 10%." },
    ]);
  });

  it("4. lê histórico antigo contendo somente mensagens recebidas", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("antiga-1", "Oi", "2026-07-01T10:00", false),
      recebida("antiga-2", "Ainda está aí?", "2026-07-01T10:01", false),
    ]));
    expect(s.classificacaoHistorico).toBe("somente_recebidas");
    expect(s.origemHistorico).toBe("notas-recebidas-legadas");
  });

  it("5. sugestão da IA não enviada não entra no histórico", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("1", "Qual é a garantia?", "2026-08-17T09:00"),
    ]));
    const conversa = conversaAtendimento(s, null);
    const prompt = promptDecidirAtendimento(
      s.mensagemAtual,
      contextoAtendimentoDoImovel(imovel([])),
      conversa,
      [],
    );
    expect(prompt).not.toContain("Sugestão ainda não enviada");
    expect(s.mensagensEnviadas).toBe(0);
  });

  it("6. mensagem aceita para envio é persistida com texto, direção e origem", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const resultado = await registrarMensagemEnviada({ rpc } as never, {
      imovelId: "imovel-1",
      userId: "usuario-1",
      mensagemId: "evolution-1",
      texto: "Mensagem realmente enviada",
      data: "2026-08-17T09:01",
      origem: "api-evolution",
    });
    expect(resultado).toEqual({ gravou: true, erro: null });
    expect(rpc.mock.calls[0][1].p_nota).toMatchObject({
      id: "wa-enviada:evolution-1",
      direcao: "enviada",
      autor: "corretor",
      origem: "api-evolution",
      texto: "Mensagem enviada pelo WhatsApp: Mensagem realmente enviada",
    });
  });

  it("7. o mesmo evento gera o mesmo id e a segunda gravação é duplicata", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    const base = {
      imovelId: "imovel-1", userId: "usuario-1", mensagemId: "mesmo-evento",
      texto: "Oi", data: "2026-08-17T09:01", origem: "webhook-evolution" as const,
    };
    expect((await registrarMensagemEnviada({ rpc } as never, base)).gravou).toBe(true);
    expect((await registrarMensagemEnviada({ rpc } as never, base)).gravou).toBe(false);
    expect(rpc.mock.calls[0][1].p_nota.id).toBe(rpc.mock.calls[1][1].p_nota.id);
  });

  it("8. ordena por timestamp e desempata deterministicamente pelo id", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("z", "Atual", "2026-08-17T09:03"),
      enviada("b", "Segundo no empate", "2026-08-17T09:01"),
      recebida("a", "Primeiro no empate", "2026-08-17T09:01"),
    ]));
    expect(s.anteriores.map((m) => m.texto)).toEqual(["Segundo no empate", "Primeiro no empate"]);
    expect(selecionarMensagensAtendimento(imovel([
      recebida("z", "Atual", "2026-08-17T09:03"),
      enviada("b", "Segundo no empate", "2026-08-17T09:01"),
      recebida("a", "Primeiro no empate", "2026-08-17T09:01"),
    ])).anteriores).toEqual(s.anteriores);
  });

  it("9. limita o contexto a 12 mensagens anteriores, sem aumentar a janela", () => {
    const notas = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0
        ? recebida(String(i), `recebida-${i}`, `2026-08-17T09:${String(i).padStart(2, "0")}`)
        : enviada(String(i), `enviada-${i}`, `2026-08-17T09:${String(i).padStart(2, "0")}`),
    );
    notas.push(recebida("atual", "Mensagem atual", "2026-08-17T10:00"));
    const s = selecionarMensagensAtendimento(imovel(notas));
    expect(s.anteriores).toHaveLength(MAX_MENSAGENS_ATENDIMENTO);
    expect(s.mensagensSelecionadas).toBe(MAX_MENSAGENS_ATENDIMENTO + 1);
  });

  it("10. entrega ao agente a fala do corretor referenciada por 'esse valor'", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("1", "Qual é a taxa?", "2026-08-17T09:00"),
      enviada("2", "A administração é de 10%.", "2026-08-17T09:01"),
      recebida("3", "E esse valor é sobre o aluguel?", "2026-08-17T09:02"),
    ]));
    const prompt = promptDecidirAtendimento(
      s.mensagemAtual,
      contextoAtendimentoDoImovel(imovel([])),
      conversaAtendimento(s, null),
      [],
    );
    expect(prompt).toContain("CORRETOR: A administração é de 10%.");
    expect(prompt.indexOf("CORRETOR:")).toBeLessThan(prompt.indexOf("E esse valor"));
  });

  it("11. usa a última abordagem somente como fallback de registro legado", () => {
    const legado = selecionarMensagensAtendimento(imovel([
      recebida("1", "Tenho uma dúvida", "2026-08-17T09:00", false),
    ]));
    const fallback = { rotulo: "Captação", texto: "Podemos conversar?" };
    expect(conversaAtendimento(legado, fallback).enviada).toEqual(fallback);

    const moderno = selecionarMensagensAtendimento(imovel([
      enviada("0", "Mensagem real", "2026-08-17T08:59"),
      recebida("1", "Tenho uma dúvida", "2026-08-17T09:00"),
    ]));
    expect(conversaAtendimento(moderno, fallback).enviada).toBeNull();
  });

  it("12. degrada com segurança quando uma nota de saída está parcialmente corrompida", () => {
    const notas = [
      { id: "wa-enviada:ruim", texto: 42, data: "2026-08-17T09:00", direcao: "enviada" },
      recebida("1", "Texto válido", "2026-08-17T09:01"),
    ] as unknown as NotaImovel[];
    const s = selecionarMensagensAtendimento(imovel(notas));
    expect(s.mensagemAtual).toBe("Texto válido");
    expect(s.mensagensDescartadasVazias).toBe(1);
  });

  it("13. envia imóvel e usuário ao RPC que aplica o isolamento", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await registrarMensagemEnviada({ rpc } as never, {
      imovelId: "imovel-do-usuario-a", userId: "usuario-a", mensagemId: "x",
      texto: "Oi", data: "2026-08-17T09:00", origem: "api-evolution",
    });
    expect(rpc).toHaveBeenCalledWith("registrar_nota_imovel", expect.objectContaining({
      p_imovel_id: "imovel-do-usuario-a",
      p_user_id: "usuario-a",
    }));
  });

  it("14. a mesma entrada produz o mesmo contexto estrutural", () => {
    const entrada = imovel([
      recebida("2", "Atual", "2026-08-17T09:02"),
      enviada("1", "Resposta", "2026-08-17T09:01"),
      recebida("0", "Pergunta", "2026-08-17T09:00"),
    ]);
    expect(selecionarMensagensAtendimento(entrada)).toEqual(selecionarMensagensAtendimento(entrada));
  });

  it("não reapresenta como pendente uma entrada que já tem saída posterior", () => {
    const s = selecionarMensagensAtendimento(imovel([
      recebida("1", "Qual é a taxa?", "2026-08-17T09:00:01"),
      enviada("2", "A taxa é de 10%.", "2026-08-17T09:00:02"),
    ]));
    expect(s.mensagemAtual).toBe("");
    expect(s.mensagensSelecionadas).toBe(0);
  });
});

describe("contrato com a Evolution", () => {
  it("lê o id de resposta usado para deduplicar API e webhook", () => {
    expect(idMensagemEvolution({ key: { id: "ABC" } })).toBe("ABC");
    expect(idMensagemEvolution({ data: { key: { id: "DEF" } } })).toBe("DEF");
    expect(idMensagemEvolution({ ok: true })).toBeNull();
  });

  it("a nota recebida nova também declara autor e direção", () => {
    const nota = notaDaResposta({
      instancia: "i", mensagemId: "r", telefone: "4398024316",
      texto: "Olá", tipo: "conversation", direcao: "recebida",
    }, "2026-08-17T09:00");
    expect(nota).toMatchObject({ direcao: "recebida", autor: "proprietario", origem: "webhook-evolution" });
  });
});
