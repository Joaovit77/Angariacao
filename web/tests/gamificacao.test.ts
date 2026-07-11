/* Medalhas da gamificação (lib/calculo/gamificacao) — feature nova da
   pós-migração, sem oráculo do app antigo. As funções são determinísticas
   a partir dos parâmetros (nenhuma usa o relógio), então os testes fixam
   o contrato com fixtures de statusHistory controlado. */
import { describe, expect, it } from "vitest";
import {
  angariacaoMaisRapidaDias,
  calcularBadges,
  maiorSequenciaDeMetasBatidas,
  melhorSemanaDeAngariacao,
  mesesComMetaDeAngariacaoBatida,
} from "@/lib/calculo/gamificacao";
import type { Imovel, Metas } from "@/lib/tipos";

let seq = 0;
function imovel(overrides: Partial<Imovel>): Imovel {
  seq += 1;
  return { id: `g${seq}`, endereco: `Rua ${seq}`, status: "Novo contato", ...overrides };
}

function angariadoEm(data: string, contatoEm?: string): Imovel {
  return imovel({
    status: "Angariado",
    statusHistory: [
      { status: "Novo contato", date: contatoEm || data },
      { status: "Angariado", date: data },
    ],
  });
}

const META = { locados: 0, comissao: 0, faturamento: 0 };

describe("melhorSemanaDeAngariacao", () => {
  it("agrupa pela segunda-feira da semana e devolve o pico", () => {
    // 2026-03-02 é segunda; 2026-03-08 é o domingo da MESMA semana.
    const imoveis = [
      angariadoEm("2026-03-02"),
      angariadoEm("2026-03-04"),
      angariadoEm("2026-03-08"),
      angariadoEm("2026-03-09"), // segunda da semana SEGUINTE
    ];
    expect(melhorSemanaDeAngariacao(imoveis)).toEqual({ semana: "2026-03-02", total: 3 });
  });

  it("sem angariações retorna null (imóvel só contatado não conta)", () => {
    const soContato = imovel({ statusHistory: [{ status: "Novo contato", date: "2026-03-02" }] });
    expect(melhorSemanaDeAngariacao([soContato])).toBeNull();
    expect(melhorSemanaDeAngariacao([])).toBeNull();
  });
});

describe("angariacaoMaisRapidaDias", () => {
  it("menor intervalo entre Novo contato e Angariado", () => {
    const imoveis = [
      angariadoEm("2026-03-10", "2026-03-05"), // 5 dias
      angariadoEm("2026-03-10", "2026-03-08"), // 2 dias
    ];
    expect(angariacaoMaisRapidaDias(imoveis)).toBe(2);
  });

  it("mesmo dia conta como 0; intervalos negativos são ignorados", () => {
    expect(angariacaoMaisRapidaDias([angariadoEm("2026-03-10", "2026-03-10")])).toBe(0);
    // histórico inconsistente (angariado "antes" do contato) não vira recorde
    expect(angariacaoMaisRapidaDias([angariadoEm("2026-03-05", "2026-03-10")])).toBeNull();
  });

  it("usa o fallback de dataAngariacao quando o histórico não tem Novo contato", () => {
    const legado = imovel({
      status: "Angariado",
      dataAngariacao: "2026-03-08",
      statusHistory: [{ status: "Angariado", date: "2026-03-10" }],
    });
    expect(angariacaoMaisRapidaDias([legado])).toBe(2);
  });
});

describe("mesesComMetaDeAngariacaoBatida / maiorSequenciaDeMetasBatidas", () => {
  const imoveis = [
    angariadoEm("2026-01-10"),
    angariadoEm("2026-02-10"),
    angariadoEm("2026-03-10"),
    angariadoEm("2026-05-10"),
  ];

  it("mês bate a meta quando realizado >= alvo (e alvo > 0)", () => {
    const metas: Metas = {
      "2026-01": { ...META, angariacoes: 1 },
      "2026-02": { ...META, angariacoes: 2 }, // só 1 angariado — não bate
      "2026-03": { ...META, angariacoes: 0 }, // sem meta — não conta
      "2026-05": { ...META, angariacoes: 1 },
    };
    expect(mesesComMetaDeAngariacaoBatida(imoveis, metas)).toEqual(["2026-01", "2026-05"]);
  });

  it("sequência exige meses consecutivos (buraco zera a corrida)", () => {
    const consecutivos: Metas = {
      "2026-01": { ...META, angariacoes: 1 },
      "2026-02": { ...META, angariacoes: 1 },
      "2026-03": { ...META, angariacoes: 1 },
      "2026-05": { ...META, angariacoes: 1 },
    };
    expect(maiorSequenciaDeMetasBatidas(imoveis, consecutivos)).toBe(3);

    const comBuraco: Metas = {
      "2026-01": { ...META, angariacoes: 1 },
      "2026-03": { ...META, angariacoes: 1 },
      "2026-05": { ...META, angariacoes: 1 },
    };
    expect(maiorSequenciaDeMetasBatidas(imoveis, comBuraco)).toBe(1);
    expect(maiorSequenciaDeMetasBatidas(imoveis, {})).toBe(0);
  });
});

describe("calcularBadges", () => {
  it("conta vazia: todas as medalhas bloqueadas", () => {
    const badges = calcularBadges([], {});
    expect(badges).toHaveLength(6);
    expect(badges.every((b) => !b.conquistada)).toBe(true);
    expect(badges.every((b) => b.detalhe === undefined)).toBe(true);
  });

  it("Angariador Ás exige 5 na mesma semana (4 espalhadas não contam)", () => {
    const espalhadas = [
      angariadoEm("2026-03-02"),
      angariadoEm("2026-03-09"),
      angariadoEm("2026-03-16"),
      angariadoEm("2026-03-23"),
    ];
    const as1 = calcularBadges(espalhadas, {}).find((b) => b.id === "angariador-as")!;
    expect(as1.conquistada).toBe(false);

    // 5 dentro de segunda..domingo (2026-03-02..2026-03-08)
    const mesmaSemana = ["2026-03-02", "2026-03-03", "2026-03-05", "2026-03-07", "2026-03-08"].map((d) =>
      angariadoEm(d),
    );
    const as2 = calcularBadges(mesmaSemana, {}).find((b) => b.id === "angariador-as")!;
    expect(as2.conquistada).toBe(true);
    expect(as2.detalhe).toContain("5 imóveis");
  });

  it("Sem Tempo a Perder: <= 2 dias conquista, 3 dias não", () => {
    const rapida = calcularBadges([angariadoEm("2026-03-10", "2026-03-08")], {});
    expect(rapida.find((b) => b.id === "sem-tempo-a-perder")!.conquistada).toBe(true);

    const lenta = calcularBadges([angariadoEm("2026-03-10", "2026-03-07")], {});
    expect(lenta.find((b) => b.id === "sem-tempo-a-perder")!.conquistada).toBe(false);
  });

  it("Primeira Angariação e Chave Entregue seguem o statusHistory, não o cadastro", () => {
    const soCadastrado = imovel({ statusHistory: [{ status: "Novo contato", date: "2026-03-02" }] });
    const b1 = calcularBadges([soCadastrado], {});
    expect(b1.find((b) => b.id === "primeira-angariacao")!.conquistada).toBe(false);
    expect(b1.find((b) => b.id === "chave-entregue")!.conquistada).toBe(false);

    const locado = imovel({
      status: "Locado",
      statusHistory: [
        { status: "Novo contato", date: "2026-03-02" },
        { status: "Angariado", date: "2026-03-05" },
        { status: "Locado", date: "2026-04-01" },
      ],
    });
    const b2 = calcularBadges([locado], {});
    expect(b2.find((b) => b.id === "primeira-angariacao")!.conquistada).toBe(true);
    expect(b2.find((b) => b.id === "chave-entregue")!.conquistada).toBe(true);
  });

  it("Meta Batida e Constância de Ferro derivam das metas mensais", () => {
    const imoveis = [angariadoEm("2026-01-10"), angariadoEm("2026-02-10"), angariadoEm("2026-03-10")];
    const metas: Metas = {
      "2026-01": { ...META, angariacoes: 1 },
      "2026-02": { ...META, angariacoes: 1 },
      "2026-03": { ...META, angariacoes: 1 },
    };
    const badges = calcularBadges(imoveis, metas);
    expect(badges.find((b) => b.id === "meta-batida")!.conquistada).toBe(true);
    const ferro = badges.find((b) => b.id === "constancia-de-ferro")!;
    expect(ferro.conquistada).toBe(true);
    expect(ferro.detalhe).toBe("3 meses consecutivos");
  });
});
