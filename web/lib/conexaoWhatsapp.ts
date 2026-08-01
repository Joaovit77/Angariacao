/* ================================================================
   CONEXÃO DO WHATSAPP (lado do browser)
   Chama /api/whatsapp/conexao, que é quem fala com a Evolution — o
   token da instância nunca chega aqui. Fora de mutacoes.ts pelo mesmo
   motivo de `envioWhatsapp.ts`: não é escrita no Supabase.
   Nunca lança: em qualquer falha devolve o estado "falha", que a UI
   sabe exibir.
   ================================================================ */
import type { Conexao } from "./calculo/conexaoWhatsapp";
import { getSupabase } from "./persistencia/supabase";

export async function consultarConexao(): Promise<Conexao> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) return { estado: "falha" };

  try {
    const r = await fetch("/api/whatsapp/conexao", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      // A tela pergunta em laço: um cache aqui a faria repetir a mesma
      // resposta enquanto o corretor escaneia o QR.
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => null)) as Conexao | null;
    return dados ?? { estado: "falha" };
  } catch {
    return { estado: "falha" };
  }
}
