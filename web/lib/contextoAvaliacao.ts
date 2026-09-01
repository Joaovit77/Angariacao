import {
  parametrosDaReferenciaAvaliacao,
  type ContextoExternoAvaliacao,
  type ReferenciaContextoAvaliacao,
} from "./calculo/contextoAvaliacao";
import { getSupabase } from "./persistencia/supabase";

export async function carregarContextoAvaliacao(
  referencia: ReferenciaContextoAvaliacao,
  signal?: AbortSignal,
): Promise<ContextoExternoAvaliacao> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");

  const parametros = parametrosDaReferenciaAvaliacao(referencia);
  const resposta = await fetch(`/api/avaliacao/contexto?${parametros}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
    signal,
  });
  const corpo = await resposta.json().catch(() => null) as
    (ContextoExternoAvaliacao & { mensagem?: string }) | null;
  if (!resposta.ok || !corpo?.prefill || !corpo.origemExterna) {
    throw new Error(
      corpo?.mensagem
      || "Não foi possível carregar o anúncio indicado. Você ainda pode preencher a avaliação manualmente.",
    );
  }
  return corpo;
}
