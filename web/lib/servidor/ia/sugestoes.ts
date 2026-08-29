import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrigemSugestaoIa } from "@/lib/ia/feedback";
import { feedbackSugestoesIaHabilitado } from "@/lib/servidor/ia/feedback-config";

export type TipoSugestaoIa = "prospeccao" | "resposta" | "outro";

interface NovaSugestaoIa {
  supabase: SupabaseClient;
  userId: string;
  imovelId?: string | null;
  tipo: TipoSugestaoIa;
  textoSugerido: string;
  contexto?: Record<string, unknown>;
  origem: OrigemSugestaoIa;
  modelo?: string | null;
}

/**
 * Quando a coleta está ativa, persiste a sugestão antes de expô-la à UI. A
 * guarda local evita tocar na tabela mesmo se um chamador esquecer de testar
 * a flag; desativada, a função encerra antes de montar qualquer query.
 */
export async function registrarSugestaoIa({
  supabase,
  userId,
  imovelId = null,
  tipo,
  textoSugerido,
  contexto = {},
  origem,
  modelo = null,
}: NovaSugestaoIa): Promise<string | null> {
  if (!feedbackSugestoesIaHabilitado()) return null;

  const { data, error } = await supabase
    .from("ia_sugestoes")
    .insert({
      user_id: userId,
      imovel_id: imovelId,
      tipo,
      texto_sugerido: textoSugerido.trim(),
      contexto,
      origem,
      modelo,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("IA: falha ao registrar a sugestão:", error?.message || "id ausente");
    return null;
  }
  return String(data.id);
}
