import {
  parametrosDaReferenciaAvaliacao,
  type ContextoExternoAvaliacao,
  type ReferenciaContextoAvaliacao,
} from "./calculo/contextoAvaliacao";
import { fetchAutenticado } from "./auth/recuperacaoSessao";

export async function carregarContextoAvaliacao(
  referencia: ReferenciaContextoAvaliacao,
  signal?: AbortSignal,
): Promise<ContextoExternoAvaliacao> {
  const parametros = parametrosDaReferenciaAvaliacao(referencia);
  const resposta = await fetchAutenticado(`/api/avaliacao/contexto?${parametros}`, {
    cache: "no-store",
    signal,
  }, { repetivel: true });
  if (!resposta) throw new Error("Sua sessão expirou. Entre novamente.");
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
