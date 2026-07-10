/* ================================================================
   BASELINE_ETAPA0.md como teste executável.
   Fixture: as linhas reais da conta de teste (tests/fixtures-baseline.json,
   gerada por scripts/gera-fixture-baseline.mjs). Relógio congelado em
   2026-07-09, o dia da captura do baseline.

   Cada número aqui foi copiado do BASELINE_ETAPA0.md — este arquivo é a
   rede que impede uma view portada de divergir do app antigo.
   ================================================================ */
import { describe, expect, it } from "vitest";
import { congelaRelogio } from "./setup-relogio";
import fixtures from "./fixtures-baseline.json";
import { fromDbAgenda, fromDbImovel, type DbAgendaRow, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { kpisDashboard, seriesDashboard } from "@/lib/calculo/dashboard";
import { buildInsights } from "@/lib/calculo/insights";
import { relatorioMensal, relatorioSemanal } from "@/lib/calculo/relatorios";
import { comissaoRecebidaValor, imoveisAngariadosNoMes, imoveisLocadosNoMes, isStale } from "@/lib/calculo/motor";
import { monthKey } from "@/lib/datas";
import { fmtMoney } from "@/lib/formatadores";

congelaRelogio();

/** fmtMoney com o espaço não-quebrável do Intl normalizado, para comparar texto. */
const dinheiro = (v: number) => fmtMoney(v).replace(/ /g, " ");

const imoveis = (fixtures.imoveis as DbImovelRow[]).map(fromDbImovel);
const agenda = (fixtures.agenda as DbAgendaRow[]).map(fromDbAgenda);
const comissaoPercent = Number(fixtures.user_config?.comissao_percent ?? 100);

describe("dataset do baseline", () => {
  it("tem o mesmo tamanho registrado no BASELINE_ETAPA0.md", () => {
    expect(imoveis).toHaveLength(14);
    expect(agenda).toHaveLength(8);
    expect(Object.keys(fixtures.metas)).toHaveLength(3);
    expect(comissaoPercent).toBe(50);
  });
});

describe("Dashboard (Julho de 2026)", () => {
  const kpis = kpisDashboard(imoveis, comissaoPercent);

  it("KPIs batem com o baseline", () => {
    expect(kpis.mKey).toBe("2026-07");
    expect(kpis.contatosThisMonth).toBe(1);
    expect(kpis.deltaContatos).toBe(-2);
    expect(kpis.angariacoesThisMonth).toBe(1);
    expect(kpis.deltaAngariacoes).toBe(-2);
    expect(kpis.locadosThisMonth).toBe(1);
    expect(kpis.deltaLocados).toBe(1);
    expect(kpis.overall.conversaoFechados.toFixed(0)).toBe("33");
    expect(Math.round(kpis.overall.tempoMedio as number)).toBe(23);
    expect(kpis.emAndamento).toBe(8);
    // Comparado por valor: fmtMoney usa espaço não-quebrável entre "R$" e o número.
    expect(kpis.comissaoEstMes).toBe(1800);
    expect(kpis.comissaoRecMes).toBe(1800);
    expect(Math.round(kpis.overall.valorMedioAluguel)).toBe(4107);
    expect(dinheiro(kpis.comissaoEstMes)).toBe("R$ 1.800");
    expect(dinheiro(kpis.overall.valorMedioAluguel)).toBe("R$ 4.107");
  });

  const series = seriesDashboard(imoveis, comissaoPercent);

  it("séries dos gráficos batem com o baseline", () => {
    // Rótulos capturados das instâncias do Chart.js do app antigo, ao vivo.
    expect(series.labels).toEqual(["fev de 26", "mar de 26", "abr de 26", "mai de 26", "jun de 26", "jul de 26"]);
    expect(series.angariacoesPorMes).toEqual([0, 0, 0, 1, 3, 1]);
    expect(series.locadosPorMes).toEqual([0, 0, 0, 1, 0, 1]);
    expect(series.bairroTop8).toEqual([
      ["Pinheiros", 4],
      ["Vila Madalena", 2],
      ["Jardim Paulista", 2],
      ["Cerqueira César", 2],
      ["Sumarezinho", 1],
      ["Vila Mariana", 1],
      ["Consolação", 1],
      ["Brás", 1],
    ]);
    expect(series.tipos).toEqual([
      ["Apartamento", 7],
      ["Casa", 2],
      ["Sobrado", 2],
      ["Kitnet/Studio", 1],
      ["Casa de Condomínio", 1],
      ["Galpão", 1],
    ]);
    expect(series.comissaoEstimadaPorMes).toEqual([0, 0, 0, 1500, 0, 1800]);
    expect(series.comissaoRecebidaPorMes).toEqual([0, 0, 0, 0, 1500, 1800]);
    // Funil atual: Novo contato 2, Visita agendada 1, Em negociação 1,
    // Documentação 1, Angariado 2, Publicado 1, Locado 2.
    expect(series.funil).toEqual([2, 1, 1, 1, 2, 1, 2]);
  });
});

describe("Pipeline", () => {
  it("badges de stale nos mesmos 4 imóveis do baseline", () => {
    const parados = imoveis.filter(isStale).map((i) => i.codigo).sort();
    expect(parados).toEqual(["AP-008", "CA-002", "CA-007", "SO-004"]);
  });
});

describe("Metas (Julho de 2026)", () => {
  const recebidaNoMes = (key: string) =>
    imoveis.reduce(
      (s, i) =>
        i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === key
          ? s + comissaoRecebidaValor(i, comissaoPercent)
          : s,
      0,
    );

  it("progresso do mês corrente bate com o baseline", () => {
    expect(imoveisAngariadosNoMes(imoveis, "2026-07")).toHaveLength(1); // meta 5 -> 20%
    expect(imoveisLocadosNoMes(imoveis, "2026-07")).toHaveLength(1); // meta 2 -> 50%
    expect(recebidaNoMes("2026-07")).toBe(1800); // meta 5000 -> 36%
  });

  it("histórico dos meses anteriores bate com o baseline", () => {
    expect(imoveisAngariadosNoMes(imoveis, "2026-06")).toHaveLength(3);
    expect(imoveisLocadosNoMes(imoveis, "2026-06")).toHaveLength(0);
    expect(recebidaNoMes("2026-06")).toBe(1500);

    expect(imoveisAngariadosNoMes(imoveis, "2026-05")).toHaveLength(1);
    expect(imoveisLocadosNoMes(imoveis, "2026-05")).toHaveLength(1);
    expect(recebidaNoMes("2026-05")).toBe(0);
  });
});

describe("Insights", () => {
  const insights = buildInsights(imoveis, comissaoPercent);

  it("gera os 9 cards do baseline, na mesma ordem", () => {
    expect(insights).toHaveLength(9);
    expect(insights.map((i) => i.icon)).toEqual(["📍", "✅", "📞", "🔎", "📈", "🚧", "🔄", "🔍", "🎯"]);
  });

  it("os números de cada card batem com o baseline", () => {
    expect(insights[0].title).toContain("Pinheiros");
    expect(insights[0].text).toContain("4 de 14 imóveis (29%)");
    expect(insights[1].title).toContain("Apartamento");
    expect(insights[1].text).toContain("33%");
    expect(insights[1].text).toContain("(7 cadastrados)");
    expect(insights[2].title).toContain("Ligação telefônica");
    expect(insights[2].text).toContain("50%");
    expect(insights[2].text).toContain("(3 contatos)");
    expect(insights[3].title).toContain("Prospecção ativa");
    expect(insights[3].text).toContain("3 dos seus imóveis");
    expect(insights[4].title).toContain("Julho de 2026");
    expect(insights[4].text).toContain("Foram 1 imóveis locados");
    expect(insights[5].title).toBe('Gargalo em "Novo contato"');
    expect(insights[5].text).toContain("1 imóvel(is)");
    expect(insights[6].title).toBe("4 imóveis estagnados no pipeline");
    expect(insights[7].title).toBe("Principal motivo de perda: Optou por outra imobiliária");
    expect(insights[7].text).toContain("1 de 3 perdas registradas (33%)");
    expect(insights[8].title).toBe("Taxa de conversão geral: 33%");
    expect(insights[8].text).toContain("os 6 processos já encerrados");
  });
});

describe("Relatórios", () => {
  it("mensal de Julho/2026 bate com o baseline", () => {
    const r = relatorioMensal(imoveis, comissaoPercent, "2026-07");
    expect(r.contatosAtual).toBe(1);
    expect(r.contatosAtual - r.contatosAnterior).toBe(-2);
    expect(r.totalAtual).toBe(1);
    expect(r.totalAtual - r.totalAnterior).toBe(-2);
    expect(r.locadosAtual).toBe(1);
    expect(r.locadosAtual - r.locadosAnterior).toBe(1);
    // A3 (pós-migração): conversão do relatório alinhada ao Dashboard —
    // locados ÷ processos fechados, escopada ao período. Julho: 1 locado e
    // 1 terminal fechados no mês → 50%. (O app antigo mostrava 100% aqui,
    // por usar locados ÷ angariados; divergência intencional.)
    expect(r.conversao.toFixed(0)).toBe("50");
    expect(r.comissaoRec).toBe(1800);
    expect(r.comissaoRec - r.comissaoRecAnterior).toBe(300);
    expect(r.comissaoEst).toBe(1800);
    expect(r.imoveisAtual.map((i) => i.codigo)).toEqual(["KT-006"]);
  });

  it("semanal da semana corrente bate com o baseline", () => {
    const r = relatorioSemanal(imoveis, comissaoPercent, 0);
    expect(r.period).toBe("06/07/2026 a 12/07/2026");
    expect(r.contatosAtual).toBe(0);
    expect(r.contatosAtual - r.contatosAnterior).toBe(-1);
    expect(r.totalAtual).toBe(0);
    expect(r.totalAtual - r.totalAnterior).toBe(-1);
    expect(r.locadosAtual).toBe(0);
    expect(r.locadosAtual - r.locadosAnterior).toBe(-1);
    expect(r.conversao).toBe(0);
    expect(r.comissaoRec).toBe(1800);
    expect(r.comissaoRecAnterior).toBe(0);
    expect(r.comissaoEst).toBe(0);
    expect(r.imoveisAtual).toHaveLength(0);
  });
});

describe("Mapa", () => {
  it("8 imóveis localizados, 6 sem localização", () => {
    const comLocalizacao = imoveis.filter((i) => i.latitude != null && i.longitude != null);
    expect(comLocalizacao).toHaveLength(8);
    expect(imoveis.length - comLocalizacao.length).toBe(6);
  });
});
