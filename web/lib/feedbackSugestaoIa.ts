import type { PedidoFeedbackSugestaoIa, ResultadoFeedbackSugestaoIa } from "@/lib/ia/feedback";
import { fetchAutenticado } from "@/lib/auth/recuperacaoSessao";

export type RespostaFeedbackSugestaoIa =
  | { ok: true; resultado: ResultadoFeedbackSugestaoIa }
  | { ok: false; mensagem: string };

/**
 * Salva pelo endpoint autenticado. O browser nunca escolhe `user_id`; a rota
 * o deriva da sessão e o banco repete a garantia com RLS e FK composta.
 */
export async function registrarFeedbackSugestaoIa(
  pedido: PedidoFeedbackSugestaoIa,
): Promise<RespostaFeedbackSugestaoIa> {
  try {
    const resposta = await fetchAutenticado("/api/ia/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    }, { repetivel: false });
    if (!resposta) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente para salvar o feedback." };
    const dados = (await resposta.json().catch(() => null)) as
      | { ok?: unknown; resultado?: unknown; mensagem?: unknown }
      | null;
    if (
      resposta.ok &&
      dados?.ok === true &&
      (dados.resultado === "aprovado" || dados.resultado === "editado" || dados.resultado === "rejeitado")
    ) {
      return { ok: true, resultado: dados.resultado };
    }
    return {
      ok: false,
      mensagem:
        typeof dados?.mensagem === "string"
          ? dados.mensagem
          : "Não foi possível salvar o feedback. Tente novamente.",
    };
  } catch {
    return { ok: false, mensagem: "Não foi possível salvar o feedback. Tente novamente." };
  }
}
