/* A recomendação no MOMENTO DA ESCOLHA (abordagensParaEnvio / momentoDoContato
   em lib/calculo/abordagens.ts). O ranking já existia; o que estes testes
   protegem é o que impede a sugestão de virar palpite: amostra mínima e a
   distinção entre abertura e seguimento. */
import { describe, expect, it } from "vitest";
import { abordagensParaEnvio, momentoDoContato, MIN_TENTATIVAS } from "@/lib/calculo/abordagens";
import type { Abordagem, Imovel, Tentativa } from "@/lib/tipos";
import { congelaRelogio } from "./setup-relogio";

congelaRelogio();

/* O ranking passou a derivar o desfecho de cada tentativa (ver
   calculo/resultadoObservado.ts), então precisa saber que dia é hoje. */
const HOJE = "2026-07-31";

const abordagem = (id: string, nome: string): Abordagem => ({ id, nome, roteiro: `Roteiro ${nome}`, arquivada: false });

function tentativa(abordagemId: string | null, dia: number, resultado: Tentativa["resultado"] = "sem-resposta"): Tentativa {
  return { id: `t${abordagemId}${dia}`, data: `2026-07-${String(dia).padStart(2, "0")}T10:00`, abordagemId, resultado };
}

/** Imóvel angariado (ou não) com as tentativas dadas. */
function imovel(id: string, angariado: boolean, tentativas: Tentativa[]): Imovel {
  return {
    id,
    endereco: `Rua ${id}`,
    status: angariado ? "Angariado" : "Novo contato",
    statusHistory: angariado
      ? [
          { status: "Novo contato", date: "2026-07-01" },
          { status: "Angariado", date: "2026-07-08" },
        ]
      : [{ status: "Novo contato", date: "2026-07-01" }],
    tentativas,
  };
}

describe("momentoDoContato", () => {
  it("imóvel sem tentativa é abertura", () => {
    expect(momentoDoContato(imovel("a", false, []))).toBe("abertura");
  });

  it("imóvel com tentativa é seguimento", () => {
    expect(momentoDoContato(imovel("a", false, [tentativa("x", 2)]))).toBe("seguimento");
  });

  it("tentativa com número errado não conta como contato feito", () => {
    // O roteiro não chegou a ser lido por ninguém — a conversa nunca começou.
    expect(momentoDoContato(imovel("a", false, [tentativa("x", 2, "numero-errado")]))).toBe("abertura");
  });
});

describe("abordagensParaEnvio", () => {
  const boa = abordagem("boa", "Avaliação gratuita");
  const fraca = abordagem("fraca", "Só um oi");
  const nova = abordagem("nova", "Recém-cadastrada");

  it("sem histórico nenhum, preserva a ordem do catálogo e não recomenda nada", () => {
    const r = abordagensParaEnvio([boa, fraca, nova], [], "abertura", HOJE);
    expect(r.map((l) => l.abordagem.id)).toEqual(["boa", "fraca", "nova"]);
    expect(r.every((l) => l.selo === null)).toBe(true);
    expect(r.some((l) => l.recomendada)).toBe(false);
  });

  it("uma tentativa só não vira recomendação nem selo", () => {
    // 100% de uma vez é acidente, não desempenho — e recomendá-lo faria o
    // ranking se autoconfirmar.
    const imoveis = [imovel("i1", true, [tentativa("boa", 2)])];
    const r = abordagensParaEnvio([boa, fraca], imoveis, "abertura", HOJE);
    expect(r.some((l) => l.recomendada)).toBe(false);
    expect(r.find((l) => l.abordagem.id === "boa")?.selo).toBeNull();
  });

  it("com amostra suficiente, a melhor sobe, ganha selo e é recomendada", () => {
    // "boa": 3 tentativas em 3 imóveis, todos angariados → 100% de angariação.
    // "fraca": 3 tentativas em 3 imóveis, nenhum angariado → 0%.
    const imoveis = [
      imovel("i1", true, [tentativa("boa", 2)]),
      imovel("i2", true, [tentativa("boa", 3)]),
      imovel("i3", true, [tentativa("boa", 4)]),
      imovel("i4", false, [tentativa("fraca", 2)]),
      imovel("i5", false, [tentativa("fraca", 3)]),
      imovel("i6", false, [tentativa("fraca", 4)]),
    ];
    // No catálogo, "fraca" vem antes — o ranking tem que inverter isso.
    const r = abordagensParaEnvio([fraca, boa, nova], imoveis, "abertura", HOJE);
    expect(r.map((l) => l.abordagem.id)).toEqual(["boa", "fraca", "nova"]);
    expect(r[0].recomendada).toBe(true);
    expect(r[0].selo).toBe(`100% de angariação · ${MIN_TENTATIVAS} usos`);
    // A pior tem amostra, então tem selo — mas não é recomendada.
    expect(r[1].selo).toBe("0% de angariação · 3 usos");
    expect(r[1].recomendada).toBe(false);
    // A sem histórico fica no fim, sem selo.
    expect(r[2].selo).toBeNull();
  });

  it("não recomenda a líder quando ela angaria 0%", () => {
    // Toda a carteira sem angariação: há amostra, mas sugerir a "melhor" seria
    // sugerir repetir o que não funcionou.
    const imoveis = [
      imovel("i1", false, [tentativa("fraca", 2)]),
      imovel("i2", false, [tentativa("fraca", 3)]),
      imovel("i3", false, [tentativa("fraca", 4)]),
    ];
    const r = abordagensParaEnvio([fraca, boa], imoveis, "abertura", HOJE);
    expect(r[0].abordagem.id).toBe("fraca");
    expect(r[0].selo).toBe("0% de angariação · 3 usos");
    expect(r.some((l) => l.recomendada)).toBe(false);
  });

  it("o momento desempata entre abordagens igualmente comprovadas", () => {
    // As duas com 3 usos e 100% de angariação. "aber" só foi usada como 1ª
    // tentativa; "segu" só depois de outra. O empate é resolvido pelo momento.
    const aber = abordagem("aber", "Primeiro contato");
    const segu = abordagem("segu", "Retomada");
    const imoveis = [
      imovel("i1", true, [tentativa("aber", 2)]),
      imovel("i2", true, [tentativa("aber", 3)]),
      imovel("i3", true, [tentativa("aber", 4)]),
      imovel("i4", true, [tentativa("outra", 2), tentativa("segu", 5)]),
      imovel("i5", true, [tentativa("outra", 3), tentativa("segu", 6)]),
      imovel("i6", true, [tentativa("outra", 4), tentativa("segu", 7)]),
    ];
    expect(abordagensParaEnvio([segu, aber], imoveis, "abertura", HOJE)[0].abordagem.id).toBe("aber");
    expect(abordagensParaEnvio([aber, segu], imoveis, "seguimento", HOJE)[0].abordagem.id).toBe("segu");
  });

  it("não perde nem duplica abordagem do catálogo", () => {
    const imoveis = [imovel("i1", true, [tentativa("boa", 2)])];
    const r = abordagensParaEnvio([boa, fraca, nova], imoveis, "seguimento", HOJE);
    expect(r).toHaveLength(3);
    expect(new Set(r.map((l) => l.abordagem.id)).size).toBe(3);
  });
});
