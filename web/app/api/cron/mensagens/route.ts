import { createClient } from "@supabase/supabase-js";
import type { DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import { enviarMensagemAgendada } from "@/lib/servidor/envioMensagemAgendada";
import { agoraISOString } from "@/lib/datas";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return Response.json({ ok: false, erro: "Cron não configurado." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${segredo}`)
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  if (!url || !serviceRole || !serverUrl)
    return Response.json({ ok: false, erro: "Envio não configurado." }, { status: 503 });

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("claim_mensagens_agendadas", { p_limite: 20 });
  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });
  let enviadas = 0, falhas = 0;
  for (const item of (data || []) as DbMensagemAgendada[]) {
    const { data: instancia } = await admin.from("whatsapp_instancias").select("instancia, token")
      .eq("user_id", item.user_id).maybeSingle();
    try {
      if (!instancia?.instancia || !instancia?.token) throw new Error("sem-instancia");
      await enviarMensagemAgendada(item.telefone, item.mensagem,
        { serverUrl, instancia: instancia.instancia as string, token: instancia.token as string });
      const agora = agoraISOString();
      await admin.from("mensagens_agendadas").update({ status: "enviada", enviado_em: agora, updated_at: agora, erro: null }).eq("id", item.id).eq("status", "processando");
      enviadas++;
    } catch (e) {
      const motivo = e instanceof Error ? e.message.slice(0, 300) : "falha-desconhecida";
      await admin.from("mensagens_agendadas").update({ status: "erro", erro: motivo, updated_at: agoraISOString() }).eq("id", item.id).eq("status", "processando");
      falhas++;
    }
  }
  return Response.json({ ok: true, processadas: (data || []).length, enviadas, falhas });
}
