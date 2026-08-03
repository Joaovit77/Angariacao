/* Conquistas do mês (lib/calculo/conquistasDoMes).

   O que estes testes fixam é o que faz o bloco existir: ele tem que MEXER
   durante o mês e zerar na virada, sem levar junto as medalhas permanentes.
   As armadilhas guardadas aqui são as três que tornariam o card irritante em
   vez de motivador — a sequência morrendo às 9h da manhã, a barra enchendo por
   causa de um proprietário falante, e a meta acusando "concluído" onde não há
   meta definida. */
import { describe, expect, it } from "vitest";
import {
  conquistasDoMes,
  diasUteisSeguidosComTentativa,
  proprietariosQueResponderamNoMes,
  tentativasNoMes,
} from "@/lib/calculo/conquistasDoMes";
import type { Imovel, NotaImovel, Tentativa } from "@/lib/tipos";

let seq = 0;
function tentativa(dataHora: string): Tentativa {
  seq += 1;
  return { id: `t${seq}`, data: dataHora, canal: "WhatsApp", resultado: "sem-resposta" };
}

function resposta(dataHora: string): NotaImovel {
  seq += 1;
  return { id: `wa:m${seq}`, data: dataHora, texto: "Resposta pelo WhatsApp: tenho interesse" };
}

function imovel(over: Partial<Imovel> = {}): Imovel {
  seq += 1;
  return { id: `i${seq}`, endereco: `Rua ${seq}`, status: "Novo contato", ...over };
}

describe("tentativasNoMes", () => {
  it("conta só as do mês pedido, somando a carteira toda", () => {
    const a = imovel({ tentativas: [tentativa("2026-08-03T10:00"), tentativa("2026-07-31T18:00")] });
    const b = imovel({ tentativas: [tentativa("2026-08-01T09:00")] });
    expect(tentativasNoMes([a, b], "2026-08")).toBe(2);
    expect(tentativasNoMes([a, b], "2026-07")).toBe(1);
  });

  /* A virada é o sintoma que originou o módulo: no dia 1º o bloco tem que
     estar zerado, senão ele é só mais um acumulado que não se mexe. */
  it("zera na virada do mês", () => {
    const i = imovel({ tentativas: [tentativa("2026-07-31T23:00")] });
    expect(tentativasNoMes([i], "2026-08")).toBe(0);
  });
});

describe("proprietariosQueResponderamNoMes", () => {
  /* Em julho/2026 um único proprietário mandou 64 mensagens. Contando
     mensagem, a barra encheria por causa de uma conversa só e diria que o mês
     foi bom quando 25 outros donos ficaram calados. */
  it("conta PROPRIETÁRIOS, não mensagens", () => {
    const falante = imovel({
      notas: [resposta("2026-08-02T10:00"), resposta("2026-08-02T10:01"), resposta("2026-08-02T10:02")],
    });
    expect(proprietariosQueResponderamNoMes([falante], "2026-08")).toBe(1);
  });

  it("a nota do encerramento automático não é resposta de ninguém", () => {
    // Ela nasce com o mesmo prefixo `wa:` e é o app falando, não o dono.
    const i = imovel({
      notas: [{ id: "wa:M1:encerrado", data: "2026-08-02T10:00", texto: "Encerrado automaticamente" }],
    });
    expect(proprietariosQueResponderamNoMes([i], "2026-08")).toBe(0);
  });

  it("nota escrita à mão não conta como resposta", () => {
    const i = imovel({ notas: [{ id: "n1", data: "2026-08-02T10:00", texto: "liguei, não atendeu" }] });
    expect(proprietariosQueResponderamNoMes([i], "2026-08")).toBe(0);
  });
});

describe("diasUteisSeguidosComTentativa", () => {
  const comDias = (dias: string[]) => [imovel({ tentativas: dias.map((d) => tentativa(`${d}T10:00`)) })];

  it("conta dias úteis seguidos até hoje", () => {
    // Qua, qui, sex de agosto/2026 — 05, 06 e 07.
    expect(diasUteisSeguidosComTentativa(comDias(["2026-08-05", "2026-08-06", "2026-08-07"]), "2026-08-07")).toBe(3);
  });

  /* A armadilha que mataria o card: às 9h da manhã nada foi enviado ainda, e
     zerar nove dias por causa disso pune quem acordou cedo. O dia corrente só
     entra quando soma; enquanto não somar, a contagem vale até ontem. */
  it("hoje sem tentativa ainda não quebra a sequência", () => {
    const dias = comDias(["2026-08-05", "2026-08-06"]);
    expect(diasUteisSeguidosComTentativa(dias, "2026-08-07")).toBe(2);
  });

  it("fim de semana não interrompe nem conta", () => {
    // Sexta 07 e segunda 10: o sábado e o domingo no meio são ignorados.
    const dias = comDias(["2026-08-07", "2026-08-10"]);
    expect(diasUteisSeguidosComTentativa(dias, "2026-08-10")).toBe(2);
  });

  it("dia útil em branco no meio quebra", () => {
    // Falta a quinta (06): a sequência vale só a partir da sexta.
    const dias = comDias(["2026-08-04", "2026-08-05", "2026-08-07"]);
    expect(diasUteisSeguidosComTentativa(dias, "2026-08-07")).toBe(1);
  });

  /* A única medida daqui que ATRAVESSA o mês. Constância medida em pedaços de
     calendário não é constância: quem trabalhou vinte dias seguidos não pode
     ler "1" no dia 1º. */
  it("a sequência atravessa a virada do mês", () => {
    // Qui 30/07, sex 31/07, seg 03/08.
    const dias = comDias(["2026-07-30", "2026-07-31", "2026-08-03"]);
    expect(diasUteisSeguidosComTentativa(dias, "2026-08-03")).toBe(3);
  });

  it("carteira sem tentativa nenhuma dá zero", () => {
    expect(diasUteisSeguidosComTentativa([imovel()], "2026-08-03")).toBe(0);
  });
});

describe("conquistasDoMes", () => {
  it("sem meta definida, o desafio de meta não aparece", () => {
    // Projetar contra meta zero acusaria "concluído" num card vazio — a mesma
    // razão de projecao.ts não projetar sem meta.
    const d = conquistasDoMes([imovel()], {}, "2026-08", "2026-08-03");
    expect(d.map((x) => x.id)).not.toContain("mes-meta");
    // Os outros três não dependem de configuração nenhuma.
    expect(d).toHaveLength(3);
  });

  it("com meta definida, ela entra por último com o alvo do corretor", () => {
    const metas = { "2026-08": { angariacoes: 15, locados: 2, comissao: 0, faturamento: 0 } };
    const d = conquistasDoMes([imovel()], metas, "2026-08", "2026-08-03");
    expect(d).toHaveLength(4);
    expect(d[3].id).toBe("mes-meta");
    expect(d[3].alvo).toBe(15);
  });

  it("o degrau perseguido é o primeiro não alcançado", () => {
    // 60 tentativas passam do primeiro degrau (50) e miram o segundo (100).
    const dias = Array.from({ length: 60 }, () => tentativa("2026-08-03T10:00"));
    const d = conquistasDoMes([imovel({ tentativas: dias })], {}, "2026-08", "2026-08-03");
    const ritmo = d.find((x) => x.id === "mes-ritmo")!;
    expect(ritmo.alvo).toBe(100);
    expect(ritmo.concluido).toBe(false);
    expect(ritmo.progressoTexto).toBe("60 de 100");
  });

  it("o topo da escada fica concluído, sem degrau fantasma", () => {
    const muitas = Array.from({ length: 400 }, () => tentativa("2026-08-03T10:00"));
    const ritmo = conquistasDoMes([imovel({ tentativas: muitas })], {}, "2026-08", "2026-08-03")
      .find((x) => x.id === "mes-ritmo")!;
    expect(ritmo.concluido).toBe(true);
    expect(ritmo.alvo).toBe(300);
    expect(ritmo.progresso).toBe(1);
    // "400 de 300" se leria como bug: passar do topo é sucesso, não erro.
    expect(ritmo.progressoTexto).toBe("completo");
  });

  it("a barra nunca passa de 100%", () => {
    const muitas = Array.from({ length: 999 }, () => tentativa("2026-08-03T10:00"));
    const ritmo = conquistasDoMes([imovel({ tentativas: muitas })], {}, "2026-08", "2026-08-03")
      .find((x) => x.id === "mes-ritmo")!;
    expect(ritmo.progresso).toBeLessThanOrEqual(1);
  });
});
