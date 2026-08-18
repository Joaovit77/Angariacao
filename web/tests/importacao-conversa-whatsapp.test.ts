import { describe, expect, it } from "vitest";
import {
  LIMITE_IMPORTACAO_CONVERSA,
  idExternoDaNotaWhatsapp,
  mesclarMensagensRecentesDaEvolution,
  mensagensRecentesDaEvolution,
  notaDaMensagemImportada,
  type MensagemRecenteWhatsapp,
} from "@/lib/calculo/importacaoConversaWhatsapp";
import { dataUltimaResposta, ehNotaDeResposta } from "@/lib/calculo/notas";
import { selecionarMensagensAtendimento } from "@/lib/ia/atendimento";
import type { Imovel, NotaImovel } from "@/lib/tipos";

function linha(
  id: string,
  texto: string,
  timestamp: number,
  opcoes: { fromMe?: boolean; jid?: string; jidAlt?: string } = {},
) {
  return {
    id: `db-${id}`,
    key: {
      id,
      fromMe: opcoes.fromMe ?? false,
      remoteJid: opcoes.jid ?? "5543998024316@s.whatsapp.net",
      ...(opcoes.jidAlt ? { remoteJidAlt: opcoes.jidAlt } : {}),
    },
    messageType: "conversation",
    message: { conversation: texto },
    messageTimestamp: timestamp,
  };
}

function mensagem(
  id: string,
  texto: string,
  data: string,
  direcao: "recebida" | "enviada",
): MensagemRecenteWhatsapp {
  return { id, texto, data, direcao, tipo: "conversation", jaImportada: false };
}

describe("importação de conversa recente", () => {
  it("aceita o envelope atual, filtra pelo telefone e mantém a ordem cronológica", () => {
    const corpo = {
      messages: {
        total: 3,
        records: [
          linha("2", "Resposta", 1_768_473_660, { fromMe: false }),
          linha("fora", "Outra pessoa", 1_768_473_700, { jid: "5543991112222@s.whatsapp.net" }),
          linha("1", "Abordagem", 1_768_473_600, { fromMe: true }),
        ],
      },
    };
    const resultado = mensagensRecentesDaEvolution(corpo, "(43) 99802-4316", []);
    expect(resultado.map((item) => [item.id, item.direcao, item.texto])).toEqual([
      ["1", "enviada", "Abordagem"],
      ["2", "recebida", "Resposta"],
    ]);
    expect(resultado[0].data).toMatch(/^2026-01-/);
  });

  it("usa remoteJidAlt para conferir com segurança mensagens no formato LID", () => {
    const corpo = [
      linha("lid", "Mensagem pelo LID", 1_768_473_600, {
        jid: "123456789012345@lid",
        jidAlt: "5543998024316@s.whatsapp.net",
      }),
    ];
    expect(mensagensRecentesDaEvolution(corpo, "43998024316", [])).toHaveLength(1);
  });

  it("não confia em LID sem número alternativo, mesmo que a Evolution o devolva", () => {
    const corpo = [linha("lid", "Sem vínculo verificável", 1_768_473_600, { jid: "123456789012345@lid" })];
    expect(mensagensRecentesDaEvolution(corpo, "43998024316", [])).toEqual([]);
  });

  it("reconhece mensagens já registradas por webhook, envio e importação", () => {
    const notas = [
      { id: "wa:recebida", texto: "x", data: "2026-01-01T10:00" },
      { id: "wa-enviada:enviada", texto: "x", data: "2026-01-01T10:01" },
      notaDaMensagemImportada(mensagem("importada", "x", "2026-01-01T10:02", "recebida")),
    ] as NotaImovel[];
    expect(notas.map(idExternoDaNotaWhatsapp)).toEqual(["recebida", "enviada", "importada"]);

    const corpo = {
      messages: {
        records: [
          linha("recebida", "A", 1_768_473_600),
          linha("enviada", "B", 1_768_473_601, { fromMe: true }),
          linha("importada", "C", 1_768_473_602),
        ],
      },
    };
    expect(mensagensRecentesDaEvolution(corpo, "43998024316", notas).every((m) => m.jaImportada)).toBe(true);
  });

  it("limita a janela às mensagens mais recentes", () => {
    const records = Array.from({ length: LIMITE_IMPORTACAO_CONVERSA + 5 }, (_, indice) =>
      linha(String(indice), `m-${indice}`, 1_768_473_600 + indice),
    );
    const resultado = mensagensRecentesDaEvolution({ messages: { records } }, "43998024316", []);
    expect(resultado).toHaveLength(LIMITE_IMPORTACAO_CONVERSA);
    expect(resultado[0].id).toBe("5");
  });

  it("reúne respostas parciais sem deixar as mensagens recentes esconderem o histórico", () => {
    const notas = [{ id: "wa:recente", texto: "x", data: "2026-08-18T16:41" }] as NotaImovel[];
    const respostaParcial = {
      messages: { records: [linha("recente", "Ah entendi", 1_776_527_660)] },
    };
    const respostaFiltrada = {
      messages: {
        records: [
          linha("antiga-1", "Mensagem anterior", 1_776_441_200, { fromMe: true }),
          linha("antiga-2", "Resposta anterior", 1_776_441_260),
          linha("recente", "Ah entendi", 1_776_527_660),
        ],
      },
    };

    const resultado = mesclarMensagensRecentesDaEvolution(
      [respostaParcial, respostaFiltrada],
      "43998024316",
      notas,
    );

    expect(resultado.map((item) => item.id)).toEqual(["antiga-1", "antiga-2", "recente"]);
    expect(resultado.find((item) => item.id === "recente")?.jaImportada).toBe(true);
  });

  it("a mensagem importada entra no contexto da IA, mas não vira resposta operacional", () => {
    const enviada = notaDaMensagemImportada(mensagem("1", "Tenho interesse em administrar seu imóvel.", "2026-08-10T09:00:00", "enviada"));
    const recebida = notaDaMensagemImportada(mensagem("2", "Qual é a taxa de administração?", "2026-08-10T09:05:00", "recebida"));
    const imovel = { id: "i", status: "Novo contato", notas: [enviada, recebida] } as Imovel;

    const selecao = selecionarMensagensAtendimento(imovel);
    expect(selecao.anteriores).toEqual([
      { autor: "corretor", texto: "Tenho interesse em administrar seu imóvel." },
    ]);
    expect(selecao.mensagemAtual).toBe("Qual é a taxa de administração?");
    expect(ehNotaDeResposta(recebida)).toBe(false);
    expect(dataUltimaResposta(imovel.notas)).toBeNull();
    expect(recebida.lida).toBe(true);
  });

  it("preserva mídia como marcador de contexto, sem inventar transcrição", () => {
    const corpo = {
      messages: {
        records: [
          {
            ...linha("audio", "", 1_768_473_600),
            messageType: "audioMessage",
            message: { audioMessage: { url: "privada" } },
          },
        ],
      },
    };
    expect(mensagensRecentesDaEvolution(corpo, "43998024316", [])[0].texto).toBe("[áudio]");
  });
});
