import { createClient } from "@supabase/supabase-js";
import { retomadaB4Habilitada } from "@/lib/retomadaConfig";
import { carregarContextoRetomada, salvarRetomada } from "@/lib/servidor/retomada";
import type { ErroRetomada } from "@/lib/calculo/retomada";

const erro = (codigo: ErroRetomada, status = 409) => Response.json({ ok: false, erro: codigo }, { status });
const uuid = (valor: unknown): valor is string => typeof valor === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
function habilitada() {
  // B4 é exclusivamente local: também evita escrita acidental no banco de Production.
  return retomadaB4Habilitada() && /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
}
async function autenticar(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!auth.startsWith("Bearer ") || !url || !key) return null;
  const db = createClient(url, key, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser();
  return !error && data.user ? { db, userId: data.user.id } : null;
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("capacidade") === "1") return Response.json({ habilitada: habilitada() });
  if (!habilitada()) return erro("feature-desabilitada", 403);
  try {
    const sessao = await autenticar(request);
    if (!sessao) return erro("sessao-invalida", 401);
    const imovelId = url.searchParams.get("retomadaImovelId");
    const id = url.searchParams.get("id");
    if (!uuid(imovelId) || (id !== null && !uuid(id))) return erro("estado-incompativel", 400);
    const resultado = await carregarContextoRetomada(sessao.db, sessao.userId, imovelId, id ?? undefined);
    return resultado.ok ? Response.json(resultado) : erro(resultado.erro);
  } catch { return erro("falha-operacao", 500); }
}
export async function POST(request: Request) {
  if (!habilitada()) return erro("feature-desabilitada", 403);
  try {
    const sessao = await autenticar(request);
    if (!sessao) return erro("sessao-invalida", 401);
    const b: unknown = await request.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) return erro("estado-incompativel", 400);
    const c = b as Record<string, unknown>;
    const permitidos = ["retomadaImovelId", "id", "versao", "data", "hora", "texto", "acao"];
    if (Object.keys(c).some((chave) => !permitidos.includes(chave)) || !uuid(c.retomadaImovelId)
      || (c.id !== undefined && !uuid(c.id)) || (c.id !== undefined && typeof c.versao !== "string")
      || typeof c.data !== "string" || typeof c.hora !== "string" || typeof c.texto !== "string"
      || (c.acao !== "salvar" && c.acao !== "cancelar")) return erro("estado-incompativel", 400);
    const resultado = await salvarRetomada(sessao.db, sessao.userId, {
      retomadaImovelId: c.retomadaImovelId, id: typeof c.id === "string" ? c.id : undefined,
      versao: typeof c.versao === "string" ? c.versao : undefined,
      data: c.data, hora: c.hora, texto: c.texto, acao: c.acao,
    });
    return resultado.ok ? Response.json(resultado) : erro(resultado.erro);
  } catch { return erro("falha-operacao", 500); }
}
