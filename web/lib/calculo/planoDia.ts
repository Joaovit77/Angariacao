/* ================================================================
   FOCO DO DIA — plano de prospecção por portal (parte pura)
   Feature nova da pós-migração (sem oráculo do app antigo).

   Responde a pergunta que o corretor faz de manhã: "hoje, quantos
   contatos NOVOS eu faço em cada portal?". Ex.: "8 na OLX, 4 nas
   redes sociais". Dois eixos honestos, os dois derivados — nenhum
   número é digitado, nenhum estado novo mora no banco:

   - O QUANTO (o total do dia) sai do SEU RITMO: a mediana de
     contatos novos por dia ativo nas últimas semanas. É "o seu dia
     típico". Sem histórico de ritmo ainda, não há total — o card cai
     para só a ordem de prioridade dos portais.
   - O ONDE (a repartição) sai do desempenho por canal (canais.ts):
     o portal cujos leads mais fecham puxa a maior fatia. Um piso por
     portal impede que o melhor zere os outros, e a trava de amostra
     impede que um "100% de um caso só" encabece a lista.

   O que conta como "contato novo": a ENTRADA do lead no funil — a 1ª
   entrada do `statusHistory`, datada quando o imóvel é cadastrado. Foi
   uma correção sobre a 1ª versão, que lia a 1ª TENTATIVA: cadastrar um
   lead não cria tentativa, então prospecção nova ficava invisível.
   Ancorar na entrada é o que casa com o fluxo real ("fazer um novo
   contato" = cadastrar o lead) e ainda é "só o novo, não follow-up" —
   é uma entrada por lead, no dia em que ele entrou.

   Puro: consome só tipos + constantes + helpers de data e o cálculo
   de canais, sem React/Next/Supabase/store.
   ================================================================ */
import { ORIGENS_IMOVEL } from "../constantes";
import { addDaysISO } from "../datas";
import type { Imovel } from "../tipos";
import { desempenhoPorCanal } from "./canais";

/** Janela, em dias, para medir o ritmo típico de contatos novos. */
export const JANELA_RITMO_DIAS = 14;

/**
 * Mínimo de imóveis angariados para a conversão de um portal PESAR na
 * repartição. Mesma razão do MIN_TENTATIVAS das abordagens: abaixo disso,
 * "converte 100%" quer dizer "aconteceu uma vez". Portal com amostra fraca
 * recebe só o piso e é marcado como indicativo.
 */
export const MIN_ANGARIADOS_CONFIAVEL = 3;

/** Piso de peso que todo portal em jogo recebe, para o melhor não zerar o resto. */
const PISO_PESO = 5;

/** Data (YYYY-MM-DD) em que o lead entrou no funil; null se não há histórico. */
export function dataEntradaFunil(imovel: Imovel): string | null {
  const primeira = imovel.statusHistory?.[0];
  return primeira ? primeira.date.slice(0, 10) : null;
}

/**
 * Contatos NOVOS (leads que entraram no funil em `hoje`), agrupados pelo portal
 * de origem do imóvel. Imóvel sem origem não entra (não há portal a creditar).
 * É o "realizado" do plano — lido só do histórico.
 */
export function contatosNovosHojePorPortal(imoveis: Imovel[], hoje: string): Map<string, number> {
  const porPortal = new Map<string, number>();
  for (const imovel of imoveis) {
    if (dataEntradaFunil(imovel) !== hoje) continue;
    const origem = imovel.origemImovel?.trim();
    if (!origem) continue;
    porPortal.set(origem, (porPortal.get(origem) ?? 0) + 1);
  }
  return porPortal;
}

function mediana(nums: number[]): number {
  const ordenados = [...nums].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * Ritmo típico: a mediana de contatos novos por DIA ATIVO nos `janela` dias
 * anteriores a `hoje` (hoje não entra — o total tem que ser estável ao longo
 * do dia). "Dia ativo" é um dia em que entrou ao menos um lead, para que os
 * dias parados não puxem a mediana para perto de zero. null quando não houve
 * nenhum contato novo na janela (cold start).
 */
export function ritmoTipico(imoveis: Imovel[], hoje: string, janela = JANELA_RITMO_DIAS): number | null {
  const inicio = addDaysISO(hoje, -janela);
  const porDia = new Map<string, number>();
  for (const imovel of imoveis) {
    const data = dataEntradaFunil(imovel);
    // Estritamente antes de hoje e dentro da janela.
    if (!data || data >= hoje || (inicio && data < inicio)) continue;
    porDia.set(data, (porDia.get(data) ?? 0) + 1);
  }
  if (porDia.size === 0) return null;
  return Math.round(mediana([...porDia.values()]));
}

/** Uma linha do plano: um portal, quanto fazer e quanto já foi feito hoje. */
export interface FocoPortal {
  origem: string;
  /** Contatos novos sugeridos para hoje. 0 quando ainda não há ritmo. */
  sugerido: number;
  /** Contatos novos já feitos hoje neste portal. */
  feitos: number;
  /** max(0, sugerido − feitos). */
  restantes: number;
  /** Conversão histórica (locado ÷ angariado) do portal, em %; null se sem histórico. */
  conversao: number | null;
  /** true quando a conversão veio de amostra fraca — número é indicativo. */
  indicativo: boolean;
}

export interface PlanoDoDia {
  /** Contatos novos no "dia típico"; null = sem histórico para estimar. */
  ritmo: number | null;
  /** false quando `ritmo` é null: o card mostra só a ordem, sem metas numéricas. */
  temSugestao: boolean;
  /** Portais em jogo, do mais para o menos prioritário. */
  portais: FocoPortal[];
  /** Total de contatos novos já feitos hoje (todos os portais). */
  feitosHoje: number;
}

/**
 * Monta o plano do dia. `portaisExtras` são os portais que o corretor cadastrou
 * além dos fixos (user_config). Entram na lista: os portais que o corretor
 * cadastrou (sempre — foram declarados de propósito) e os fixos que têm
 * histórico de angariação OU já receberam um contato hoje. Assim o card não
 * vira uma lista de dezenas de zeros, mas um portal recém-cadastrado aparece na
 * hora.
 */
export function planoDoDia(imoveis: Imovel[], portaisExtras: string[], hoje: string): PlanoDoDia {
  const extras = new Set(portaisExtras.map((p) => p.trim()).filter(Boolean));
  const universo = new Set<string>([...ORIGENS_IMOVEL, ...extras]);
  const desempenho = new Map(desempenhoPorCanal(imoveis).map((d) => [d.origem, d]));
  const feitosPorPortal = contatosNovosHojePorPortal(imoveis, hoje);
  const ritmo = ritmoTipico(imoveis, hoje);

  // Portais em jogo: cadastrados pelo corretor (sempre) ou com histórico/contato hoje.
  const emJogo = new Set<string>();
  for (const origem of universo) {
    if (extras.has(origem) || (desempenho.get(origem)?.angariados ?? 0) > 0 || (feitosPorPortal.get(origem) ?? 0) > 0) {
      emJogo.add(origem);
    }
  }

  // Peso de cada portal: piso + bônus pela conversão de quem tem amostra firme.
  const pesoDe = (origem: string): number => {
    const d = desempenho.get(origem);
    if (d && d.angariados >= MIN_ANGARIADOS_CONFIAVEL) return PISO_PESO + d.conversao;
    return PISO_PESO;
  };

  // Repartição do ritmo pelos pesos por MAIOR RESTO (Hamilton): a soma dos
  // sugeridos bate exatamente com o ritmo e as unidades que sobram vão para os
  // portais de maior fração — e, no empate, para o de maior conversão. Isso é o
  // que evita "faça 0 em tudo" quando o ritmo é pequeno perto do nº de portais:
  // com ritmo 1, a única unidade cai no portal mais prioritário, não some no
  // arredondamento.
  const sugeridoPorPortal = new Map<string, number>();
  const emJogoArr = [...emJogo];
  if (ritmo != null && ritmo > 0) {
    const soma = emJogoArr.reduce((s, o) => s + pesoDe(o), 0) || 1;
    const cotas = emJogoArr.map((origem) => {
      const bruto = (ritmo * pesoDe(origem)) / soma;
      const base = Math.floor(bruto);
      return { origem, base, frac: bruto - base };
    });
    cotas.forEach((c) => sugeridoPorPortal.set(c.origem, c.base));
    let resto = ritmo - cotas.reduce((s, c) => s + c.base, 0);
    const fila = [...cotas].sort(
      (a, b) =>
        b.frac - a.frac ||
        (desempenho.get(b.origem)?.conversao ?? -1) - (desempenho.get(a.origem)?.conversao ?? -1) ||
        a.origem.localeCompare(b.origem),
    );
    for (let i = 0; i < fila.length && resto > 0; i++, resto--) {
      sugeridoPorPortal.set(fila[i].origem, (sugeridoPorPortal.get(fila[i].origem) ?? 0) + 1);
    }
  }

  const portais: FocoPortal[] = emJogoArr.map((origem) => {
    const d = desempenho.get(origem);
    const feitos = feitosPorPortal.get(origem) ?? 0;
    const sugerido = sugeridoPorPortal.get(origem) ?? 0;
    return {
      origem,
      sugerido,
      feitos,
      restantes: Math.max(0, sugerido - feitos),
      conversao: d ? d.conversao : null,
      indicativo: !d || d.angariados < MIN_ANGARIADOS_CONFIAVEL,
    };
  });

  // Prioridade: mais a fazer primeiro, empate pela conversão e depois nome.
  portais.sort(
    (a, b) =>
      b.sugerido - a.sugerido ||
      (b.conversao ?? -1) - (a.conversao ?? -1) ||
      a.origem.localeCompare(b.origem),
  );

  return {
    ritmo,
    temSugestao: ritmo != null,
    portais,
    feitosHoje: [...feitosPorPortal.values()].reduce((s, n) => s + n, 0),
  };
}
