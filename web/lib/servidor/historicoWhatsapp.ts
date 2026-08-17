import type { SupabaseClient } from "@supabase/supabase-js";
import { notaDaMensagemEnviada, type OrigemMensagemEnviada } from "@/lib/calculo/notas";

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

/** A Evolution 2.x devolve o id em `key.id`. As alternativas mantêm
    compatibilidade com envelopes usados por versões anteriores/proxies. */
export function idMensagemEvolution(corpo: unknown): string | null {
  const raiz = objeto(corpo);
  const candidatos = [
    objeto(raiz.key).id,
    objeto(objeto(raiz.data).key).id,
    raiz.messageId,
    raiz.id,
  ];
  for (const candidato of candidatos) {
    if (typeof candidato === "string" && candidato.trim()) return candidato.trim();
  }
  return null;
}

export interface RegistroMensagemEnviada {
  imovelId: string;
  userId: string;
  mensagemId: string;
  texto: string;
  data: string;
  origem: OrigemMensagemEnviada;
  tipo?: string;
}

/** Persiste por RPC em vez de regravar o array JSONB inteiro. A função do
    banco filtra imóvel + usuário e recusa um id já existente na mesma
    instrução, protegendo RLS/isolamento e reentregas concorrentes. */
export async function registrarMensagemEnviada(
  supabase: SupabaseClient,
  registro: RegistroMensagemEnviada,
): Promise<{ gravou: boolean; erro: string | null }> {
  const { data, error } = await supabase.rpc("registrar_nota_imovel", {
    p_imovel_id: registro.imovelId,
    p_user_id: registro.userId,
    p_nota: notaDaMensagemEnviada(
      registro.mensagemId,
      registro.texto,
      registro.data,
      registro.origem,
      registro.tipo,
    ),
  });
  return { gravou: data === true, erro: error?.message || null };
}
