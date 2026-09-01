import type { SupabaseClient } from "@supabase/supabase-js";
import type { CorrespondenciaInvestigacao } from "@/lib/calculo/investigadorImoveis";
import { urlCanonicaDeAnuncio } from "@/lib/calculo/comparaveisMercado";

interface LinhaReferenciaAvaliacao {
  id: string;
  url_canonica: string | null;
}

/**
 * Associa somente resultados que já possuem uma referência persistida e
 * inequívoca na conta. A falha desse enriquecimento não invalida a pesquisa:
 * o card continua transitório e apenas fica sem o atalho de avaliação.
 */
export async function associarReferenciasAvaliacaoDoInvestigador(
  supabase: SupabaseClient,
  userId: string,
  resultados: CorrespondenciaInvestigacao[],
): Promise<CorrespondenciaInvestigacao[]> {
  const urlsCanonicas = [...new Set(
    resultados.map((resultado) => urlCanonicaDeAnuncio(resultado.url)).filter(Boolean),
  )];
  if (!urlsCanonicas.length) {
    return resultados.map((resultado) => ({ ...resultado, comparavelId: null }));
  }

  const { data, error } = await supabase
    .from("comparaveis_mercado")
    .select("id,url_canonica")
    .eq("user_id", userId)
    .in("url_canonica", urlsCanonicas);
  if (error) {
    console.warn("[investigador-imoveis] referências de avaliação indisponíveis", {
      codigo: error.code || "consulta",
    });
    return resultados.map((resultado) => ({ ...resultado, comparavelId: null }));
  }

  const idsPorUrl = new Map<string, string[]>();
  for (const linha of (data || []) as LinhaReferenciaAvaliacao[]) {
    const url = urlCanonicaDeAnuncio(linha.url_canonica);
    if (!url) continue;
    idsPorUrl.set(url, [...(idsPorUrl.get(url) || []), linha.id]);
  }

  return resultados.map((resultado) => {
    const ids = idsPorUrl.get(urlCanonicaDeAnuncio(resultado.url)) || [];
    return { ...resultado, comparavelId: ids.length === 1 ? ids[0] : null };
  });
}
