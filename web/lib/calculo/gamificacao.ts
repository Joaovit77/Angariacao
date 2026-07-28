/* ================================================================
   GAMIFICAÇÃO — conquistas em TRILHA (badges da view de Metas)
   Módulo puro (só tipos, datas e motor): todas as conquistas são
   derivadas do statusHistory e das metas já persistidas — nada de
   estado novo no banco. Determinístico a partir dos parâmetros
   (nenhuma função usa todayISO()), o que mantém os testes
   independentes do relógio.

   Antes eram SEIS medalhas fixas, e o problema aparecia no dia em que
   o corretor batia a última: a tela virava um mural encerrado, com
   tudo aceso e nada a perseguir. Quem angariou o primeiro imóvel e
   quem angariou cem viam exatamente a mesma coisa.

   Agora cada medalha é o primeiro DEGRAU de uma trilha, e conquistar
   um degrau revela o próximo. A regra de exibição é a que mantém isso
   honesto sem inundar a grade:

       mostra todos os degraus CONQUISTADOS + exatamente UM a seguir

   Assim a grade cresce de um card por vez (o "próximo" vira
   conquistado e o seguinte aparece), sempre há algo a perseguir, e
   nunca se vê a escada inteira de longe — que é o que transformaria
   "100 angariações" num alvo desanimador no dia da primeira.

   Conta zerada continua mostrando 6 cards travados, um por trilha —
   exatamente o que ela mostrava antes.
   ================================================================ */
import { daysBetween, inicioDaSemana, shiftMonthKey } from "../datas";
import { fmtDate } from "../formatadores";
import type { Imovel, Metas } from "../tipos";
import {
  dataAngariadoEfetiva,
  dateEnteredStatus,
  foiAngariado,
  imoveisAngariadosNoMes,
} from "./motor";

export interface Badge {
  id: string;
  nome: string;
  descricao: string;
  /** Emoji exibido no card da medalha. */
  icone: string;
  conquistada: boolean;
  /** Complemento exibido quando conquistada (ex.: "5 imóveis na semana de 02/03/2026"). */
  detalhe?: string;
  /** Quanto falta para este degrau, pronto para a tela ("6 de 10").
      Só nos NÃO conquistados — é o que dá ao card travado uma função
      além de "você ainda não conseguiu". */
  progressoTexto?: string;
  /** 0..1 rumo a este degrau, para a barrinha. Ausente onde progresso
      contínuo não faz sentido (o recorde de velocidade não "enche"). */
  progresso?: number;
}

/** Semana (segunda ISO) com mais angariações e o total dela. */
export function melhorSemanaDeAngariacao(imoveis: Imovel[]): { semana: string; total: number } | null {
  const porSemana: Record<string, number> = {};
  imoveis.forEach((i) => {
    const semana = inicioDaSemana(dataAngariadoEfetiva(i));
    if (semana) porSemana[semana] = (porSemana[semana] || 0) + 1;
  });
  const semanas = Object.keys(porSemana);
  if (semanas.length === 0) return null;
  const melhor = semanas.reduce((a, b) => (porSemana[b] > porSemana[a] ? b : a));
  return { semana: melhor, total: porSemana[melhor] };
}

/** Menor tempo (dias) entre entrar em "Novo contato" e entrar em "Angariado". */
export function angariacaoMaisRapidaDias(imoveis: Imovel[]): number | null {
  let melhor: number | null = null;
  imoveis.forEach((i) => {
    const d = daysBetween(dateEnteredStatus(i, "Novo contato"), dateEnteredStatus(i, "Angariado"));
    if (d !== null && d >= 0 && (melhor === null || d < melhor)) melhor = d;
  });
  return melhor;
}

/** Meses ("YYYY-MM", ordenados) em que a meta de angariações foi batida. */
export function mesesComMetaDeAngariacaoBatida(imoveis: Imovel[], metas: Metas): string[] {
  return Object.keys(metas)
    .filter((k) => {
      const alvo = metas[k].angariacoes;
      return alvo > 0 && imoveisAngariadosNoMes(imoveis, k).length >= alvo;
    })
    .sort();
}

/** Maior sequência de meses CONSECUTIVOS batendo a meta de angariações. */
export function maiorSequenciaDeMetasBatidas(imoveis: Imovel[], metas: Metas): number {
  const batidos = mesesComMetaDeAngariacaoBatida(imoveis, metas);
  let maior = 0;
  let atual = 0;
  let anterior: string | null = null;
  batidos.forEach((k) => {
    atual = anterior !== null && shiftMonthKey(anterior, 1) === k ? atual + 1 : 1;
    if (atual > maior) maior = atual;
    anterior = k;
  });
  return maior;
}

/* ----------------------------------------------------------------
   AS TRILHAS
   ---------------------------------------------------------------- */

interface Degrau {
  /** Id estável do card. Os primeiros degraus mantêm os ids das seis
      medalhas originais — eles são a chave de render e aparecem em teste. */
  id: string;
  alvo: number;
  nome: string;
  icone: string;
  descricao: string;
}

interface Trilha {
  /** O valor medido hoje; null quando não há o que medir ainda. */
  valor: number | null;
  degraus: Degrau[];
  /** Velocidade é a única em que o recorde MELHORA descendo (2 dias é
      melhor que 5), então a comparação inverte e não há barra de progresso:
      "40% do caminho até angariar no mesmo dia" não quer dizer nada. */
  menorEhMelhor?: boolean;
  /** Complemento das conquistadas. undefined quando não há o que dizer. */
  detalhe?: (valor: number) => string | undefined;
  /** Texto do que falta, no degrau a perseguir. */
  progressoTexto?: (valor: number | null, alvo: number) => string;
}

/** "6 de 10" — o padrão das trilhas de acúmulo. */
function quantosDe(valor: number | null, alvo: number): string {
  return `${valor ?? 0} de ${alvo}`;
}

function construirTrilhas(imoveis: Imovel[], metas: Metas): Trilha[] {
  const angariados = imoveis.filter(foiAngariado).length;
  const locados = imoveis.filter((i) => dateEnteredStatus(i, "Locado") != null).length;
  const melhorSemana = melhorSemanaDeAngariacao(imoveis);
  const maisRapida = angariacaoMaisRapidaDias(imoveis);
  const mesesBatidos = mesesComMetaDeAngariacaoBatida(imoveis, metas);
  const sequencia = maiorSequenciaDeMetasBatidas(imoveis, metas);

  return [
    {
      valor: angariados,
      detalhe: (v) => `${v} angariação(ões) no total`,
      progressoTexto: quantosDe,
      degraus: [
        { id: "primeira-angariacao", alvo: 1, nome: "Primeira Angariação", icone: "🌱", descricao: "Conclua a angariação do seu primeiro imóvel." },
        { id: "angariacoes-5", alvo: 5, nome: "Pegando o Ritmo", icone: "🌿", descricao: "Chegue a 5 imóveis angariados." },
        { id: "angariacoes-10", alvo: 10, nome: "Carteira Formada", icone: "🌳", descricao: "Chegue a 10 imóveis angariados." },
        { id: "angariacoes-25", alvo: 25, nome: "Carteira Sólida", icone: "🏛️", descricao: "Chegue a 25 imóveis angariados." },
        { id: "angariacoes-50", alvo: 50, nome: "Carteira de Peso", icone: "💎", descricao: "Chegue a 50 imóveis angariados." },
        { id: "angariacoes-100", alvo: 100, nome: "Cem Angariações", icone: "👑", descricao: "Chegue a 100 imóveis angariados." },
      ],
    },
    {
      valor: locados,
      detalhe: (v) => `${v} imóvel(is) locado(s)`,
      progressoTexto: quantosDe,
      degraus: [
        { id: "chave-entregue", alvo: 1, nome: "Chave Entregue", icone: "🔑", descricao: "Tenha o seu primeiro imóvel locado." },
        { id: "locados-5", alvo: 5, nome: "Cinco Chaves", icone: "🏘️", descricao: "Chegue a 5 imóveis locados." },
        { id: "locados-10", alvo: 10, nome: "Dez Chaves", icone: "🏙️", descricao: "Chegue a 10 imóveis locados." },
        { id: "locados-25", alvo: 25, nome: "Chaveiro Mestre", icone: "🏆", descricao: "Chegue a 25 imóveis locados." },
      ],
    },
    {
      valor: melhorSemana?.total ?? null,
      detalhe: () =>
        melhorSemana ? `${melhorSemana.total} imóveis na semana de ${fmtDate(melhorSemana.semana)}` : undefined,
      progressoTexto: (v, alvo) => `melhor semana: ${v ?? 0} de ${alvo}`,
      degraus: [
        { id: "angariador-as", alvo: 5, nome: "Angariador Ás", icone: "🏅", descricao: "Angarie 5 imóveis na mesma semana." },
        { id: "semana-8", alvo: 8, nome: "Semana Cheia", icone: "🥇", descricao: "Angarie 8 imóveis na mesma semana." },
        { id: "semana-12", alvo: 12, nome: "Semana Histórica", icone: "🚀", descricao: "Angarie 12 imóveis na mesma semana." },
      ],
    },
    {
      valor: maisRapida,
      menorEhMelhor: true,
      detalhe: (v) => (v === 0 ? "Angariado no mesmo dia" : `Angariado em ${v} dia(s)`),
      progressoTexto: (v) =>
        v == null ? "sem angariação para medir" : `seu recorde: ${v === 0 ? "mesmo dia" : `${v} dia(s)`}`,
      degraus: [
        { id: "sem-tempo-a-perder", alvo: 2, nome: "Sem Tempo a Perder", icone: "⚡", descricao: "Leve um imóvel do primeiro contato à angariação em até 2 dias." },
        { id: "velocidade-1", alvo: 1, nome: "Fechou no Dia Seguinte", icone: "⏱️", descricao: "Angarie um imóvel em até 1 dia do primeiro contato." },
        { id: "velocidade-0", alvo: 0, nome: "Fechou na Hora", icone: "💨", descricao: "Angarie um imóvel no mesmo dia do primeiro contato." },
      ],
    },
    {
      valor: mesesBatidos.length,
      detalhe: (v) => `${v} mês(es) com meta batida`,
      progressoTexto: quantosDe,
      degraus: [
        { id: "meta-batida", alvo: 1, nome: "Meta Batida", icone: "🎯", descricao: "Bata a meta mensal de angariações pela primeira vez." },
        { id: "metas-3", alvo: 3, nome: "Três Metas", icone: "📈", descricao: "Bata a meta mensal de angariações em 3 meses." },
        { id: "metas-6", alvo: 6, nome: "Meio Ano de Metas", icone: "🧭", descricao: "Bata a meta mensal de angariações em 6 meses." },
        { id: "metas-12", alvo: 12, nome: "Um Ano de Metas", icone: "🗓️", descricao: "Bata a meta mensal de angariações em 12 meses." },
      ],
    },
    {
      valor: sequencia,
      detalhe: (v) => `${v} meses consecutivos`,
      progressoTexto: (v, alvo) => `sequência atual: ${v ?? 0} de ${alvo}`,
      degraus: [
        { id: "constancia-de-ferro", alvo: 3, nome: "Constância de Ferro", icone: "🔥", descricao: "Bata a meta de angariações por 3 meses seguidos." },
        { id: "sequencia-6", alvo: 6, nome: "Meio Ano Seguido", icone: "🌋", descricao: "Bata a meta de angariações por 6 meses seguidos." },
        { id: "sequencia-12", alvo: 12, nome: "Ano Inteiro", icone: "⭐", descricao: "Bata a meta de angariações por 12 meses seguidos." },
      ],
    },
  ];
}

/** O degrau caiu? Velocidade inverte a comparação (menor é melhor). */
function conquistou(trilha: Trilha, alvo: number): boolean {
  if (trilha.valor == null) return false;
  return trilha.menorEhMelhor ? trilha.valor <= alvo : trilha.valor >= alvo;
}

/**
 * As conquistas visíveis: todos os degraus já conquistados de cada trilha,
 * mais o próximo a perseguir.
 *
 * Quando a trilha inteira cai, não há "próximo" — e a última conquistada fica
 * como topo. Quando nada caiu ainda, aparece só o primeiro degrau, travado:
 * é o que faz uma conta zerada continuar mostrando as mesmas 6 medalhas de
 * sempre, em vez de uma grade vazia.
 */
export function calcularBadges(imoveis: Imovel[], metas: Metas): Badge[] {
  const badges: Badge[] = [];

  for (const trilha of construirTrilhas(imoveis, metas)) {
    let proximoMostrado = false;

    for (const degrau of trilha.degraus) {
      const ganhou = conquistou(trilha, degrau.alvo);

      if (ganhou) {
        badges.push({
          id: degrau.id,
          nome: degrau.nome,
          descricao: degrau.descricao,
          icone: degrau.icone,
          conquistada: true,
          detalhe: trilha.valor != null ? trilha.detalhe?.(trilha.valor) : undefined,
        });
        continue;
      }

      // O primeiro não conquistado é o alvo da vez; os demais ficam ocultos
      // até chegar a hora deles.
      if (proximoMostrado) break;
      proximoMostrado = true;

      badges.push({
        id: degrau.id,
        nome: degrau.nome,
        descricao: degrau.descricao,
        icone: degrau.icone,
        conquistada: false,
        progressoTexto: trilha.progressoTexto?.(trilha.valor, degrau.alvo),
        // Sem barra onde "meio caminho" não significa nada (ver menorEhMelhor).
        progresso:
          trilha.menorEhMelhor || degrau.alvo <= 0
            ? undefined
            : Math.min(1, Math.max(0, (trilha.valor ?? 0) / degrau.alvo)),
      });
    }
  }

  return badges;
}
