/* ================================================================
   INSIGHTS — motor de regras (parte pura)
   Port literal de buildInsights() (app.js, 5E). Motor de regras
   simples (sem IA externa) que lê os dados atuais e gera observações.
   Cada insight só aparece se houver dados suficientes para
   sustentá-lo (evita afirmações vazias).
   ================================================================ */
import { STALE_DAYS_THRESHOLD, STATUS_TERMINAL_NEGATIVE } from "../constantes";
import { monthKey, monthLabelLong } from "../datas";
import type { Imovel } from "../tipos";
import { dateEnteredStatus, groupCount, isStale, metricsForRange, tempoAteLocacao } from "./motor";

/** mínimo de imóveis para uma métrica ser considerada confiável */
export const MIN_SAMPLE = 3;

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

export interface Insight {
  tone: "info" | "pos" | "warn" | "bad";
  icon: string;
  title: string;
  text: string;
}

export function buildInsights(imoveis: Imovel[], comissaoPercent: number): Insight[] {
  const list: Insight[] = [];
  if (imoveis.length < MIN_SAMPLE) return list;

  // 1. Bairro mais procurado (maior volume de angariações)
  const bairroCounts = groupCount(imoveis, (i) => i.bairro);
  const bairroEntries = Object.entries(bairroCounts)
    .filter(([b]) => b !== "Não informado")
    .sort((a, b) => b[1] - a[1]);
  if (bairroEntries.length > 0 && bairroEntries[0][1] >= 2) {
    const [bairro, count] = bairroEntries[0];
    const pct = ((count / imoveis.length) * 100).toFixed(0);
    list.push({
      tone: "info",
      icon: "📍",
      title: `${bairro} concentra suas tentativas de contato`,
      text: `${count} de ${imoveis.length} imóveis (${pct}%) do seu pipeline vieram desse bairro. Pode valer investir mais tempo prospectando ali, já que você já tem presença e conhecimento da região.`,
    });
  }

  // 2. Tipo de imóvel com maior conversão (entre tipos com amostra mínima)
  const tipos = [...new Set(imoveis.map((i) => i.tipo))];
  const tipoConv = tipos
    .map((t) => {
      const doTipo = imoveis.filter((i) => i.tipo === t);
      const fechados = doTipo.filter((i) => i.status === "Locado" || TERMINAIS.includes(i.status));
      const locados = doTipo.filter((i) => i.status === "Locado");
      return { tipo: t, total: doTipo.length, taxa: fechados.length ? (locados.length / fechados.length) * 100 : null };
    })
    .filter((t) => t.total >= MIN_SAMPLE && t.taxa != null)
    .sort((a, b) => (b.taxa as number) - (a.taxa as number));
  if (tipoConv.length > 0) {
    const best = tipoConv[0];
    list.push({
      tone: "pos",
      icon: "✅",
      title: `${best.tipo} tem a melhor taxa de conversão`,
      text: `${(best.taxa as number).toFixed(0)}% dos imóveis do tipo "${best.tipo}" que chegaram a um desfecho foram locados (${best.total} cadastrados). Priorizar esse perfil de imóvel tende a gerar resultado mais rápido.`,
    });
    if (tipoConv.length > 1) {
      const worst = tipoConv[tipoConv.length - 1];
      if ((worst.taxa as number) < 40 && worst.tipo !== best.tipo) {
        list.push({
          tone: "warn",
          icon: "⚠️",
          title: `${worst.tipo} converte pouco`,
          text: `Apenas ${(worst.taxa as number).toFixed(0)}% dos imóveis do tipo "${worst.tipo}" viraram locação. Vale entender se o problema é preço, demanda da região ou qualidade do anúncio antes de continuar investindo tempo nesse perfil.`,
        });
      }
    }
  }

  // 2b. Forma de abordagem com melhor conversão (entre formas com amostra mínima)
  const abordagens = [...new Set(imoveis.map((i) => i.formaAbordagem).filter(Boolean))];
  const abordagemConv = abordagens
    .map((a) => {
      const doAbordagem = imoveis.filter((i) => i.formaAbordagem === a);
      const fechados = doAbordagem.filter((i) => i.status === "Locado" || TERMINAIS.includes(i.status));
      const locadosA = doAbordagem.filter((i) => i.status === "Locado");
      return {
        abordagem: a as string,
        total: doAbordagem.length,
        taxa: fechados.length ? (locadosA.length / fechados.length) * 100 : null,
      };
    })
    .filter((a) => a.total >= MIN_SAMPLE && a.taxa != null)
    .sort((a, b) => (b.taxa as number) - (a.taxa as number));
  if (abordagemConv.length > 1) {
    const best = abordagemConv[0];
    list.push({
      tone: "pos",
      icon: "📞",
      title: `"${best.abordagem}" converte melhor`,
      text: `Entre as abordagens usadas com pelo menos ${MIN_SAMPLE} tentativas, "${best.abordagem}" teve ${(best.taxa as number).toFixed(0)}% de conversão em locação (${best.total} contatos). Vale priorizar esse canal ao iniciar um novo contato.`,
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
      icon: "🔎",
      title: `${origem} é sua principal fonte de oportunidades`,
      text: `${count} dos seus imóveis angariados vieram dessa origem. Reforçar esse canal tende a manter o volume de entrada de novas oportunidades.`,
    });
  }

  // 2d. Concorrente mais frequente
  const comConcorrente = imoveis.filter((i) => i.imobiliariaConcorrente && i.imobiliariaConcorrente.trim());
  if (comConcorrente.length >= MIN_SAMPLE) {
    const concorrenteCounts = groupCount(comConcorrente, (i) => (i.imobiliariaConcorrente as string).trim());
    const [concorrente, count] = Object.entries(concorrenteCounts).sort((a, b) => b[1] - a[1])[0];
    if (count >= 2) {
      const pct = ((count / comConcorrente.length) * 100).toFixed(0);
      list.push({
        tone: "warn",
        icon: "🏢",
        title: `${concorrente} é seu concorrente mais frequente`,
        text: `Apareceu em ${count} dos ${comConcorrente.length} imóveis (${pct}%) onde havia outra imobiliária envolvida. Vale entender o que essa imobiliária costuma oferecer de diferente para o proprietário.`,
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
      icon: "⏱️",
      title: `Tempo médio até locação: ${Math.round(media)} dias`,
      text: `Com base em ${tempos.length} imóveis já locados, esse é o tempo médio entre o primeiro contato e a locação efetiva. Use essa referência para prever quando um imóvel recém-contatado deve gerar retorno.`,
    });
  }

  // 4. Melhor mês de desempenho
  const monthGroups: Record<string, number> = {};
  locados.forEach((i) => {
    const k = monthKey(dateEnteredStatus(i, "Locado"));
    if (k) monthGroups[k] = (monthGroups[k] || 0) + 1;
  });
  const monthEntries = Object.entries(monthGroups).sort((a, b) => b[1] - a[1]);
  if (monthEntries.length >= 2) {
    const [bestMonth, bestCount] = monthEntries[0];
    list.push({
      tone: "pos",
      icon: "📈",
      title: `${monthLabelLong(bestMonth)} foi seu melhor mês`,
      text: `Foram ${bestCount} imóveis locados nesse período, o maior volume registrado até agora. Vale revisar o que foi diferente — canais usados, tipos de imóvel, ritmo de follow-up — para tentar repetir o padrão.`,
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
      icon: "🚧",
      title: `Gargalo em "${status}"`,
      text: `${count} imóvel(is) estão parados há mais de ${STALE_DAYS_THRESHOLD} dias nessa etapa. Esse é um bom ponto de partida para retomar contato ou revisar o que está travando o andamento.`,
    });
  }

  // 6. Slots vs demanda: comparação simples entre volume por tipo e conversão
  const totalStale = imoveis.filter(isStale).length;
  if (totalStale >= 3) {
    list.push({
      tone: "warn",
      icon: "🔄",
      title: `${totalStale} imóveis estagnados no pipeline`,
      text: `Isso representa uma fatia relevante da sua carteira ativa sem movimentação recente. Reservar um horário fixo na semana só para retomar esses casos costuma destravar parte deles.`,
    });
  }

  // 6b. Principal motivo de perda (entre Perdido/Cancelado com motivo informado)
  const comMotivo = imoveis.filter((i) => (i.status === "Perdido" || i.status === "Cancelado") && i.motivoPerda);
  if (comMotivo.length >= MIN_SAMPLE) {
    const motivoCounts = groupCount(comMotivo, (i) =>
      i.motivoPerda === "Outro" ? i.motivoPerdaOutro || "Outro" : i.motivoPerda,
    );
    const [motivo, count] = Object.entries(motivoCounts).sort((a, b) => b[1] - a[1])[0];
    const pct = ((count / comMotivo.length) * 100).toFixed(0);
    list.push({
      tone: "info",
      icon: "🔍",
      title: `Principal motivo de perda: ${motivo}`,
      text: `${count} de ${comMotivo.length} perdas registradas (${pct}%) foram por esse motivo. Se for algo recorrente como imóvel já vendido/alugado por fora, pode valer reduzir o tempo entre o primeiro contato e a visita, pra chegar antes da concorrência.`,
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
      icon: "🎯",
      title: `Taxa de conversão geral: ${m.conversaoFechados.toFixed(0)}%`,
      text: `Considerando os ${m.locados + m.perdidosCancelados} processos já encerrados (locados + perdidos/cancelados), essa taxa representa ${read}. Comparar mês a mês ajuda a identificar se mudanças no processo estão funcionando.`,
    });
  }

  return list;
}
