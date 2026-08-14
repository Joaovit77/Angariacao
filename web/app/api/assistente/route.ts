import { NextResponse } from "next/server";
import { clienteDoChamador, podeUsarIa, tokenDaRequisicao } from "@/lib/servidor/iaAcesso";
import { normalizarPedidoAssistente, responderComAssistente } from "@/lib/servidor/assistente/orquestrador";
import type { RespostaAssistente } from "@/lib/assistente/tipos";

export const runtime = "nodejs";

function falha(erro: string, status: number, codigo: string) {
  return NextResponse.json<RespostaAssistente>({ ok: false, erro, codigo }, { status });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !process.env.OPENAI_API_KEY) return falha("Assistente indisponivel neste ambiente.", 503, "indisponivel");
  const token = tokenDaRequisicao(request);
  if (!token) return falha("Sessao nao encontrada.", 401, "nao_autenticado");
  const supabase = clienteDoChamador(supabaseUrl, anonKey, token);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return falha("Sessao invalida ou expirada.", 401, "nao_autenticado");
  if (!(await podeUsarIa(supabase, auth.user.id))) return falha("Sua conta nao tem acesso ao assistente.", 403, "sem_permissao");
  let corpo: unknown;
  try { corpo = await request.json(); } catch { return falha("Requisicao invalida.", 400, "pedido_invalido"); }
  const pedido = normalizarPedidoAssistente(corpo);
  if (!pedido) return falha("Escreva uma pergunta valida.", 400, "pedido_invalido");
  try {
    const resposta = await responderComAssistente(pedido, supabase, auth.user.id);
    return NextResponse.json<RespostaAssistente>({ ok: true, ...resposta });
  } catch (error) {
    console.error("Assistente: falha ao responder:", error);
    return falha("Nao foi possivel consultar o assistente agora.", 502, "falha_ia");
  }
}
