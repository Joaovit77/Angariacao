import {
  anuncioPertenceAoMercado,
  rotuloPortal,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "./centralAngariacao";
import { situacaoRepeticaoCentral, urlsDosImoveis } from "./repeticaoCentralAngariacao";
import { agoraTimestamp, dataOperacionalDeTimestamp, timestampDeIso } from "../datas";
import type { Imovel } from "../tipos";

// Duas horas preservam alertas no mesmo turno e reduzem em 75% as consultas
// automáticas em comparação com o intervalo anterior de 30 minutos.
export const INTERVALO_RADAR_MS = 2 * 60 * 60 * 1000;

export type OrigemVerificacaoRadar = "manual" | "navegador" | "cron";

export interface BuscaRadar {
  id: string;
  nome: string;
  filtros: FiltrosCentralAngariacao;
  ativo: boolean;
  ultimoCheck: string | null;
  ultimoCheckAutomatico: string | null;
  ultimoCheckOrigem: OrigemVerificacaoRadar | null;
  criadoEm: string;
}

export interface AnuncioRadar {
  id: string;
  buscaId: string;
  anuncio: AnuncioCentralAngariacao;
  visto: boolean;
  encontradoEm: string;
}

export interface EstadoRadar {
  buscas: BuscaRadar[];
  anuncios: AnuncioRadar[];
}

/**
 * Compara a coleta atual com o histórico da busca. A chave composta é a
 * mesma da restrição UNIQUE do banco, portanto uma rodada do navegador e uma
 * rodada agendada podem acontecer juntas sem criarem dois alertas.
 */
export function selecionarAnunciosNovosRadar(
  anuncios: AnuncioCentralAngariacao[],
  existentes: Array<{ portal: string; id_externo: string }>,
): AnuncioCentralAngariacao[] {
  const chaves = new Set(existentes.map((item) => `${item.portal}:${item.id_externo}`));
  return anuncios.filter((anuncio) => !chaves.has(`${anuncio.portal}:${anuncio.idExterno}`));
}

export function nomePadraoBuscaRadar(filtros: FiltrosCentralAngariacao): string {
  const local = [filtros.bairro, filtros.cidade].filter(Boolean).join(", ");
  return `${local || "Minha busca"} · ${rotuloPortal(filtros.portal)}`;
}

export function buscaRadarEstaVencida(busca: BuscaRadar, agora = agoraTimestamp()): boolean {
  if (!busca.ativo) return false;
  if (!busca.ultimoCheck) return true;
  const ultimo = timestampDeIso(busca.ultimoCheck);
  return ultimo == null || agora - ultimo >= INTERVALO_RADAR_MS;
}

/** O cron roda uma vez por dia civil de São Paulo, independentemente das
    verificações manuais e do monitor do navegador. */
export function buscaElegivelParaCron(busca: BuscaRadar, agora = agoraTimestamp()): boolean {
  if (!busca.ativo) return false;
  if (!busca.ultimoCheckAutomatico) return true;
  const ultimoAutomatico = timestampDeIso(busca.ultimoCheckAutomatico);
  if (ultimoAutomatico == null) return true;
  if (ultimoAutomatico > agora) return false;
  return dataOperacionalDeTimestamp(ultimoAutomatico) !== dataOperacionalDeTimestamp(agora);
}

/**
 * Anúncio do Radar que ainda pode exigir atenção, como devolvido pela RPC
 * `candidatos_pendentes_radar`: `visto = false` e sem registro em
 * `central_anuncios_visualizados` para o mesmo usuário + portal + id externo.
 * Traz só os campos que a regra de pipeline e a de mercado leem.
 */
export interface CandidatoPendenteRadar {
  id: string;
  buscaId: string;
  anuncio: Pick<
    AnuncioCentralAngariacao,
    "portal" | "idExterno" | "url" | "titulo" | "descricao" | "endereco" | "cidade" | "estado"
  >;
}

export interface PendenciasRadar {
  total: number;
  porBusca: Map<string, number>;
  /** IDs de `radar_anuncios` pendentes, para marcar "Novo" nos cards. */
  ids: Set<string>;
}

/**
 * Regra única do contador do Radar, usada pela tela e pelo monitor:
 * pendente = candidato do servidor (não visto e não visualizado) que pertence
 * ao mercado da busca e que a lista não esconde por já estar no pipeline
 * (`situacaoRepeticaoCentral`, a mesma regra que oculta os cards).
 */
export function resumirPendenciasRadar(
  candidatos: CandidatoPendenteRadar[],
  buscas: Array<Pick<BuscaRadar, "id" | "filtros">>,
  imoveis: Imovel[],
): PendenciasRadar {
  const filtrosPorBusca = new Map(buscas.map((busca) => [busca.id, busca.filtros]));
  const urlsNaCarteira = urlsDosImoveis(imoveis);
  const porBusca = new Map<string, number>();
  const ids = new Set<string>();
  for (const candidato of candidatos) {
    const filtros = filtrosPorBusca.get(candidato.buscaId);
    if (!filtros || !anuncioPertenceAoMercado(candidato.anuncio, filtros.cidade, filtros.estado)) continue;
    if (situacaoRepeticaoCentral(candidato.anuncio, imoveis, urlsNaCarteira).ocultar) continue;
    ids.add(candidato.id);
    porBusca.set(candidato.buscaId, (porBusca.get(candidato.buscaId) || 0) + 1);
  }
  return { total: ids.size, porBusca, ids };
}
