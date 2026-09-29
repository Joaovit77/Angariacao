import { ehPortalAtivo } from "@/lib/calculo/centralAngariacao";
import { autenticarRequisicao } from "@/lib/servidor/autenticacao";
import { registrarEvento } from "@/lib/servidor/registro";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fechamento acessório de uma verificação já persistida pelo cliente. */
export async function POST(request: Request) {
  const auth = await autenticarRequisicao(request, "central-angariacao/telemetria-radar");
  if (!auth.ok) return Response.json({ ok: false, erro: auth.erro }, { status: auth.status });
  const { supabase, userId } = auth;

  const corpo = await request.json().catch(() => null) as Record<string, unknown> | null;
  const execucaoId = corpo?.execucaoId;
  const buscaId = corpo?.buscaId;
  const novos = corpo?.novos;
  if (typeof execucaoId !== "string" || !UUID.test(execucaoId)
    || typeof buscaId !== "string" || !UUID.test(buscaId)
    || typeof novos !== "number" || !Number.isInteger(novos) || novos < 0 || novos > 50) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const { data: busca, error: erroBusca } = await supabase.from("radar_buscas")
    .select("id,filtros")
    .eq("id", buscaId)
    .eq("user_id", userId)
    .maybeSingle();
  if (erroBusca || !busca) return Response.json({ ok: false }, { status: 403 });

  try {
    const portal = (busca.filtros as { portal?: unknown } | null)?.portal;
    registrarEvento({
      userId,
      categoria: "radar",
      nivel: "info",
      evento: "radar-verificacao-fechada",
      detalhe: JSON.stringify({
        execucao_id: execucaoId,
        busca_id: buscaId,
        // Telemetria de COLETA: portal inativo ainda não executa, então segue "desconhecido".
        portal: ehPortalAtivo(portal)
          ? portal : "desconhecido",
        novos,
        origem_contagem: "cliente_autenticado_apos_upsert",
      }),
    });
  } catch {
    // O registro nunca altera a verificação já concluída.
  }
  return Response.json({ ok: true });
}
