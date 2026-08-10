import { executarMonitorRadar } from "@/lib/servidor/monitorRadarAngariacao";

export const runtime = "nodejs";
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  return !!segredo && request.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[radar-cron] CRON_SECRET não configurado");
    return Response.json({ ok: false, erro: "Monitor automático não configurado." }, { status: 503 });
  }
  if (!autorizado(request)) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const resumo = await executarMonitorRadar();
    console.info("[radar-cron] rodada concluída", resumo);
    return Response.json({ ok: true, ...resumo });
  } catch (erro) {
    console.error("[radar-cron] rodada interrompida", erro);
    return Response.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "Falha desconhecida." },
      { status: 500 },
    );
  }
}
