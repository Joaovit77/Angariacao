/* ================================================================
   API: ESTADO DA CONEXÃO COM O GOOGLE (e como desfazê-la)

   GET    -> { ok, conectado, email }
   DELETE -> desconecta

   O `email` é rótulo, e é o que faz a tela dizer "conectado como
   fulano@gmail.com". Sem isso, quem tem conta pessoal e conta de
   trabalho não descobre em qual das duas os compromissos estão caindo
   — só percebe quando procura a visita no celular e ela não está lá.

   O refresh token NUNCA sai daqui. Esta rota devolve um booleano e um
   e-mail; a credencial fica no servidor, que é o motivo de a tabela
   `google_contas` não ter política de leitura nenhuma.
   ================================================================ */
import { GOOGLE_TOKEN_URL, mensagemFalhaGoogle, type FalhaGoogle } from "@/lib/calculo/googleAgenda";
import { admin, ambiente, contaDoUsuario, usuarioDaRequisicao } from "../_comum";

function erro(falha: FalhaGoogle, status: number): Response {
  return Response.json({ ok: false, falha, mensagem: mensagemFalhaGoogle(falha) }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const env = ambiente();
  // Sem configuração no servidor a resposta é "não conectado", e não um erro:
  // a tela só precisa saber se pode oferecer o botão.
  if (!env) return Response.json({ ok: true, conectado: false, configurado: false });

  const usuario = await usuarioDaRequisicao(request, env);
  if (!usuario) return erro("sessao-expirada", 401);

  const { data } = await admin(env)
    .from("google_contas")
    .select("email")
    .eq("user_id", usuario.id)
    .maybeSingle();

  return Response.json({
    ok: true,
    configurado: true,
    conectado: !!data,
    email: (data?.email as string | null) || null,
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const env = ambiente();
  if (!env) return erro("nao-configurado", 500);

  const usuario = await usuarioDaRequisicao(request, env);
  if (!usuario) return erro("sessao-expirada", 401);

  // Revoga do lado do Google ANTES de esquecer o token — depois de apagar a
  // linha não haveria mais o que revogar, e a autorização continuaria de pé
  // na conta da pessoa, listada em "apps com acesso" para sempre.
  // Falhar aqui não impede a desconexão local: o que o corretor pediu foi
  // parar de sincronizar.
  const conta = await contaDoUsuario(env, usuario.id);
  if (conta) {
    try {
      await fetch(`${GOOGLE_TOKEN_URL.replace("/token", "/revoke")}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: conta.refreshToken }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      /* segue e apaga localmente */
    }
  }

  const { error } = await admin(env).from("google_contas").delete().eq("user_id", usuario.id);
  if (error) {
    console.error("Google Agenda: falha ao desconectar:", error.message);
    return erro("falha-google", 500);
  }

  // Os ponteiros para eventos que não são mais nossos. Sem isto, reconectar
  // faria o painel tentar ATUALIZAR eventos de uma autorização morta — que
  // no melhor caso dá 404, e no pior mexe num evento que não é mais dele.
  await admin(env).from("agenda").update({ google_event_id: null }).eq("user_id", usuario.id);

  return Response.json({ ok: true });
}
