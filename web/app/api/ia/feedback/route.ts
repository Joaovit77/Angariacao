import { createClient } from "@supabase/supabase-js";
import { agoraISOString } from "@/lib/datas";
import {
  ehMotivoRejeicaoSugestaoIa,
  ehResultadoFeedbackSugestaoIa,
  textoFinalDiferenteDaSugestao,
  type MotivoRejeicaoSugestaoIa,
  type ResultadoFeedbackSugestaoIa,
} from "@/lib/ia/feedback";
import { feedbackSugestoesIaHabilitado } from "@/lib/servidor/ia/feedback-config";

const MAX_COMENTARIO = 500;
const MAX_TEXTO_FINAL = 4_000;

function tokenDaRequisicao(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

function respostaErro(mensagem: string, status: number): Response {
  return Response.json({ ok: false, mensagem }, { status });
}

interface CorpoFeedback {
  sugestaoId: string;
  resultado: ResultadoFeedbackSugestaoIa;
  motivo: MotivoRejeicaoSugestaoIa | null;
  comentario: string | null;
  textoFinal: string | null;
}

function validarCorpo(valor: unknown): CorpoFeedback | null {
  if (!valor || typeof valor !== "object") return null;
  const bruto = valor as Record<string, unknown>;
  const sugestaoId = typeof bruto.sugestaoId === "string" ? bruto.sugestaoId.trim() : "";
  if (!sugestaoId || !ehResultadoFeedbackSugestaoIa(bruto.resultado)) return null;

  const resultado = bruto.resultado;
  const motivo = bruto.motivo == null ? null : ehMotivoRejeicaoSugestaoIa(bruto.motivo) ? bruto.motivo : undefined;
  if (motivo === undefined) return null;
  const comentario = typeof bruto.comentario === "string" ? bruto.comentario.trim() || null : bruto.comentario == null ? null : undefined;
  const textoFinal = typeof bruto.textoFinal === "string" ? bruto.textoFinal.trim() || null : bruto.textoFinal == null ? null : undefined;
  if (comentario === undefined || textoFinal === undefined) return null;
  if ((comentario?.length || 0) > MAX_COMENTARIO || (textoFinal?.length || 0) > MAX_TEXTO_FINAL) return null;
  if (resultado === "editado" && !textoFinal) return null;
  if (resultado !== "editado" && textoFinal) return null;
  if (resultado !== "rejeitado" && (motivo || comentario)) return null;

  return { sugestaoId, resultado, motivo, comentario, textoFinal };
}

export async function POST(request: Request): Promise<Response> {
  if (!feedbackSugestoesIaHabilitado()) {
    return respostaErro("Feedback de sugestões indisponível.", 404);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = tokenDaRequisicao(request);
  if (!supabaseUrl || !anonKey) return respostaErro("Feedback indisponível neste ambiente.", 503);
  if (!accessToken) return respostaErro("Sua sessão expirou.", 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || !sessao.user) return respostaErro("Sua sessão expirou.", 401);

  let corpo: CorpoFeedback | null;
  try {
    corpo = validarCorpo(await request.json());
  } catch {
    corpo = null;
  }
  if (!corpo) return respostaErro("Feedback inválido.", 400);

  // A RLS torna uma sugestão de outra conta indistinguível de uma inexistente.
  const { data: sugestao, error: erroSugestao } = await supabase
    .from("ia_sugestoes")
    .select("id, texto_sugerido")
    .eq("id", corpo.sugestaoId)
    .maybeSingle();
  if (erroSugestao) return respostaErro("Não foi possível consultar a sugestão.", 500);
  if (!sugestao) return respostaErro("Sugestão não encontrada.", 404);
  if (
    corpo.resultado === "editado" &&
    !textoFinalDiferenteDaSugestao(String(sugestao.texto_sugerido || ""), corpo.textoFinal || "")
  ) {
    return respostaErro("O texto final precisa ser diferente da sugestão original.", 422);
  }

  const agora = agoraISOString();
  const { data: feedback, error: erroFeedback } = await supabase
    .from("ia_feedbacks")
    .upsert(
      {
        sugestao_id: corpo.sugestaoId,
        user_id: sessao.user.id,
        resultado: corpo.resultado,
        motivo: corpo.resultado === "rejeitado" ? corpo.motivo : null,
        comentario: corpo.resultado === "rejeitado" ? corpo.comentario : null,
        texto_final: corpo.resultado === "editado" ? corpo.textoFinal : null,
        updated_at: agora,
      },
      { onConflict: "sugestao_id" },
    )
    .select("resultado")
    .single();
  if (erroFeedback || !feedback) return respostaErro("Não foi possível salvar o feedback. Tente novamente.", 500);

  return Response.json({ ok: true, resultado: feedback.resultado });
}
