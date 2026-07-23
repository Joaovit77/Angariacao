/* ================================================================
   FOCO DO DIA — plano de prospecção por portal (parte pura)
   Feature nova da pós-migração (sem oráculo do app antigo).

   Responde a pergunta que o corretor faz de manhã: "hoje, quantos
   contatos NOVOS eu faço em cada portal?". Ex.: "4 no Garimpo, 4 na
   OLX, 4 nas redes". Dois eixos, os dois derivados — nenhum número é
   digitado, nenhum estado novo no banco além dos portais que o
   corretor cadastra:

   - O QUANTO (o total do dia) sai do SEU RITMO: a mediana de contatos
     novos por dia ativo nas últimas semanas. É "o seu dia típico".
     Sem histórico de ritmo, não há total — o card cai para só a lista
     dos portais.
   - O ONDE: o ritmo é dividido IGUALMENTE entre os portais que o
     corretor usa. O sistema NÃO ranqueia portais por conversão de
     propósito: o registro de leads difere entre eles (no garimpo o
     corretor cadastra tudo na descoberta; na OLX/marketplace só depois
     que o cliente engaja), então "leads registrados" não é esforço de
     prospecção, e qualquer taxa favoreceria uns por hábito de registro,
     não por qualidade do canal. Divisão igual é o que o dado sustenta
     com honestidade; o card vira um lembrete de não abandonar nenhum
     canal, e o corretor equilibra o resto na intuição.

   O que conta como "contato novo": a ENTRADA do lead no funil — a 1ª
   entrada do `statusHistory`, datada quando o imóvel é cadastrado.
   Cadastrar um lead não cria tentativa, então ancorar na entrada é o
   que casa com o fluxo real ("fazer um novo contato" = cadastrar o
   lead) e ainda é "só o novo, não follow-up" — uma entrada por lead.

   Puro: consome só tipos + constantes + helpers de data e o motor,
   sem React/Next/Supabase/store.
   ================================================================ */
import { ORIGENS_IMOVEL } from "../constantes";
import { addDaysISO } from "../datas";
import type { Imovel } from "../tipos";
import { foiAngariado } from "./motor";

/** Janela, em dias, para medir o ritmo típico de contatos novos. */
export const JANELA_RITMO_DIAS = 14;

/** Data (YYYY-MM-DD) em que o lead entrou no funil; null se não há histórico. */
export function dataEntradaFunil(imovel: Imovel): string | null {
  const primeira = imovel.statusHistory?.[0];
  return primeira ? primeira.date.slice(0, 10) : null;
}

/** Leads e angariados por portal — para saber quais portais estão em jogo e
    dar o contexto (nº de angariações) que o card mostra. NÃO vira taxa: ver o
    cabeçalho sobre por que o registro enviesa qualquer conversão. */
export interface AngariacaoPortal {
  leads: number;
  angariados: number;
}

export function angariacaoPorPortal(imoveis: Imovel[]): Map<string, AngariacaoPortal> {
  const bruto = new Map<string, AngariacaoPortal>();
  for (const imovel of imoveis) {
    const origem = imovel.origemImovel?.trim();
    if (!origem) continue;
    const a = bruto.get(origem) ?? { leads: 0, angariados: 0 };
    a.leads++;
    if (foiAngariado(imovel)) a.angariados++;
    bruto.set(origem, a);
  }
  return bruto;
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
  /** Angariações que este portal já produziu (contexto neutro, não é ranking). */
  angariados: number;
}

export interface PlanoDoDia {
  /** Contatos novos no "dia típico"; null = sem histórico para estimar. */
  ritmo: number | null;
  /** false quando `ritmo` é null: o card mostra só a lista, sem metas numéricas. */
  temSugestao: boolean;
  /** Portais em jogo, do que mais falta fazer hoje para o que menos falta. */
  portais: FocoPortal[];
  /** Total de contatos novos já feitos hoje (todos os portais). */
  feitosHoje: number;
}

/**
 * Monta o plano do dia. `portaisExtras` são os portais que o corretor cadastrou
 * além dos fixos (user_config). Entram na lista: os portais cadastrados (sempre)
 * e os que já produziram angariação OU receberam um contato hoje. Assim o card
 * não vira uma lista de dezenas de zeros, mas um portal recém-cadastrado aparece
 * na hora.
 */
export function planoDoDia(imoveis: Imovel[], portaisExtras: string[], hoje: string): PlanoDoDia {
  const extras = new Set(portaisExtras.map((p) => p.trim()).filter(Boolean));
  const universo = new Set<string>([...ORIGENS_IMOVEL, ...extras]);
  const ang = angariacaoPorPortal(imoveis);
  const feitosPorPortal = contatosNovosHojePorPortal(imoveis, hoje);
  const ritmo = ritmoTipico(imoveis, hoje);

  // Portais em jogo: cadastrados pelo corretor (sempre) ou com angariação/contato hoje.
  const emJogo: string[] = [];
  for (const origem of universo) {
    if (extras.has(origem) || (ang.get(origem)?.angariados ?? 0) > 0 || (feitosPorPortal.get(origem) ?? 0) > 0) {
      emJogo.push(origem);
    }
  }

  // Divisão IGUAL do ritmo. As unidades que não dividem certo (resto) vão para
  // os primeiros portais em ordem alfabética — critério neutro, sem ranquear.
  const sugeridoPorPortal = new Map<string, number>();
  if (ritmo != null && ritmo > 0 && emJogo.length > 0) {
    const base = Math.floor(ritmo / emJogo.length);
    let resto = ritmo - base * emJogo.length;
    emJogo.forEach((o) => sugeridoPorPortal.set(o, base));
    for (const origem of [...emJogo].sort((a, b) => a.localeCompare(b))) {
      if (resto <= 0) break;
      sugeridoPorPortal.set(origem, base + 1);
      resto--;
    }
  }

  const portais: FocoPortal[] = emJogo.map((origem) => {
    const feitos = feitosPorPortal.get(origem) ?? 0;
    const sugerido = sugeridoPorPortal.get(origem) ?? 0;
    return {
      origem,
      sugerido,
      feitos,
      restantes: Math.max(0, sugerido - feitos),
      angariados: ang.get(origem)?.angariados ?? 0,
    };
  });

  // Ordem: o que mais falta fazer hoje primeiro (canais neglicenciados sobem);
  // empate por quem você mais tocou e, por fim, nome — estável.
  portais.sort(
    (a, b) => b.restantes - a.restantes || b.feitos - a.feitos || a.origem.localeCompare(b.origem),
  );

  return {
    ritmo,
    temSugestao: ritmo != null,
    portais,
    feitosHoje: [...feitosPorPortal.values()].reduce((s, n) => s + n, 0),
  };
}
