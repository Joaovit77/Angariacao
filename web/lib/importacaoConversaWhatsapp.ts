/* Cliente da importação de conversa. O token da Evolution nunca cruza esta
   fronteira; o browser envia apenas o imóvel e, após a prévia, os ids que o
   corretor marcou. */
import type { MensagemRecenteWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";
import { getSupabase } from "@/lib/persistencia/supabase";
import type { NotaImovel } from "@/lib/tipos";

export interface ResultadoImportacaoConversa {
  ok: boolean;
  mensagem?: string;
  mensagens?: MensagemRecenteWhatsapp[];
  importadas?: NotaImovel[];
  ignoradas?: number;
}

async function chamar(corpo: unknown): Promise<ResultadoImportacaoConversa> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };

  try {
    const resposta = await fetch("/api/whatsapp/importar-conversa", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(corpo),
    });
    const dados = (await resposta.json().catch(() => null)) as ResultadoImportacaoConversa | null;
    return dados || { ok: false, mensagem: "O servidor não devolveu uma resposta válida." };
  } catch {
    return { ok: false, mensagem: "Não foi possível consultar o WhatsApp. Verifique sua conexão." };
  }
}

export function preverImportacaoConversa(imovelId: string): Promise<ResultadoImportacaoConversa> {
  return chamar({ acao: "prever", imovelId });
}

export function importarConversaSelecionada(
  imovelId: string,
  mensagemIds: string[],
): Promise<ResultadoImportacaoConversa> {
  return chamar({ acao: "importar", imovelId, mensagemIds });
}
