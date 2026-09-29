/* ================================================================
   AUTENTICAÇÃO DO CHAMADOR (lado do servidor)

   Rota /api protegida recebe o Bearer da sessão do browser e só VALIDA:
   um `auth.getUser(token)` por request, sem refresh, sem signOut, sem
   cookie, sem guardar sessão. Quem recupera sessão é o browser
   (lib/auth/recuperacaoSessao.ts), e ele só reage a 401.

   Por isso a resposta separa três coisas que antes eram um 401 só:

   - 401 `sessao-invalida`: sem token, sessão revogada ou JWT recusado.
     O browser confirma com o Auth antes de encerrar qualquer coisa.
   - 503 `auth-indisponivel`: o Auth não respondeu (rede, 5xx, 429,
     resposta ilegível). Nada prova que a sessão morreu; o browser não
     recupera nem desloga.
   - 500 `erro-auth`: qualquer coisa não classificada, inclusive env
     ausente. Nunca vira 401: erro desconhecido não é sessão expirada.

   403 não passa por aqui. Permissão, RLS e recurso de outra conta são
   decisão da rota, depois de autenticar.

   O único token que o helper rejeita sem perguntar ao Auth é o que não
   existe: header ausente, scheme que não é Bearer ou Bearer vazio.
   Qualquer outro vai ao `getUser`, que classifica `bad_jwt`.
   ================================================================ */
import {
  createClient,
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type SupabaseClient,
} from "@supabase/supabase-js";

export type ErroAutenticacao = "sessao-invalida" | "auth-indisponivel" | "erro-auth";

export type ResultadoAutenticacao =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; status: 401 | 503 | 500; erro: ErroAutenticacao };

export type MotivoFalhaAuth = "sem_token" | "jwt_invalido" | "sessao_revogada" | "auth_indisponivel" | "erro_auth";

type CausaErroAuth = "configuracao" | "excecao" | "resposta_inesperada" | "codigo_nao_mapeado";

export interface ClassificacaoFalhaAuth {
  motivo: MotivoFalhaAuth;
  status: 401 | 503 | 500;
  /** Só em `erro_auth`: de onde veio o que não se sabe classificar. */
  causa?: CausaErroAuth;
}

/** Os mesmos códigos que o browser trata como sessão morta. `session_not_found`
    normalmente chega como `AuthSessionMissingError` (o SDK converte); fica
    aqui para o caso de chegar cru. */
const CODIGOS_SESSAO_INEXISTENTE: ReadonlySet<string> = new Set([
  "session_not_found",
  "session_expired",
  "user_not_found",
]);

const ERRO_POR_STATUS: Record<ClassificacaoFalhaAuth["status"], ErroAutenticacao> = {
  401: "sessao-invalida",
  503: "auth-indisponivel",
  500: "erro-auth",
};

/** Classifica pelo tipo e pelo `code`/`status` do SDK, nunca pela mensagem. */
export function classificarFalhaAuth(erro: unknown): ClassificacaoFalhaAuth {
  if (isAuthSessionMissingError(erro)) return { motivo: "sessao_revogada", status: 401 };
  if (isAuthRetryableFetchError(erro)) return { motivo: "auth_indisponivel", status: 503 };
  if (isAuthApiError(erro)) {
    if (erro.code === "bad_jwt") return { motivo: "jwt_invalido", status: 401 };
    if (erro.code && CODIGOS_SESSAO_INEXISTENTE.has(erro.code)) return { motivo: "sessao_revogada", status: 401 };
    if (erro.code === "over_request_rate_limit" || erro.status === 429 || erro.status >= 500) {
      return { motivo: "auth_indisponivel", status: 503 };
    }
    return { motivo: "erro_auth", status: 500, causa: "codigo_nao_mapeado" };
  }
  // Resposta de erro que nem é JSON: proxy ou gateway na frente do Auth.
  if (isAuthError(erro) && erro.name === "AuthUnknownError") return { motivo: "auth_indisponivel", status: 503 };
  if (isAuthError(erro)) return { motivo: "erro_auth", status: 500, causa: "codigo_nao_mapeado" };
  return { motivo: "erro_auth", status: 500, causa: "excecao" };
}

const CODIGO_AUTH_SEGURO = /^[a-z_]{1,64}$/;

/** Do erro do SDK, só o `code` (enum do SDK) e o status numérico. Nunca
    `message`, `stack` ou o objeto: a resposta crua do Auth pode vir ali. */
function detalheSdk(erro: unknown): { codigoAuth?: string; statusAuth?: number } {
  const detalhe: { codigoAuth?: string; statusAuth?: number } = {};
  try {
    if (!isAuthError(erro)) return detalhe;
    if (typeof erro.code === "string" && CODIGO_AUTH_SEGURO.test(erro.code)) detalhe.codigoAuth = erro.code;
    if (typeof erro.status === "number" && Number.isInteger(erro.status) && erro.status >= 0 && erro.status <= 599) {
      detalhe.statusAuth = erro.status;
    }
  } catch {
    /* getter malformado não pode derrubar a resposta */
  }
  return detalhe;
}

function falhar(
  rota: string,
  classificacao: ClassificacaoFalhaAuth,
  erroSdk?: unknown,
): ResultadoAutenticacao {
  console.warn("[auth]", {
    rota,
    motivo: classificacao.motivo,
    status: classificacao.status,
    ...(classificacao.causa ? { causa: classificacao.causa } : {}),
    ...(erroSdk === undefined ? {} : detalheSdk(erroSdk)),
  });
  return { ok: false, status: classificacao.status, erro: ERRO_POR_STATUS[classificacao.status] };
}

/**
 * Quem está chamando, a partir do Bearer. Em sucesso devolve o cliente
 * Supabase do chamador (com o Bearer no header, para o RLS valer) para a
 * rota reaproveitar no PostgREST, e só o `userId`: e-mail e telefone não
 * circulam. Em falha, o status e o código estável; o corpo é da rota.
 */
export async function autenticarRequisicao(request: Request, rota: string): Promise<ResultadoAutenticacao> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return falhar(rota, { motivo: "erro_auth", status: 500, causa: "configuracao" });

  const cabecalho = request.headers.get("authorization") || "";
  const token = cabecalho.toLowerCase().startsWith("bearer ") ? cabecalho.slice(7).trim() : "";
  if (!token) return falhar(rota, { motivo: "sem_token", status: 401 });

  try {
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return falhar(rota, classificarFalhaAuth(error), error);
    const userId = data?.user?.id;
    if (!userId) return falhar(rota, { motivo: "erro_auth", status: 500, causa: "resposta_inesperada" });
    return { ok: true, supabase, userId };
  } catch (erro) {
    return falhar(rota, classificarFalhaAuth(erro), erro);
  }
}
