import { numeroEvolution } from "@/lib/calculo/whatsapp";
import { idMensagemEvolution } from "@/lib/servidor/historicoWhatsapp";

export interface ConfigEnvioAgendado { serverUrl: string; instancia: string; token: string }

export async function enviarMensagemAgendada(
  telefone: string,
  mensagem: string,
  config: ConfigEnvioAgendado,
): Promise<{ mensagemId: string }> {
  const numero = numeroEvolution(telefone);
  if (!numero) throw new Error("numero-invalido");
  const resposta = await fetch(
    `${config.serverUrl.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(config.instancia)}`,
    { method: "POST", headers: { "Content-Type": "application/json", apikey: config.token },
      body: JSON.stringify({ number: numero, text: mensagem }), signal: AbortSignal.timeout(20000) },
  );
  if (!resposta.ok) throw new Error(`evolution-http-${resposta.status}`);
  const corpo = await resposta.json().catch(() => null);
  return { mensagemId: idMensagemEvolution(corpo) || `agendamento:${crypto.randomUUID()}` };
}
