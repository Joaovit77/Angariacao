/* ================================================================
   GOOGLE AGENDA — o que as três rotas compartilham

   Não é rota (o `_` no nome mantém fora do roteamento): é o pedaço de
   servidor que `conectar`, `callback` e `sincronizar` usam igual —
   autenticação, o `state` assinado, o refresh do access token e a
   leitura da conta conectada.

   Aqui mora a SERVICE ROLE, e ela é a exceção mais perigosa do projeto:
   ignora a RLS por completo. A regra que a segura é a mesma do webhook
   e da rota de envio — **o `user_id` nunca vem da requisição**. Ou sai
   de `auth.getUser()`, ou sai do `state` assinado por nós.
   ================================================================ */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GOOGLE_TOKEN_URL, type FalhaGoogle } from "@/lib/calculo/googleAgenda";

export interface Ambiente {
  clientId: string;
  clientSecret: string;
  supabaseUrl: string;
  anonKey: string;
  servico: string;
}

/** As variáveis todas, ou null (e a rota responde "nao-configurado").
    Nenhuma delas leva `NEXT_PUBLIC_`: o client secret do Google é segredo,
    e é ele que transforma um `code` em acesso contínuo à agenda da pessoa. */
export function ambiente(): Ambiente | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clientId || !clientSecret || !supabaseUrl || !anonKey || !servico) return null;
  return { clientId, clientSecret, supabaseUrl, anonKey, servico };
}

/** Cliente com a service role. Criado dentro de cada rota, nunca exportado
    como singleton de módulo compartilhado — de onde vazaria para outra rota
    por descuido. */
export function admin(env: Ambiente): SupabaseClient {
  return createClient(env.supabaseUrl, env.servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Quem está chamando, a partir do Bearer do Supabase. null = sem sessão. */
export async function usuarioDaRequisicao(
  request: Request,
  env: Ambiente,
): Promise<{ id: string } | null> {
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!accessToken) return null;

  const supabase = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

/* ----------------------------------------------------------------
   O `state` ASSINADO — e por que ele não podia ser um cookie

   O callback do Google é um redirect de NAVEGAÇÃO: o browser sai do
   nosso site, vai ao Google e volta. A rota que recebe essa volta
   precisa saber de quem é a autorização — e não tem como saber.

   A sessão do Supabase neste app vive em `localStorage` (cliente de
   browser, `persistSession`), não em cookie. Servidor nenhum enxerga
   localStorage, então o callback chega literalmente anônimo. Também não
   dá para mandar o access token do Supabase no `state`: ele viajaria na
   query string, e query string entra em log de servidor, em histórico e
   no header `Referer`.

   A saída é levar só o `user_id` e ASSINÁ-LO. O que a assinatura impede
   é o ataque que importa: sem ela, qualquer um montaria um `state` com o
   id de outra pessoa e plantaria a PRÓPRIA conta do Google na conta
   dela — passando a receber, na sua agenda, os compromissos do outro.

   A chave do HMAC é o `GOOGLE_CLIENT_SECRET`. Reusar segredo para dois
   fins não é ideal, mas aqui vale: já é obrigatório para esta feature,
   já é do mesmo domínio (OAuth do Google), o HMAC não o revela, e a
   alternativa era mais uma variável de ambiente para o corretor errar
   ao configurar. Trocá-lo invalida os `state` em trânsito — e isso é um
   fluxo de 30 segundos, ninguém perde nada.
   ---------------------------------------------------------------- */

/** Janela de validade do `state`. Cobre com folga o tempo de escolher a conta
    e ler a tela de consentimento; curta o bastante para um link vazado não
    servir amanhã. */
const STATE_VALIDADE_MS = 15 * 60 * 1000;

function assinar(dados: string, chave: string): string {
  return createHmac("sha256", chave).update(dados).digest("base64url");
}

export function criarState(userId: string, chave: string): string {
  // O nonce não protege nada sozinho — serve para dois pedidos do mesmo
  // usuário no mesmo milissegundo não gerarem o mesmo state, o que faria
  // um parecer replay do outro em qualquer análise de log.
  const corpo = `${userId}.${Date.now()}.${randomBytes(8).toString("base64url")}`;
  return `${corpo}.${assinar(corpo, chave)}`;
}

/** Devolve o user_id se a assinatura confere e não expirou; senão null. */
export function lerState(state: string, chave: string): string | null {
  const partes = (state || "").split(".");
  if (partes.length !== 4) return null;
  const [userId, emitidoEm, , assinatura] = partes;
  const corpo = `${userId}.${emitidoEm}.${partes[2]}`;

  const esperada = Buffer.from(assinar(corpo, chave));
  const recebida = Buffer.from(assinatura);
  // Comparação em tempo constante: `===` vaza, pelo tempo, quantos caracteres
  // iniciais bateram, e isso permite descobrir a assinatura byte a byte.
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  const quando = Number(emitidoEm);
  if (!Number.isFinite(quando) || Date.now() - quando > STATE_VALIDADE_MS) return null;
  return userId;
}

/** A URL pública desta instalação, para montar o redirect_uri.

    Sai do host da própria requisição em vez de env var: em produção o valor
    seria mais uma variável para configurar errado, e o redirect_uri PRECISA
    bater com o registrado no Google. `x-forwarded-proto` porque atrás do
    proxy da Vercel o request chega como http. */
export function origemPublica(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export interface ContaGoogle {
  refreshToken: string;
  calendarId: string;
}

/** A conta conectada do usuário. Lida com service role porque `google_contas`
    não tem política nenhuma — o refresh token é segredo (ver o comentário da
    tabela em supabase-schema.sql). */
export async function contaDoUsuario(
  env: Ambiente,
  userId: string,
): Promise<ContaGoogle | null> {
  const { data, error } = await admin(env)
    .from("google_contas")
    .select("refresh_token, calendar_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Google Agenda: falha ao ler a conta conectada:", error.message);
    return null;
  }
  if (!data?.refresh_token) return null;
  return {
    refreshToken: data.refresh_token as string,
    calendarId: (data.calendar_id as string) || "primary",
  };
}

/**
 * Troca o refresh token por um access token novo.
 *
 * Sem cache, de propósito: o access token vale uma hora, e guardá-lo exigiria
 * mais uma coluna com mais um segredo e a invalidação correspondente. Uma
 * chamada a mais por sincronização é barata perto disso.
 *
 * `invalid_grant` é o caso que merece nome próprio: significa que o usuário
 * revogou o acesso na conta do Google (ou que o token expirou por o app ter
 * ficado em modo "Teste" mais de 7 dias). Não é falha transitória — reconectar
 * é a única saída, e a UI precisa dizer isso em vez de "tente de novo".
 */
export async function accessToken(
  env: Ambiente,
  refreshToken: string,
): Promise<{ token: string } | { falha: FalhaGoogle }> {
  let r: Response;
  try {
    r = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error("Google Agenda: o Google não respondeu ao refresh:", e);
    return { falha: "falha-google" };
  }

  const corpo = (await r.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!r.ok || !corpo?.access_token) {
    if (corpo?.error === "invalid_grant") return { falha: "autorizacao-expirada" };
    console.error("Google Agenda: refresh recusado:", r.status, corpo?.error);
    return { falha: "falha-google" };
  }
  return { token: corpo.access_token };
}
