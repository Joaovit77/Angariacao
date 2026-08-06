/* ================================================================
   API: QUAL É O MEU CARGO?
   A pergunta que a UI faz no boot para decidir que menu montar.

   Responde DUAS coisas, e elas são independentes: `admin` (tem o
   cargo) e `operaCarteira` (trabalha angariação nesta conta). Ter o
   cargo não diz nada sobre a segunda — numa imobiliária pequena quem
   administra o sistema também tem carteira própria, e num operador
   puro as dez telas do corretor abrem numa parede de zeros.

   `operaCarteira` é `true` em toda dúvida — sem sessão, sem ambiente,
   erro de leitura, conta que não é admin. É o oposto do `admin`, que
   nega na dúvida, e a assimetria é proposital: errar para `false` aqui
   trancaria um corretor fora do próprio trabalho por causa de uma
   falha de rede nossa, enquanto errar para `true` só mostra um menu a
   mais para quem não ia usá-lo. Mesma escolha de `aceitouVersaoAtual`.

   Responde `{ admin: false }` em vez de 403 quando não é — e a
   diferença importa em dois pontos:

   1. O boot do painel não pode quebrar por causa disto. É a mesma
      escolha do `GET /api/ia`, que devolve `permitido: false` sem
      sessão em vez de recusar.
   2. Um 403 aqui seria um oráculo: "este endereço existe e você quase
      chegou". Um `false` não diz nada a quem estiver tentando.

   Esconder o menu é conveniência. A trava está em `exigirAdmin`, que
   toda rota de admin chama por conta própria.
   ================================================================ */
import { ambiente, servico } from "../_comum";
import { createClient } from "@supabase/supabase-js";

/** A resposta em toda dúvida: sem cargo, mas com o painel do corretor
    inteiro. Ver o comentário do topo sobre a assimetria. */
const NEUTRO = { admin: false, operaCarteira: true };

export async function GET(request: Request): Promise<Response> {
  const env = ambiente();
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!env || !accessToken) return Response.json(NEUTRO);

  const comoUsuario = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error } = await comoUsuario.auth.getUser();
  if (error || !sessao.user) return Response.json(NEUTRO);

  const { data, error: erroAdmin } = await servico(env)
    .from("admins")
    .select("user_id, opera_carteira")
    .eq("user_id", sessao.user.id)
    .maybeSingle();
  if (erroAdmin) {
    console.error("Admin: falha ao conferir o cargo:", erroAdmin.message);
    return Response.json(NEUTRO);
  }

  // Quem não é admin opera carteira por definição — é o app inteiro
  // para ele. Só a linha de `admins` pode dizer o contrário.
  if (!data) return Response.json(NEUTRO);
  return Response.json({ admin: true, operaCarteira: data.opera_carteira !== false });
}
