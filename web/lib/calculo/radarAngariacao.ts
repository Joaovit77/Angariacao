import {
  rotuloPortal,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "./centralAngariacao";
import { agoraTimestamp, dataOperacionalDeTimestamp, timestampDeIso } from "../datas";

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
