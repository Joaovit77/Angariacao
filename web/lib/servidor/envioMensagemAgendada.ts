import { numeroEvolution } from "@/lib/calculo/whatsapp";

export interface ConfigEnvioAgendado { serverUrl: string; instancia: string; token: string }

export async function enviarMensagemAgendada(
  telefone: string,
  mensagem: string,
  config: ConfigEnvioAgendado,
): Promise<void> {
  const numero = numeroEvolution(telefone);
  if (!numero) throw new Error("numero-invalido");
  const resposta = await fetch(
    `${config.serverUrl.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(config.instancia)}`,
    { method: "POST", headers: { "Content-Type": "application/json", apikey: config.token },
      body: JSON.stringify({ number: numero, text: mensagem }), signal: AbortSignal.timeout(20000) },
  );
  if (!resposta.ok) throw new Error(`evolution-http-${resposta.status}`);
}
