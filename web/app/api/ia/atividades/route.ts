import { createClient } from "@supabase/supabase-js";
import { criarAtividadesIa, type LinhaUsoIa } from "@/lib/calculo/atividadeIa";
import { clienteDoChamador, tokenDaRequisicao } from "@/lib/servidor/iaAcesso";

export const runtime = "nodejs";

function falha(mensagem: string, status: number): Response {
  return Response.json({ ok: false, atividades: [], mensagem }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRole) {
    console.error("Histórico da IA: variáveis do Supabase ausentes (ver DEPLOY.md).");
    return falha("O histórico da IA não está configurado neste ambiente.", 503);
  }

  const token = tokenDaRequisicao(request);
  if (!token) return falha("Sua sessão expirou. Entre novamente.", 401);

  // A identidade vem sempre do token do Supabase, nunca da URL ou do browser.
  const comoUsuario = clienteDoChamador(supabaseUrl, anonKey, token);
  const { data: auth, error: erroAuth } = await comoUsuario.auth.getUser();
  if (erroAuth || !auth.user) return falha("Sua sessão expirou. Entre novamente.", 401);

  // `ia_uso` não é exposta ao browser: contém modelo e tokens contábeis.
  // A service role lê somente três campos e filtra explicitamente pelo dono.
  const servico = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await servico
    .from("ia_uso")
    .select("id,tipo,criado_em")
    .eq("user_id", auth.user.id)
    .order("criado_em", { ascending: false })
    .limit(80);

  if (error) {
    console.error("Histórico da IA: falha ao consultar atividades:", error.message);
    return falha("Não foi possível carregar o histórico da IA.", 500);
  }

  return Response.json(
    { ok: true, atividades: criarAtividadesIa((data || []) as LinhaUsoIa[]) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
