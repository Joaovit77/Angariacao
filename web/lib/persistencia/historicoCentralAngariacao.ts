import { chaveAnuncio } from "../calculo/repeticaoCentralAngariacao";
import type { AnuncioCentralVisualizado } from "../tipos";
import { fromDbAnuncioCentralVisualizado, type DbAnuncioCentralVisualizadoRow } from "./mapeadores";
import { getSupabase } from "./supabase";

export async function carregarAnunciosCentralVisualizados(): Promise<AnuncioCentralVisualizado[]> {
  const { data, error } = await getSupabase()
    .from("central_anuncios_visualizados")
    .select("user_id,portal,id_externo,url,visualizado_em")
    .order("visualizado_em", { ascending: false });
  if (error) throw error;
  return ((data || []) as DbAnuncioCentralVisualizadoRow[]).map(fromDbAnuncioCentralVisualizado);
}

export async function carregarChavesAnunciosCentralVisualizados(): Promise<Set<string>> {
  const anuncios = await carregarAnunciosCentralVisualizados();
  return new Set(anuncios.map((anuncio) => chaveAnuncio(anuncio)));
}
