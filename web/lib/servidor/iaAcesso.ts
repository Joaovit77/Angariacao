import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function clienteDoChamador(supabaseUrl: string, anonKey: string, accessToken: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function tokenDaRequisicao(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

export async function podeUsarIa(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("ia_permissoes")
    .select("liberado")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("IA: falha ao ler a permissao:", error.message);
    return false;
  }
  return data?.liberado === true;
}
