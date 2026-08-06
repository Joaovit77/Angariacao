/* ================================================================
   API: ESTADO DA CONEXÃO DO WHATSAPP (e o QR para reconectar)

   Existe pelo mesmo motivo das outras rotas de servidor: o token da
   instância não pode chegar ao browser. Aqui isso é literal — a
   consulta USA o token para perguntar à Evolution, e devolve ao
   cliente apenas o estado e, quando for o caso, a imagem do QR. O
   token nunca sai.

   O QUE PERGUNTA À EVOLUTION mora em `../_conexao`, compartilhado com
   `api/admin/conexao`. Esta rota é a parte que só vale AQUI: quem está
   perguntando (a sessão do Supabase), de quem é a instância (a própria,
   sempre) e o registro no log quando o número caiu.

   Contrato: GET + Authorization: Bearer <access_token do Supabase>.
   Responde { estado, qr?, numero? } — ver lib/calculo/conexaoWhatsapp.
   ================================================================ */
import { createClient } from "@supabase/supabase-js";
import type { Conexao, EstadoConexao } from "@/lib/calculo/conexaoWhatsapp";
import { registrarEvento } from "@/lib/servidor/registro";
import { consultarConexao } from "../_conexao";

function responder(estado: EstadoConexao, extra: Partial<Conexao> = {}): Response {
  const corpo: Conexao = { estado, ...extra };
  return Response.json(corpo);
}

/** A instância DESTE corretor. Service role porque `whatsapp_instancias`
    não tem política de leitura — o token é segredo. O `userId` já veio
    de `auth.getUser()`, nunca da requisição. */
async function instanciaDoUsuario(
  supabaseUrl: string,
  userId: string,
): Promise<{ instancia: string; token: string } | null> {
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!servico) return null;
  const admin = createClient(supabaseUrl, servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from("whatsapp_instancias")
    .select("instancia, token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Conexão do WhatsApp: falha ao ler a instância:", error.message);
    return null;
  }
  if (!data?.instancia || !data?.token) return null;
  return { instancia: data.instancia as string, token: data.token as string };
}

export async function GET(request: Request): Promise<Response> {
  const serverUrl = process.env.EVOLUTION_SERVER_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!serverUrl || !supabaseUrl || !anonKey) return responder("nao-configurado");

  // 1. Quem está perguntando. Sem sessão a rota não existe — senão
  //    qualquer um sondaria o estado (e pediria o QR!) do número alheio.
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return responder("falha");

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error: erroAuth } = await supabase.auth.getUser();
  if (erroAuth || !sessao.user) return responder("falha");

  const minha = await instanciaDoUsuario(supabaseUrl, sessao.user.id);
  if (!minha) return responder("sem-instancia");

  // 2. O estado, com QR: esta é a tela em que o corretor está com o
  //    celular na mão para reconectar.
  const conexao = await consultarConexao(serverUrl, minha.instancia, minha.token, true);

  /* 3. Caiu: registra no log do admin — é a informação que faltava para
     saber que o número de alguém caiu sem esperar a reclamação. "aviso"
     e não "erro": o corretor está justamente na tela que resolve isso, e
     uma desconexão que ele reconecta em trinta segundos não é incidente. */
  if (conexao.estado === "desconectado") {
    registrarEvento({
      userId: sessao.user.id,
      categoria: "whatsapp",
      nivel: "aviso",
      evento: "instancia-desconectada",
      detalhe: "consultado na tela de conexão",
    });
  }

  return Response.json(conexao);
}
