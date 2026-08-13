/* ================================================================
   CATEGORIAS DO MAPA — parte pura
   Em qual balde de cor cada imóvel cai no mapa, e a legenda que
   descreve esses baldes. Fonte única: o pino (MapaLeaflet) e a
   legenda/filtro (MapaView) leem daqui, então nunca divergem.

   Puro: consome só tipos + constantes + o motor (foiAngariado),
   sem React/Next/Leaflet/store.
   ================================================================ */
import { STATUS_TERMINAL_NEGATIVE } from "../constantes";
import type { Imovel } from "../tipos";
import { captacaoGanha, ehUnidadeDesdobrada } from "./motor";

export type CategoriaMapa = "locado" | "angariado" | "andamento" | "sem-sucesso";

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

/**
 * O balde do imóvel, decidido pelo DESFECHO ATUAL, não pelo histórico.
 *
 * A ordem importa: Locado e as saídas negativas ganham de "angariado" de
 * propósito. Um imóvel foi angariado e depois perdido conta como "tentado, sem
 * sucesso" — é o estado final que vale, igual à cor por status que já existia.
 * Sobra para "angariado" o que foi captado e segue na carteira sem locar
 * (Angariado, Autorização assinada, Publicado). "andamento" é o pipeline antes
 * da captação.
 *
 * Quem decide se a captação foi ganha é `captacaoGanha`, e não `foiAngariado`:
 * o imóvel cuja autorização o Sistema Principal marcou como assinada pode não
 * ter a etapa "Angariado" no histórico daqui, e pintá-lo de "em andamento"
 * diria no mapa que ainda estamos atrás de um proprietário que já assinou.
 */
export function categoriaMapa(i: Imovel): CategoriaMapa {
  if (i.status === "Locado") return "locado";
  if (TERMINAIS.includes(i.status)) return "sem-sucesso";
  if (captacaoGanha(i)) return "angariado";
  return "andamento";
}

/** Fonte única dos pontos e do contador do mapa de calor. */
export function entraNoCalorMapa(i: Imovel): boolean {
  return captacaoGanha(i);
}

/** O período do mapa usa a data em que o imóvel entrou na captação. */
export function dentroPeriodoMapa(i: Imovel, desde: string | null): boolean {
  return desde == null || !!i.dataAngariacao && i.dataAngariacao >= desde;
}

export interface ResumoMapa {
  total: number;
  localizados: number;
  ganhas: number;
  emAndamento: number;
  conversao: number;
}

export interface FiltrosMapa {
  busca?: string;
  bairro?: string;
  status?: string;
  responsavel?: string;
  origem?: string;
  desde?: string | null;
}

export function filtrarImoveisMapa(imoveis: Imovel[], filtros: FiltrosMapa): Imovel[] {
  const normalizar = (v: string | null | undefined) => (v || "").trim().toLocaleLowerCase("pt-BR");
  const termo = normalizar(filtros.busca);
  const bairro = normalizar(filtros.bairro);
  return imoveis.filter((i) => {
    if (!dentroPeriodoMapa(i, filtros.desde || null)) return false;
    if (bairro && !normalizar(i.bairro).includes(bairro)) return false;
    if (filtros.status && i.status !== filtros.status) return false;
    if (filtros.responsavel && i.responsavel !== filtros.responsavel) return false;
    if (filtros.origem && i.origemImovel !== filtros.origem) return false;
    return !termo || [i.codigo, i.endereco, i.bairro, i.edificio, i.proprietarioNome].some((v) => normalizar(v).includes(termo));
  });
}

export interface DesempenhoBairroMapa {
  bairro: string;
  total: number;
  ganhas: number;
  conversao: number;
}

export interface LeituraTerritorialMapa {
  oportunidade: DesempenhoBairroMapa | null;
  atencao: DesempenhoBairroMapa | null;
  concentracao: DesempenhoBairroMapa | null;
  mediaConversao: number;
}

/** Números que alimentam os cards; a IA recebe somente este resumo pronto. */
export function leituraTerritorialMapa(imoveis: Imovel[]): LeituraTerritorialMapa {
  const captacoes = imoveis.filter((i) => !ehUnidadeDesdobrada(i) && !!i.bairro?.trim());
  const grupos = new Map<string, Imovel[]>();
  for (const i of captacoes) {
    const nome = i.bairro!.trim();
    grupos.set(nome, [...(grupos.get(nome) || []), i]);
  }
  const bairros = [...grupos.entries()].map(([bairro, itens]) => {
    const ganhas = itens.filter(captacaoGanha).length;
    return { bairro, total: itens.length, ganhas, conversao: ganhas / itens.length * 100 };
  });
  const mediaConversao = captacoes.length ? captacoes.filter(captacaoGanha).length / captacoes.length * 100 : 0;
  const comAmostra = bairros.filter((b) => b.total >= 3);
  const oportunidade = [...comAmostra].sort((a, b) => b.conversao - a.conversao || b.total - a.total)[0] || null;
  const atencao = [...comAmostra]
    .filter((b) => b.conversao < mediaConversao)
    .sort((a, b) => b.total - a.total || a.conversao - b.conversao)[0] || null;
  const concentracao = [...bairros].sort((a, b) => b.total - a.total || b.ganhas - a.ganhas)[0] || null;
  return { oportunidade, atencao, concentracao, mediaConversao };
}

/** Resumo operacional sem inflar captações com unidades desdobradas. */
export function resumoMapa(imoveis: Imovel[]): ResumoMapa {
  const captacoes = imoveis.filter((i) => !ehUnidadeDesdobrada(i));
  const ganhas = captacoes.filter(captacaoGanha).length;
  return {
    total: captacoes.length,
    localizados: imoveis.filter((i) => i.latitude != null && i.longitude != null).length,
    ganhas,
    emAndamento: captacoes.filter((i) => categoriaMapa(i) === "andamento").length,
    conversao: captacoes.length ? ganhas / captacoes.length * 100 : 0,
  };
}

export interface CategoriaMapaInfo {
  id: CategoriaMapa;
  label: string;
  cor: string;
}

/** Ordem e cores da legenda (funil: conseguiu → captou → tentando → falhou).
    O azul do "angariado" é distinto de propósito do verde do "locado" e do
    âmbar do "andamento", para os quatro baldes se separarem no olho. */
export const CATEGORIAS_MAPA: CategoriaMapaInfo[] = [
  { id: "locado", label: "Locado (conseguiu)", cor: "#5fb896" },
  { id: "angariado", label: "Angariado", cor: "#6f9bd8" },
  { id: "andamento", label: "Em andamento", cor: "#e0b458" },
  { id: "sem-sucesso", label: "Tentado, sem sucesso", cor: "#d97878" },
];

const COR_POR_CATEGORIA: Record<CategoriaMapa, string> = Object.fromEntries(
  CATEGORIAS_MAPA.map((c) => [c.id, c.cor]),
) as Record<CategoriaMapa, string>;

/** Cor do pino do imóvel — a mesma da sua categoria na legenda. */
export function corDaCategoria(i: Imovel): string {
  return COR_POR_CATEGORIA[categoriaMapa(i)];
}
