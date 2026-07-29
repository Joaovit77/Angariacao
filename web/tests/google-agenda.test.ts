/* Testes das partes puras da integração com o Google Agenda.

   O que estes testes guardam é o que quebra em SILÊNCIO na agenda de
   alguém: fuso ausente (evento 3h fora do lugar), dia inteiro montado
   com fim errado (a API recusa), e os dois parâmetros de OAuth sem os
   quais a integração morre em uma hora ou na reconexão. */
import { describe, expect, it } from "vitest";
import {
  DURACAO_PADRAO_MIN,
  ESCOPO_GOOGLE,
  eventoDoCompromisso,
  FUSO,
  horaUtil,
  somarMinutos,
  urlDeAutorizacao,
} from "@/lib/calculo/googleAgenda";
import type { AgendaItem, Imovel } from "@/lib/tipos";

function compromisso(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "a1",
    title: "Visita",
    type: "Visita",
    date: "2026-07-30",
    hora: null,
    done: false,
    isVerificacaoDisponibilidade: false,
    ...over,
  };
}

describe("horaUtil", () => {
  it("aceita HH:MM e normaliza para 5 caracteres", () => {
    expect(horaUtil("10:00")).toBe("10:00");
    expect(horaUtil("9:30")).toBe("09:30");
  });

  it("trata null, vazio e só espaços como SEM hora", () => {
    // Mesma tolerância do separarPorHorario: o modal grava null, mas dado
    // antigo tem "".
    expect(horaUtil(null)).toBeNull();
    expect(horaUtil("")).toBeNull();
    expect(horaUtil("   ")).toBeNull();
    expect(horaUtil("manhã")).toBeNull();
  });
});

describe("somarMinutos", () => {
  it("soma dentro da hora e virando a hora", () => {
    expect(somarMinutos("10:00", 60)).toBe("11:00");
    expect(somarMinutos("10:45", 30)).toBe("11:15");
  });

  it("satura em 23:59 em vez de empurrar para o dia seguinte", () => {
    // Um compromisso às 23:30 não pode gerar um evento que termina no dia
    // seguinte — o Google aceitaria, e o bloco apareceria atravessando a
    // virada na agenda do corretor.
    expect(somarMinutos("23:30", 60)).toBe("23:59");
  });
});

describe("eventoDoCompromisso — com hora", () => {
  it("vira evento cronometrado COM fuso", () => {
    // Sem timeZone o Google interpreta como UTC e a visita das 10h aparece
    // às 7h no celular.
    const e = eventoDoCompromisso(compromisso({ hora: "10:00" }), null);
    expect(e.start.dateTime).toBe("2026-07-30T10:00:00");
    expect(e.start.timeZone).toBe(FUSO);
    expect(e.end.dateTime).toBe(`2026-07-30T11:00:00`);
    expect(e.start.date).toBeUndefined();
  });

  it("a duração padrão define o fim", () => {
    const e = eventoDoCompromisso(compromisso({ hora: "14:00" }), null);
    expect(e.end.dateTime).toBe(`2026-07-30T${somarMinutos("14:00", DURACAO_PADRAO_MIN)}:00`);
  });
});

describe("eventoDoCompromisso — sem hora", () => {
  it("vira evento de DIA INTEIRO, com fim exclusivo no dia seguinte", () => {
    const e = eventoDoCompromisso(compromisso({ hora: null }), null);
    expect(e.start.date).toBe("2026-07-30");
    expect(e.end.date).toBe("2026-07-31");
    expect(e.start.dateTime).toBeUndefined();
    expect(e.start.timeZone).toBeUndefined();
  });

  it("vira o mês corretamente", () => {
    expect(eventoDoCompromisso(compromisso({ date: "2026-07-31" }), null).end.date).toBe("2026-08-01");
    expect(eventoDoCompromisso(compromisso({ date: "2026-04-30" }), null).end.date).toBe("2026-05-01");
  });

  it("vira o ano corretamente", () => {
    expect(eventoDoCompromisso(compromisso({ date: "2026-12-31" }), null).end.date).toBe("2027-01-01");
  });

  it("respeita fevereiro em ano bissexto e em ano comum", () => {
    expect(eventoDoCompromisso(compromisso({ date: "2028-02-28" }), null).end.date).toBe("2028-02-29");
    expect(eventoDoCompromisso(compromisso({ date: "2026-02-28" }), null).end.date).toBe("2026-03-01");
  });
});

describe("eventoDoCompromisso — conteúdo", () => {
  it("concluído ganha ✓ no título, e não é apagado", () => {
    // A agenda também é registro do que foi feito: uma visita que some
    // depois de realizada apaga a prova de que aconteceu.
    const e = eventoDoCompromisso(compromisso({ done: true, title: "Visita ao imóvel" }), null);
    expect(e.summary).toBe("✓ Visita ao imóvel");
  });

  it("pendente não leva o ✓", () => {
    expect(eventoDoCompromisso(compromisso({ title: "Visita" }), null).summary).toBe("Visita");
  });

  it("sem imóvel continua válido (compromisso avulso)", () => {
    const e = eventoDoCompromisso(compromisso(), null);
    expect(e.location).toBeUndefined();
    expect(e.summary).toBeTruthy();
  });

  it("com imóvel, leva endereço e contato do proprietário", () => {
    const imovel: Imovel = {
      id: "i1",
      codigo: "LD-140",
      endereco: "Rua Raja Gabaglia, 664",
      bairro: "Centro",
      cidade: "Londrina",
      proprietarioNome: "Marcia",
      proprietarioTelefone: "(43) 99802-4316",
      status: "Em negociação",
    };
    const e = eventoDoCompromisso(compromisso(), imovel);
    expect(e.location).toBe("Rua Raja Gabaglia, 664, Centro, Londrina");
    expect(e.description).toContain("LD-140");
    expect(e.description).toContain("Marcia");
    expect(e.description).toContain("(43) 99802-4316");
  });
});

describe("urlDeAutorizacao", () => {
  const url = new URL(urlDeAutorizacao("cid", "https://exemplo.app/api/google/callback", "st4te"));

  it("pede acesso offline — é o que devolve REFRESH token", () => {
    // Sem isto vem só um access token de uma hora, e a sincronização morre
    // no almoço do primeiro dia.
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("força a tela de consentimento na reconexão", () => {
    // O Google só manda refresh token na PRIMEIRA autorização de cada conta;
    // sem prompt=consent, reconectar devolve um code que não gera refresh.
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("pede só o escopo de eventos, não o de agendas inteiras", () => {
    expect(url.searchParams.get("scope")).toBe(ESCOPO_GOOGLE);
    expect(ESCOPO_GOOGLE.endsWith("/calendar.events")).toBe(true);
  });

  it("leva o state e o redirect_uri exatos", () => {
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("redirect_uri")).toBe("https://exemplo.app/api/google/callback");
  });
});
