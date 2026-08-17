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
import { ORIGEM_GARIMPO_SITE } from "../constantes";
import { monthKey, monthLabelLong, shiftMonthKey } from "../datas";
import type { Imovel } from "../tipos";
import type { PipelineCol } from "./filtros";
import {
  conversaoCaptacao,
  dateEnteredStatus,
  diasSemMovimento,
  groupCount,
  isStale,
  limiteStaleParaStatus,
  metricsForRange,
  tempoAteLocacao,
  foiAngariado,
} from "./motor";

/** mínimo de imóveis para uma métrica ser considerada confiável */
export const MIN_SAMPLE = 3;

/* ----------------------------------------------------------------
   POR QUE OS RANKINGS OLHAM ANGARIAÇÃO, NÃO LOCAÇÃO

   Os rankings de tipo/bairro/canal já foram medidos por conversão em
   LOCAÇÃO, e na carteira real isso os deixava mudos ou mentirosos: com
   dezenas de captações e poucas locações, a taxa saía de uma amostra
   de dois ou três imóveis, e "Apartamento é o tipo que mais converte"
   podia significar literalmente "um apartamento alugou".

   Além da amostra, havia um erro de atribuição: se um imóvel angariado
   não aluga porque o proprietário insiste num preço fora do mercado,
   isso não diz nada sobre a qualidade daquele canal de captação — e o
   ranking creditava a falha ao canal.

   Então o eixo primário destes cards passou a ser a taxa de
   ANGARIAÇÃO (o "sim" do proprietário, que é o trabalho medido por
   este painel), com a locação como leitura secundária quando há
   amostra para ela. A conversão em locação continua tendo card
   próprio: ela é a régua do dinheiro e não foi removida de lugar
   nenhum.
   ---------------------------------------------------------------- */

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

export interface PrioridadeInsight {
  id: string;
  identificador: string;
  endereco: string;
  status: string;
  diasParado: number;
  busca: string;
}

export interface ResumoExecutivoInsights {
  precisamAtencao: number;
  taxaAngariacao: number | null;
  conversaoLocacao: number | null;
  emAndamento: number;
  prioridades: PrioridadeInsight[];
}

/** Resumo compacto da carteira para abrir a página com decisão, não texto. */
export function resumoExecutivoInsights(imoveis: Imovel[], comissaoPercent: number): ResumoExecutivoInsights {
  const estagnados = imoveis
    .filter((imovel) => isStale(imovel))
    .map((imovel) => ({ imovel, dias: diasSemMovimento(imovel) ?? 0 }))
    .sort((a, b) => b.dias - a.dias);
  const captacao = conversaoCaptacao(imoveis);
  const locacao = metricsForRange(imoveis, comissaoPercent);

  return {
    precisamAtencao: estagnados.length,
    taxaAngariacao: captacao.taxa,
    conversaoLocacao:
      locacao.locados + locacao.perdidosCancelados > 0 ? locacao.conversaoFechados : null,
    emAndamento: imoveis.filter((imovel) =>
      !["Locado", "Perdido", "Cancelado"].includes(imovel.status),
    ).length,
    prioridades: estagnados.slice(0, 3).map(({ imovel, dias }) => {
      const crmDisponivel = foiAngariado(imovel) && !!imovel.referenciaCrm?.trim();
      const identificador = crmDisponivel
        ? `CRM ${imovel.referenciaCrm!.trim()}`
        : imovel.codigo?.trim() || "Sem código";
      return {
        id: imovel.id,
        identificador,
        endereco: imovel.endereco || "Endereço não informado",
        status: imovel.status,
        diasParado: dias,
        busca: crmDisponivel
          ? imovel.referenciaCrm!.trim()
          : imovel.codigo?.trim() || imovel.endereco || imovel.id,
      };
    }),
  };
}

/**
 * Ranking por taxa de ANGARIAÇÃO de um recorte da carteira (tipo, bairro,
 * canal…). Só entram recortes com `MIN_SAMPLE` captações **decididas** — a
 * amostra é de desfechos, não de linhas cadastradas, senão um bairro com dez
 * leads todos em aberto apareceria no ranking sem nunca ter produzido nada.
 *
 * A cauda ("o que menos converte") sai da mesma lista ordenada, e não de um
 * cálculo próprio: duas contas para o topo e a base é o caminho mais curto
 * para os dois cards se contradizerem.
 */
interface RankingCaptacao {
  rotulo: string;
  taxa: number;
  angariados: number;
  decididos: number;
  /** Locações vindas desse recorte — leitura secundária, quando houver. */
  locados: number;
}

function rankingPorAngariacao(
  imoveis: Imovel[],
  chave: (i: Imovel) => string | null | undefined,
): RankingCaptacao[] {
  const grupos = new Map<string, Imovel[]>();
  for (const imovel of imoveis) {
    const k = (chave(imovel) || "").trim();
    if (!k || k === "Não informado") continue;
    const lista = grupos.get(k);
    if (lista) lista.push(imovel);
    else grupos.set(k, [imovel]);
  }
  const linhas: RankingCaptacao[] = [];
  for (const [rotulo, lista] of grupos) {
    const c = conversaoCaptacao(lista);
    if (c.decididos < MIN_SAMPLE || c.taxa == null) continue;
    linhas.push({
      rotulo,
      taxa: c.taxa,
      angariados: c.angariados,
      decididos: c.decididos,
      locados: lista.filter((i) => i.status === "Locado").length,
    });
  }
  // Maior taxa primeiro; empate pela amostra maior (mais confiável) e, por fim,
  // pelo rótulo — para a ordem ser estável entre renders.
  return linhas.sort(
    (a, b) => b.taxa - a.taxa || b.decididos - a.decididos || a.rotulo.localeCompare(b.rotulo),
  );
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
    // Concentração de esforço + o retorno dela. Volume sozinho não diz se o
    // bairro merece o esforço: é onde ele bate mais, não onde ele fecha mais.
    const cBairro = conversaoCaptacao(imoveis.filter((i) => (i.bairro || "").trim() === bairro));
    const leituraTaxa =
      cBairro.taxa != null && cBairro.decididos >= MIN_SAMPLE
        ? ` Lá você angaria ${cBairro.taxa.toFixed(0)}% do que chega a um desfecho (${cBairro.angariados} de ${cBairro.decididos}).`
        : "";
    list.push({
      tone: "info",
      icon: "local",
      title: `${bairro} é seu bairro mais trabalhado`,
      text: `${count} de ${imoveis.length} imóveis (${pct}%) do pipeline estão nesse bairro — sua maior concentração de esforço.${leituraTaxa}`,
      group: "padroes",
      priority: 50,
      action: { tipo: "coluna", col: "bairro", valor: bairro },
    });
  }

  // 2. Tipo de imóvel que mais/menos rende ANGARIAÇÃO (ver o bloco de cabeçalho
  //    sobre por que o eixo é captação, e não locação).
  const tipoRank = rankingPorAngariacao(imoveis, (i) => i.tipo);
  // Só destaca "o tipo que mais angaria" se ele de fato angaria (> 0%); caso
  // contrário o card seria contraditório ("0% é o que mais converte").
  if (tipoRank.length > 0 && tipoRank[0].taxa > 0) {
    const best = tipoRank[0];
    const leituraLocacao =
      best.locados > 0
        ? ` Desses, ${best.locados} já ${best.locados === 1 ? "virou" : "viraram"} locação.`
        : "";
    list.push({
      tone: "pos",
      icon: "check",
      title: `${best.rotulo} é o tipo que você mais angaria`,
      text: `Você fecha ${best.taxa.toFixed(0)}% das captações de "${best.rotulo}" que já tiveram desfecho (${best.angariados} de ${best.decididos}).${leituraLocacao} Priorizar esse perfil tende a render mais angariações pelo mesmo esforço.`,
      group: "desempenho",
      priority: 60,
      action: { tipo: "coluna", col: "tipo", valor: best.rotulo },
    });
    if (tipoRank.length > 1) {
      const worst = tipoRank[tipoRank.length - 1];
      if (worst.taxa < 40 && worst.rotulo !== best.rotulo) {
        list.push({
          tone: "warn",
          icon: "alerta",
          title: `${worst.rotulo} custa caro para angariar`,
          text: `Só ${worst.taxa.toFixed(0)}% das captações de "${worst.rotulo}" com desfecho terminaram em angariação (${worst.angariados} de ${worst.decididos}). Vale rever a abordagem para esse perfil antes de investir mais tempo nele.`,
          group: "acao",
          priority: 70,
          action: { tipo: "coluna", col: "tipo", valor: worst.rotulo },
        });
      }
    }
  }

  // Não existe ranking de eficácia por `formaAbordagem`. Esse campo registra
  // uma classificação do imóvel, não o universo real de tentativas. Em Rede
  // social/OLX, sobretudo, o painel não vê as mensagens feitas dentro do
  // portal; 6 imóveis angariados cadastrados poderiam aparecer como 6 de 6
  // (100%) mesmo depois de dezenas de abordagens invisíveis. Eficiência de
  // contato só pode vir do histórico `tentativas`, exibido em Relatórios.

  // 2c. Origem de imóvel mais comum. Isto mede REGISTROS que chegaram ao
  //     sistema, nunca tentativas feitas fora dele: redes sociais e OLX não
  //     expõem ao painel todas as mensagens enviadas pelo corretor. Portanto,
  //     6 imóveis de Redes sociais significam 6 oportunidades CADASTRADAS, e
  //     não 6 contatos nem uma taxa de produtividade daquele canal.
  const origemCounts = groupCount(imoveis, (i) => i.origemImovel);
  const origemEntries = Object.entries(origemCounts)
    .filter(([o]) => o !== "Não informado")
    .sort((a, b) => b[1] - a[1]);
  if (origemEntries.length > 0 && origemEntries[0][1] >= MIN_SAMPLE) {
    const [origem, count] = origemEntries[0];
    list.push({
      tone: "info",
      icon: "entrada",
      title: `${origem}: ${count} oportunidades cadastradas`,
      text: `${count} imóveis do pipeline estão identificados com essa origem. Este número não representa tentativas ou mensagens feitas no canal — o sistema não monitora contatos realizados dentro de redes sociais, OLX ou outros portais externos.`,
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
      text: `${count} imóvel(is) parado(s) há mais de ${limiteStaleParaStatus(status)} dias nessa etapa. Bom ponto de partida pra retomar contato.`,
      group: "acao",
      priority: 100,
      action: { tipo: "coluna", col: "status", valor: status },
    });
  }

  // 5b. O imóvel específico parado há mais tempo — ação concreta e nominal.
  // `diasSemMovimento`, e não dias no status: é o número que o `isStale` usou
  // para eleger estes imóveis, e o texto abaixo afirma que nada aconteceu.
  const parados = imoveis
    .filter((imovel) => isStale(imovel))
    .map((i) => ({ i, dias: diasSemMovimento(i) ?? 0 }))
    .sort((a, b) => b.dias - a.dias);
  if (parados.length > 0) {
    const { i, dias } = parados[0];
    const rotuloImovel = (i.codigo && i.codigo.trim()) || (i.endereco && i.endereco.trim()) || "Um imóvel";
    list.push({
      tone: "bad",
      icon: "ampulheta",
      title: `${rotuloImovel} é o mais parado: ${dias} dias`,
      text: `Está há ${dias} dias sem nenhum movimento — segue em "${i.status}", e é o maior tempo parado da carteira. Priorize retomar esse contato.`,
      group: "acao",
      priority: 95,
      action:
        i.codigo && i.codigo.trim()
          ? { tipo: "busca", termo: i.codigo.trim(), rotulo: "Ver imóvel →" }
          : { tipo: "coluna", col: "status", valor: i.status },
    });
  }

  // 5c. Total de estagnados no pipeline
  const totalStale = imoveis.filter((imovel) => isStale(imovel)).length;
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

  // 6b. Taxa de ANGARIAÇÃO geral — a régua do trabalho deste painel, e por isso
  //     com prioridade acima da conversão em locação. As duas convivem de
  //     propósito: esta mede o "sim" do proprietário (o que o corretor
  //     controla), a outra mede o dinheiro (que depende de preço e demanda).
  const cap = conversaoCaptacao(imoveis);
  if (cap.decididos >= MIN_SAMPLE && cap.taxa != null) {
    const tone = cap.taxa >= 50 ? "pos" : cap.taxa >= 25 ? "info" : "warn";
    const emJogo =
      cap.emAberto > 0
        ? ` Outras ${cap.emAberto} captações seguem em disputa e ainda não entram nessa conta.`
        : "";
    list.push({
      tone,
      icon: "aperto",
      title: `Taxa de angariação: ${cap.taxa.toFixed(0)}%`,
      text: `Você fecha ${cap.taxa.toFixed(0)}% das captações que chegam a um desfecho — ${cap.angariados} angariações contra ${cap.perdidosAntesDeAngariar} perdidas antes do sim.${emJogo}`,
      group: "desempenho",
      priority: 85,
    });
  }

  // 7. Taxa de conversão geral, com leitura
  const m = metricsForRange(imoveis, comissaoPercent);
  // Não mostra a taxa geral quando ela é 0% — um "0%" cru não agrega leitura.
  if (m.locados + m.perdidosCancelados >= MIN_SAMPLE && m.conversaoFechados > 0) {
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
