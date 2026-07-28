/* Termômetro do proprietário (lib/calculo/temperatura).
   O que se garante aqui é a ORDEM e, principalmente, quem NÃO entra:
   uma lista de prioridade que manda cutucar quem acabou de responder,
   ou quem já recusou, é pior que nenhuma — o corretor para de olhar. */
import { describe, expect, it } from "vitest";
import { todayISO } from "@/lib/datas";
import {
  DIAS_LEAD_ESQUECIDO,
  FAIXA,
  linhaTemperatura,
  termometro,
  ultimaTentativa,
} from "@/lib/calculo/temperatura";
import type { Imovel, Tentativa } from "@/lib/tipos";
import { congelaRelogio } from "./setup-relogio";

congelaRelogio();

const HOJE = todayISO(); // 2026-07-09

function imovel(over: Partial<Imovel> & { id: string }): Imovel {
  return {
    endereco: "Rua A, 100",
    status: "Novo contato",
    statusHistory: [{ status: "Novo contato", date: "2026-07-01" }],
    ...over,
  };
}

function tentativa(over: Partial<Tentativa> & { data: string }): Tentativa {
  return { id: `t-${over.data}`, resultado: "sem-resposta", ...over };
}

describe("ultimaTentativa", () => {
  it("pega a mais recente, não a última do array", () => {
    const i = imovel({
      id: "1",
      tentativas: [
        tentativa({ data: "2026-07-08T10:00", id: "nova" }),
        tentativa({ data: "2026-07-02T10:00", id: "velha" }),
      ],
    });
    expect(ultimaTentativa(i)?.id).toBe("nova");
  });

  it("sem tentativa devolve null", () => {
    expect(ultimaTentativa(imovel({ id: "1" }))).toBeNull();
  });
});

describe("quem NÃO entra", () => {
  it("status terminal negativo fica fora, mesmo com resposta recente", () => {
    const i = imovel({
      id: "1",
      status: "Perdido",
      tentativas: [tentativa({ data: "2026-07-06T10:00", resultado: "respondeu" })],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("quem recusou fica fora — reagir não é querer", () => {
    const i = imovel({
      id: "1",
      tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "recusou" })],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("número errado fica fora — é problema de cadastro, não de proprietário", () => {
    const i = imovel({
      id: "1",
      tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "numero-errado" })],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("imóvel pausado fica fora", () => {
    const i = imovel({
      id: "1",
      pausadoAte: "2026-08-01",
      tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "vai-retornar" })],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("quem reagiu HOJE fica fora — você acabou de falar com ele", () => {
    const i = imovel({
      id: "1",
      tentativas: [tentativa({ data: `${HOJE}T09:00`, resultado: "agendou" })],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("contato de hoje silencia até um compromisso já vencido", () => {
    // O caminho que a guarda de "tocou hoje" realmente protege: sem ela, um
    // envio feito hoje carregando uma sugestão de retomada com data passada
    // reapareceria como compromisso vencido — mandando cobrar de novo, no
    // mesmo dia, alguém que acabou de receber mensagem.
    const i = imovel({
      id: "1",
      tentativas: [
        tentativa({
          data: `${HOJE}T09:00`,
          resultado: "sem-resposta",
          aguardandoResultado: true,
          sugestaoIa: { resultado: "vai-retornar", retomarEm: "2026-07-01", resumo: "Antiga." },
        }),
      ],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("enviou e ainda não houve reação não é calor — é espera (o lote cobra isso)", () => {
    // Esta é a maioria de qualquer carteira de captação. Se entrasse, a faixa
    // mais fraca dominaria o card e enterraria a resposta rara.
    const i = imovel({
      id: "1",
      statusHistory: [{ status: "Novo contato", date: "2026-06-01" }],
      tentativas: [tentativa({ data: "2026-07-02T10:00", resultado: "sem-resposta" })],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  it("lead recém-cadastrado ainda não é cobrança", () => {
    const i = imovel({
      id: "1",
      statusHistory: [{ status: "Novo contato", date: HOJE }],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });
});

describe("faixas", () => {
  it("compromisso marcado pelo proprietário vence tudo", () => {
    const i = imovel({
      id: "1",
      tentativas: [
        tentativa({
          data: "2026-07-01T10:00",
          resultado: "sem-resposta",
          aguardandoResultado: true,
          sugestaoIa: { resultado: "vai-retornar", retomarEm: "2026-07-06", resumo: "Pediu retorno." },
        }),
      ],
    });
    const linha = linhaTemperatura(i, HOJE);
    expect(linha?.score).toBe(FAIXA.compromissoVencido);
    expect(linha?.motivo).toContain("06/07/2026");
    expect(linha?.dias).toBe(3);
  });

  it("compromisso ainda no futuro não entra nessa faixa", () => {
    const i = imovel({
      id: "1",
      tentativas: [
        tentativa({
          data: "2026-07-08T10:00",
          resultado: "sem-resposta",
          aguardandoResultado: true,
          sugestaoIa: { resultado: "vai-retornar", retomarEm: "2026-07-20", resumo: "Semana que vem." },
        }),
      ],
    });
    // Cai na faixa comum da tentativa, não na de compromisso.
    expect(linhaTemperatura(i, HOJE)?.score).not.toBe(FAIXA.compromissoVencido);
  });

  it("agendou > vai-retornar > respondeu", () => {
    const faixa = (resultado: Tentativa["resultado"]) =>
      linhaTemperatura(
        imovel({ id: "1", tentativas: [tentativa({ data: "2026-07-06T10:00", resultado })] }),
        HOJE,
      )?.score;
    expect(faixa("agendou")).toBe(FAIXA.agendou);
    expect(faixa("vai-retornar")).toBe(FAIXA.vaiRetornar);
    expect(faixa("respondeu")).toBe(FAIXA.respondeu);
    expect(FAIXA.agendou).toBeGreaterThan(FAIXA.vaiRetornar);
    expect(FAIXA.vaiRetornar).toBeGreaterThan(FAIXA.respondeu);
  });

  it("lead cadastrado e nunca contatado vira cobrança depois do prazo", () => {
    const i = imovel({
      id: "1",
      statusHistory: [{ status: "Novo contato", date: "2026-07-01" }],
    });
    const linha = linhaTemperatura(i, HOJE);
    expect(linha?.score).toBe(FAIXA.leadEsquecido);
    expect(linha?.dias).toBeGreaterThanOrEqual(DIAS_LEAD_ESQUECIDO);
    expect(linha?.motivo).toContain("nunca contatado");
  });

  it("imóvel já captado não entra por esquecimento nem por estagnação", () => {
    // A cobrança dessa fase é o lembrete de disponibilidade, não esta lista.
    const i = imovel({
      id: "1",
      status: "Publicado",
      statusHistory: [{ status: "Publicado", date: "2026-01-01" }],
    });
    expect(linhaTemperatura(i, HOJE)).toBeNull();
  });

  /* Depois de angariar o proprietário fala MUITO mais — documentação, fotos,
     metragem, dúvidas de contrato —, então o captado ganha no volume e enterra
     o lead que ainda precisa do "sim". Em 28/07/2026 eram 5 das 8 linhas.

     Este bloco já garantiu o CONTRÁRIO ("um compromisso marcado vale mesmo já
     captado"). Mudou por observação do campo: em imóvel captado, a visita
     marcada é com o INQUILINO, e quem cobra hora marcada é a agenda. */
  it("captado não entra por NENHUMA faixa, nem promessa marcada", () => {
    const base = {
      id: "1",
      status: "Angariado" as const,
      statusHistory: [{ status: "Angariado", date: "2026-06-01" }],
    };
    const fora = (over: Partial<Imovel>) =>
      expect(linhaTemperatura(imovel({ ...base, ...over }), HOJE)).toBeNull();

    // "respondeu" registrado na tentativa (o caso LD-163).
    fora({ tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "respondeu" })] });
    // "vai-retornar" — reação sem hora combinada.
    fora({ tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "vai-retornar" })] });
    // "agendou": visita com o inquilino, não captação (o caso LD-123).
    fora({ tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "agendou" })] });
    // Compromisso vencido marcado pelo próprio proprietário.
    fora({
      tentativas: [
        tentativa({
          data: "2026-07-01T10:00",
          resultado: "sem-resposta",
          aguardandoResultado: true,
          sugestaoIa: { resultado: "vai-retornar", retomarEm: "2026-07-08", resumo: "Retorna dia 8." },
        }),
      ],
    });
    // Resposta lida direto das notas do webhook (o caso LD-156, com 64
    // mensagens de CPF, fotos e "Já Assinei").
    fora({ notas: [{ id: "wa:MSG1", texto: "Resposta pelo WhatsApp: Já Assinei", data: "2026-07-08T10:00" }] });
  });

  it("o corte é só para captado: em captação, reação solta continua entrando", () => {
    const i = imovel({
      id: "1",
      status: "Novo contato",
      tentativas: [tentativa({ data: "2026-07-05T10:00", resultado: "respondeu" })],
    });
    expect(linhaTemperatura(i, HOJE)?.score).toBe(FAIXA.respondeu);
  });
});

describe("termometro", () => {
  it("ordena por faixa e, dentro dela, por quem espera há mais tempo", () => {
    const lista = termometro(
      [
        imovel({
          id: "respondeu",
          tentativas: [tentativa({ data: "2026-07-07T10:00", resultado: "respondeu" })],
        }),
        imovel({
          id: "agendou-antigo",
          tentativas: [tentativa({ data: "2026-07-02T10:00", resultado: "agendou" })],
        }),
        imovel({
          id: "agendou-recente",
          tentativas: [tentativa({ data: "2026-07-07T10:00", resultado: "agendou" })],
        }),
      ],
      HOJE,
    );
    expect(lista.map((l) => l.imovelId)).toEqual(["agendou-antigo", "agendou-recente", "respondeu"]);
  });

  it("respeita o limite", () => {
    const muitos = Array.from({ length: 20 }, (_, n) =>
      imovel({ id: `i${n}`, statusHistory: [{ status: "Novo contato", date: "2026-07-01" }] }),
    );
    expect(termometro(muitos, HOJE, 3)).toHaveLength(3);
  });

  it("unidade de desdobramento não aparece — a captação é do principal", () => {
    const principal = imovel({ id: "galpao" });
    const unidade = imovel({
      id: "sala-1",
      imovelPrincipalId: "galpao",
      statusHistory: [{ status: "Novo contato", date: "2026-07-01" }],
    });
    expect(termometro([principal, unidade], HOJE).map((l) => l.imovelId)).not.toContain("sala-1");
  });

  it("carteira sem sinal devolve lista vazia, não invenção", () => {
    expect(termometro([imovel({ id: "1", status: "Locado" })], HOJE)).toEqual([]);
  });
});
