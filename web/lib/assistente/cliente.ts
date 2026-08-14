import { getSupabase } from "@/lib/persistencia/supabase";
import type { PedidoAssistente, RespostaAssistente } from "./tipos";

export const TIMEOUT_ASSISTENTE_PADRAO_MS = 30_000;

interface OpcoesPerguntaAssistente {
  signal?: AbortSignal;
  timeoutMs?: number;
}

function timeoutConfigurado(): number {
  const informado = Number(process.env.NEXT_PUBLIC_ASSISTENTE_TIMEOUT_MS);
  return Number.isFinite(informado) && informado >= 1_000 && informado <= 120_000
    ? informado
    : TIMEOUT_ASSISTENTE_PADRAO_MS;
}

export async function perguntarAoAssistente(
  pedido: PedidoAssistente,
  opcoes: OpcoesPerguntaAssistente = {},
): Promise<RespostaAssistente> {
  const controller = new AbortController();
  let expirou = false;
  const timeoutMs = Number.isFinite(opcoes.timeoutMs) && Number(opcoes.timeoutMs) > 0 ? Number(opcoes.timeoutMs) : timeoutConfigurado();
  const cancelarExternamente = () => controller.abort(opcoes.signal?.reason);
  if (opcoes.signal?.aborted) cancelarExternamente();
  else opcoes.signal?.addEventListener("abort", cancelarExternamente, { once: true });
  const timer = setTimeout(() => { expirou = true; controller.abort(); }, timeoutMs);

  try {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (!session) return { ok: false, erro: "Sua sessão expirou. Entre novamente para continuar.", codigo: "nao_autenticado" };
    if (controller.signal.aborted) throw new DOMException("Abortado", "AbortError");

    const resposta = await fetch("/api/assistente", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(pedido),
      signal: controller.signal,
    });
    const dados = await resposta.json().catch(() => null) as RespostaAssistente | null;
    if (resposta.status === 401) return { ok: false, erro: "Sua sessão expirou. Entre novamente para continuar.", codigo: "nao_autenticado" };
    if (resposta.status === 403) return { ok: false, erro: "Você não tem permissão para usar o Assistente.", codigo: "sem_permissao" };
    if (!resposta.ok) return { ok: false, erro: "O Assistente encontrou um erro interno. Tente novamente em instantes.", codigo: "falha_api" };
    return dados || { ok: false, erro: "O Assistente devolveu uma resposta inválida.", codigo: "resposta_invalida" };
  } catch (erro) {
    if (expirou) return { ok: false, erro: "A consulta demorou mais que o esperado. Tente novamente.", codigo: "timeout" };
    if (controller.signal.aborted || (erro instanceof DOMException && erro.name === "AbortError")) {
      return { ok: false, erro: "Consulta cancelada.", codigo: "cancelado" };
    }
    return { ok: false, erro: "Não foi possível conectar ao Assistente. Verifique sua rede e tente novamente.", codigo: "falha_rede" };
  } finally {
    clearTimeout(timer);
    opcoes.signal?.removeEventListener("abort", cancelarExternamente);
  }
}
