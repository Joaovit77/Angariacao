/* ================================================================
   IA (lado do browser)
   Chama a nossa rota /api/ia, que é quem fala com a Anthropic — a
   chave nunca chega aqui. Fora de mutacoes.ts pelo mesmo motivo do
   envioWhatsapp: não é escrita no Supabase, é efeito externo.
   Nunca lança: devolve o resultado ou o motivo da falha, e a UI
   decide entre avisar e seguir sem a sugestão.
   ================================================================ */
import type { ContextoRoteiro, FalhaIa, RoteiroSugerido } from "./calculo/ia";
import { getSupabase } from "./persistencia/supabase";

export interface ResultadoRoteiros {
  ok: boolean;
  falha?: FalhaIa;
  mensagem?: string;
  roteiros?: RoteiroSugerido[];
}

export interface ResultadoAnalise {
  ok: boolean;
  falha?: FalhaIa;
  mensagem?: string;
  texto?: string;
}

async function chamar<T>(corpo: unknown): Promise<T | { ok: false; falha: FalhaIa }> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return { ok: false, falha: "sessao-expirada" };

  try {
    const resposta = await fetch("/api/ia", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => null)) as T | null;
    if (!dados) return { ok: false, falha: "falha-ia" };
    return dados;
  } catch {
    // Rede caiu, offline, rota fora do ar.
    return { ok: false, falha: "falha-ia" };
  }
}

/** Pede 3 roteiros de abordagem para o cenário informado. */
export function sugerirRoteiros(contexto: ContextoRoteiro): Promise<ResultadoRoteiros> {
  return chamar<ResultadoRoteiros>({ tipo: "sugerir-roteiros", contexto });
}

/** Pede a leitura do ranking. Não recebe parâmetro de propósito: os números
    são recalculados no servidor a partir do banco (ver a rota). */
export function analisarAbordagens(): Promise<ResultadoAnalise> {
  return chamar<ResultadoAnalise>({ tipo: "analisar-abordagens" });
}
