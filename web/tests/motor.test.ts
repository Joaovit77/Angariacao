/* Testes de caracterização — motor de cálculo (Etapa 2).
   O oráculo (oracle-expected.json) é a saída REAL do app.js antigo
   sobre as fixtures; o port precisa reproduzi-la exatamente,
   inclusive nos comportamentos de borda (limiar de stale, comissão
   fallback, tempo negativo etc.). */
import { describe, it, expect, vi } from "vitest";
import {
  dataLocadoEfetiva, dataPublicadoEfetiva, dateEnteredStatus, currentStatusSince, isPausado, isStale,
  daysInCurrentStatus, comissaoEstimada, comissaoRecebidaValor,
  tempoAteLocacao, metricsForRange, foiAngariado, dataAngariadoEfetiva,
  imoveisAngariadosNoMes, imoveisAngariadosNoPeriodo,
  imoveisContatadosNoMes, imoveisContatadosNoPeriodo,
  imoveisLocadosNoMes, groupCount, historicoComStatus, marcoDoStatus,
  ultimoMovimentoISO, diasSemMovimento,
} from "@/lib/calculo/motor";
import type { Imovel } from "@/lib/tipos";
import { congelaRelogio, INSTANTE_ORACULO } from "./setup-relogio";
import fixturesJson from "./fixtures.json";
import oracle from "./oracle-expected.json";

congelaRelogio();

const imoveis = fixturesJson.imoveis as unknown as Imovel[];
const pct = fixturesJson.config.comissaoPercent;
const ids = (arr: Imovel[]) => arr.map((i) => i.id);

describe("caracterização por imóvel (todas as fixtures × todas as funções)", () => {
  for (const im of imoveis) {
    it(`fixture ${im.id} (${im.status})`, () => {
      const esperado = oracle.porImovel[im.id as keyof typeof oracle.porImovel];
      expect({
        dateEnteredStatus_NovoContato: dateEnteredStatus(im, "Novo contato"),
        dateEnteredStatus_Angariado: dateEnteredStatus(im, "Angariado"),
        dateEnteredStatus_Locado: dateEnteredStatus(im, "Locado"),
        currentStatusSince: currentStatusSince(im),
        isPausado: isPausado(im),
        isStale: isStale(im),
        daysInCurrentStatus: daysInCurrentStatus(im),
        comissaoEstimada: comissaoEstimada(im, pct),
        comissaoRecebidaValor: comissaoRecebidaValor(im, pct),
        tempoAteLocacao: tempoAteLocacao(im),
        foiAngariado: foiAngariado(im),
        dataAngariadoEfetiva: dataAngariadoEfetiva(im),
      }).toEqual(esperado);
    });
  }
});

describe("semânticas críticas do domínio (specs explícitas)", () => {
  const porId = (id: string) => imoveis.find((i) => i.id === id)!;

  it("registro criado ou status atual = Angariado NÃO conta como angariado sem histórico (f04)", () => {
    expect(porId("f04").status).toBe("Angariado");
    expect(foiAngariado(porId("f04"))).toBe(false);
  });
  it("limiar de stale: exatamente 7 dias parado JÁ é stale (f09), 6 dias não (f10)", () => {
    expect(isStale(porId("f09"))).toBe(true);
    expect(isStale(porId("f10"))).toBe(false);
  });
  it("status terminal negativo e Locado nunca são stale, mesmo parados (f05, f12)", () => {
    expect(isStale(porId("f05"))).toBe(false);
    expect(isStale(porId("f12"))).toBe(false);
  });
  it("pausadoAte no próprio dia ainda pausa (f07); vencido ontem volta a valer stale (f08)", () => {
    expect(isPausado(porId("f07"))).toBe(true);
    expect(isPausado(porId("f08"))).toBe(false);
    expect(isStale(porId("f08"))).toBe(true);
  });
  it("comissão recebida sem valor informado cai na estimada (f11: 2400 × 50% = 1200)", () => {
    expect(comissaoRecebidaValor(porId("f11"), pct)).toBe(1200);
  });
  it("comissão marcada como recebida em imóvel NÃO locado vale 0 (f13)", () => {
    expect(comissaoRecebidaValor(porId("f13"), pct)).toBe(0);
  });
  it("registro legado sem histórico usa dataAngariacao como entrada em Novo contato (f02)", () => {
    expect(dateEnteredStatus(porId("f02"), "Novo contato")).toBe("2026-06-01");
  });
  it("histórico com status repetido: primeira entrada vale para dateEnteredStatus, última para currentStatusSince (f16)", () => {
    expect(dateEnteredStatus(porId("f16"), "Novo contato")).toBe("2026-06-01");
    expect(currentStatusSince(porId("f16"))).toBe("2026-06-20");
  });
});

/* ------------------------------------------------------------------
   "PARADO" É AUSÊNCIA DE MOVIMENTO

   O oráculo acima continua verde porque as fixtures do app antigo não
   têm `tentativas` nem `notas` — sem elas, movimento é exatamente a
   mudança de status, e nada mudou. Estes testes cobrem o que só passou
   a existir depois: tentativa registrada e resposta do proprietário
   chegando pelo webhook.

   Hoje congelado em 2026-07-09 (ver setup-relogio).
   ------------------------------------------------------------------ */
describe("isStale conta movimento, não mudança de status", () => {
  const HA_20_DIAS = "2026-06-19";

  function imovel(over: Partial<Imovel> = {}): Imovel {
    return {
      id: "m1",
      status: "Novo contato",
      statusHistory: [{ status: "Novo contato", date: HA_20_DIAS }],
      ...over,
    } as Imovel;
  }

  const tentativaEm = (dia: string) => [{ id: "t1", data: `${dia}T10:00` }] as Imovel["tentativas"];
  const respostaEm = (dia: string) =>
    [{ id: "wa:MSG1", texto: "Resposta pelo WhatsApp: oi", data: `${dia}T10:00` }] as Imovel["notas"];

  it("sem tentativa e sem nota, segue valendo o tempo no status (comportamento antigo)", () => {
    const i = imovel();
    expect(ultimoMovimentoISO(i)).toBe(HA_20_DIAS);
    expect(diasSemMovimento(i)).toBe(20);
    expect(isStale(i)).toBe(true);
  });

  it("tentativa recente tira o selo mesmo com o status parado há 20 dias", () => {
    const i = imovel({ tentativas: tentativaEm("2026-07-07") });
    expect(diasSemMovimento(i)).toBe(2);
    expect(isStale(i)).toBe(false);
    // O funil continua medido por status — este número NÃO muda.
    expect(daysInCurrentStatus(i)).toBe(20);
  });

  it("tentativa antiga: segue parado, mas contado desde ela (10 dias, não 20)", () => {
    const i = imovel({ tentativas: tentativaEm("2026-06-29") });
    expect(diasSemMovimento(i)).toBe(10);
    expect(isStale(i)).toBe(true);
  });

  it("resposta do proprietário é movimento — o caso LD-55", () => {
    // Follow-up há 10 dias, o proprietário respondeu ontem: o app sabia dos
    // dois e ainda assim cobrava "parado há 20 dias".
    const i = imovel({
      tentativas: tentativaEm("2026-06-29"),
      notas: respostaEm("2026-07-08"),
    });
    expect(ultimoMovimentoISO(i)).toBe("2026-07-08");
    expect(isStale(i)).toBe(false);
  });

  it("a nota do ENCERRAMENTO automático não é movimento — é o app falando", () => {
    const i = imovel({
      notas: [
        { id: "wa:MSG1:encerrado", texto: "Imóvel marcado como Perdido…", data: `${"2026-07-08"}T10:00` },
      ],
    });
    expect(diasSemMovimento(i)).toBe(20);
    expect(isStale(i)).toBe(true);
  });

  it("nota escrita à mão pelo corretor não é movimento (não distingue ação de lembrete)", () => {
    const i = imovel({
      notas: [{ id: "n1", texto: "checar o IPTU depois", data: "2026-07-08T10:00" }],
    });
    expect(diasSemMovimento(i)).toBe(20);
    expect(isStale(i)).toBe(true);
  });

  it("pausado e terminal continuam fora, por mais movimento que tenham", () => {
    expect(isStale(imovel({ status: "Perdido" }))).toBe(false);
    expect(isStale(imovel({ status: "Locado" }))).toBe(false);
    expect(isStale(imovel({ pausadoAte: "2026-07-20" }))).toBe(false);
  });

  it("Angariado mantém o prazo longo: 20 dias sem movimento ainda não é parado", () => {
    const i = imovel({
      status: "Angariado",
      statusHistory: [{ status: "Angariado", date: HA_20_DIAS }],
    });
    expect(diasSemMovimento(i)).toBe(20);
    expect(isStale(i)).toBe(false);
  });

  it("sem data nenhuma não há movimento nem selo", () => {
    const i = imovel({ statusHistory: [], dataAngariacao: null });
    expect(ultimoMovimentoISO(i)).toBeNull();
    expect(diasSemMovimento(i)).toBeNull();
    expect(isStale(i)).toBe(false);
  });

  it("o último movimento é o mais recente entre as três fontes", () => {
    const i = imovel({
      statusHistory: [{ status: "Em negociação", date: "2026-07-01" }],
      tentativas: tentativaEm("2026-06-20"),
      notas: respostaEm("2026-06-25"),
    });
    expect(ultimoMovimentoISO(i)).toBe("2026-07-01");
  });
});

describe("isStale com referência temporal explícita", () => {
  function imovelComUltimoMovimentoEm(data: string): Imovel {
    return {
      id: `stale-${data}`,
      status: "Novo contato",
      statusHistory: [{ status: "Novo contato", date: data }],
    } as Imovel;
  }

  it("mantém o resultado quando recebe explicitamente a mesma referência temporal", () => {
    const imovel = imovelComUltimoMovimentoEm("2026-07-02");

    expect(isStale(imovel)).toBe(isStale(imovel, "2026-07-09"));
  });

  it("não depende do relógio real quando a referência é explícita", () => {
    const imovel = {
      ...imovelComUltimoMovimentoEm("2026-08-01"),
      pausadoAte: "2026-08-14",
    };

    try {
      vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"));
      expect(isStale(imovel, "2026-08-13")).toBe(false);
    } finally {
      vi.setSystemTime(new Date(INSTANTE_ORACULO));
    }
  });

  it.each([
    ["abaixo do limite", "2026-08-07", false],
    ["exatamente no limite", "2026-08-06", true],
    ["acima do limite", "2026-08-05", true],
  ])("%s segue a regra atual", (_caso, ultimoMovimento, esperado) => {
    expect(isStale(imovelComUltimoMovimentoEm(ultimoMovimento), "2026-08-13")).toBe(esperado);
  });
});

describe("metricsForRange", () => {
  it("todas as fixtures", () => {
    expect(metricsForRange(imoveis, pct)).toEqual(oracle.metricsForRange.todos);
  });
  it("lista vazia", () => {
    expect(metricsForRange([], pct)).toEqual(oracle.metricsForRange.vazio);
  });
  it("só locados", () => {
    expect(metricsForRange(imoveis.filter((i) => i.status === "Locado"), pct)).toEqual(oracle.metricsForRange.soLocados);
  });
  it("tempo até locação negativo (f15) fica FORA da média, mas o imóvel conta como locado", () => {
    expect(tempoAteLocacao(imoveis.find((i) => i.id === "f15")!)).toBe(-4);
    expect(oracle.metricsForRange.todos.locados).toBe(5);
  });
});

describe("coortes mensais e períodos", () => {
  it("angariados no mês (pela data de ENTRADA em Angariado, não pela criação)", () => {
    expect(ids(imoveisAngariadosNoMes(imoveis, "2026-05"))).toEqual(oracle.porMes.angariadosNoMes["2026-05"]);
    expect(ids(imoveisAngariadosNoMes(imoveis, "2026-06"))).toEqual(oracle.porMes.angariadosNoMes["2026-06"]);
    expect(ids(imoveisAngariadosNoMes(imoveis, "2026-07"))).toEqual(oracle.porMes.angariadosNoMes["2026-07"]);
  });
  it("angariados no período", () => {
    expect(ids(imoveisAngariadosNoPeriodo(imoveis, "2026-06-01", "2026-06-30"))).toEqual(oracle.porMes.angariadosNoPeriodo["2026-06-01__2026-06-30"]);
    expect(ids(imoveisAngariadosNoPeriodo(imoveis, "2026-06-05", "2026-06-10"))).toEqual(oracle.porMes.angariadosNoPeriodo["2026-06-05__2026-06-10"]);
  });
  it("contatados no mês/período (pela dataAngariacao — topo do funil)", () => {
    expect(ids(imoveisContatadosNoMes(imoveis, "2026-06"))).toEqual(oracle.porMes.contatadosNoMes["2026-06"]);
    expect(ids(imoveisContatadosNoMes(imoveis, "2026-07"))).toEqual(oracle.porMes.contatadosNoMes["2026-07"]);
    expect(ids(imoveisContatadosNoPeriodo(imoveis, "2026-07-01", "2026-07-09"))).toEqual(oracle.porMes.contatadosNoPeriodo["2026-07-01__2026-07-09"]);
  });
  it("locados no mês (pela data de entrada em Locado)", () => {
    expect(ids(imoveisLocadosNoMes(imoveis, "2026-05"))).toEqual(oracle.porMes.locadosNoMes["2026-05"]);
    expect(ids(imoveisLocadosNoMes(imoveis, "2026-06"))).toEqual(oracle.porMes.locadosNoMes["2026-06"]);
    expect(ids(imoveisLocadosNoMes(imoveis, "2026-07"))).toEqual(oracle.porMes.locadosNoMes["2026-07"]);
  });
});

describe("marcos históricos permanentes", () => {
  it("preserva Angariado ao avançar para Publicado e Locado", () => {
    let historico = historicoComStatus([], "Angariado", "Documentação", "2026-08-10", { userId: "u1", source: "usuario" });
    historico = historicoComStatus(historico, "Publicado", "Angariado", "2026-08-12", { userId: "u2", source: "usuario" });
    historico = historicoComStatus(historico, "Locado", "Publicado", "2026-08-15", { userId: "u3", source: "usuario" });
    const i = { id: "marcos", endereco: "Rua", status: "Locado", statusHistory: historico } as Imovel;
    expect(marcoDoStatus(i, "Angariado")).toEqual({ status: "Angariado", date: "2026-08-10", userId: "u1", source: "usuario" });
    expect(dataPublicadoEfetiva(i)).toBe("2026-08-12");
    expect(dataLocadoEfetiva(i)).toBe("2026-08-15");
  });

  it("uma edição comum e uma reentrada não sobrescrevem o primeiro marco", () => {
    let historico = historicoComStatus([], "Publicado", "Angariado", "2026-08-01");
    historico = historicoComStatus(historico, "Publicado", "Publicado", "2026-08-02");
    historico = historicoComStatus(historico, "Angariado", "Publicado", "2026-08-03");
    historico = historicoComStatus(historico, "Publicado", "Angariado", "2026-08-04");
    const i = { id: "reaberto", endereco: "Rua", status: "Publicado", statusHistory: historico } as Imovel;
    expect(dataPublicadoEfetiva(i)).toBe("2026-08-01");
    expect(historico.filter((entrada) => entrada.status === "Publicado").map((entrada) => entrada.date)).toEqual(["2026-08-01", "2026-08-04"]);
  });

  it("prefere locadoEm real da Sophia e não usa updated_at", () => {
    const i = {
      id: "sophia",
      endereco: "Rua",
      status: "Publicado",
      locadoEm: "2026-08-05",
      statusHistory: [{ status: "Locado", date: "2026-08-07" }],
      updated_at: "2099-01-01",
    } as Imovel & { updated_at: string };
    expect(dataLocadoEfetiva(i)).toBe("2026-08-05");
  });

  it("legado sem fonte confiável permanece sem data de marco", () => {
    const i = { id: "legado", endereco: "Rua", status: "Locado", statusHistory: [] } as Imovel;
    expect(dataLocadoEfetiva(i)).toBeNull();
    expect(imoveisLocadosNoMes([i], "2026-08")).toEqual([]);
  });

  it("conta locação pelo evento mesmo após o status atual mudar", () => {
    const i = {
      id: "pago",
      endereco: "Rua",
      status: "Pago",
      statusHistory: [{ status: "Locado", date: "2026-08-09" }],
    } as Imovel;
    expect(imoveisLocadosNoMes([i], "2026-08")).toEqual([i]);
  });
});

describe("groupCount", () => {
  it("agrupa por bairro/tipo/status com 'Não informado' para vazios", () => {
    expect(groupCount(imoveis, (i) => i.bairro)).toEqual(oracle.groupCount.porBairro);
    expect(groupCount(imoveis, (i) => i.tipo)).toEqual(oracle.groupCount.porTipo);
    expect(groupCount(imoveis, (i) => i.status)).toEqual(oracle.groupCount.porStatus);
  });
});
