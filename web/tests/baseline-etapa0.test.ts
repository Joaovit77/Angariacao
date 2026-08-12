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
    /* Era "33" no baseline original. Divergência INTENCIONAL de 31/07/2026
       (a terceira, registrada no BASELINE_ETAPA0.md): "Sem resposta" deixou de
       contar como processo DECIDIDO, porque é silêncio e é o público que o
       follow-up em lote trabalha. Nas fixtures são 2 locados e 4 terminais, um
       deles "Sem resposta" — antes 2÷6 = 33%, agora 2÷5 = 40%. Ver
       `ehPerdaDecidida` no motor. */
    expect(kpis.overall.conversaoFechados.toFixed(0)).toBe("40");
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
    /* Funil atual: Novo contato 2, Visita agendada 1, Em negociação 1,
       Documentação 1, Angariado 2, Autorização assinada 0, Publicado 1,
       Locado 2.

       DIVERGÊNCIA ASSINADA vs. o baseline de 09/07/2026: a série tinha SETE
       posições e passou a ter OITO, com um zero na sexta. "Autorização
       assinada" entrou no `STATUS_FLOW` com a integração com o Sistema
       Principal — ver a nota no BASELINE_ETAPA0.md e o bloco em
       `lib/constantes.ts`.

       Nenhum número existente mudou, e é isso que o zero prova: o seed é
       anterior à integração, então nenhum imóvel dele passou por essa etapa.
       O dia em que este valor deixar de ser zero sem alguém ter mexido no
       seed é o dia em que um evento externo entrou no cálculo — que é
       justamente o que este teste existe para denunciar. */
    expect(series.funil).toEqual([2, 1, 1, 1, 2, 0, 1, 2]);
  });
});

describe("Pipeline", () => {
  // Divergência intencional do app antigo: Angariado/Publicado só contam como
  // "parado" após 60 dias (não 7), pois são etapas de imóvel já captado
  // aguardando locação. Isso tira do baseline o AP-008 (Publicado, 24d) e o
  // CA-007 (Angariado, 29d) — restam só as etapas de perseguição ativa.
  it("badges de stale só nas etapas de perseguição ativa", () => {
    const parados = imoveis.filter(isStale).map((i) => i.codigo).sort();
    expect(parados).toEqual(["CA-002", "SO-004"]);
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

  // Um índice pela CHAVE do ícone (única neste fixture; ver icones.tsx). Os cards
  // são gerados na ordem do código e reordenados por seção (ação → garimpo →
  // desempenho → padrões) e prioridade; localizamos cada um pela chave do ícone.
  const porIcone = (icone: string) => {
    const card = insights.find((i) => i.icon === icone);
    if (!card) throw new Error(`insight ausente: ${icone}`);
    return card;
  };

  // Com a regra nova de "parado", só 2 imóveis ficam estagnados (< 3), então o
  // card "estagnado" (que exige ao menos 3) não é gerado — 11 cards, não 12.
  //
  // DIVERGÊNCIA INTENCIONAL (eixo de captação, 2026-07-25): os rankings de
  // tipo/bairro/canal passaram a medir ANGARIAÇÃO em vez de LOCAÇÃO — ver o
  // bloco de cabeçalho em lib/calculo/insights.ts. Dois efeitos no fixture:
  //  - entra o card "aperto" (Taxa de angariação), com amostra de 9 desfechos
  //    contra os 6 da taxa de locação;
  //  - sai o card "telefone" (canal mais eficaz): a amostra mínima agora é de
  //    captações DECIDIDAS, e nenhum canal do fixture chega a 3. O card antigo
  //    aparecia com 3 imóveis apenas cadastrados, o que é justamente o tipo de
  //    afirmação sem lastro que MIN_SAMPLE existe para barrar.
  // O total segue em 11 por coincidência (um entrou, um saiu).
  it("gera os 11 cards do baseline, na ordem agrupada por seção", () => {
    expect(insights).toHaveLength(11);
    expect(insights.map((i) => i.icon)).toEqual([
      "funil", "ampulheta", "escopo", "aperto", "alvo", "alta", "check", "grafico", "local", "entrada", "busca",
    ]);
    // As seções saem em blocos, na ordem de INSIGHT_GROUP_ORDER.
    expect(insights.map((i) => i.group)).toEqual([
      "acao", "acao",
      "garimpo",
      "desempenho", "desempenho", "desempenho", "desempenho", "desempenho",
      "padroes", "padroes", "padroes",
    ]);
  });

  it("os números de cada card batem com o baseline", () => {
    expect(porIcone("local").title).toContain("Pinheiros");
    expect(porIcone("local").text).toContain("4 de 14 imóveis (29%)");
    /* O contraponto de retorno do bairro SUMIU, e isso é a rede de segurança
       funcionando. Com "Sem resposta" fora dos desfechos decididos (ver o KPI
       acima), Pinheiros caiu de 3 para 2 captações decididas e ficou abaixo da
       amostra mínima — então o app parou de afirmar uma taxa que não sustenta,
       em vez de exibir "50% (1 de 2)". Denominador menor é a contrapartida
       conhecida desta mudança. */
    expect(porIcone("local").text).not.toContain("angaria");
    /* Tipo mede ANGARIAÇÃO (não locação, como no app antigo). Era "2 de 4
       captações decididas (50%)"; virou 2 de 3 (67%) pelo mesmo motivo do KPI
       acima — um daqueles 4 era "Sem resposta", que deixou de ser desfecho
       decidido em 31/07/2026. Ver `ehPerdaDecidida`. */
    expect(porIcone("check").title).toContain("Apartamento");
    expect(porIcone("check").text).toContain("67%");
    expect(porIcone("check").text).toContain("(2 de 3)");
    expect(porIcone("check").text).toContain("1 já virou locação");
    /* A taxa de angariação: 5 angariadas contra 3 perdidas antes do sim, com 6
       ainda em disputa (fora da conta, porque lead em aberto não é derrota).
       Era 56% (5 de 9) no baseline: uma das 4 "perdidas" era "Sem resposta",
       que em 31/07/2026 passou para "em disputa" — ela é silêncio, e o
       follow-up ainda a trabalha. Ver `ehPerdaDecidida` no motor. */
    expect(porIcone("aperto").title).toBe("Taxa de angariação: 63%");
    expect(porIcone("aperto").text).toContain("5 angariações contra 3 perdidas antes do sim");
    expect(porIcone("aperto").text).toContain("Outras 6 captações seguem em disputa");
    expect(porIcone("entrada").title).toContain("Prospecção ativa");
    expect(porIcone("entrada").text).toContain("3 imóveis do pipeline");
    expect(porIcone("entrada").text).toContain("não representa tentativas ou mensagens");
    expect(porIcone("grafico").title).toContain("Julho de 2026");
    expect(porIcone("grafico").text).toContain("1 imóveis locados");
    expect(porIcone("funil").title).toBe('Gargalo em "Novo contato"');
    expect(porIcone("funil").text).toContain("1 imóvel(is)");
    expect(porIcone("busca").title).toBe("Principal motivo de perda: Optou por outra imobiliária");
    expect(porIcone("busca").text).toContain("1 de 3 perdas registradas (33%)");
    /* Mesma divergência do KPI do Dashboard, e propositalmente igual a ele: os
       "processos já encerrados" caíram de 6 para 5 porque "Sem resposta" saiu
       da conta (31/07/2026). Se estes dois números voltarem a divergir entre
       si, é bug — não recorte novo. */
    expect(porIcone("alvo").title).toBe("Taxa de conversão geral: 40%");
    expect(porIcone("alvo").text).toContain("os 5 processos já encerrados");
    // Card por-imóvel: o mais parado da carteira, nominal. Com a regra nova,
    // Angariado/Publicado não entram, então o topo passa a ser CA-002.
    expect(porIcone("ampulheta").title).toBe("CA-002 é o mais parado: 12 dias");
    // O NÚMERO do baseline não mudou (12 dias): estas fixtures não têm
    // tentativas nem notas, então "sem movimento" é o mesmo que "no status".
    // A frase é que passou a dizer movimento em vez de etapa — ver
    // `diasSemMovimento` no motor.
    expect(porIcone("ampulheta").text).toContain("há 12 dias sem nenhum movimento");
    expect(porIcone("ampulheta").text).toContain('segue em "Novo contato"');
    // Tendência mês a mês (Julho/2026 = 1 vs Junho/2026 = 0).
    expect(porIcone("alta").title).toContain("Julho de 2026");
    expect(porIcone("alta").text).toContain("contra 0 em Junho de 2026");
    // Garimpo: 2 imóveis com fonte nomeada + 1 com origem "Garimpo em site".
    expect(porIcone("escopo").title).toBe("Garimpo em concorrentes: 3 imóveis");
    expect(porIcone("escopo").text).toContain("3 de 14 angariações (21%)");
  });

  it("os cards acionáveis apontam para a ação certa do Pipeline", () => {
    expect(porIcone("funil").action).toEqual({ tipo: "coluna", col: "status", valor: "Novo contato" });
    expect(porIcone("check").action).toEqual({ tipo: "coluna", col: "tipo", valor: "Apartamento" });
    expect(porIcone("local").action).toEqual({ tipo: "coluna", col: "bairro", valor: "Pinheiros" });
    expect(porIcone("entrada").action).toEqual({
      tipo: "coluna",
      col: "origem",
      valor: "Prospecção ativa (porta a porta)",
    });
    // O card por-imóvel busca pelo código do imóvel específico.
    expect(porIcone("ampulheta").action).toEqual({ tipo: "busca", termo: "CA-002", rotulo: "Ver imóvel →" });
    // Cards sem recorte equivalente não oferecem atalho.
    expect(porIcone("aperto").action).toBeUndefined();
    expect(porIcone("alvo").action).toBeUndefined();
    expect(porIcone("escopo").action).toBeUndefined();
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
