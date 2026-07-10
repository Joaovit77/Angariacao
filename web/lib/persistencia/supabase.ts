/* ================================================================
   CLIENTE SUPABASE (singleton do browser)
   Equivalente ao supabase-config.js do app original. A anon key é
   pública por design — o isolamento por usuário é garantido pelas
   políticas RLS do schema (supabase-schema.sql na raiz), nunca por
   lógica no app. Nenhum outro segredo pode entrar no cliente.
   ================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error(
        "Configuração do Supabase ausente: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (ver web/.env.example).",
      );
    }
    client = createClient(url, anonKey);
  }
  return client;
}
