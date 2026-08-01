/* ================================================================
   API: SOU ADMIN?
   A pergunta que a UI faz no boot para decidir se mostra o menu.

   Responde `{ admin: false }` em vez de 403 quando não é — e a
   diferença importa em dois pontos:

   1. O boot do painel não pode quebrar por causa disto. É a mesma
      escolha do `GET /api/ia`, que devolve `permitido: false` sem
      sessão em vez de recusar.
   2. Um 403 aqui seria um oráculo: "este endereço existe e você quase
      chegou". Um `false` não diz nada a quem estiver tentando.

   Esconder o menu é conveniência. A trava está em `exigirAdmin`, que
   toda rota de admin chama por conta própria.
   ================================================================ */
import { ambiente, servico } from "../_comum";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request): Promise<Response> {
  const env = ambiente();
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!env || !accessToken) return Response.json({ admin: false });

  const comoUsuario = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error } = await comoUsuario.auth.getUser();
  if (error || !sessao.user) return Response.json({ admin: false });

  const { data, error: erroAdmin } = await servico(env)
    .from("admins")
    .select("user_id")
    .eq("user_id", sessao.user.id)
    .maybeSingle();
  if (erroAdmin) {
    console.error("Admin: falha ao conferir o cargo:", erroAdmin.message);
    return Response.json({ admin: false });
  }

  return Response.json({ admin: !!data });
}
