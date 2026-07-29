/* Testes da Caixa de respostas (calculo/respostas.ts).

   O que estes testes guardam, em ordem de importância:
   1. o que conta como RESPOSTA (a nota do corretor e a do encerramento
      automático não são resposta de ninguém);
   2. a regra dupla de "pendente" — sai por ação OU por `lida`;
   3. o empate de mesmo dia entre statusHistory (dia) e nota (datetime),
      que tem que cair para o lado de continuar pendente. */
import { describe, expect, it } from "vitest";
import {
  caixaDeRespostas,
  contarRespostasPendentes,
  respostasDoImovel,
} from "@/lib/calculo/respostas";
import type { Imovel } from "@/lib/tipos";

const HOJE = "2026-07-29";

function imovel(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "i1",
    endereco: "Rua A, 100",
    status: "Novo contato",
    ...over,
  };
}

/** Nota do webhook (resposta do proprietário). */
function resposta(id: string, data: string, texto = "oi", lida?: boolean) {
  return { id: `wa:${id}`, texto, data, ...(lida === undefined ? {} : { lida }) };
}

describe("respostasDoImovel", () => {
  it("pega só as notas do webhook, em ordem cronológica crescente", () => {
    const i = imovel({
      notas: [
        { id: "manual-1", texto: "lembrar do IPTU", data: "2026-07-27T09:00" },
        resposta("b", "2026-07-28T15:00", "pode ser quinta"),
        resposta("a", "2026-07-27T10:00", "quem é?"),
      ],
    });
    expect(respostasDoImovel(i).map((n) => n.texto)).toEqual(["quem é?", "pode ser quinta"]);
  });

  it("ignora a nota do encerramento automático (wa:<id>:encerrado)", () => {
    const i = imovel({
      notas: [
        resposta("a", "2026-07-28T10:00", "já aluguei"),
        { id: "wa:a:encerrado", texto: "Imóvel encerrado automaticamente.", data: "2026-07-28T10:00" },
      ],
    });
    expect(respostasDoImovel(i)).toHaveLength(1);
  });

  it("descarta nota sem data utilizável", () => {
    const i = imovel({ notas: [resposta("a", "")] });
    expect(respostasDoImovel(i)).toHaveLength(0);
  });
});

describe("caixaDeRespostas — o que entra", () => {
  it("imóvel sem resposta não vira linha", () => {
    const i = imovel({ notas: [{ id: "manual", texto: "nota", data: "2026-07-28T10:00" }] });
    expect(caixaDeRespostas([i], HOJE)).toHaveLength(0);
  });

  it("agrupa as mensagens por imóvel e usa a última para ordenar", () => {
    const antigo = imovel({ id: "velho", notas: [resposta("a", "2026-07-20T10:00")] });
    const recente = imovel({
      id: "novo",
      notas: [resposta("b", "2026-07-21T10:00"), resposta("c", "2026-07-28T18:00", "última")],
    });
    const caixa = caixaDeRespostas([antigo, recente], HOJE);
    expect(caixa.map((l) => l.imovelId)).toEqual(["novo", "velho"]);
    expect(caixa[0].total).toBe(2);
    expect(caixa[0].ultima.texto).toBe("última");
    expect(caixa[0].dias).toBe(1);
  });

  it("NÃO exclui imóvel já captado — é onde está o volume de mensagens", () => {
    const captado = imovel({ status: "Angariado", notas: [resposta("a", "2026-07-28T10:00", "segue o CPF")] });
    expect(caixaDeRespostas([captado], HOJE)).toHaveLength(1);
  });
});

describe("caixaDeRespostas — a regra dupla de pendente", () => {
  it("resposta sem ação nenhuma fica pendente", () => {
    const i = imovel({ notas: [resposta("a", "2026-07-28T10:00")] });
    const [linha] = caixaDeRespostas([i], HOJE);
    expect(linha.pendente).toBe(true);
    expect(linha.naoTratadas).toBe(1);
  });

  it("tentativa registrada DEPOIS da mensagem trata a resposta sozinha", () => {
    const i = imovel({
      notas: [resposta("a", "2026-07-28T10:00")],
      tentativas: [{ id: "t1", data: "2026-07-28T11:00", resultado: "sem-resposta" }],
    });
    expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(false);
  });

  it("tentativa ANTERIOR à mensagem não trata nada (foi ela que provocou a resposta)", () => {
    const i = imovel({
      notas: [resposta("a", "2026-07-28T10:00")],
      tentativas: [{ id: "t1", data: "2026-07-27T09:00", resultado: "sem-resposta" }],
    });
    expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(true);
  });

  it("mudança de status em dia POSTERIOR trata a resposta", () => {
    const i = imovel({
      notas: [resposta("a", "2026-07-27T10:00")],
      statusHistory: [{ status: "Em negociação", date: "2026-07-28" }],
    });
    expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(false);
  });

  it("mudança de status no MESMO dia não prova que veio depois — segue pendente", () => {
    // O histórico guarda dia; a nota guarda datetime. No empate, a mensagem
    // continua na caixa: dar por lida uma resposta que ninguém viu é o único
    // erro que esta tela não pode cometer.
    const i = imovel({
      notas: [resposta("a", "2026-07-28T10:00")],
      statusHistory: [{ status: "Perdido", date: "2026-07-28" }],
    });
    expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(true);
  });

  it("`lida` tira da caixa o que nunca vai gerar ação", () => {
    const i = imovel({ notas: [resposta("a", "2026-07-28T10:00", "obrigado!", true)] });
    expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(false);
  });

  it("basta UMA mensagem não tratada para a linha ficar pendente", () => {
    const i = imovel({
      notas: [
        resposta("a", "2026-07-27T10:00", "oi", true),
        resposta("b", "2026-07-28T10:00", "e aí?"),
      ],
    });
    const [linha] = caixaDeRespostas([i], HOJE);
    expect(linha.pendente).toBe(true);
    expect(linha.naoTratadas).toBe(1);
    expect(linha.total).toBe(2);
  });
});

describe("caixaDeRespostas — encerramento automático", () => {
  it("marca a linha do imóvel que o app encerrou sozinho", () => {
    const i = imovel({
      status: "Perdido",
      notas: [
        resposta("a", "2026-07-28T10:00", "já aluguei"),
        { id: "wa:a:encerrado", texto: "Encerrado automaticamente.", data: "2026-07-28T10:00" },
      ],
    });
    expect(caixaDeRespostas([i], HOJE)[0].encerradoAutomaticamente).toBe(true);
  });

  it("imóvel sem encerramento automático não é marcado", () => {
    const i = imovel({ notas: [resposta("a", "2026-07-28T10:00")] });
    expect(caixaDeRespostas([i], HOJE)[0].encerradoAutomaticamente).toBe(false);
  });
});

describe("caixaDeRespostas — marcador de mídia não cobra ação", () => {
  it("mensagem só de mídia não deixa a linha pendente", () => {
    const i = imovel({ notas: [resposta("a", "2026-07-28T10:00", "[áudio]")] });
    const [linha] = caixaDeRespostas([i], HOJE);
    expect(linha.pendente).toBe(false);
    expect(linha.naoTratadas).toBe(0);
    expect(linha.midiaPendentes).toBe(1);
    // Continua na conversa: some da cobrança, não da tela.
    expect(linha.total).toBe(1);
    expect(linha.mensagens[0].soMidia).toBe(true);
  });

  it("reconhece o marcador mesmo com o prefixo do webhook", () => {
    const i = imovel({
      notas: [resposta("a", "2026-07-28T10:00", "Resposta pelo WhatsApp: [imagem]")],
    });
    expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(false);
  });

  it("texto junto de mídia continua cobrando, e só ele é contado", () => {
    const i = imovel({
      notas: [
        resposta("a", "2026-07-28T10:00", "[áudio]"),
        resposta("b", "2026-07-28T10:01", "Bloco 10, Ap 701"),
        resposta("c", "2026-07-28T10:02", "[áudio]"),
      ],
    });
    const [linha] = caixaDeRespostas([i], HOJE);
    expect(linha.pendente).toBe(true);
    expect(linha.naoTratadas).toBe(1);
    expect(linha.midiaPendentes).toBe(2);
  });

  it("mensagem CURTA continua cobrando — 'Pode sim' e 'Já Assinei' são curtas", () => {
    const curtas = ["Pode sim", "Já Assinei", "Sim"];
    for (const texto of curtas) {
      const i = imovel({ notas: [resposta("a", "2026-07-28T10:00", texto)] });
      expect(caixaDeRespostas([i], HOJE)[0].pendente).toBe(true);
    }
  });
});

describe("caixaDeRespostas — fase (blocos da tela)", () => {
  it("imóvel já captado vai para o bloco da carteira", () => {
    for (const status of ["Angariado", "Publicado", "Locado"]) {
      const i = imovel({ status, notas: [resposta("a", "2026-07-28T10:00")] });
      expect(caixaDeRespostas([i], HOJE)[0].fase).toBe("carteira");
    }
  });

  it("o resto é captação — inclusive as saídas laterais", () => {
    for (const status of ["Novo contato", "Em negociação", "Sem resposta", "Perdido"]) {
      const i = imovel({ status, notas: [resposta("a", "2026-07-28T10:00")] });
      expect(caixaDeRespostas([i], HOJE)[0].fase).toBe("captacao");
    }
  });
});

describe("contarRespostasPendentes", () => {
  it("conta IMÓVEIS pendentes, não mensagens", () => {
    const a = imovel({
      id: "a",
      notas: [resposta("1", "2026-07-28T10:00"), resposta("2", "2026-07-28T10:05")],
    });
    const b = imovel({ id: "b", notas: [resposta("3", "2026-07-28T11:00", "ok", true)] });
    expect(contarRespostasPendentes([a, b], HOJE)).toBe(1);
  });

  it("o badge ignora a carteira — só captação alarma o menu", () => {
    const captacao = imovel({ id: "a", notas: [resposta("1", "2026-07-28T10:00")] });
    const carteira = imovel({
      id: "b",
      status: "Angariado",
      notas: [resposta("2", "2026-07-28T11:00")],
    });
    expect(caixaDeRespostas([captacao, carteira], HOJE).filter((l) => l.pendente)).toHaveLength(2);
    expect(contarRespostasPendentes([captacao, carteira], HOJE)).toBe(1);
  });

  it("carteira sem resposta nenhuma conta zero", () => {
    expect(contarRespostasPendentes([imovel()], HOJE)).toBe(0);
  });
});
