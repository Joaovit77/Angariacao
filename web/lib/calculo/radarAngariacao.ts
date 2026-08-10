import {
  rotuloPortal,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "./centralAngariacao";
import { agoraTimestamp, timestampDeIso } from "../datas";

// Duas horas preservam alertas no mesmo turno e reduzem em 75% as consultas
// automáticas em comparação com o intervalo anterior de 30 minutos.
export const INTERVALO_RADAR_MS = 2 * 60 * 60 * 1000;

export interface BuscaRadar {
  id: string;
  nome: string;
  filtros: FiltrosCentralAngariacao;
  ativo: boolean;
  ultimoCheck: string | null;
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
