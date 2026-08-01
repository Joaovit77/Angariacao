/* Testes da chegada de resposta ao vivo (calculo/chegadaResposta.ts).

   O que estes testes guardam, em ordem de importância:
   1. sem retrato ANTERIOR não há aviso — um imóvel que o painel nunca viu
      chega com o histórico inteiro, e o LD-156 real tem 64 respostas;
   2. só mensagem do PROPRIETÁRIO avisa: a nota do encerramento automático
      nasce com o mesmo prefixo `wa:` e é o próprio app falando;
   3. a nossa própria escrita não vira aviso (é o caso de todo dia — cada
      tentativa registrada devolve um evento do Realtime);
   4. rajada de mensagens curtas vira UM aviso, não três. */
import { describe, expect, it } from "vitest";
import {
  avisoDeResposta,
  MAX_PREVIA_AVISO,
  previaDaMensagem,
  respostasQueChegaram,
  rotuloDoImovel,
} from "@/lib/calculo/chegadaResposta";
import type { Imovel, NotaImovel } from "@/lib/tipos";

function imovel(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "i1",
    endereco: "Rua A, 100",
    status: "Novo contato",
    ...over,
  };
}

/** Nota do webhook, como ela é gravada de verdade (com o prefixo do texto). */
function resposta(id: string, data: string, texto = "oi"): NotaImovel {
  return { id: `wa:${id}`, texto: `Resposta pelo WhatsApp: ${texto}`, data };
}

describe("respostasQueChegaram", () => {
  it("sem retrato anterior não acusa nada — nem com histórico cheio", () => {
    const novo = imovel({
      notas: [resposta("a", "2026-07-30T10:00"), resposta("b", "2026-07-30T11:00")],
    });
    expect(respostasQueChegaram(undefined, novo)).toEqual([]);
    expect(respostasQueChegaram(null, novo)).toEqual([]);
  });

  it("acusa só a nota que não existia antes", () => {
    const antes = imovel({ notas: [resposta("a", "2026-07-30T10:00")] });
    const depois = imovel({
      notas: [resposta("a", "2026-07-30T10:00"), resposta("b", "2026-07-30T11:00", "pode quinta")],
    });
    const novas = respostasQueChegaram(antes, depois);
    expect(novas).toHaveLength(1);
    expect(novas[0].id).toBe("wa:b");
  });

  it("a nota do ENCERRAMENTO automático não é resposta de ninguém", () => {
    const antes = imovel({ notas: [resposta("a", "2026-07-30T10:00")] });
    const depois = imovel({
      notas: [
        resposta("a", "2026-07-30T10:00"),
        { id: "wa:a:encerrado", texto: "Encerrado automaticamente", data: "2026-07-30T10:01" },
      ],
    });
    expect(respostasQueChegaram(antes, depois)).toEqual([]);
  });

  it("nota escrita à mão pelo corretor não avisa", () => {
    const antes = imovel({ notas: [] });
    const depois = imovel({
      notas: [{ id: "manual-1", texto: "lembrar do IPTU", data: "2026-07-30T10:00" }],
    });
    expect(respostasQueChegaram(antes, depois)).toEqual([]);
  });

  it("a nossa própria escrita não vira aviso: mesmos ids, nada novo", () => {
    // Registrar uma tentativa reescreve a linha e devolve um evento do
    // Realtime com as MESMAS notas. Sem esta regra o corretor seria avisado
    // de uma "resposta" a cada mensagem que ele mesmo mandasse.
    const notas = [resposta("a", "2026-07-30T10:00")];
    const antes = imovel({ notas });
    const depois = imovel({ notas, tentativas: [] });
    expect(respostasQueChegaram(antes, depois)).toEqual([]);
  });

  it("marcar como lida reescreve a nota e não conta como chegada", () => {
    const antes = imovel({ notas: [resposta("a", "2026-07-30T10:00")] });
    const depois = imovel({ notas: [{ ...resposta("a", "2026-07-30T10:00"), lida: true }] });
    expect(respostasQueChegaram(antes, depois)).toEqual([]);
  });
});

describe("previaDaMensagem", () => {
  it("mostra o que a pessoa escreveu, sem o prefixo do webhook", () => {
    expect(previaDaMensagem(resposta("a", "2026-07-30T10:00", "Pode sim"))).toBe("Pode sim");
  });

  it("corta a mensagem longa em vez de deixar o sistema truncar sem aviso", () => {
    const longa = "a".repeat(MAX_PREVIA_AVISO + 50);
    const p = previaDaMensagem(resposta("a", "2026-07-30T10:00", longa));
    expect(p).toHaveLength(MAX_PREVIA_AVISO);
    expect(p.endsWith("…")).toBe(true);
  });

  it("marcador de mídia passa como está — é o que a caixa também mostra", () => {
    expect(previaDaMensagem(resposta("a", "2026-07-30T10:00", "[imagem]"))).toBe("[imagem]");
  });
});

describe("rotuloDoImovel", () => {
  it("junta código e endereço", () => {
    expect(rotuloDoImovel(imovel({ codigo: "LD-176" }))).toBe("LD-176 · Rua A, 100");
  });

  it("sem código, fica o endereço", () => {
    expect(rotuloDoImovel(imovel())).toBe("Rua A, 100");
  });
});

describe("avisoDeResposta", () => {
  it("sem mensagem nova não há aviso", () => {
    expect(avisoDeResposta(imovel(), [])).toBeNull();
  });

  it("usa o nome do proprietário e a prévia da mensagem", () => {
    const i = imovel({ codigo: "LD-176", proprietarioNome: "João Silva" });
    const a = avisoDeResposta(i, [resposta("a", "2026-07-30T10:00", "Pode sim")]);
    expect(a?.titulo).toBe("João Silva respondeu");
    expect(a?.corpo).toBe("LD-176 · Rua A, 100 — Pode sim");
    expect(a?.imovelId).toBe("i1");
  });

  it("sem nome do proprietário, ainda avisa", () => {
    const a = avisoDeResposta(imovel(), [resposta("a", "2026-07-30T10:00")]);
    expect(a?.titulo).toBe("Resposta no WhatsApp");
  });

  it("rajada vira UM aviso, com a prévia da mensagem MAIS RECENTE", () => {
    const i = imovel({ proprietarioNome: "Ana" });
    const a = avisoDeResposta(i, [
      resposta("a", "2026-07-30T10:00", "pode quinta"),
      resposta("c", "2026-07-30T10:02", "combinado"),
      resposta("b", "2026-07-30T10:01", "às 10h"),
    ]);
    expect(a?.quantidade).toBe(3);
    expect(a?.titulo).toBe("Ana respondeu (3 mensagens)");
    expect(a?.corpo.endsWith("— combinado")).toBe(true);
  });

  // As partes soltas alimentam o CARTÃO do toast; as compostas, a caixinha do
  // sistema, que só aceita texto puro. Divergir faria os dois avisos contarem
  // histórias diferentes da mesma mensagem.
  it("as partes soltas são as mesmas do texto composto", () => {
    const i = imovel({ codigo: "LD-176", proprietarioNome: "João Silva" });
    const a = avisoDeResposta(i, [resposta("a", "2026-07-30T10:00", "Pode sim")]);
    expect(a?.quem).toBe("João Silva");
    expect(a?.imovel).toBe("LD-176 · Rua A, 100");
    expect(a?.mensagem).toBe("Pode sim");
    expect(a?.corpo).toBe(`${a?.imovel} — ${a?.mensagem}`);
    expect(a?.titulo.startsWith(a?.quem ?? "")).toBe(true);
  });

  it("sem nome, o cartão ainda tem quem mostrar", () => {
    const a = avisoDeResposta(imovel(), [resposta("a", "2026-07-30T10:00")]);
    expect(a?.quem).toBe("Resposta no WhatsApp");
  });
});
