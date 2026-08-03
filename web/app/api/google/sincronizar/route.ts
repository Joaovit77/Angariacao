/* ================================================================
   API: LEVA UM COMPROMISSO PARA O GOOGLE AGENDA

   POST { agendaId, acao?: "remover" } + Bearer do Supabase.

   Esta rota é a porta do BROWSER para o espelhamento. O trabalho em si
   mora em `../_espelho.ts`, porque ele ganhou um segundo chamador que
   não passa por aqui: o webhook do WhatsApp, que cria compromisso sem
   nenhuma sessão de usuário envolvida. O que sobra na rota é o que só
   ela tem — autenticar quem chamou e traduzir a falha em status HTTP.

   A leitura usa o token de QUEM CHAMOU (não a service role): o RLS
   escopa ao dono, então pedir o compromisso de outra pessoa volta
   vazio. A service role aparece só onde não há alternativa — ler o
   refresh token, que é o que `contaDoUsuario` faz.

   REMOÇÃO ACONTECE ANTES da exclusão local, com a linha ainda no
   banco: é assim que o `google_event_id` continua saindo do banco em
   vez de vir do browser. Invertida a ordem, o cliente teria que mandar
   o id do evento, e aí ele poderia pedir a exclusão de qualquer evento
   da agenda da pessoa.
   ================================================================ */
import { createClient } from "@supabase/supabase-js";
import { mensagemFalhaGoogle, type FalhaGoogle } from "@/lib/calculo/googleAgenda";
import { espelharCompromisso } from "../_espelho";
import { ambiente, usuarioDaRequisicao } from "../_comum";

function erro(falha: FalhaGoogle, status: number): Response {
  return Response.json({ ok: false, falha, mensagem: mensagemFalhaGoogle(falha) }, { status });
}

/** O status HTTP de cada falha. Fica aqui, e não no `_espelho`, porque o
    webhook não tem o que fazer com número de status — ele só loga. */
function statusDaFalha(falha: FalhaGoogle): number {
  if (falha === "sem-conexao-google" || falha === "autorizacao-expirada") return 422;
  if (falha === "compromisso-nao-encontrado") return 404;
  return 502;
}

export async function POST(request: Request): Promise<Response> {
  const env = ambiente();
  if (!env) return erro("nao-configurado", 500);

  const usuario = await usuarioDaRequisicao(request, env);
  if (!usuario) return erro("sessao-expirada", 401);

  let corpo: { agendaId?: unknown; acao?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("compromisso-nao-encontrado", 400);
  }
  const agendaId = typeof corpo.agendaId === "string" ? corpo.agendaId : "";
  const remover = corpo.acao === "remover";
  if (!agendaId) return erro("compromisso-nao-encontrado", 400);

  // Cliente do usuário: o RLS faz o escopo. O compromisso de outro dono
  // simplesmente não aparece.
  const auth = request.headers.get("authorization") || "";
  const doUsuario = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const r = await espelharCompromisso(env, doUsuario, usuario.id, agendaId, { remover });
  if (!r.ok) return erro(r.falha, statusDaFalha(r.falha));
  return Response.json({ ok: true, eventoId: r.eventoId });
}
