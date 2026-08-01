/* ================================================================
   API: O LOG

   O que responde "quebrou na casa de quem". Antes disto, o erro de um
   corretor ia para o console do servidor — um fluxo único, sem dono,
   que ninguém lê — e quem descobria era ele.

   Filtro por nível e por corretor porque a pergunta muda: "o que
   quebrou hoje no sistema" (nível erro, todo mundo) e "o que aconteceu
   com este aqui" (um corretor, todos os níveis) são as duas telas, e
   uma lista sem filtro não serve nem para uma nem para outra.
   ================================================================ */
import { alvoValido, erro, exigirAdmin } from "../_comum";

/** Teto de linhas por pedido. Existe para uma tela mal usada (ou um
    filtro largo demais) não puxar a tabela inteira. */
const LIMITE_MAX = 300;
const LIMITE_PADRAO = 100;

const NIVEIS = ["erro", "aviso", "info"];

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb } = guarda;

  const url = new URL(request.url);
  const nivel = url.searchParams.get("nivel") || "";
  const alvo = alvoValido(url.searchParams.get("userId"));
  const pedido = Number(url.searchParams.get("limite"));
  const limite = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_MAX) : LIMITE_PADRAO;

  let consulta = sb
    .from("log_eventos")
    .select("id, user_id, categoria, nivel, evento, detalhe, criado_em")
    .order("criado_em", { ascending: false })
    .limit(limite);

  if (NIVEIS.includes(nivel)) consulta = consulta.eq("nivel", nivel);
  if (alvo) consulta = consulta.eq("user_id", alvo);

  const { data, error } = await consulta;
  if (error) {
    console.error("Admin: falha ao ler o log:", error.message);
    return erro("falha", 500);
  }

  const eventos = (data || []).map((r) => ({
    id: Number(r.id),
    userId: (r.user_id as string | null) ?? null,
    categoria: r.categoria as string,
    nivel: r.nivel as string,
    evento: r.evento as string,
    detalhe: (r.detalhe as string | null) ?? null,
    criadoEm: r.criado_em as string,
  }));

  return Response.json({ ok: true, eventos, limite });
}
