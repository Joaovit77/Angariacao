/* Testes de caracterização — motor de cálculo (Etapa 2).
   O oráculo (oracle-expected.json) é a saída REAL do app.js antigo
   sobre as fixtures; o port precisa reproduzi-la exatamente,
   inclusive nos comportamentos de borda (limiar de stale, comissão
   fallback, tempo negativo etc.). */
import { describe, it, expect } from "vitest";
import {
  dateEnteredStatus, currentStatusSince, isPausado, isStale,
  daysInCurrentStatus, comissaoEstimada, comissaoRecebidaValor,
  tempoAteLocacao, metricsForRange, foiAngariado, dataAngariadoEfetiva,
  imoveisAngariadosNoMes, imoveisAngariadosNoPeriodo,
  imoveisContatadosNoMes, imoveisContatadosNoPeriodo,
  imoveisLocadosNoMes, groupCount,
} from "@/lib/calculo/motor";
import type { Imovel } from "@/lib/tipos";
import { congelaRelogio } from "./setup-relogio";
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

describe("groupCount", () => {
  it("agrupa por bairro/tipo/status com 'Não informado' para vazios", () => {
    expect(groupCount(imoveis, (i) => i.bairro)).toEqual(oracle.groupCount.porBairro);
    expect(groupCount(imoveis, (i) => i.tipo)).toEqual(oracle.groupCount.porTipo);
    expect(groupCount(imoveis, (i) => i.status)).toEqual(oracle.groupCount.porStatus);
  });
});
