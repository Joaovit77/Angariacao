/* ================================================================
   SUPER ADMIN — a guarda que todas as rotas de admin atravessam

   NÃO é rota (o `_` a mantém fora do roteamento).

   Aqui mora a service role, e nestas rotas ela é mais perigosa do que
   em qualquer outro lugar do projeto. Nas outras (webhook, envio,
   Google) ela ignora a RLS para trabalhar dentro de UMA conta já
   identificada. Aqui ela ignora a RLS para olhar TODAS — que é
   exatamente o poder que o cargo precisa ter, e exatamente por isso o
   que não pode escapar por um descuido.

   A regra que segura tudo: **o `user_id` de quem chama nunca vem da
   requisição.** Sai de `auth.getUser()` sobre o Bearer do Supabase, e
   só então é conferido contra a tabela `admins` com a service role.
   Um `userId` no corpo do pedido só é aceito como ALVO de uma ação
   (liberar a IA de fulano), nunca como identidade de quem pede.

   E a segunda: **toda rota chama `exigirAdmin` por conta própria.**
   Esconder o menu no browser é conveniência; quem souber o endereço
   chama a rota direto — o mesmo raciocínio que já valia para
   `podeUsarIa` na rota de IA.
   ================================================================ */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Ambiente {
  supabaseUrl: string;
  anonKey: string;
  servico: string;
}

/** As variáveis todas, ou null. Sem a service role não há painel de
    admin possível: as três tabelas que ele lê (`admins`,
    `whatsapp_instancias`, `ia_permissoes`) não têm política nenhuma. */
export function ambiente(): Ambiente | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !servico) return null;
  return { supabaseUrl, anonKey, servico };
}

/** Cliente com service role. Criado a cada chamada, nunca exportado
    como singleton — a mesma ressalva de `api/google/_comum.ts`. */
export function servico(env: Ambiente): SupabaseClient {
  return createClient(env.supabaseUrl, env.servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type FalhaAdmin = "nao-configurado" | "sessao-expirada" | "sem-permissao" | "requisicao-invalida" | "falha";

const MENSAGENS: Record<FalhaAdmin, string> = {
  "nao-configurado": "O painel de administração não está configurado neste ambiente.",
  "sessao-expirada": "Sua sessão expirou. Entre novamente.",
  "sem-permissao": "Esta área é restrita a administradores.",
  "requisicao-invalida": "Pedido inválido.",
  falha: "Não foi possível concluir. Tente de novo.",
};

export function erro(falha: FalhaAdmin, status: number): Response {
  return Response.json({ ok: false, falha, mensagem: MENSAGENS[falha] }, { status });
}

export interface Chamador {
  env: Ambiente;
  /** Quem está pedindo — de `auth.getUser()`, nunca do corpo. */
  userId: string;
  /** Já com service role, pronto para as consultas da rota. */
  sb: SupabaseClient;
}

/**
 * Devolve o chamador quando ele é admin, ou a Response de erro pronta.
 *
 * Quem usa escreve:
 *
 *     const guarda = await exigirAdmin(request);
 *     if ("resposta" in guarda) return guarda.resposta;
 *
 * A forma é feia de propósito: um `exigirAdmin` que devolvesse
 * `boolean` deixaria a rota seguir por engano quando alguém esquecesse
 * o `if`. Devolvendo a Response, o caminho de erro é o único que
 * compila sem uso.
 */
export async function exigirAdmin(
  request: Request,
): Promise<Chamador | { resposta: Response }> {
  const env = ambiente();
  if (!env) {
    console.error("Admin: SUPABASE_SERVICE_ROLE_KEY ausente (ver DEPLOY.md).");
    return { resposta: erro("nao-configurado", 503) };
  }

  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return { resposta: erro("sessao-expirada", 401) };

  // A identidade sai do TOKEN. É a única fonte aceita.
  const comoUsuario = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessao, error } = await comoUsuario.auth.getUser();
  if (error || !sessao.user) return { resposta: erro("sessao-expirada", 401) };

  // E o cargo sai da tabela, lida com service role: `admins` não tem
  // política de select, então o próprio interessado não consegue
  // consultá-la pelo browser (ver supabase-schema.sql).
  const sb = servico(env);
  const { data, error: erroAdmin } = await sb
    .from("admins")
    .select("user_id")
    .eq("user_id", sessao.user.id)
    .maybeSingle();

  if (erroAdmin) {
    // Falha de leitura NÃO libera. Mesma regra de `podeUsarIa`: na
    // dúvida, nega — e aqui o que está em jogo é o sistema inteiro.
    console.error("Admin: falha ao conferir o cargo:", erroAdmin.message);
    return { resposta: erro("falha", 500) };
  }
  if (!data) return { resposta: erro("sem-permissao", 403) };

  return { env, userId: sessao.user.id, sb };
}

/** Um `user_id` recebido no corpo, validado como FORMA (uuid). Não diz
    nada sobre existir — quem verifica isso é a consulta seguinte. */
export function alvoValido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuid.test(valor.trim()) ? valor.trim() : null;
}
