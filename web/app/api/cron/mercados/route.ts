import { executarColetaMercados } from "@/lib/servidor/coletaMercadosMonitorados";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return Response.json({ ok: false, erro: "Coleta automática não configurada." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...await executarColetaMercados() });
  } catch {
    console.error("[mercados-cron] rodada interrompida", { codigo: "falha_infraestrutura" });
    return Response.json({ ok: false, erro: "Coleta de mercados indisponível." }, { status: 503 });
  }
}
