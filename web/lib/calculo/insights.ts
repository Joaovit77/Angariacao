/* ================================================================
   INSIGHTS — motor de regras (parte pura)
   Motor de regras simples (sem IA externa) que lê os dados atuais e
   gera observações específicas e acionáveis. Cada insight só aparece
   se houver dados suficientes para sustentá-lo (evita afirmações
   vazias), traz números concretos e, quando possível, um atalho para
   os imóveis no Pipeline.

   Enquadramento importante: a "imobiliária concorrente" registrada num
   imóvel é a FONTE do garimpo (onde a corretora achou o anúncio e foi
   atrás de angariar), não uma rival disputando o proprietário. Os
   insights de garimpo tratam isso como canal de prospecção.
   ================================================================ */
import { ORIGEM_GARIMPO_SITE, STALE_DAYS_THRESHOLD, STATUS_TERMINAL_NEGATIVE } from "../constantes";
import { monthKey, monthLabelLong, shiftMonthKey } from "../datas";
import type { Imovel } from "../tipos";
import type { PipelineCol } from "./filtros";
import {
  dateEnteredStatus,
  daysInCurrentStatus,
  groupCount,
  isStale,
  metricsForRange,
  tempoAteLocacao,
} from "./motor";

/** mínimo de imóveis para uma métrica ser considerada confiável */
export const MIN_SAMPLE = 3;

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

/** Um imóvel foi garimpado quando registra a imobiliária-fonte onde foi achado. */
const ehGarimpado = (i: Imovel) => !!(i.imobiliariaConcorrente && i.imobiliariaConcorrente.trim());
const fonteGarimpo = (i: Imovel) => (i.imobiliariaConcorrente || "").trim();

/** Agrupamento temático dos insights, na ordem em que as seções aparecem. */
export type InsightGroup = "acao" | "garimpo" | "desempenho" | "padroes";

export const INSIGHT_GROUP_ORDER: readonly InsightGroup[] = ["acao", "garimpo", "desempenho", "padroes"];

// `icon` é a CHAVE do ícone (ver components/insights/icones.tsx), não um emoji.
export const INSIGHT_GROUP_META: Record<InsightGroup, { icon: string; label: string; sub: string }> = {
  acao: { icon: "alerta", label: "Precisa de atenção", sub: "Onde o pipeline está travando agora" },
  garimpo: { icon: "escopo", label: "Garimpo em concorrentes", sub: "De onde você tira suas oportunidades" },
  desempenho: { icon: "alta", label: "Desempenho", sub: "O que os seus números dizem" },
  padroes: { icon: "camadas", label: "Padrões da carteira", sub: "Leitura do perfil das suas angariações" },
};

/** Ação de um card: leva ao Pipeline filtrado por uma coluna ou por uma busca. */
export type InsightAction =
  | { tipo: "coluna"; col: PipelineCol; valor: string; rotulo?: string }
  | { tipo: "busca"; termo: string; rotulo?: string };

export interface Insight {
  tone: "info" | "pos" | "warn" | "bad";
  /** Chave do ícone de linha (ver components/insights/icones.tsx), não um emoji. */
  icon: string;
  title: string;
  text: string;
  /** Seção temática do card. */
  group: InsightGroup;
  /** Peso de ordenação dentro da seção — maior aparece primeiro. */
  priority: number;
  /** Se presente, o card abre o Pipeline já recortado nesses imóveis. */
  action?: InsightAction;
}

/** Taxa de conversão em locação entre os imóveis que já tiveram desfecho. */
function taxaConversao(imoveis: Imovel[]): { taxa: number | null; fechados: number; locados: number } {
  const locados = imoveis.filter((i) => i.status === "Locado").length;
  const fechados = imoveis.filter((i) => i.status === "Locado" || TERMINAIS.includes(i.status)).length;
  return { taxa: fechados ? (locados / fechados) * 100 : null, fechados, locados };
}

export function buildInsights(imoveis: Imovel[], comissaoPercent: number): Insight[] {
  const list: Insight[] = [];
  if (imoveis.length < MIN_SAMPLE) return list;

  // 1. Bairro mais trabalhado (maior volume de tentativas)
  const bairroCounts = groupCount(imoveis, (i) => i.bairro);
  const bairroEntries = Object.entries(bairroCounts)
    .filter(([b]) => b !== "Não informado")
    .sort((a, b) => b[1] - a[1]);
  if (bairroEntries.length > 0 && bairroEntries[0][1] >= 2) {
    const [bairro, count] = bairroEntries[0];
    const pct = ((count / imoveis.length) * 100).toFixed(0);
    list.push({
      tone: "info",
      icon: "local",
      title: `${bairro} é seu bairro mais trabalhado`,
      text: `${count} de ${imoveis.length} imóveis (${pct}%) do pipeline estão nesse bairro — sua maior concentração de esforço.`,
      group: "padroes",
      priority: 50,
      action: { tipo: "coluna", col: "bairro", valor: bairro },
    });
  }

  // 2. Tipo de imóvel com maior/menor conversão (entre tipos com amostra mínima)
  const tipos = [...new Set(imoveis.map((i) => i.tipo))];
  const tipoConv = tipos
    .map((t) => {
      const doTipo = imoveis.filter((i) => i.tipo === t);
      const { taxa } = taxaConversao(doTipo);
      return { tipo: t, total: doTipo.length, taxa };
    })
    .filter((t) => t.total >= MIN_SAMPLE && t.taxa != null)
    .sort((a, b) => (b.taxa as number) - (a.taxa as number));
  if (tipoConv.length > 0) {
    const best = tipoConv[0];
    list.push({
      tone: "pos",
      icon: "check",
      title: `${best.tipo} é o tipo que mais converte`,
      text: `${(best.taxa as number).toFixed(0)}% dos "${best.tipo}" com desfecho viraram locação (${best.total} na carteira). Priorizar esse perfil tende a render mais rápido.`,
      group: "desempenho",
      priority: 60,
      action: { tipo: "coluna", col: "tipo", valor: best.tipo as string },
    });
    if (tipoConv.length > 1) {
      const worst = tipoConv[tipoConv.length - 1];
      if ((worst.taxa as number) < 40 && worst.tipo !== best.tipo) {
        list.push({
          tone: "warn",
          icon: "alerta",
          title: `${worst.tipo} converte pouco`,
          text: `Só ${(worst.taxa as number).toFixed(0)}% dos "${worst.tipo}" com desfecho viraram locação. Vale revisar preço, demanda ou anúncio antes de investir mais tempo.`,
          group: "acao",
          priority: 70,
          action: { tipo: "coluna", col: "tipo", valor: worst.tipo as string },
        });
      }
    }
  }

  // 2b. Forma de abordagem com melhor conversão (entre formas com amostra mínima)
  const abordagens = [...new Set(imoveis.map((i) => i.formaAbordagem).filter(Boolean))];
  const abordagemConv = abordagens
    .map((a) => {
      const doAbordagem = imoveis.filter((i) => i.formaAbordagem === a);
      const { taxa } = taxaConversao(doAbordagem);
      return { abordagem: a as string, total: doAbordagem.length, taxa };
    })
    .filter((a) => a.total >= MIN_SAMPLE && a.taxa != null)
    .sort((a, b) => (b.taxa as number) - (a.taxa as number));
  if (abordagemConv.length > 1) {
    const best = abordagemConv[0];
    list.push({
      tone: "pos",
      icon: "telefone",
      title: `"${best.abordagem}" é sua abordagem mais eficaz`,
      text: `${(best.taxa as number).toFixed(0)}% de conversão em locação (${best.total} contatos) — a melhor entre as abordagens com ao menos ${MIN_SAMPLE} usos.`,
      group: "desempenho",
      priority: 55,
    });
  }

  // 2c. Origem de imóvel mais comum
  const origemCounts = groupCount(imoveis, (i) => i.origemImovel);
  const origemEntries = Object.entries(origemCounts)
    .filter(([o]) => o !== "Não informado")
    .sort((a, b) => b[1] - a[1]);
  if (origemEntries.length > 0 && origemEntries[0][1] >= MIN_SAMPLE) {
    const [origem, count] = origemEntries[0];
    list.push({
      tone: "info",
      icon: "entrada",
      title: `${origem} traz mais oportunidades`,
      text: `${count} imóveis vieram dessa origem — sua principal porta de entrada de novas angariações.`,
      group: "padroes",
      priority: 45,
      action: { tipo: "coluna", col: "origem", valor: origem },
    });
  }

  // --- GARIMPO EM CONCORRENTES -------------------------------------------
  // Imóveis achados no site/vitrine de outras imobiliárias (fonte registrada).
  const garimpados = imoveis.filter(ehGarimpado);
  const porOrigemGarimpo = imoveis.filter((i) => i.origemImovel === ORIGEM_GARIMPO_SITE);
  // Une os dois sinais: fonte nomeada OU origem marcada como garimpo em site.
  const universoGarimpo = [...new Set([...garimpados, ...porOrigemGarimpo])];

  if (universoGarimpo.length >= 2) {
    const pct = ((universoGarimpo.length / imoveis.length) * 100).toFixed(0);
    const locadosG = universoGarimpo.filter((i) => i.status === "Locado").length;
    const complemento = locadosG > 0 ? ` — ${locadosG} já viraram locação.` : ".";
    list.push({
      tone: "info",
      icon: "escopo",
      title: `Garimpo em concorrentes: ${universoGarimpo.length} imóveis`,
      text: `${universoGarimpo.length} de ${imoveis.length} angariações (${pct}%) você garimpou em sites de outras imobiliárias${complemento}`,
      group: "garimpo",
      priority: 60,
    });
  }

  // Melhor fonte de garimpo: a imobiliária cujo site mais te rende (com amostra ≥ 2).
  if (garimpados.length >= 2) {
    const fonteCounts = groupCount(garimpados, fonteGarimpo);
    const [fonte, count] = Object.entries(fonteCounts).sort((a, b) => b[1] - a[1])[0];
    if (count >= 2) {
      const daFonte = garimpados.filter((i) => fonteGarimpo(i) === fonte);
      const locadosF = daFonte.filter((i) => i.status === "Locado").length;
      const complemento = locadosF > 0 ? `, ${locadosF} já locado(s)` : "";
      list.push({
        tone: "pos",
        icon: "predio",
        title: `"${fonte}" é sua melhor fonte de garimpo`,
        text: `${count} imóveis vieram do site dessa imobiliária${complemento}. Monitorar essa vitrine com frequência tende a manter o volume de entrada.`,
        group: "garimpo",
        priority: 70,
      });
    }
  }

  // 3. Tempo médio até locação
  const locados = imoveis.filter((i) => i.status === "Locado");
  const tempos = locados.map(tempoAteLocacao).filter((t): t is number => t != null && t >= 0);
  if (tempos.length >= MIN_SAMPLE) {
    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    list.push({
      tone: "info",
      icon: "relogio",
      title: `Tempo médio até locação: ${Math.round(media)} dias`,
      text: `Média entre o primeiro contato e a locação, com base em ${tempos.length} imóveis locados. Use como referência de prazo ao prospectar.`,
      group: "desempenho",
      priority: 40,
    });
  }

  // 4. Locações por mês: melhor mês + tendência entre os dois últimos meses
  const monthGroups: Record<string, number> = {};
  locados.forEach((i) => {
    const k = monthKey(dateEnteredStatus(i, "Locado"));
    if (k) monthGroups[k] = (monthGroups[k] || 0) + 1;
  });
  const monthKeysOrd = Object.keys(monthGroups).sort();
  if (monthKeysOrd.length >= 1) {
    // Tendência: mês mais recente com locação vs. o mês de calendário anterior.
    const ultimo = monthKeysOrd[monthKeysOrd.length - 1];
    const anterior = shiftMonthKey(ultimo, -1);
    const atualQ = monthGroups[ultimo];
    const antQ = monthGroups[anterior] || 0;
    if (atualQ !== antQ) {
      const subiu = atualQ > antQ;
      list.push({
        tone: subiu ? "pos" : "warn",
        icon: subiu ? "alta" : "baixa",
        title: subiu
          ? `Locações em alta: ${atualQ} em ${monthLabelLong(ultimo)}`
          : `Locações em queda: ${atualQ} em ${monthLabelLong(ultimo)}`,
        text: `Você fechou ${atualQ} locação(ões) em ${monthLabelLong(ultimo)}, contra ${antQ} em ${monthLabelLong(anterior)}. ${subiu ? "Vale entender o que mudou pra manter o ritmo." : "Vale reforçar o follow-up dos imóveis em negociação."}`,
        group: "desempenho",
        priority: 75,
      });
    }
  }
  const monthByVolume = Object.entries(monthGroups).sort((a, b) => b[1] - a[1]);
  if (monthByVolume.length >= 2) {
    const [bestMonth, bestCount] = monthByVolume[0];
    list.push({
      tone: "pos",
      icon: "grafico",
      title: `${monthLabelLong(bestMonth)} foi seu melhor mês`,
      text: `${bestCount} imóveis locados nesse período — o maior volume registrado até agora.`,
      group: "desempenho",
      priority: 35,
    });
  }

  // 5. Gargalo: status com maior concentração de imóveis parados
  const staleByStatus: Record<string, number> = {};
  imoveis.forEach((i) => {
    if (isStale(i)) staleByStatus[i.status] = (staleByStatus[i.status] || 0) + 1;
  });
  const staleEntries = Object.entries(staleByStatus).sort((a, b) => b[1] - a[1]);
  if (staleEntries.length > 0) {
    const [status, count] = staleEntries[0];
    list.push({
      tone: "bad",
      icon: "funil",
      title: `Gargalo em "${status}"`,
      text: `${count} imóvel(is) parado(s) há mais de ${STALE_DAYS_THRESHOLD} dias nessa etapa. Bom ponto de partida pra retomar contato.`,
      group: "acao",
      priority: 100,
      action: { tipo: "coluna", col: "status", valor: status },
    });
  }

  // 5b. O imóvel específico parado há mais tempo — ação concreta e nominal.
  const parados = imoveis
    .filter(isStale)
    .map((i) => ({ i, dias: daysInCurrentStatus(i) ?? 0 }))
    .sort((a, b) => b.dias - a.dias);
  if (parados.length > 0) {
    const { i, dias } = parados[0];
    const rotuloImovel = (i.codigo && i.codigo.trim()) || (i.endereco && i.endereco.trim()) || "Um imóvel";
    list.push({
      tone: "bad",
      icon: "ampulheta",
      title: `${rotuloImovel} é o mais parado: ${dias} dias`,
      text: `Está há ${dias} dias em "${i.status}" sem avançar — o maior tempo parado da carteira. Priorize retomar esse contato.`,
      group: "acao",
      priority: 95,
      action:
        i.codigo && i.codigo.trim()
          ? { tipo: "busca", termo: i.codigo.trim(), rotulo: "Ver imóvel →" }
          : { tipo: "coluna", col: "status", valor: i.status },
    });
  }

  // 5c. Total de estagnados no pipeline
  const totalStale = imoveis.filter(isStale).length;
  if (totalStale >= 3) {
    list.push({
      tone: "warn",
      icon: "estagnado",
      title: `${totalStale} imóveis estagnados no pipeline`,
      text: `Uma fatia relevante da carteira ativa sem movimentação recente. Reservar um horário fixo na semana só pra esses casos costuma destravar parte deles.`,
      group: "acao",
      priority: 90,
    });
  }

  // 6. Principal motivo de perda (entre Perdido/Cancelado com motivo informado)
  const comMotivo = imoveis.filter((i) => (i.status === "Perdido" || i.status === "Cancelado") && i.motivoPerda);
  if (comMotivo.length >= MIN_SAMPLE) {
    const motivoCounts = groupCount(comMotivo, (i) =>
      i.motivoPerda === "Outro" ? i.motivoPerdaOutro || "Outro" : i.motivoPerda,
    );
    const [motivo, count] = Object.entries(motivoCounts).sort((a, b) => b[1] - a[1])[0];
    const pct = ((count / comMotivo.length) * 100).toFixed(0);
    list.push({
      tone: "info",
      icon: "busca",
      title: `Principal motivo de perda: ${motivo}`,
      text: `${count} de ${comMotivo.length} perdas registradas (${pct}%) foram por esse motivo. Se for recorrente (ex.: alugado por fora), reduzir o tempo até a visita ajuda a chegar antes.`,
      group: "padroes",
      priority: 40,
    });
  }

  // 7. Taxa de conversão geral, com leitura
  const m = metricsForRange(imoveis, comissaoPercent);
  if (m.locados + m.perdidosCancelados >= MIN_SAMPLE) {
    const tone = m.conversaoFechados >= 60 ? "pos" : m.conversaoFechados >= 35 ? "info" : "warn";
    const read =
      m.conversaoFechados >= 60
        ? "um resultado sólido"
        : m.conversaoFechados >= 35
          ? "um resultado dentro da média"
          : "um ponto de atenção";
    list.push({
      tone,
      icon: "alvo",
      title: `Taxa de conversão geral: ${m.conversaoFechados.toFixed(0)}%`,
      text: `Sobre os ${m.locados + m.perdidosCancelados} processos já encerrados (locados + perdidos/cancelados) — ${read}.`,
      group: "desempenho",
      priority: 80,
    });
  }

  // Ordena por seção (ação → garimpo → desempenho → padrões) e, dentro dela, por
  // prioridade decrescente — o mais urgente/relevante primeiro. A geração acima
  // segue a ordem do código; só aqui a lista ganha a ordem de exibição.
  list.sort((a, b) => {
    const g = INSIGHT_GROUP_ORDER.indexOf(a.group) - INSIGHT_GROUP_ORDER.indexOf(b.group);
    return g !== 0 ? g : b.priority - a.priority;
  });

  return list;
}
