/* ================================================================
   API: VOLTA DA AUTORIZAÇÃO DO GOOGLE

   Quem chama esta rota é o NAVEGADOR, redirecionado pelo Google — não
   o nosso código. Ela chega sem sessão do Supabase (ver a explicação do
   `state` em ../_comum.ts) e sem header nenhum: tudo que ela tem é o
   `code` e o `state`.

   Por isso ela responde com REDIRECT, nunca com JSON: o que está na
   frente do usuário é uma aba de navegação, e um `{"ok":true}` cru na
   tela seria o fim do fluxo. Volta para /agenda com o resultado na
   query, e a tela traduz.
   ================================================================ */
import { CAMINHO_CALLBACK, GOOGLE_TOKEN_URL } from "@/lib/calculo/googleAgenda";
import { admin, ambiente, lerState, origemPublica } from "../_comum";

/** Volta para a Agenda dizendo o que houve. `google=ok` | `google=<falha>`. */
function voltar(request: Request, resultado: string): Response {
  return Response.redirect(`${origemPublica(request)}/agenda?google=${encodeURIComponent(resultado)}`, 302);
}

export async function GET(request: Request): Promise<Response> {
  const env = ambiente();
  if (!env) {
    console.error("Google Agenda: variáveis de ambiente ausentes (ver web/.env.example).");
    return voltar(request, "nao-configurado");
  }

  const url = new URL(request.url);
  // O usuário pode ter clicado em "Cancelar" na tela do Google.
  if (url.searchParams.get("error")) return voltar(request, "autorizacao-negada");

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) return voltar(request, "autorizacao-negada");

  // De QUEM é esta autorização. Vem do state assinado por nós — nunca de um
  // parâmetro solto, senão qualquer um plantaria a própria conta do Google
  // na conta de outro corretor e passaria a receber os compromissos dele.
  const userId = lerState(state, env.clientSecret);
  if (!userId) {
    console.error("Google Agenda: state inválido ou expirado no callback.");
    return voltar(request, "autorizacao-negada");
  }

  // Troca o code pelos tokens. O redirect_uri vai de novo e tem que ser
  // IDÊNTICO ao usado na autorização — o Google confere, e essa é a origem
  // mais comum de `redirect_uri_mismatch`.
  let resposta: Response;
  try {
    resposta = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: `${origemPublica(request)}${CAMINHO_CALLBACK}`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error("Google Agenda: o Google não respondeu à troca do code:", e);
    return voltar(request, "falha-google");
  }

  const corpo = (await resposta.json().catch(() => null)) as {
    refresh_token?: string;
    access_token?: string;
    error?: string;
  } | null;

  if (!resposta.ok || !corpo) {
    console.error("Google Agenda: troca do code recusada:", resposta.status, corpo?.error);
    return voltar(request, "falha-google");
  }

  // SEM refresh token não há integração: o access token morre em uma hora e
  // a sincronização pararia sozinha no mesmo dia. O Google só o manda na
  // primeira autorização de cada conta — é para isso que a URL leva
  // `prompt=consent`. Se ainda assim não veio, é melhor falhar aqui e alto
  // do que gravar uma conexão que vai morrer sem explicação.
  if (!corpo.refresh_token) {
    console.error("Google Agenda: o Google não devolveu refresh_token (prompt=consent ausente?).");
    return voltar(request, "falha-google");
  }

  // O e-mail da conta conectada NÃO é buscado aqui, e isso é decisão, não
  // esquecimento: o endpoint `userinfo` exige o escopo `userinfo.email`, e o
  // nosso é só `calendar.events`. Pedir mais um escopo — que ainda por cima
  // aparece na tela de consentimento como "ver seu endereço de e-mail" — para
  // exibir um rótulo seria pagar caro por pouco.
  //
  // Ele é capturado de graça na primeira sincronização: a resposta de criação
  // de evento traz `creator.email`, que é a própria conta. Ver a rota
  // `sincronizar`. Até lá a UI mostra só "Conectado".

  // upsert: reconectar substitui a conexão anterior em vez de duplicar.
  // `email` fica de fora do upsert de propósito — sobrescrevê-lo com null
  // apagaria, a cada reconexão, o rótulo que a sincronização já tinha
  // descoberto.
  const { error } = await admin(env)
    .from("google_contas")
    .upsert(
      { user_id: userId, refresh_token: corpo.refresh_token },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("Google Agenda: falha ao gravar a conta conectada:", error.message);
    return voltar(request, "falha-google");
  }

  return voltar(request, "ok");
}
