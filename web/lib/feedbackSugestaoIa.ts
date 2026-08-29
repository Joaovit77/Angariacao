import type { PedidoFeedbackSugestaoIa, ResultadoFeedbackSugestaoIa } from "@/lib/ia/feedback";
import { getSupabase } from "@/lib/persistencia/supabase";

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
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente para salvar o feedback." };

  try {
    const resposta = await fetch("/api/ia/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(pedido),
    });
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
