import { createClient } from "@supabase/supabase-js";
import { registrarEvento } from "@/lib/servidor/registro";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fechamento acessório de uma verificação já persistida pelo cliente. */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!url || !key || !token) return Response.json({ ok: false }, { status: 401 });

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario, error: erroUsuario } = await supabase.auth.getUser();
  if (erroUsuario || !usuario.user) return Response.json({ ok: false }, { status: 401 });

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
    .eq("user_id", usuario.user.id)
    .maybeSingle();
  if (erroBusca || !busca) return Response.json({ ok: false }, { status: 403 });

  try {
    const portal = (busca.filtros as { portal?: unknown } | null)?.portal;
    registrarEvento({
      userId: usuario.user.id,
      categoria: "radar",
      nivel: "info",
      evento: "radar-verificacao-fechada",
      detalhe: JSON.stringify({
        execucao_id: execucaoId,
        busca_id: buscaId,
        portal: typeof portal === "string" && ["olx", "chaves-na-mao", "wimoveis", "viva-real"].includes(portal)
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
