/* Idade do anúncio (lib/calculo/idadeAnuncio).
   Feature nova da pós-migração. O que os testes fixam é a honestidade da
   medida: quem entra na taxa, quem fica de fora e quando a amostra não
   sustenta conclusão. */
import { describe, expect, it } from "vitest";
import { analisarIdadeAnuncio, MIN_AMOSTRA_FAIXA } from "@/lib/calculo/idadeAnuncio";
import type { Imovel } from "@/lib/tipos";

let seq = 0;
function imovel(over: Partial<Imovel> = {}): Imovel {
  seq += 1;
  return { id: `ia${seq}`, endereco: `Rua ${seq}`, status: "Novo contato", ...over };
}

/** Angariado com a idade de anúncio informada. */
function angariado(idade: number): Imovel {
  return imovel({
    anuncioIdadeDias: idade,
    status: "Angariado",
    statusHistory: [
      { status: "Novo contato", date: "2026-07-01" },
      { status: "Angariado", date: "2026-07-05" },
    ],
  });
}

/** Encerrado sem nunca ter angariado. */
function perdido(idade: number): Imovel {
  return imovel({
    anuncioIdadeDias: idade,
    status: "Perdido",
    statusHistory: [{ status: "Novo contato", date: "2026-07-01" }],
  });
}

const faixaDe = (imoveis: Imovel[], id: string) =>
  analisarIdadeAnuncio(imoveis).faixas.find((f) => f.id === id)!;

describe("analisarIdadeAnuncio", () => {
  it("separa os desfechos nas faixas certas", () => {
    const lista = [angariado(0), angariado(3), perdido(5), angariado(10), perdido(90)];
    expect(faixaDe(lista, "0-3").angariados).toBe(2);
    expect(faixaDe(lista, "4-7").decididos).toBe(1);
    expect(faixaDe(lista, "4-7").angariados).toBe(0);
    expect(faixaDe(lista, "8-30").angariados).toBe(1);
    expect(faixaDe(lista, "31+").decididos).toBe(1);
  });

  it("a taxa é sobre DECIDIDOS — lead em aberto não é derrota", () => {
    // Sem isto, a taxa despencaria a cada dia de prospecção bem-feita, que é o
    // oposto do que ela deveria dizer (mesma regra de `conversaoCaptacao`).
    const lista = [angariado(1), perdido(1), imovel({ anuncioIdadeDias: 1 })];
    const f = faixaDe(lista, "0-3");
    expect(f.decididos).toBe(2);
    expect(f.emAberto).toBe(1);
    expect(f.taxa).toBe(50);
  });

  it("'Locado' conta como captação ganha mesmo sem a etapa no histórico", () => {
    const locadoDireto = imovel({
      anuncioIdadeDias: 2,
      status: "Locado",
      statusHistory: [{ status: "Locado", date: "2026-07-10" }],
    });
    const f = faixaDe([locadoDireto], "0-3");
    expect(f.angariados).toBe(1);
    expect(f.taxa).toBe(100);
  });

  it("imóvel sem idade registrada não entra na conta — nem como zero", () => {
    // Fingir idade 0 para o histórico antigo inventaria justamente a resposta
    // que a análise deveria descobrir.
    const analise = analisarIdadeAnuncio([angariado(1), imovel({ status: "Perdido" })]);
    expect(analise.comIdade).toBe(1);
    expect(analise.semIdade).toBe(1);
    expect(faixaDe([angariado(1), imovel({ status: "Perdido" })], "0-3").decididos).toBe(1);
  });

  it("marca a faixa cuja amostra não sustenta conclusão", () => {
    const poucos = [angariado(1), perdido(1)];
    expect(faixaDe(poucos, "0-3").amostraSuficiente).toBe(false);

    const bastantes = Array.from({ length: MIN_AMOSTRA_FAIXA }, () => perdido(1));
    expect(faixaDe(bastantes, "0-3").amostraSuficiente).toBe(true);
  });

  it("faixa sem nenhum desfecho devolve taxa null, não zero", () => {
    // Zero diria "essa faixa nunca converte"; null diz "não sei ainda".
    const f = faixaDe([angariado(1)], "31+");
    expect(f.decididos).toBe(0);
    expect(f.taxa).toBeNull();
  });

  it("unidade desdobrada não conta — a captação é do imóvel principal", () => {
    const unidade = imovel({
      anuncioIdadeDias: 1,
      imovelPrincipalId: "principal",
      status: "Angariado",
      statusHistory: [{ status: "Angariado", date: "2026-07-05" }],
    });
    const analise = analisarIdadeAnuncio([unidade]);
    expect(analise.comIdade).toBe(0);
    expect(analise.faixas.every((f) => f.decididos === 0)).toBe(true);
  });

  it("idade negativa é dado corrompido e fica fora", () => {
    const analise = analisarIdadeAnuncio([imovel({ anuncioIdadeDias: -5, status: "Perdido" })]);
    expect(analise.comIdade).toBe(0);
    expect(analise.semIdade).toBe(1);
  });
});
