import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anuncioPertenceAoMercado,
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import { salvarComparaveisMercado } from "@/lib/servidor/comparaveisMercado";

export interface ColetaCentralFinalizada {
  anuncios: AnuncioCentralAngariacao[];
  comparaveisSalvos: number;
  erroComparaveis: unknown | null;
}

/**
 * Finaliza uma coleta já realizada. Central e cron do Radar compartilham
 * esta fronteira para normalizar os mesmos campos, respeitar a cidade exata e
 * alimentar a mesma base histórica sem repetir a consulta ao portal.
 *
 * A base de comparáveis é complementar: uma falha nela não apaga a coleta.
 * O chamador recebe o erro para registrá-lo e decidir como comunicá-lo.
 */
export async function finalizarColetaCentralAngariacao(
  supabase: SupabaseClient,
  userId: string,
  coletados: AnuncioCentralAngariacao[],
  filtros: FiltrosCentralAngariacao,
): Promise<ColetaCentralFinalizada> {
  const anuncios = coletados
    .map((anuncio) => comCaracteristicasDoAnuncio(anuncio, filtros.tipo))
    .filter((anuncio) => anuncioPertenceAoMercado(anuncio, filtros.cidade, filtros.estado));

  try {
    const comparaveisSalvos = await salvarComparaveisMercado(
      supabase,
      userId,
      anuncios,
      filtros,
    );
    return { anuncios, comparaveisSalvos, erroComparaveis: null };
  } catch (erro) {
    return { anuncios, comparaveisSalvos: 0, erroComparaveis: erro };
  }
}
