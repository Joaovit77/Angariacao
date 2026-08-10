/* Cliente da busca sob demanda. O token comprova a sessão; a rota fixa
   os hosts consultados, portanto o browser nunca escolhe uma URL arbitrária. */
import { getSupabase } from "./persistencia/supabase";
import type { FiltrosCentralAngariacao, ResultadoBuscaCentral } from "./calculo/centralAngariacao";

export async function buscarNaCentral(
  filtros: FiltrosCentralAngariacao,
): Promise<ResultadoBuscaCentral> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) {
    return { ok: false, anuncios: [], urlPesquisa: "", aviso: "Sua sessão expirou. Entre novamente." };
  }

  try {
    const resposta = await fetch("/api/central-angariacao/buscar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(filtros),
    });
    const dados = (await resposta.json().catch(() => null)) as ResultadoBuscaCentral | null;
    if (dados) return dados;
  } catch {
    /* mensagem uniforme abaixo */
  }
  return {
    ok: false,
    anuncios: [],
    urlPesquisa: "",
    aviso: "Não foi possível consultar o portal agora.",
  };
}
