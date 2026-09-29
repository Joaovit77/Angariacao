/* ================================================================
   CONEXÃO DO WHATSAPP (lado do browser)
   Chama /api/whatsapp/conexao, que é quem fala com a Evolution — o
   token da instância nunca chega aqui. Fora de mutacoes.ts pelo mesmo
   motivo de `envioWhatsapp.ts`: não é escrita no Supabase.
   Nunca lança: em qualquer falha devolve o estado "falha", que a UI
   sabe exibir.
   ================================================================ */
import type { Conexao } from "./calculo/conexaoWhatsapp";
import { fetchAutenticado } from "./auth/recuperacaoSessao";

export async function consultarConexao(): Promise<Conexao> {
  try {
    const r = await fetchAutenticado("/api/whatsapp/conexao", {
      // A tela pergunta em laço: um cache aqui a faria repetir a mesma
      // resposta enquanto o corretor escaneia o QR.
      cache: "no-store",
    }, { repetivel: true });
    if (!r) return { estado: "falha" };
    const dados = (await r.json().catch(() => null)) as Conexao | null;
    return dados ?? { estado: "falha" };
  } catch {
    return { estado: "falha" };
  }
}
