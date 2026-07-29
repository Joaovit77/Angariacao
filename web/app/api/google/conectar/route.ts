/* ================================================================
   API: INÍCIO DA CONEXÃO COM O GOOGLE AGENDA

   POST (com Bearer do Supabase) -> { ok: true, url } e o browser navega
   para lá. A URL é montada AQUI, e não no cliente, por dois motivos:
   o `client_id` e o `redirect_uri` ficam do lado do servidor, e o
   `state` precisa ser assinado com um segredo que o browser não tem.

   Por que POST e não GET: a rota depende do header Authorization, e
   um GET com efeito de identidade convida a ser aberto direto na barra
   de endereços — onde não há header nenhum e o erro fica obscuro.
   ================================================================ */
import { CAMINHO_CALLBACK, mensagemFalhaGoogle, urlDeAutorizacao, type FalhaGoogle } from "@/lib/calculo/googleAgenda";
import { ambiente, criarState, origemPublica, usuarioDaRequisicao } from "../_comum";

function erro(falha: FalhaGoogle, status: number): Response {
  return Response.json({ ok: false, falha, mensagem: mensagemFalhaGoogle(falha) }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const env = ambiente();
  if (!env) {
    console.error("Google Agenda: variáveis de ambiente ausentes (ver web/.env.example).");
    return erro("nao-configurado", 500);
  }

  const usuario = await usuarioDaRequisicao(request, env);
  if (!usuario) return erro("sessao-expirada", 401);

  const redirectUri = `${origemPublica(request)}${CAMINHO_CALLBACK}`;
  const state = criarState(usuario.id, env.clientSecret);
  return Response.json({ ok: true, url: urlDeAutorizacao(env.clientId, redirectUri, state) });
}
