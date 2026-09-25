import { executarMonitorRadar } from "@/lib/servidor/monitorRadarAngariacao";
import { registrarEvento } from "@/lib/servidor/registro";
import { sanitizarErroExterno } from "@/lib/servidor/erroExterno";
import { novoIdExecucao } from "@/lib/servidor/observabilidadeRadar";

export const runtime = "nodejs";
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  return !!segredo && request.headers.get("authorization") === `Bearer ${segredo}`;
}

function registrarRodada(detalhe: Record<string, unknown>): void {
  try {
    registrarEvento({
      userId: null,
      categoria: "radar",
      nivel: "info",
      evento: "radar-rodada",
      detalhe: JSON.stringify(detalhe),
    });
  } catch (erro) {
    console.error(
      "[radar-cron] falha ao agendar registro da rodada (ignorada)",
      sanitizarErroExterno(erro, "registrar"),
    );
  }
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[radar-cron] CRON_SECRET não configurado");
    return Response.json({ ok: false, erro: "Monitor automático não configurado." }, { status: 503 });
  }
  if (!autorizado(request)) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }

  const inicio = performance.now();
  const rodadaId = novoIdExecucao();
  registrarRodada({ etapa: "inicio", rodada_id: rodadaId });
  try {
    const resumo = await executarMonitorRadar(rodadaId);
    registrarRodada({
      etapa: "fim",
      rodada_id: rodadaId,
      candidatas: resumo.candidatas,
      elegiveis: resumo.elegiveis,
      verificadas: resumo.verificadas,
      falhas: resumo.falhas,
      duracao_ms: Math.round(performance.now() - inicio),
    });
    console.info("[radar-cron] rodada concluída", resumo);
    return Response.json({ ok: true, ...resumo });
  } catch (erro) {
    registrarRodada({
      etapa: "fim",
      rodada_id: rodadaId,
      candidatas: 0,
      elegiveis: 0,
      verificadas: 0,
      falhas: 1,
      duracao_ms: Math.round(performance.now() - inicio),
      status: "interrompida",
    });
    console.error("[radar-cron] rodada interrompida", erro);
    return Response.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "Falha desconhecida." },
      { status: 500 },
    );
  }
}
