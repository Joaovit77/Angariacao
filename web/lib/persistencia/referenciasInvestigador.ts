import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnuncioCentralAngariacao, PortalAngariacao } from "@/lib/calculo/centralAngariacao";
import { chaveAnuncio } from "@/lib/calculo/repeticaoCentralAngariacao";
import { getSupabase } from "./supabase";

interface LinhaReferenciaComparavel {
  id: string;
  portal: PortalAngariacao;
  id_externo: string;
}

export async function carregarIdsComparaveisDosAnunciosComCliente(
  supabase: SupabaseClient,
  userId: string,
  anuncios: AnuncioCentralAngariacao[],
): Promise<Map<string, string>> {
  const idsPorPortal = new Map<PortalAngariacao, Set<string>>();
  for (const anuncio of anuncios) {
    const ids = idsPorPortal.get(anuncio.portal) || new Set<string>();
    ids.add(anuncio.idExterno);
    idsPorPortal.set(anuncio.portal, ids);
  }

  const grupos = [...idsPorPortal.entries()];
  if (!grupos.length) return new Map();
  const resultados = await Promise.all(grupos.map(async ([portal, ids]) => {
    const { data, error } = await supabase
      .from("comparaveis_mercado")
      .select("id,portal,id_externo")
      .eq("user_id", userId)
      .eq("portal", portal)
      .in("id_externo", [...ids]);
    if (error) throw error;
    return (data || []) as LinhaReferenciaComparavel[];
  }));

  return new Map(
    resultados.flat().map((linha) => [
      chaveAnuncio({ portal: linha.portal, idExterno: linha.id_externo }),
      linha.id,
    ]),
  );
}

export async function carregarIdsComparaveisDosAnuncios(
  userId: string,
  anuncios: AnuncioCentralAngariacao[],
): Promise<Map<string, string>> {
  return carregarIdsComparaveisDosAnunciosComCliente(getSupabase(), userId, anuncios);
}
