import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anuncioPertenceAoMercado,
  comCaracteristicasDoAnuncio,
  type AnuncioCentralAngariacao,
  type FiltrosCentralAngariacao,
} from "@/lib/calculo/centralAngariacao";
import * as comparaveisMercado from "@/lib/servidor/comparaveisMercado";
import type { MotivoFalhaComparavel } from "@/lib/servidor/comparaveisMercado";
import { anuncioAdmitidoRecorteRadar, finalidadeContextoRadar } from "@/lib/calculo/aquisicaoRadar";
import { exigirCapacidadeAquisicaoRadar } from "./centralAngariacao";

export interface ColetaCentralFinalizada {
  anuncios: AnuncioCentralAngariacao[];
  comparaveisSalvos: number;
  comparaveisFalhos?: number;
  comparaveisParcial?: boolean;
  comparaveisFalhasPorMotivo?: Partial<Record<MotivoFalhaComparavel, number>>;
  erroComparaveis: unknown | null;
}

/**
 * Finaliza uma coleta já realizada. Central e cron do Radar compartilham
 * esta fronteira para normalizar os mesmos campos, respeitar a cidade exata e
 * alimentar a mesma base histórica sem repetir a consulta ao portal.
 *
 * A base de comparáveis é complementar: uma falha nela não apaga a coleta.
 * Sucesso parcial preserva os registros salvos e sinaliza `comparaveisParcial`
 * separado de `erroComparaveis` (falha integral).
 */
export async function finalizarColetaCentralAngariacao(
  supabase: SupabaseClient,
  userId: string,
  coletados: AnuncioCentralAngariacao[],
  filtros: FiltrosCentralAngariacao,
): Promise<ColetaCentralFinalizada> {
  exigirCapacidadeAquisicaoRadar(filtros);
  const finalidade = finalidadeContextoRadar(filtros);
  const anuncios = coletados
    .filter((anuncio) => anuncio.finalidade === undefined || anuncio.finalidade === finalidade)
    .map((anuncio) => ({ ...anuncio, finalidade }))
    .map((anuncio) => comCaracteristicasDoAnuncio(anuncio, filtros.tipo))
    .filter((anuncio) => anuncioAdmitidoRecorteRadar(anuncio, filtros))
    .filter((anuncio) => anuncioPertenceAoMercado(anuncio, filtros.cidade, filtros.estado));

  try {
    const temDetalhado = Object.keys(comparaveisMercado).includes("salvarComparaveisMercadoDetalhado");
    if (temDetalhado && typeof comparaveisMercado.salvarComparaveisMercadoDetalhado === "function") {
      const resultado = await comparaveisMercado.salvarComparaveisMercadoDetalhado(
        supabase,
        userId,
        anuncios,
        filtros,
      );
      if (resultado.salvos === 0 && resultado.primeiroErro) {
        return {
          anuncios,
          comparaveisSalvos: 0,
          comparaveisFalhos: resultado.falhas.length,
          comparaveisParcial: false,
          comparaveisFalhasPorMotivo: resultado.falhasPorMotivo,
          erroComparaveis: resultado.primeiroErro,
        };
      }
      return {
        anuncios,
        comparaveisSalvos: resultado.salvos,
        ...(resultado.falhas.length > 0
          ? {
              comparaveisFalhos: resultado.falhas.length,
              comparaveisParcial: resultado.parcial,
              comparaveisFalhasPorMotivo: resultado.falhasPorMotivo,
            }
          : {}),
        erroComparaveis: null,
      };
    }

    const comparaveisSalvos = await comparaveisMercado.salvarComparaveisMercado(
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
