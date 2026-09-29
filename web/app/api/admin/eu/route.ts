/* ================================================================
   API: QUAL É O MEU CARGO?
   A pergunta que a UI faz no boot para decidir que menu montar.

   Responde DUAS coisas, e elas são independentes: `admin` (tem o
   cargo) e `operaCarteira` (trabalha angariação nesta conta). Ter o
   cargo não diz nada sobre a segunda — numa imobiliária pequena quem
   administra o sistema também tem carteira própria, e num operador
   puro as dez telas do corretor abrem numa parede de zeros.

   `operaCarteira` é `true` em toda dúvida — sem ambiente, erro de
   leitura, conta que não é admin. É o oposto do `admin`, que nega na
   dúvida, e a assimetria é proposital: errar para `false` aqui
   trancaria um corretor fora do próprio trabalho por causa de uma
   falha de rede nossa, enquanto errar para `true` só mostra um menu a
   mais para quem não ia usá-lo. Mesma escolha de `aceitouVersaoAtual`.

   Quem chama sem sessão válida recebe o contrato do AUTH-1b
   (401/503/500), como qualquer rota protegida: é esse 401 que deixa o
   browser perceber, já no boot, uma sessão revogada. Depois de
   autenticar, responde `{ admin: false }` em vez de 403 quando não é —
   e a diferença importa em dois pontos:

   1. O boot do painel não pode quebrar por causa disto. É a mesma
      escolha do `GET /api/ia`, que devolve `permitido: false` a quem
      não tem acesso em vez de recusar.
   2. Um 403 aqui seria um oráculo: "este endereço existe e você quase
      chegou". Um `false` não diz nada a quem estiver tentando.

   Esconder o menu é conveniência. A trava está em `exigirAdmin`, que
   toda rota de admin chama por conta própria.
   ================================================================ */
import { ambiente, servico } from "../_comum";
import { agoraBoot, registrarEtapaBootServidor } from "@/lib/bootPerformance";
import { autenticarRequisicao } from "@/lib/servidor/autenticacao";

/** A resposta em toda dúvida depois de autenticar: sem cargo, mas com o
    painel do corretor inteiro. Ver o comentário do topo sobre a assimetria. */
const NEUTRO = { admin: false, operaCarteira: true };

export async function GET(request: Request): Promise<Response> {
  const inicioTotal = agoraBoot();
  const responder = (corpo: typeof NEUTRO, sucesso: boolean) => {
    registrarEtapaBootServidor("api_admin_eu_servidor", inicioTotal, { sucesso });
    return Response.json(corpo);
  };

  const inicioAuth = agoraBoot();
  const auth = await autenticarRequisicao(request, "admin-eu");
  registrarEtapaBootServidor("auth_get_user_admin", inicioAuth, { sucesso: auth.ok });
  if (!auth.ok) {
    registrarEtapaBootServidor("api_admin_eu_servidor", inicioTotal, { sucesso: false });
    return Response.json({ erro: auth.erro }, { status: auth.status });
  }

  const env = ambiente();
  if (!env) return responder(NEUTRO, false);

  const inicioQuery = agoraBoot();
  const { data, error: erroAdmin } = await servico(env)
    .from("admins")
    .select("user_id, opera_carteira")
    .eq("user_id", auth.userId)
    .maybeSingle();
  registrarEtapaBootServidor("query_admins_perfil", inicioQuery, { sucesso: !erroAdmin });
  if (erroAdmin) {
    console.error("Admin: falha ao conferir o cargo:", erroAdmin.message);
    return responder(NEUTRO, false);
  }

  // Quem não é admin opera carteira por definição — é o app inteiro
  // para ele. Só a linha de `admins` pode dizer o contrário.
  if (!data) return responder(NEUTRO, true);
  return responder({ admin: true, operaCarteira: data.opera_carteira !== false }, true);
}
