/* ================================================================
   ENVIO DIRETO DE WHATSAPP (lado do browser)
   Chama a nossa rota /api/whatsapp/enviar, que é quem fala com a
   Evolution — o token dela nunca chega aqui. Fica fora de mutacoes.ts
   de propósito: não é uma escrita no Supabase, é um efeito externo.
   Nunca lança: devolve { ok } ou o motivo da falha, para a UI decidir
   entre avisar e cair no wa.me.
   ================================================================ */
import type { FalhaEnvio } from "./calculo/whatsapp";
import { getSupabase } from "./persistencia/supabase";

export interface ResultadoEnvio {
  ok: boolean;
  falha?: FalhaEnvio;
  /** Texto pt-BR já pronto para o toast (vem da rota). */
  mensagem?: string;
}

/** Envia a mensagem ao proprietário do imóvel pelo WhatsApp da imobiliária.
    O destinatário é resolvido no servidor a partir do imovelId (RLS). */
export async function enviarWhatsapp(imovelId: string, mensagem: string): Promise<ResultadoEnvio> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return { ok: false, falha: "sessao-expirada" };

  try {
    const resposta = await fetch("/api/whatsapp/enviar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ imovelId, mensagem }),
    });
    const corpo = (await resposta.json().catch(() => null)) as ResultadoEnvio | null;
    if (!corpo) return { ok: false, falha: "falha-evolution" };
    return corpo;
  } catch {
    // Rede caiu, offline, rota fora do ar.
    return { ok: false, falha: "sem-conexao" };
  }
}
