/* ================================================================
   GAMIFICAÇÃO — medalhas (badges) da view de Metas
   Módulo puro (só tipos, datas e motor): todas as conquistas são
   derivadas do statusHistory e das metas já persistidas — nada de
   estado novo no banco. Determinístico a partir dos parâmetros
   (nenhuma função usa todayISO()), o que mantém os testes
   independentes do relógio.
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

export function calcularBadges(imoveis: Imovel[], metas: Metas): Badge[] {
  const angariados = imoveis.filter(foiAngariado);
  const locados = imoveis.filter((i) => dateEnteredStatus(i, "Locado") != null);
  const melhorSemana = melhorSemanaDeAngariacao(imoveis);
  const maisRapida = angariacaoMaisRapidaDias(imoveis);
  const mesesBatidos = mesesComMetaDeAngariacaoBatida(imoveis, metas);
  const sequencia = maiorSequenciaDeMetasBatidas(imoveis, metas);

  return [
    {
      id: "primeira-angariacao",
      nome: "Primeira Angariação",
      descricao: "Conclua a angariação do seu primeiro imóvel.",
      icone: "🌱",
      conquistada: angariados.length > 0,
      detalhe: angariados.length > 0 ? `${angariados.length} angariação(ões) no total` : undefined,
    },
    {
      id: "angariador-as",
      nome: "Angariador Ás",
      descricao: "Angarie 5 imóveis na mesma semana.",
      icone: "🏅",
      conquistada: !!melhorSemana && melhorSemana.total >= 5,
      detalhe:
        melhorSemana && melhorSemana.total >= 5
          ? `${melhorSemana.total} imóveis na semana de ${fmtDate(melhorSemana.semana)}`
          : undefined,
    },
    {
      id: "sem-tempo-a-perder",
      nome: "Sem Tempo a Perder",
      descricao: "Leve um imóvel do primeiro contato à angariação em até 2 dias.",
      icone: "⚡",
      conquistada: maisRapida !== null && maisRapida <= 2,
      detalhe:
        maisRapida !== null && maisRapida <= 2
          ? maisRapida === 0
            ? "Angariado no mesmo dia"
            : `Angariado em ${maisRapida} dia(s)`
          : undefined,
    },
    {
      id: "chave-entregue",
      nome: "Chave Entregue",
      descricao: "Tenha o seu primeiro imóvel locado.",
      icone: "🔑",
      conquistada: locados.length > 0,
      detalhe: locados.length > 0 ? `${locados.length} imóvel(is) locado(s)` : undefined,
    },
    {
      id: "meta-batida",
      nome: "Meta Batida",
      descricao: "Bata a meta mensal de angariações pela primeira vez.",
      icone: "🎯",
      conquistada: mesesBatidos.length > 0,
      detalhe: mesesBatidos.length > 0 ? `${mesesBatidos.length} mês(es) com meta batida` : undefined,
    },
    {
      id: "constancia-de-ferro",
      nome: "Constância de Ferro",
      descricao: "Bata a meta de angariações por 3 meses seguidos.",
      icone: "🔥",
      conquistada: sequencia >= 3,
      detalhe: sequencia >= 3 ? `${sequencia} meses consecutivos` : undefined,
    },
  ];
}
